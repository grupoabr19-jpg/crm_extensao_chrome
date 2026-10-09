import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const crmRoot = resolve(__dirname, "../../..");

loadDotEnv(resolve(crmRoot, ".env"));

const config = {
  enabled: envBool("WHATSAPP_BOT_ENABLED", false),
  mode: envChoice("WHATSAPP_BOT_MODE", ["dry-run", "supervised", "auto"], "supervised"),
  headless: envBool("WHATSAPP_BOT_HEADLESS", false),
  hideWindow: envBool("WHATSAPP_BOT_HIDE_WINDOW", false),
  apiBase: stripSlash(process.env.WHATSAPP_BOT_API_BASE_URL || process.env.ABR_API_BASE_URL || process.env.API_BASE_URL || "https://abr-crm-api.onrender.com"),
  email: process.env.WHATSAPP_BOT_CRM_EMAIL || process.env.WHATSAPP_BOT_ALLOWED_EMAIL || "thiago.almeida@grupoabr.com.br",
  password: process.env.WHATSAPP_BOT_CRM_PASSWORD || "",
  pollMs: envInt("WHATSAPP_BOT_POLL_MS", 5000),
  commitReady: envBool("WHATSAPP_BOT_COMMIT_READY", false),
  activeChatOnly: envBool("WHATSAPP_BOT_ACTIVE_CHAT_ONLY", true),
  pietraName: process.env.WHATSAPP_BOT_PIETRA_NAME || "Pietra",
  pietraPhone: process.env.WHATSAPP_BOT_PIETRA_PHONE || "+5535998138542",
  trainingFile: process.env.WHATSAPP_BOT_TRAINING_FILE || resolve(__dirname, "../training/abr-bot-training.json"),
  profileDir: process.env.WHATSAPP_BOT_PROFILE_DIR || resolve(crmRoot, ".local/whatsapp-bot-profile"),
  stateFile: process.env.WHATSAPP_BOT_STATE_FILE || resolve(crmRoot, ".local/whatsapp-bot-state.json"),
  maxChatsPerTick: envInt("WHATSAPP_BOT_MAX_CHATS_PER_TICK", 3),
  respondExistingUnread: envBool("WHATSAPP_BOT_RESPOND_EXISTING_UNREAD", false),
  scanRecentForCommands: envBool("WHATSAPP_BOT_SCAN_RECENT_FOR_COMMANDS", true),
  maxRecentCommandChats: envInt("WHATSAPP_BOT_MAX_RECENT_COMMAND_CHATS", 8),
  transferLockMs: envInt("WHATSAPP_BOT_TRANSFER_LOCK_MS", 12 * 60 * 60 * 1000)
};

const state = loadState(config.stateFile);
const seen = new Map(Object.entries(state.seen || {}));
const cooldowns = new Map();
const awaitingCustomer = new Map(Object.entries(state.awaitingCustomer || {}));
const handledTransfers = new Map(Object.entries(state.handledTransfers || {}));
const training = loadTraining(config.trainingFile);
let authToken = "";
let emptyActiveChatNotified = false;
let bootstrappedUnread = false;

async function main() {
  if (!config.enabled) {
    log("Bot desativado. Defina WHATSAPP_BOT_ENABLED=true no crm/.env para rodar.");
    return;
  }
  if (!config.password || /__.*__|preencher|senha_do_crm/i.test(config.password)) {
    throw new Error("WHATSAPP_BOT_CRM_PASSWORD nao configurado no crm/.env");
  }

  mkdirSync(config.profileDir, { recursive: true });
  authToken = await loginCrm();
  log(`CRM autenticado como ${config.email}. Modo: ${config.mode}. API: ${config.apiBase}`);

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: config.headless,
    viewport: { width: 1366, height: 900 },
    args: [
      "--disable-notifications",
      ...(config.hideWindow ? ["--start-minimized", "--window-position=-32000,-32000", "--window-size=1366,900"] : [])
    ]
  });
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
  await waitForWhatsAppReady(page);
  log(config.activeChatOnly
    ? "WhatsApp Web pronto. Abra uma conversa no Chromium do bot; vou monitorar o chat aberto."
    : "WhatsApp Web pronto em segundo plano. Monitorando chats nao lidos...");

  process.on("SIGINT", async () => {
    log("Encerrando bot...");
    await context.close().catch(() => {});
    process.exit(0);
  });

  while (true) {
    try {
      await tick(page);
  } catch (error) {
      log(`Erro no ciclo: ${describeError(error)}`);
    }
    await sleep(config.pollMs);
  }
}

