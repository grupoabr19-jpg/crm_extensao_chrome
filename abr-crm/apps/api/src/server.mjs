import { createServer } from "node:http";
import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlaceholderConnectionString, loadDotEnv } from "./env.mjs";
import { makeMemoryStorage, makePostgresStorage } from "./storage.mjs";

loadDotEnv();

const PORT = Number(process.env.PORT || 10000);
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || "http://localhost:5173";
const ALLOWED_EXTENSION_IDS = (process.env.ALLOWED_EXTENSION_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const API_ADMIN_TOKEN = process.env.API_ADMIN_TOKEN || "";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const STARTED_AT = new Date().toISOString();
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "../public");

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function protocol() {
  const b = cryptoRandomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i += 1) s += ALPHABET[b[i] & 31];
  return `ABR-${s.slice(0, 4)}-${s.slice(4)}`;
}

function handoffLink(targetE164, publicProtocol) {
  const text = `Ola! Meu protocolo de atendimento ABR e ${publicProtocol}`;
  return `https://wa.me/${targetE164.slice(1)}?text=${encodeURIComponent(text)}`;
}

function externalHandoffMessage({ firstName, responsibleName, department, link, publicProtocol }) {
  const thanks = firstName ? `Obrigado, ${firstName}.` : "Obrigado.";
  return `${thanks} Registrei sua solicitacao. Para continuar, fale com ${responsibleName}, do ${department}: ${link}. Clique no link e envie a mensagem que aparecer. Protocolo: ${publicProtocol}.`;
}

const storageDeps = { protocol, handoffLink, externalHandoffMessage };
let storage = !isPlaceholderConnectionString(process.env.DATABASE_URL) && process.env.ABR_STORAGE !== "memory"
  ? makePostgresStorage({ connectionString: process.env.DATABASE_URL, ...storageDeps })
  : makeMemoryStorage(storageDeps);

function send(res, status, body, headers = {}) {
  const payload = body == null ? "" : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-abr-device-id,x-abr-extension-id",
    ...headers
  });
  res.end(payload);
}

function sendText(res, status, body, contentType, headers = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-abr-device-id,x-abr-extension-id",
    ...headers
  });
  res.end(body);
}

async function sendFile(res, status, path, contentType) {
  const payload = await readFile(path);
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req, res) {
  if (!API_ADMIN_TOKEN) return true;
  const got = req.headers.authorization || req.headers["x-api-admin-token"] || "";
  const token = String(got).replace(/^Bearer\s+/i, "");
  if (token === API_ADMIN_TOKEN) return true;
  send(res, 401, { error: "unauthorized" });
  return false;
}