async function tick(page) {
  if (config.activeChatOnly) {
    const snapshot = await readOpenChat(page);
    if (!snapshot.messages.length) {
      if (!emptyActiveChatNotified) {
        log("Nenhum chat aberto com mensagens legiveis. Abra uma conversa de cliente no Chromium do bot.");
        emptyActiveChatNotified = true;
      }
      return;
    }
    emptyActiveChatNotified = false;
    const key = chatKey(snapshot);
    if (isCoolingDown(key, snapshot)) return;
    const fingerprint = incomingFingerprint(snapshot);
    if (isAwaitingCustomer(key, snapshot, fingerprint)) return;
    if (seen.get(key) === fingerprint) return;
    seen.set(key, fingerprint);
    await handleConversation(page, snapshot);
    return;
  }

  const chats = await findUnreadChats(page);
  if (chats.length) {
    log(`Chats nao lidos encontrados: ${chats.length}; candidatos=${chats.slice(0, 5).map((chat) => `${chat.index}:${chat.title || "sem titulo"}`).join(" | ")}`);
    if (!bootstrappedUnread && !config.respondExistingUnread) {
      await bootstrapUnreadChats(page, chats);
      bootstrappedUnread = true;
      if (config.scanRecentForCommands) await scanRecentTransferCommands(page);
      return;
    }
    let handled = 0;
    for (const chat of chats) {
      if (handled >= config.maxChatsPerTick) break;
      const snapshot = await openAndReadChat(page, chat);
      if (!snapshot) continue;
      const key = chatKey(snapshot);
      if (isCoolingDown(key, snapshot)) continue;
      const fingerprint = incomingFingerprint(snapshot);
      if (isAwaitingCustomer(key, snapshot, fingerprint)) continue;
      if (seen.get(key) === fingerprint) continue;
      seen.set(key, fingerprint);
      persistState();
      const didHandle = await handleConversation(page, snapshot);
      if (didHandle) handled += 1;
    }
  }
  bootstrappedUnread = true;

  if (config.scanRecentForCommands) {
    await scanRecentTransferCommands(page);
  }
}

async function bootstrapUnreadChats(page, chats) {
  log("Primeiro ciclo: registrando conversas antigas sem responder automaticamente.");
  for (const chat of chats.slice(0, Math.max(config.maxRecentCommandChats, config.maxChatsPerTick))) {
    const snapshot = await openAndReadChat(page, chat);
    if (!snapshot) continue;
    const key = chatKey(snapshot);
    const fingerprint = incomingFingerprint(snapshot);
    seen.set(key, fingerprint);
    if (hasTransferToPietraCommand(snapshot.messages) && !isHandledTransfer(snapshot)) {
      const customerPhone = customerPhoneFromSnapshot(snapshot);
      if (customerPhone) await transferToPietra(page, snapshot, customerPhone);
      continue;
    }
    markAwaitingCustomer(snapshot);
  }
  persistState();
}

async function handleConversation(page, snapshot) {
  const incoming = snapshot.messages.filter((message) => message.direction === "in");
  if (!incoming.length) return false;
  const customerPhone = customerPhoneFromSnapshot(snapshot);
  if (!customerPhone) {
    log(`Ignorando sem telefone confiavel: ${snapshot.chatTitle || "sem titulo"} (${incoming.length} msg recebidas)`);
    return false;
  }
  log(`Triando: ${snapshot.chatTitle} (${customerPhone}; ${incoming.length} msg recebidas)`);

  if (hasTransferToPietraCommand(snapshot.messages)) {
    await transferToPietra(page, snapshot, customerPhone);
    return true;
  }

  const triage = await postJson("/v1/ai/triage", {
    commit: false,
    phone: customerPhone,
    contact: { name: nameFromTitle(snapshot.chatTitle), phone: customerPhone },
    context: { bot_training: training },
    messages: snapshot.messages
  });

  const outbound = triage.triage?.outbound;
  if (outbound?.text) {
    await maybeSend(page, outbound.text, "pergunta aprovada");
    markCooldown(snapshot);
    markAwaitingCustomer(snapshot);
    return true;
  }

  if (triage.triage?.action === "request_routing" && !triage.triage?.humanNeeded && config.commitReady) {
    const committed = await postJson("/v1/ai/triage", {
      commit: true,
      phone: customerPhone,
      contact: { name: nameFromTitle(snapshot.chatTitle), phone: customerPhone },
      context: { bot_training: training },
      messages: snapshot.messages
    });
    const message = committed.outbox?.payload?.message || committed.handoff?.message || "";
    if (message) {
      await maybeSend(page, message, "transferencia");
      markCooldown(snapshot);
      markAwaitingCustomer(snapshot);
    }
    return true;
  }

  log(`Sem envio: action=${triage.triage?.action || "n/a"} humanNeeded=${Boolean(triage.triage?.humanNeeded)} confidence=${triage.triage?.confidence ?? "n/a"}`);
  return true;
}

async function transferToPietra(page, snapshot, customerPhone) {
  if (isHandledTransfer(snapshot, customerPhone)) {
    log(`Transferencia ja processada para este comando: ${snapshot.chatTitle}`);
    return;
  }
  markHandledTransfer(snapshot, customerPhone);
  log(`Comando detectado: transferir para ${config.pietraName}. Criando ficha e handoff...`);
  let casePayload = {};
  try {
    const triage = await postJson("/v1/ai/triage", {
      commit: false,
      phone: customerPhone,
      contact: { name: nameFromTitle(snapshot.chatTitle), phone: customerPhone },
      context: { bot_training: training },
      messages: snapshot.messages,
      minConfidence: 0.4
    });
    casePayload = triage.casePayload || {};
  } catch (error) {
    log(`Triagem previa falhou; vou criar ficha com dados minimos: ${describeError(error)}`);
  }

  const phone = casePayload.phone || customerPhone;
  if (!phone) {
    await maybeSend(page, "Para eu transferir para a Pietra, preciso confirmar o telefone do cliente.", "telefone necessario");
    markCooldown(snapshot);
    markAwaitingCustomer(snapshot);
    return;
  }

  const created = await postJson("/v1/cases", {
    ...casePayload,
    name: casePayload.name || nameFromTitle(snapshot.chatTitle) || "Cliente WhatsApp",
    phone,
    need: casePayload.need || qualificationSummary(snapshot.messages),
    source: casePayload.source || "WhatsApp",
    department: casePayload.department || "Vendas",
    pipeline: casePayload.pipeline || "VAREJO",
    stage: casePayload.stage || "Novo Lead",
    responsibleName: config.pietraName,
    responsiblePhone: config.pietraPhone,
    nextTask: "Pietra assumir atendimento transferido pela IA"
  });
  const message = created.handoff?.message || created.outbox?.payload?.message || "";
  if (message) {
    await maybeSend(page, message, `transferencia para ${config.pietraName}`);
    markCooldown(snapshot);
    markAwaitingCustomer(snapshot);
    log(`Ficha criada: ${created.case?.protocol || created.case?.id || "sem protocolo"}; destino=${config.pietraName}`);
  } else {
    log(`Ficha criada, mas sem mensagem de handoff retornada: ${created.case?.protocol || created.case?.id || "sem protocolo"}`);
  }
}