async function runGroqSmokeTest(body) {
  if (!process.env.GROQ_API_KEY || /__preencher__/i.test(process.env.GROQ_API_KEY)) {
    return { ok: false, error: "groq_key_not_configured" };
  }
  const configuredModel = body.model || process.env.GROQ_MODEL || "";
  const model = configuredModel && !/__preencher__/i.test(configuredModel) ? configuredModel : "openai/gpt-oss-120b";
  const prompt = body.prompt || "Responda somente OK se voce recebeu esta mensagem de teste do CRM Grupo ABR.";
  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: "system", content: "Voce e um verificador tecnico do CRM ABR. Nao informe precos, prazos, estoque ou promessas comerciais." },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data.error?.message || response.statusText };
  return {
    ok: true,
    model,
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage || null
  };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, null);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, {
        ok: true,
        service: "abr-crm-api",
        mode: storage.mode,
        started_at: STARTED_AT,
        now: new Date().toISOString()
      });
    }

    if (req.method === "GET" && url.pathname === "/readyz") {
      await storage.ready();
      return send(res, 200, { ok: true, mode: storage.mode, now: new Date().toISOString() });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/crm")) {
      return sendFile(res, 200, resolve(publicDir, "crm.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/v1/bootstrap") {
      await storage.ready();
      return send(res, 200, await storage.bootstrap());
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/test") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      return send(res, 200, await runGroqSmokeTest(body));
    }

    if (req.method === "POST" && url.pathname === "/v1/tests/transfer") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      await storage.ready();
      const customerPhone = body.customerPhone || process.env.ABR_TEST_CUSTOMER_PHONE || "+5511999991234";
      const destinationPhone = body.destinationPhone || process.env.ABR_TEST_DESTINATION_PHONE || "+5511999990001";
      const destinationName = body.destinationName || process.env.ABR_TEST_DESTINATION_NAME || "Vendedor ABR Teste";
      const created = await storage.createCase({
        name: body.customerName || "Cliente Teste ABR",
        phone: customerPhone,
        company: body.company || "Empresa Teste",
        city: body.city || "Jundiai",
        uf: body.uf || "SP",
        segment: body.segment || "Construtoras",
        department: body.department || "Vendas",
        pipeline: body.pipeline || "VAREJO",
        stage: body.stage || "Novo Lead",
        need: body.need || "Teste de transferencia entre numeros",
        responsibleName: destinationName,
        responsiblePhone: destinationPhone,
        source: "Nao informado"
      });
      if (created.error) return send(res, 422, created);
      const command = await storage.queueHandoffMessage(created.case.id);
      return send(res, 201, { scenario: "transfer_smoke_test", ...created, outbox: command.command || command });
    }

    if (req.method === "POST" && url.pathname === "/v1/devices/register") {
      const body = await readBody(req);
      await storage.ready();
      return send(res, 201, await storage.registerDevice(body));
    }

    if (req.method === "POST" && url.pathname === "/v1/routing/simulate") {
      const body = await readBody(req);
      await storage.ready();
      return send(res, 200, await storage.simulateRouting(body));
    }

    if (req.method === "POST" && url.pathname === "/v1/cases") {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.createCase(body);
      if (result.error === "invalid_phone") return send(res, 422, result);
      return send(res, 201, result);
    }

    if (req.method === "GET" && url.pathname === "/v1/cases") {
      await storage.ready();
      return send(res, 200, await storage.listCases());
    }

    if (req.method === "GET" && url.pathname === "/v1/reports/kpis") {
      await storage.ready();
      return send(res, 200, await storage.kpis());
    }

    if (req.method === "GET" && url.pathname === "/v1/reports/cases.csv") {
      await storage.ready();
      const csv = await storage.exportCasesCsv();
      return sendText(res, 200, csv, "text/csv; charset=utf-8", { "content-disposition": "attachment; filename=abr-cases.csv" });
    }

    if (req.method === "GET" && url.pathname === "/v1/funnels") {
      await storage.ready();
      return send(res, 200, await storage.listFunnels());
    }

    const board = /^\/v1\/funnels\/([^/]+)\/board$/.exec(url.pathname);
    if (req.method === "GET" && board) {
      await storage.ready();
      return send(res, 200, await storage.funnelBoard(decodeURIComponent(board[1])));
    }

    const move = /^\/v1\/cases\/([^/]+)\/stage$/.exec(url.pathname);
    if (req.method === "POST" && move) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.moveCaseStage(move[1], body.stageId);
      if (result.error === "case_not_found" || result.error === "stage_not_found") return send(res, 404, result);
      return send(res, 200, result);
    }

    const task = /^\/v1\/cases\/([^/]+)\/tasks$/.exec(url.pathname);
    if (req.method === "POST" && task) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.createTask(task[1], body);
      if (result.error === "case_not_found") return send(res, 404, result);
      return send(res, 201, result);
    }

    if (req.method === "GET" && url.pathname === "/v1/tasks") {
      await storage.ready();
      return send(res, 200, await storage.listTasks());
    }

    const note = /^\/v1\/cases\/([^/]+)\/notes$/.exec(url.pathname);
    if (req.method === "POST" && note) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.addNote(note[1], body);
      if (result.error === "case_not_found") return send(res, 404, result);
      return send(res, 201, result);
    }

    const closeCase = /^\/v1\/cases\/([^/]+)\/close$/.exec(url.pathname);
    if (req.method === "POST" && closeCase) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.closeCase(closeCase[1], body);
      if (result.error === "case_not_found") return send(res, 404, result);
      return send(res, 200, result);
    }

    const transfer = /^\/v1\/cases\/([^/]+)\/transfer$/.exec(url.pathname);
    if (req.method === "POST" && transfer) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.transferCase(transfer[1], body);
      if (result.error === "case_not_found") return send(res, 404, result);
      return send(res, 201, result);
    }

    const queueMessage = /^\/v1\/cases\/([^/]+)\/outbox\/handoff-message$/.exec(url.pathname);
    if (req.method === "POST" && queueMessage) {
      await storage.ready();
      const result = await storage.queueHandoffMessage(queueMessage[1]);
      if (result.error === "case_not_found") return send(res, 404, result);
      return send(res, 201, result);
    }

    if (req.method === "GET" && url.pathname === "/v1/outbox") {
      await storage.ready();
      return send(res, 200, await storage.listOutbox());
    }

    const outboxAck = /^\/v1\/outbox\/([^/]+)\/ack$/.exec(url.pathname);
    if (req.method === "POST" && outboxAck) {
      const body = await readBody(req);
      await storage.ready();
      const result = await storage.ackOutbox(outboxAck[1], body);
      if (result.error === "outbox_not_found") return send(res, 404, result);
      return send(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/v1/handoffs/pending") {
      await storage.ready();
      return send(res, 200, await storage.pendingHandoffs(url.searchParams.get("destination_phone") || ""));
    }

    const claim = /^\/v1\/handoffs\/([^/]+)\/claim$/.exec(url.pathname);
    if (req.method === "POST" && claim) {
      await storage.ready();
      const result = await storage.claimHandoff(claim[1]);
      if (result.error === "handoff_not_found") return send(res, 404, result);
      return send(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/v1/observations") {
      const body = await readBody(req);
      await storage.ready();
      return send(res, 202, await storage.recordObservation(body, req.headers));
    }

    return send(res, 404, { error: "not_found", path: url.pathname });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal_error";
    const status = message === "invalid_json" ? 400 : message === "database_not_migrated" ? 503 : 500;
    return send(res, status, { error: message });
  }
}

const server = createServer(handler);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ABR CRM API MVP listening on http://0.0.0.0:${PORT}`);
  console.log(`Storage mode: ${storage.mode}`);
  if (ALLOWED_EXTENSION_IDS.length) console.log(`Allowed extension ids configured: ${ALLOWED_EXTENSION_IDS.join(", ")}`);
  console.log(`Admin origin hint: ${ADMIN_ORIGIN}`);
});

async function shutdown() {
  await storage.close().catch(() => {});
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