async function openAndReadChat(page, chat) {
  const opened = await openChatByIndex(page, chat.index);
  if (!opened) {
    log(`Nao consegui abrir chat index=${chat.index}.`);
    return null;
  }
  await page.waitForTimeout(600);
  const snapshot = withChatCandidate(await readOpenChat(page), chat);
  if (!snapshot.messages.length) {
    log(`Chat aberto sem mensagens legiveis: ${snapshot.chatTitle || "sem titulo"}; candidates=${snapshot.candidateCount || 0}`);
    return null;
  }
  return snapshot;
}

async function scanRecentTransferCommands(page) {
  const chats = await findRecentChats(page);
  for (const chat of chats.slice(0, config.maxRecentCommandChats)) {
    const snapshot = await openAndReadChat(page, chat);
    if (!snapshot || !hasTransferToPietraCommand(snapshot.messages)) continue;
    const customerPhone = customerPhoneFromSnapshot(snapshot);
    if (isHandledTransfer(snapshot, customerPhone)) continue;
    if (!customerPhone) {
      log(`Comando para Pietra ignorado sem telefone confiavel: ${snapshot.chatTitle || "sem titulo"}`);
      markHandledTransfer(snapshot, customerPhone);
      continue;
    }
    await transferToPietra(page, snapshot, customerPhone);
    break;
  }
}

async function maybeSend(page, text, reason) {
  if (config.mode === "dry-run") {
    log(`[dry-run] ${reason}: ${text}`);
    return;
  }
  await fillComposer(page, text);
  if (config.mode === "auto") {
    await page.keyboard.press("Enter");
    log(`Mensagem enviada (${reason}).`);
    return;
  }
  log(`[supervised] Texto preparado no compositor (${reason}). Revise e envie manualmente.`);
}

async function waitForWhatsAppReady(page) {
  log("Aguardando WhatsApp Web. Se aparecer QR Code, escaneie com o numero principal.");
  await page.waitForFunction(() => {
    return Boolean(document.querySelector("#pane-side") || document.querySelector("canvas[aria-label*='Scan']") || document.body?.innerText?.includes("Use WhatsApp on your computer"));
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => Boolean(document.querySelector("#pane-side")), null, { timeout: 0 });
}

async function findUnreadChats(page) {
  return page.evaluate(() => {
    const rows = chatRows();
    return rows.map((row, index) => {
      const text = row.textContent || "";
      const title = row.querySelector("span[title]")?.getAttribute("title") || "";
      const hasUnreadBadge = Boolean(row.querySelector(
        "[aria-label*='unread' i], [aria-label*='não lida' i], [aria-label*='nao lida' i], [aria-label*='mensagem não lida' i], [aria-label*='mensagem nao lida' i]"
      ));
      const badgeText = Array.from(row.querySelectorAll("span,div"))
        .map((node) => (node.getAttribute("aria-label") || node.textContent || "").trim())
        .find((value) => /^(?:\d{1,3}|[1-9]\d{0,2}\s+(?:unread|não lida|nao lida))/i.test(value));
      const looksUnread = Boolean(badgeText) && /(\d{1,2}:\d{2}|Ontem|Yesterday|Hoje|Today)/i.test(text);
      return { index, title, text: text.slice(0, 180), unread: hasUnreadBadge || looksUnread };
    }).filter((row) => row.unread);

    function chatRows() {
      const selectors = [
        "#pane-side [role='row']",
        "#pane-side [role='listitem']",
        "#pane-side div[tabindex='0']"
      ];
      for (const selector of selectors) {
        const rows = Array.from(document.querySelectorAll(selector)).filter((row) => {
          const rect = row.getBoundingClientRect();
          const text = row.textContent || "";
          const title = row.querySelector("span[title]")?.getAttribute("title") || "";
          const hasTime = /(\d{1,2}:\d{2}|Ontem|Yesterday|Hoje|Today)/i.test(text);
          const isNav = /^(conversas|chats|status|atualizacoes|atualizações|canais|channels|comunidades|communities|arquivadas)$/i.test(title.trim());
          return title && !isNav && hasTime && text.trim() && rect.height > 42 && rect.width > 180;
        });
        if (rows.length) return rows;
      }
      return [];
    }
  });
}

async function findRecentChats(page) {
  return page.evaluate(() => {
    return chatRows().map((row, index) => {
      const text = row.textContent || "";
      const title = row.querySelector("span[title]")?.getAttribute("title") || "";
      return { index, title, text: text.slice(0, 180), unread: false };
    });

    function chatRows() {
      const selectors = [
        "#pane-side [role='row']",
        "#pane-side [role='listitem']",
        "#pane-side div[tabindex='0']"
      ];
      for (const selector of selectors) {
        const rows = Array.from(document.querySelectorAll(selector)).filter((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const text = candidate.textContent || "";
          const title = candidate.querySelector("span[title]")?.getAttribute("title") || "";
          const hasTime = /(\d{1,2}:\d{2}|Ontem|Yesterday|Hoje|Today)/i.test(text);
          const isNav = /^(conversas|chats|status|atualizacoes|atualizaÃ§Ãµes|canais|channels|comunidades|communities|arquivadas)$/i.test(title.trim());
          return title && !isNav && hasTime && text.trim() && rect.height > 42 && rect.width > 180;
        });
        if (rows.length) return rows;
      }
      return [];
    }
  });
}

async function openChatByIndex(page, index) {
  const marked = await page.evaluate((wantedIndex) => {
    document.querySelectorAll("[data-abr-bot-open-chat]").forEach((node) => node.removeAttribute("data-abr-bot-open-chat"));
    const rows = chatRows();
    const row = rows[wantedIndex];
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    row.setAttribute("data-abr-bot-open-chat", "1");
    return true;

    function chatRows() {
      const selectors = [
        "#pane-side [role='row']",
        "#pane-side [role='listitem']",
        "#pane-side div[tabindex='0']"
      ];
      for (const selector of selectors) {
        const rows = Array.from(document.querySelectorAll(selector)).filter((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const text = candidate.textContent || "";
          const title = candidate.querySelector("span[title]")?.getAttribute("title") || "";
          const hasTime = /(\d{1,2}:\d{2}|Ontem|Yesterday|Hoje|Today)/i.test(text);
          const isNav = /^(conversas|chats|status|atualizacoes|atualizações|canais|channels|comunidades|communities|arquivadas)$/i.test(title.trim());
          return title && !isNav && hasTime && text.trim() && rect.height > 42 && rect.width > 180;
        });
        if (rows.length) return rows;
      }
      return [];
    }
  }, index);
  if (!marked) return false;
  await page.locator("[data-abr-bot-open-chat='1']").click({ force: true, timeout: 5000 });
  await page.evaluate(() => document.querySelector("[data-abr-bot-open-chat='1']")?.removeAttribute("data-abr-bot-open-chat")).catch(() => {});
  return true;
}

async function readOpenChat(page) {
  return page.evaluate(() => {
    const main = document.querySelector("#main") || document;
    const title = Array.from(main.querySelectorAll("header span[title]"))
      .map((node) => node.getAttribute("title") || "")
      .find((value) => value && !/^(online|digitando|typing)$/i.test(value))
      || main.querySelector("header [dir='auto']")?.textContent?.trim()
      || "Contato WhatsApp";
    const rows = messageRows(main);
    const messages = rows.slice(-30).map((row, index) => {
      const messageNode = row.closest(".message-in,.message-out") || row;
      const dataNode = messageNode.closest("[data-id]") || messageNode;
      const id = dataNode.getAttribute("data-id") || `m${index + 1}`;
      const copyable = row.querySelector(".copyable-text") || row.querySelector("[data-pre-plain-text]") || row;
      const pre = copyable.getAttribute?.("data-pre-plain-text") || "";
      let text = (copyable.textContent || "").replace(/\s+/g, " ").trim();
      if (pre && text.startsWith(pre)) text = text.slice(pre.length).trim();
      const className = String(messageNode.className || dataNode.className || "");
      return {
        id: id.slice(0, 80),
        direction: id.startsWith("true_") || className.includes("message-out") ? "out" : "in",
        text: text.slice(0, 1000)
      };
    }).filter((message) => message.text);
    const chatPhone = phoneFromIds(messages.map((message) => message.id));
    return { chatTitle: title, chatPhone, messages, candidateCount: rows.length };

    function messageRows(scope) {
      const byDataId = Array.from(scope.querySelectorAll("[data-id]")).filter((row) => /^(true|false)_/.test(row.getAttribute("data-id") || ""));
      if (byDataId.length) return byDataId;
      return Array.from(scope.querySelectorAll(".copyable-text, [data-pre-plain-text]")).map((node) => {
        return node.closest(".message-in,.message-out") || node.closest("[data-id]") || node;
      });
    }

    function phoneFromIds(ids) {
      for (const id of ids) {
        const match = String(id || "").match(/_(55\d{10,13})@(?:c|s)\.us/i);
        if (match) return `+${match[1]}`;
      }
      return "";
    }
  });
}

async function fillComposer(page, text) {
  const composer = page.locator("#main footer [contenteditable='true']").last();
  await composer.fill(text);
}

async function loginCrm() {
  const result = await postJson("/v1/auth/login", { email: config.email, password: config.password }, false);
  if (!result.token) throw new Error("Login CRM sem token");
  return result.token;
}

async function postJson(path, body, authenticated = true) {
  const headers = { "content-type": "application/json" };
  if (authenticated && authToken) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(`${config.apiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error || response.statusText);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function loadDotEnv(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function loadTraining(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    log(`Treinamento nao carregado (${path}): ${error.message}`);
    return {};
  }
}

function loadState(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function persistState() {
  try {
    mkdirSync(dirname(config.stateFile), { recursive: true });
    writeFileSync(config.stateFile, JSON.stringify({
      seen: Object.fromEntries(seen),
      awaitingCustomer: Object.fromEntries(awaitingCustomer),
      handledTransfers: Object.fromEntries(handledTransfers)
    }, null, 2));
  } catch (error) {
    log(`Estado nao salvo: ${error.message}`);
  }
}

function envBool(key, fallback) {
  const value = String(process.env[key] || "").trim().toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(value)) return true;
  if (["0", "false", "no", "nao", "não", "off"].includes(value)) return false;
  return fallback;
}

function envInt(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envChoice(key, choices, fallback) {
  const value = String(process.env[key] || "").trim();
  return choices.includes(value) ? value : fallback;
}

function stripSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function phoneFromTitle(title) {
  const digits = String(title || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return `+${digits.startsWith("55") ? digits : `55${digits}`}`;
}

function customerPhoneFromSnapshot(snapshot) {
  return snapshot.chatPhone || phoneFromTitle(snapshot.chatTitle);
}

function withChatCandidate(snapshot, chat) {
  const candidateTitle = String(chat?.title || "").trim();
  if (!candidateTitle) return snapshot;
  const currentTitle = String(snapshot.chatTitle || "").trim();
  const genericTitle = /^(conta comercial|business account|clique para mostrar|click to view)/i.test(currentTitle);
  return {
    ...snapshot,
    chatTitle: currentTitle && !genericTitle ? currentTitle : candidateTitle,
    chatPhone: snapshot.chatPhone || phoneFromTitle(candidateTitle)
  };
}

function chatKey(snapshot) {
  return snapshot.chatPhone || snapshot.chatTitle || "active";
}

function isCoolingDown(key, snapshot) {
  if (hasTransferToPietraCommand(snapshot.messages)) return false;
  return (cooldowns.get(key) || 0) > Date.now();
}

function markCooldown(snapshot) {
  cooldowns.set(chatKey(snapshot), Date.now() + envInt("WHATSAPP_BOT_CHAT_COOLDOWN_MS", 120000));
}

function markAwaitingCustomer(snapshot) {
  awaitingCustomer.set(chatKey(snapshot), {
    incomingCount: incomingCount(snapshot),
    fingerprint: incomingFingerprint(snapshot)
  });
  persistState();
}

function isAwaitingCustomer(key, snapshot, fingerprint) {
  const pending = awaitingCustomer.get(key);
  if (!pending) return false;
  if (incomingCount(snapshot) <= pending.incomingCount) return true;
  if (fingerprint === pending.fingerprint) return true;
  awaitingCustomer.delete(key);
  persistState();
  return false;
}

function isHandledTransfer(snapshot, customerPhone = "") {
  const keys = transferDedupKeys(snapshot, customerPhone);
  const now = Date.now();
  return keys.some((key) => {
    const handledAt = Number(handledTransfers.get(key) || 0);
    return handledAt > 0 && now - handledAt < config.transferLockMs;
  });
}

function markHandledTransfer(snapshot, customerPhone = "") {
  for (const key of transferDedupKeys(snapshot, customerPhone)) {
    handledTransfers.set(key, Date.now());
  }
  persistState();
}

function transferDedupKeys(snapshot, customerPhone = "") {
  const fingerprint = transferCommandFingerprint(snapshot);
  if (!fingerprint) return [];
  const keys = [`chat:${chatKey(snapshot)}:${fingerprint}`];
  if (customerPhone) {
    keys.push(`phone:${customerPhone}`);
    keys.push(`phone-command:${customerPhone}:${fingerprint}`);
  }
  return keys;
}

function transferCommandFingerprint(snapshot) {
  return snapshot.messages
    .filter((message) => message.direction === "in")
    .slice(-8)
    .map((message) => normalizeTextLocal(message.text))
    .filter((text) => /TRANSFERIR|TRANSFERE|PASSA|PASSAR|ENCAMINH/.test(text) && /PIETRA/.test(text))
    .join("|");
}

function incomingCount(snapshot) {
  return snapshot.messages.filter((message) => message.direction === "in").length;
}

function incomingFingerprint(snapshot) {
  return snapshot.messages
    .filter((message) => message.direction === "in")
    .slice(-8)
    .map((message) => normalizeTextLocal(message.text))
    .filter(Boolean)
    .join("|");
}

function hasTransferToPietraCommand(messages) {
  return messages.slice(-8).some((message) => {
    const text = normalizeTextLocal(message.text);
    return /TRANSFERIR|TRANSFERE|PASSA|PASSAR|ENCAMINH/.test(text) && /PIETRA/.test(text);
  });
}

function qualificationSummary(messages) {
  const useful = messages
    .filter((message) => message.direction === "in")
    .slice(-8)
    .map((message) => message.text)
    .filter(Boolean);
  return useful.length ? `Resumo automatico para transferencia:\n${useful.join("\n")}`.slice(0, 1000) : "Transferencia solicitada para Pietra.";
}

function normalizeTextLocal(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function nameFromTitle(title) {
  return /^\+?[\d\s().-]+$/.test(String(title || "").trim()) ? "" : String(title || "").trim();
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function describeError(error) {
  const parts = [];
  if (error.status) parts.push(`status=${error.status}`);
  parts.push(error.message || String(error));
  if (error.data && typeof error.data === "object") {
    const safe = {
      error: error.data.error,
      allowed_email: error.data.allowed_email,
      offline: error.data.offline,
      status: error.data.status
    };
    parts.push(JSON.stringify(Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== undefined))));
  }
  return parts.join(" ");
}

function log(message) {
  console.log(`[whatsapp-bot] ${new Date().toISOString()} ${message}`);
}

main().catch((error) => {
  console.error("[whatsapp-bot] erro fatal:", error);
  process.exitCode = 1;
});
