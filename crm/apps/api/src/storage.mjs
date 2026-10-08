import pg from "pg";
import { randomUUID } from "node:crypto";
import { pgSslConfig } from "./env.mjs";

const { Pool } = pg;

export function normalizePhone(raw) {
  const original = String(raw || "").trim();
  let digits = original.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty", original };
  const international = original.startsWith("+") || digits.startsWith("55");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!international && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits) && !(digits.length >= 8 && digits.length <= 15)) {
    return { ok: false, reason: "invalid_length", original };
  }
  return { ok: true, e164: `+${digits}`, original };
}

function normalizeSaleValue(raw) {
  if (raw == null || String(raw).trim() === "") return { ok: true, value: null };
  const value = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(value) && value >= 0
    ? { ok: true, value }
    : { ok: false, value: null };
}

function normalizePotential(value) {
  const map = {
    baixo: "low",
    medio: "medium",
    "médio": "medium",
    alto: "high",
    "conta-chave": "key_account",
    "conta chave": "key_account"
  };
  const key = String(value || "").trim().toLowerCase();
  return map[key] || null;
}

function normalizeTemperature(value) {
  const map = {
    quente: "hot",
    morno: "warm",
    frio: "cold"
  };
  const key = String(value || "").trim().toLowerCase();
  return map[key] || null;
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function dddFromPhone(raw) {
  const phone = normalizePhone(raw || "");
  if (!phone.ok) return null;
  const digits = phone.e164.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits.slice(2, 4) : null;
}

function inferSalesFunction(input) {
  const explicit = String(input.salesFunction || input.sellerFunction || "").trim().toLowerCase();
  const allowed = new Set(["adm_sdr", "vendedor_externo", "especialista", "corporativo", "construcao_civil"]);
  if (allowed.has(explicit)) return explicit;
  const text = normalizeText([input.segment, input.department, input.need, input.pipeline].filter(Boolean).join(" "));
  if (/(CONSTRUCAO|CONSTRUTORA|OBRA|CIVIL|ENGENHARIA)/.test(text)) return "construcao_civil";
  if (/(CORPORATIVO|INDUSTRIA|INDUSTRIAL|TRANSPORTE|MANUTENCAO)/.test(text)) return "corporativo";
  if (/(ESPECIALISTA|TECNICO|TECNICA|PROJETO)/.test(text)) return "especialista";
  return "vendedor_externo";
}

const CITY_REGION = new Map(Object.entries({
  ATIBAIA: "BRAGANCA",
  PIRACAIA: "BRAGANCA",
  "BOM JESUS DOS PERDOES": "BRAGANCA",
  JOANOPOLIS: "BRAGANCA",
  VARGEM: "BRAGANCA",
  "NAZARE PAULISTA": "BRAGANCA",
  MAIRIPORA: "BRAGANCA",
  ITATIBA: "JUNDIAI",
  JARINU: "JUNDIAI",
  "VARZEA PAULISTA": "JUNDIAI",
  "CAMPO LIMPO": "JUNDIAI",
  ITUPEVA: "JUNDIAI",
  CAJAMAR: "JUNDIAI",
  VINHEDO: "JUNDIAI",
  "TRES PONTAS": "VARGINHA",
  "TRES CORACOES": "VARGINHA",
  "ELOI MENDES": "VARGINHA",
  PARAGUACU: "VARGINHA",
  "MONSENHOR PAULO": "VARGINHA",
  CAMPANHA: "VARGINHA",
  CAMBUQUIRA: "VARGINHA",
  "SAO GONCALO": "VARGINHA",
  CAREACU: "VARGINHA",
  COQUEIRAL: "VARGINHA",
  "SANTANA DA VARGEM": "VARGINHA",
  JACUTINGA: "POUSO ALEGRE",
  "BORDA DA MATA": "POUSO ALEGRE",
  "BUENO BRANDAO": "POUSO ALEGRE",
  LAMBARI: "POUSO ALEGRE",
  CAXAMBU: "POUSO ALEGRE",
  "SAO LOURENCO": "POUSO ALEGRE",
  "SAO SEBASTIAO DA BELA VISTA": "POUSO ALEGRE",
  NATERCIA: "POUSO ALEGRE",
  HELIODORA: "POUSO ALEGRE",
  "OURO FINO": "POUSO ALEGRE",
  BAEPENDI: "POUSO ALEGRE",
  "CARMO DE MINAS": "POUSO ALEGRE",
  "MONTE SIAO": "POUSO ALEGRE",
  INCONFIDENTES: "POUSO ALEGRE",
  "CONCEICAO DO RIO VERDE": "POUSO ALEGRE",
  ALFENAS: "POCOS DE CALDAS",
  MACHADO: "POCOS DE CALDAS",
  CALDAS: "POCOS DE CALDAS",
  "SANTA RITA DE CALDAS": "POCOS DE CALDAS",
  CONGONHAL: "POCOS DE CALDAS",
  "POCO FUNDO": "POCOS DE CALDAS",
  SILVIANOPOLIS: "POCOS DE CALDAS",
  FAMA: "POCOS DE CALDAS",
  ANDRADAS: "POCOS DE CALDAS",
  "CAMPOS GERAIS": "POCOS DE CALDAS",
  IBITIURA: "POCOS DE CALDAS",
  "SANTA RITA SAPUCAI": "ITAJUBA",
  PIRANGUINHO: "ITAJUBA",
  "MARIA DA FE": "ITAJUBA",
  PEDRALVA: "ITAJUBA",
  VIRGINIA: "ITAJUBA",
  "DELFIM MOREIRA": "ITAJUBA",
  GONCALVES: "ITAJUBA",
  "SAPUCAI MIRIM": "ITAJUBA",
  "SAO BENTO": "ITAJUBA",
  "CONCEICAO DOS OUROS": "ITAJUBA",
  "CACHOEIRA DE MINAS": "ITAJUBA",
  BRASOPOLIS: "ITAJUBA",
  PARAISOPOLIS: "ITAJUBA",
  "SAO JOSE DO ALEGRE": "ITAJUBA",
  CONSOLACAO: "ITAJUBA",
  TOLEDO: "EXTREMA",
  MUNHOZ: "EXTREMA",
  "PEDRA BELA": "EXTREMA",
  PINHALZINHO: "EXTREMA",
  SOCORRO: "EXTREMA",
  "SERRA NEGRA": "EXTREMA",
  "BOM REPOUSO": "CAMBUI",
  SENADOR: "CAMBUI",
  ESTIVA: "CAMBUI",
  CAMANDUCAIA: "CAMBUI",
  ITAPEVA: "CAMBUI",
  "CORREGO DO BOM JESUS": "CAMBUI"
}));

function inferRegion(input) {
  return normalizeText(input.region || CITY_REGION.get(normalizeText(input.city)) || input.city);
}

export function makeMemoryStorage({ protocol, handoffLink, externalHandoffMessage }) {
  const db = {
    organization: { id: randomUUID(), name: "Grupo ABR MVP" },
    users: [
      { id: randomUUID(), name: "Triagem ABR", role: "sdr", phone: "+5511999990000", department: "Triagem" },
      { id: randomUUID(), name: "Vendedor ABR", role: "seller", phone: "+5511999990001", department: "Vendas" }
    ],
    sellers: [],
    devices: [],
    cases: [],
    handoffs: [],
    observations: [],
    audit: []
  };

  function routeLead(input) {
    const requested = normalizePhone(input.responsiblePhone || "");
    const fallback = db.users.find((u) => u.role === "seller") || db.users[1];
    if (requested.ok) {
      return {
        user: {
          id: `manual-${requested.e164}`,
          name: String(input.responsibleName || "Responsavel ABR").slice(0, 120),
          phone: requested.e164,
          department: String(input.department || "Vendas").slice(0, 80)
        },
        reason: "Destino manual informado no painel MVP"
      };
    }
    return { user: fallback, reason: "Fallback MVP: vendedor demonstrativo" };
  }

  function publicState() {
    return {
      organization: db.organization,
      users: db.users,
      counts: {
        cases: db.cases.length,
        handoffs: db.handoffs.length,
        observations: db.observations.length,
        devices: db.devices.length
      }
    };
  }
  function memoryFunnels() {
    return [
      {
        id: "varejo",
        name: "VAREJO",
        stages: [
          { id: "novo", name: "Novo Lead", position: 1 },
          { id: "contato", name: "Contato", position: 2 },
          { id: "qualificacao", name: "Qualificacao", position: 3 },
          { id: "cotacao", name: "Cotacao", position: 4 },
          { id: "ganha", name: "Venda ganha", position: 5 },
          { id: "perdida", name: "Venda perdida", position: 6 }
        ]
      }
    ];
  }

  return {
    mode: "mvp-memory",
    ready: async () => {},
    bootstrap: async () => publicState(),
    registerDevice: async (body) => {
      const phone = normalizePhone(body.localPhone || "");
      const device = {
        id: randomUUID(),
        label: String(body.label || "Chrome ABR").slice(0, 120),
        local_phone: phone.ok ? phone.e164 : null,
        mode: body.mode === "destination" ? "destination" : "main",
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      };
      db.devices.push(device);
      return { device, state: publicState() };
    },
    simulateRouting: async (body) => {
      const routed = routeLead(body);
      return { destination: routed.user, reason: routed.reason };
    },
    authenticateUser: async () => {
      return { error: "invalid_credentials" };
    },
    listSellers: async () => ({ items: db.sellers, total: db.sellers.length }),
    createSeller: async (body) => {
      const seller = {
        id: randomUUID(),
        name: String(body.name || body.displayName || "").slice(0, 120),
        email: String(body.email || "").toLowerCase(),
        sales_function: inferSalesFunction(body),
        profile_title: body.profileTitle || body.profile_title || "Vendedor",
        whatsapp_e164: normalizePhone(body.whatsapp || body.whatsapp_e164 || "").e164 || null,
        routes: Array.isArray(body.routes) ? body.routes : []
      };
      db.sellers.unshift(seller);
      return { seller };
    },
    deactivateSeller: async (profileId) => {
      const seller = db.sellers.find((item) => item.id === profileId || item.profile_id === profileId);
      if (!seller) return { error: "seller_not_found" };
      seller.active = false;
      return { ok: true, profile_id: profileId };
    },
    createCase: async (body) => {
      const phone = normalizePhone(body.phone || "");
      if (!phone.ok) return { error: "invalid_phone", detail: phone.reason };
      const saleValue = normalizeSaleValue(body.saleValue);
      if (!saleValue.ok) return { error: "invalid_sale_value" };
      const routed = routeLead(body);
      const publicProtocol = protocol();
      const link = handoffLink(routed.user.phone, publicProtocol);
      const createdAt = new Date().toISOString();
      const crmCase = {
        id: randomUUID(),
        protocol: publicProtocol,
        status: "awaiting_arrival",
        contact: { name: String(body.name || "").trim() || null, phone: phone.e164, original_phone: phone.original },
        fields: {
          company: body.company || null,
          city: body.city || null,
          uf: body.uf || null,
          segment: body.segment || null,
          need: body.need || null,
          department: body.department || routed.user.department,
          pipeline: body.pipeline || "VAREJO",
          stage: body.stage || "Novo Lead",
          potential: body.potential || null,
          temperature: body.temperature || null,
          saleValue: saleValue.value,
          source: body.source || null
        },
        owner: routed.user,
        routing_reason: routed.reason,
        created_at: createdAt,
        updated_at: createdAt
      };
      const handoff = {
        id: randomUUID(),
        case_id: crmCase.id,
        protocol: publicProtocol,
        destination_phone: routed.user.phone,
        destination_name: routed.user.name,
        destination_department: routed.user.department,
        link,
        message: externalHandoffMessage({
          firstName: crmCase.contact.name ? crmCase.contact.name.split(/\s+/)[0] : null,
          responsibleName: routed.user.name,
          department: routed.user.department,
          link,
          publicProtocol
        }),
        state: "created",
        created_at: createdAt,
        events: [{ type: "created", at: createdAt, reason: routed.reason }]
      };
      db.cases.unshift(crmCase);
      db.handoffs.unshift(handoff);
      if (body.nextTask) {
        db.tasks ||= [];
        db.tasks.unshift({ id: randomUUID(), case_id: crmCase.id, title: String(body.nextTask).slice(0, 200), status: "open", created_at: createdAt });
      }
      return { case: crmCase, handoff };
    },
    updateCase: async (caseId, body) => {
      const found = db.cases.find((item) => item.id === caseId);
      if (!found) return { error: "case_not_found" };
      const phone = normalizePhone(body.phone || "");
      if (!phone.ok) return { error: "invalid_phone", detail: phone.reason };
      const saleValue = normalizeSaleValue(body.saleValue);
      if (!saleValue.ok) return { error: "invalid_sale_value" };
      found.contact.name = String(body.name || "").trim() || null;
      found.contact.phone = phone.e164;
      found.contact.original_phone = phone.original;
      found.fields.company = body.company || null;
      found.fields.city = body.city || null;
      found.fields.uf = body.uf || null;
      found.fields.segment = body.segment || null;
      found.fields.department = body.department || found.fields.department;
      found.fields.source = body.source || null;
      found.fields.need = body.need || null;
      found.fields.potential = body.potential || null;
      found.fields.temperature = body.temperature || null;
      found.fields.saleValue = saleValue.value;
      found.updated_at = new Date().toISOString();
      return { case: found };
    },
    listCases: async () => ({ items: db.cases, total: db.cases.length }),
    listFunnels: async () => ({ items: memoryFunnels() }),
    funnelBoard: async (pipelineId) => {
      const funnel = memoryFunnels().find((f) => f.id === pipelineId || f.name === pipelineId) || memoryFunnels()[0];
      const columns = funnel.stages.map((stage) => ({
        ...stage,
        cards: db.cases.filter((c) => (c.fields.stage || "Novo Lead") === stage.name || (c.fields.stage || "").toLowerCase() === stage.id)
      }));
      return { funnel, columns };
    },
    moveCaseStage: async (caseId, stageId) => {
      const found = db.cases.find((c) => c.id === caseId);
      if (!found) return { error: "case_not_found" };
      const stage = memoryFunnels().flatMap((f) => f.stages).find((s) => s.id === stageId || s.name === stageId);
      if (!stage) return { error: "stage_not_found" };
      found.fields.stage = stage.name;
      found.updated_at = new Date().toISOString();
      return { case: found };
    },
    createTask: async (caseId, body) => {
      const found = db.cases.find((c) => c.id === caseId);
      if (!found) return { error: "case_not_found" };
      const task = { id: randomUUID(), case_id: caseId, title: String(body.title || "Follow-up").slice(0, 200), due_at: body.dueAt || null, status: "open", created_at: new Date().toISOString() };
      db.tasks ||= [];
      db.tasks.unshift(task);
      return { task };
    },
    listTasks: async () => ({ items: db.tasks || [], total: (db.tasks || []).length }),
    addNote: async (caseId, body) => {
      const found = db.cases.find((c) => c.id === caseId);
      if (!found) return { error: "case_not_found" };
      const note = { id: randomUUID(), case_id: caseId, body: String(body.body || "").slice(0, 4000), created_at: new Date().toISOString() };
      db.notes ||= [];
      db.notes.unshift(note);
      return { note };
    },
    closeCase: async (caseId, body) => {
      const found = db.cases.find((c) => c.id === caseId);
      if (!found) return { error: "case_not_found" };
      found.status = "closed";
      found.fields.stage = body.outcome === "lost" ? "Venda perdida" : "Venda ganha";
      found.fields.lossReason = body.lossReason || null;
      found.fields.lossDetail = body.lossDetail || null;
      found.fields.saleValue = body.saleValue || null;
      found.updated_at = new Date().toISOString();
      return { case: found };
    },
    transferCase: async (caseId, body) => {
      const found = db.cases.find((c) => c.id === caseId);
      if (!found) return { error: "case_not_found" };
      const routed = routeLead(body);
      const publicProtocol = protocol();
      const link = handoffLink(routed.user.phone, publicProtocol);
      const handoff = {
        id: randomUUID(),
        case_id: caseId,
        protocol: publicProtocol,
        destination_phone: routed.user.phone,
        destination_name: routed.user.name,
        destination_department: routed.user.department,
        link,
        message: externalHandoffMessage({ firstName: found.contact.name ? found.contact.name.split(/\s+/)[0] : null, responsibleName: routed.user.name, department: routed.user.department, link, publicProtocol }),
        state: "created",
        created_at: new Date().toISOString(),
        events: [{ type: "created", at: new Date().toISOString(), reason: "Transferencia manual MVP" }]
      };
      db.handoffs.unshift(handoff);
      return { case: found, handoff };
    },
    queueHandoffMessage: async (caseId) => {
      const found = db.cases.find((c) => c.id === caseId);
      const handoff = db.handoffs.find((h) => h.case_id === caseId);
      if (!found || !handoff) return { error: "case_not_found" };
      const command = { id: randomUUID(), case_id: caseId, handoff_id: handoff.id, kind: "handoff_link", state: "created", payload: { message: handoff.message, link: handoff.link, protocol: handoff.protocol }, created_at: new Date().toISOString() };
      db.outbox ||= [];
      db.outbox.unshift(command);
      return { command };
    },
    listOutbox: async () => ({ items: db.outbox || [], total: (db.outbox || []).length }),
    ackOutbox: async (id, body) => {
      const command = (db.outbox || []).find((c) => c.id === id);
      if (!command) return { error: "outbox_not_found" };
      command.state = ["observed", "uncertain", "cancelled", "failed"].includes(body.state) ? body.state : "observed";
      command.updated_at = new Date().toISOString();
      return { command };
    },
    kpis: async (pipelineId) => {
      const funnel = pipelineId ? memoryFunnels().find((item) => item.id === pipelineId || item.name.toLowerCase() === String(pipelineId).toLowerCase()) : null;
      const cases = funnel ? db.cases.filter((item) => String(item.fields.pipeline || "").toLowerCase() === funnel.name.toLowerCase()) : db.cases;
      const caseIds = new Set(cases.map((item) => item.id));
      const handoffs = db.handoffs.filter((item) => caseIds.has(item.case_id));
      const tasks = (db.tasks || []).filter((item) => caseIds.has(item.case_id));
      const byStatus = Object.entries(cases.reduce((acc, item) => (acc[item.status] = (acc[item.status] || 0) + 1, acc), {})).map(([status, count]) => ({ status, count }));
      const won = cases.filter((item) => item.fields.stage === "Venda ganha").length;
      const lost = cases.filter((item) => item.fields.stage === "Venda perdida").length;
      return {
        funnel: funnel ? { id: funnel.id, name: funnel.name } : null,
        totals: {
          cases: cases.length,
          closed: cases.filter((item) => item.status === "closed").length,
          won,
          lost,
          sale_value: cases.reduce((sum, item) => sum + Number(item.fields.saleValue || 0), 0)
        },
        handoffs: { total: handoffs.length, claimed: handoffs.filter((item) => item.state === "claimed").length },
        tasks: { open: tasks.filter((item) => item.status === "open").length, overdue: 0 },
        byStatus,
        byPipeline: funnel ? [{ pipeline: funnel.name, count: cases.length }] : []
      };
    },
    exportCasesCsv: async () => {
      const header = ["id", "protocol", "status", "name", "phone", "city", "uf", "segment", "pipeline", "stage", "owner", "created_at"];
      const rows = db.cases.map((c) => [c.id, c.protocol, c.status, c.contact.name, c.contact.phone, c.fields.city, c.fields.uf, c.fields.segment, c.fields.pipeline, c.fields.stage, c.owner?.name, c.created_at]);
      return toCsv([header, ...rows]);
    },
    pendingHandoffs: async (destinationPhone) => {
      const phone = normalizePhone(destinationPhone || "");
      const items = db.handoffs.filter((h) => h.state !== "claimed" && (!phone.ok || h.destination_phone === phone.e164));
      return { items, total: items.length };
    },
    claimHandoff: async (id) => {
      const handoff = db.handoffs.find((h) => h.id === id);
      if (!handoff) return { error: "handoff_not_found" };
      handoff.state = "claimed";
      handoff.events.push({ type: "claimed", at: new Date().toISOString() });
      const crmCase = db.cases.find((c) => c.id === handoff.case_id);
      if (crmCase) {
        crmCase.status = "in_service";
        crmCase.updated_at = new Date().toISOString();
      }
      return { handoff, case: crmCase || null };
    },
    recordObservation: async (body, headers) => {
      const item = {
        id: randomUUID(),
        device_id: headers["x-abr-device-id"] || body.device_id || null,
        kind: body.kind || "diagnostic_snapshot",
        payload: body.payload || body,
        received_at: new Date().toISOString()
      };
      db.observations.unshift(item);
      return { accepted: true, observation: item };
    },
    close: async () => {}
  };
}

export function makePostgresStorage({ connectionString, protocol, handoffLink, externalHandoffMessage }) {
  const pool = new Pool({
    connectionString,
    ssl: pgSslConfig(connectionString),
    max: Number(process.env.PGPOOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  let boot;
  async function ready() {
    boot ||= bootstrapDb();
    return boot;
  }
  async function one(sql, params = []) {
    const r = await pool.query(sql, params);
    return r.rows[0] || null;
  }
  async function many(sql, params = []) {
    const r = await pool.query(sql, params);
    return r.rows;
  }

  async function bootstrapDb() {
    const exists = await one("select to_regclass('public.organizations') as table_name");
    if (!exists?.table_name) throw new Error("database_not_migrated");

    let org = await one("select id, name from organizations order by created_at limit 1");
    if (!org) {
      org = await one("insert into organizations(name) values($1) returning id, name", ["Grupo ABR"]);
    }
    const triageDept = await ensureDepartment(org.id, "Triagem");
    const salesDept = await ensureDepartment(org.id, "Vendas");
    const triageUser = await ensureUser(org.id, "mvp-triagem@abr.local", "Triagem ABR", "sdr");
    const sellerUser = await ensureUser(org.id, "mvp-vendedor@abr.local", "Vendedor ABR", "seller");
    const mainAccount = await ensureAccount(org.id, "+5511999990000", "Principal ABR MVP", "main");
    const sellerAccount = await ensureAccount(org.id, "+5511999990001", "Vendedor ABR MVP", "employee");
    await ensureUserDepartment(triageUser.id, triageDept.id);
    await ensureUserDepartment(sellerUser.id, salesDept.id);
    await ensureBinding(org.id, triageUser.id, mainAccount.id);
    await ensureBinding(org.id, sellerUser.id, sellerAccount.id);
    return { org, triageDept, salesDept, triageUser, sellerUser, mainAccount, sellerAccount };
  }

  async function ensureDepartment(orgId, name) {
    return one(
      "insert into departments(organization_id,name) values($1,$2) on conflict (organization_id,name) do update set active=true returning id,name",
      [orgId, name]
    );
  }
  async function ensureUser(orgId, email, displayName, role) {
    const found = await one("select id, display_name as name, role from users where organization_id=$1 and lower(email)=lower($2)", [orgId, email]);
    if (found) return found;
    return one("insert into users(organization_id,email,display_name,role) values($1,$2,$3,$4) returning id, display_name as name, role", [orgId, email, displayName, role]);
  }
  async function ensureAccount(orgId, e164, label, kind) {
    const found = await one("select id,e164,label,kind from whatsapp_accounts where organization_id=$1 and e164=$2", [orgId, e164]);
    if (found) return found;
    return one("insert into whatsapp_accounts(organization_id,e164,label,kind) values($1,$2,$3,$4) returning id,e164,label,kind", [orgId, e164, label, kind]);
  }
  async function ensureUserDepartment(userId, departmentId) {
    await pool.query("insert into user_departments(user_id,department_id) values($1,$2) on conflict do nothing", [userId, departmentId]);
  }
  async function ensureBinding(orgId, userId, accountId) {
    const found = await one("select id from user_account_bindings where account_id=$1 and revoked_at is null", [accountId]);
    if (found) return found;
    return one("insert into user_account_bindings(organization_id,user_id,account_id,verified_at) values($1,$2,$3,now()) returning id", [orgId, userId, accountId]);
  }
  async function findRoutedSeller(ctx, input) {
    const channel = normalizeText(input.pipeline) === "ATACADO" ? "atacado" : "varejo";
    const salesFunction = channel === "atacado" ? "vendedor_externo" : inferSalesFunction(input);
    const routeType = channel === "atacado" ? "ddd" : "region";
    const routeValue = channel === "atacado" ? (String(input.ddd || "").replace(/\D/g, "") || dddFromPhone(input.phone)) : inferRegion(input);
    if (!routeValue) return null;
    const row = await one(`
      select sp.id profile_id, sp.profile_title, sp.sales_function, sp.whatsapp_e164,
        u.id user_id, u.display_name seller_name, u.email,
        sr.channel, sr.route_type, sr.route_value, sr.region, sr.priority
      from seller_routes sr
      join seller_profiles sp on sp.id=sr.profile_id
      join users u on u.id=sp.user_id
      where sr.organization_id=$1
        and sr.active=true
        and sp.active=true
        and sr.channel=$2
        and sr.sales_function=$3
        and sr.route_type=$4
        and lower(sr.route_value)=lower($5)
      order by sr.priority, u.display_name
      limit 1
    `, [ctx.org.id, channel, salesFunction, routeType, routeValue]);
    if (!row) return null;
    return { ...row, channel, salesFunction, routeType, routeValue };
  }
  async function ensureManualDestination(ctx, input) {
    const requested = normalizePhone(input.responsiblePhone || "");
    if (!requested.ok) {
      const routed = await findRoutedSeller(ctx, input);
      if (routed) {
        const departmentName = routed.channel === "atacado" ? "Atacado" : "Vendas";
        const department = await ensureDepartment(ctx.org.id, departmentName);
        let account = ctx.sellerAccount;
        let phone = ctx.sellerAccount.e164;
        if (routed.whatsapp_e164) {
          account = await ensureAccount(ctx.org.id, routed.whatsapp_e164, routed.seller_name, "employee");
          await ensureBinding(ctx.org.id, routed.user_id, account.id);
          phone = account.e164;
        }
        await ensureUserDepartment(routed.user_id, department.id);
        return {
          user: { id: routed.user_id, name: routed.seller_name, role: "seller" },
          account,
          department,
          phone,
          name: routed.seller_name,
          departmentName,
          route: {
            channel: routed.channel,
            sales_function: routed.salesFunction,
            route_type: routed.routeType,
            route_value: routed.routeValue,
            region: routed.region
          },
          reason: `Roteamento ${routed.channel}: ${routed.salesFunction} / ${routed.routeType} ${routed.routeValue}`
        };
      }
      return {
        user: ctx.sellerUser,
        account: ctx.sellerAccount,
        department: ctx.salesDept,
        phone: ctx.sellerAccount.e164,
        name: ctx.sellerUser.name,
        departmentName: ctx.salesDept.name,
        reason: "Fallback MVP: vendedor demonstrativo"
      };
    }
    const departmentName = String(input.department || "Vendas").slice(0, 80);
    const department = await ensureDepartment(ctx.org.id, departmentName);
    const safePhone = requested.e164.replace(/\D/g, "");
    const displayName = String(input.responsibleName || "Responsavel ABR").slice(0, 120);
    const user = await ensureUser(ctx.org.id, `mvp-${safePhone}@abr.local`, displayName, "seller");
    const account = await ensureAccount(ctx.org.id, requested.e164, displayName, "employee");
    await ensureUserDepartment(user.id, department.id);
    await ensureBinding(ctx.org.id, user.id, account.id);
    return { user, account, department, phone: account.e164, name: displayName, departmentName, reason: "Destino manual informado no painel MVP" };
  }
  async function ensureContact(orgId, phone, name) {
    const found = await one(
      "select c.id from contacts c join contact_identifiers i on i.contact_id=c.id where c.organization_id=$1 and i.e164=$2 order by c.created_at limit 1",
      [orgId, phone.e164]
    );
    if (found) {
      if (name) await pool.query("update contacts set display_name=coalesce(display_name,$2) where id=$1", [found.id, name]);
      return found;
    }
    const contact = await one("insert into contacts(organization_id,display_name) values($1,$2) returning id", [orgId, name || null]);
    await pool.query(
      "insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source,reliable) values($1,$2,'phone',$3,$4,'mvp_panel',true)",
      [orgId, contact.id, phone.e164, phone.original]
    );
    return contact;
  }
  async function findSegment(orgId, label) {
    if (!label) return null;
    return one("select id,label from segments where organization_id=$1 and lower(label)=lower($2) limit 1", [orgId, label]);
  }
  async function defaultPipeline(orgId, requested) {
    const name = requested || "VAREJO";
    const found = await one("select id,name from pipelines where organization_id=$1 and lower(name)=lower($2) limit 1", [orgId, name]);
    if (found) return found;
    return one("select id,name from pipelines where organization_id=$1 order by name limit 1", [orgId]);
  }
  async function defaultStage(pipelineId, requested) {
    if (!pipelineId) return null;
    if (requested) {
      const found = await one("select id,name,position from pipeline_stages where pipeline_id=$1 and lower(name)=lower($2) limit 1", [pipelineId, requested]);
      if (found) return found;
    }
    return one("select id,name,position from pipeline_stages where pipeline_id=$1 order by position limit 1", [pipelineId]);
  }

  function shapeCase(row) {
    return {
      id: row.id,
      protocol: row.protocol,
      status: row.status,
      contact: { name: row.contact_name, phone: row.contact_phone, original_phone: row.original_phone },
      fields: {
        company: row.company_name,
        city: row.city,
        uf: row.uf,
        segment: row.segment_label,
        need: row.need,
        department: row.department_name,
        pipeline: row.pipeline_name,
        stage: row.stage_name,
        potential: row.potential,
        temperature: row.temperature,
        saleValue: row.sale_value,
        source: row.source_name
      },
      owner: row.owner_user_id ? { id: row.owner_user_id, name: row.owner_name, phone: row.owner_phone, department: row.department_name } : null,
      routing_reason: row.routing_reason || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
  function shapeHandoff(row) {
    const link = handoffLink(row.destination_phone, row.protocol);
    return {
      id: row.id,
      case_id: row.case_id,
      protocol: row.protocol,
      destination_phone: row.destination_phone,
      destination_name: row.destination_name,
      destination_department: row.destination_department,
      link,
      message: externalHandoffMessage({
        firstName: row.contact_name ? String(row.contact_name).split(/\s+/)[0] : null,
        responsibleName: row.destination_name,
        department: row.destination_department,
        link,
        publicProtocol: row.protocol
      }),
      state: row.state,
      created_at: row.created_at,
      events: row.events || []
    };
  }

  const caseSelect = `
    select c.id, h.protocol, c.status, co.display_name contact_name, ci.e164 contact_phone, ci.original original_phone,
      c.company_name, c.city, c.uf, s.label segment_label, c.need, d.name department_name,
      p.name pipeline_name, ps.name stage_name, c.potential, c.temperature, c.sale_value, src.name source_name,
      c.owner_user_id, u.display_name owner_name, coalesce(wa.e164, hwa.e164) owner_phone, ca.reason routing_reason,
      c.created_at::text, c.updated_at::text
    from cases c
    join contacts co on co.id=c.contact_id
    left join lateral (
      select e164, original
      from contact_identifiers
      where organization_id=co.organization_id and contact_id=co.id and kind='phone'
      order by (source='mvp_panel') desc, reliable desc, id
      limit 1
    ) ci on true
    left join handoffs h on h.case_id=c.id
    left join segments s on s.id=c.segment_id
    left join departments d on d.id=c.department_id
    left join pipelines p on p.id=c.pipeline_id
    left join pipeline_stages ps on ps.id=c.stage_id
    left join acquisition_sources src on src.id=c.source_id
    left join users u on u.id=c.owner_user_id
    left join user_account_bindings ub on ub.user_id=u.id and ub.revoked_at is null
    left join whatsapp_accounts wa on wa.id=ub.account_id
    left join whatsapp_accounts hwa on hwa.id=h.destination_account_id
    left join case_assignments ca on ca.case_id=c.id and ca.ended_at is null
  `;

  return {
    mode: "postgres",
    ready,
    bootstrap: async () => {
      const ctx = await ready();
      const counts = await one(`
        select
          (select count(*)::int from cases where organization_id=$1) cases,
          (select count(*)::int from handoffs where organization_id=$1) handoffs,
          (select count(*)::int from audit_events where organization_id=$1 and action='observation_received') observations,
          (select count(*)::int from extension_devices where organization_id=$1) devices
      `, [ctx.org.id]);
      const users = await many("select id, display_name as name, role from users where organization_id=$1 order by display_name", [ctx.org.id]);
      return { organization: ctx.org, users, counts };
    },
    registerDevice: async (body) => {
      const ctx = await ready();
      const phone = normalizePhone(body.localPhone || "");
      const user = body.mode === "destination" ? ctx.sellerUser : ctx.triageUser;
      const device = await one(
        "insert into extension_devices(organization_id,user_id,label,last_observation_at) values($1,$2,$3,now()) returning id,label,created_at::text,last_observation_at::text",
        [ctx.org.id, user.id, String(body.label || "Chrome ABR").slice(0, 120)]
      );
      const counts = await one(`
        select
          (select count(*)::int from cases where organization_id=$1) cases,
          (select count(*)::int from handoffs where organization_id=$1) handoffs,
          (select count(*)::int from audit_events where organization_id=$1 and action='observation_received') observations,
          (select count(*)::int from extension_devices where organization_id=$1) devices
      `, [ctx.org.id]);
      return {
        device: { ...device, local_phone: phone.ok ? phone.e164 : null, mode: body.mode === "destination" ? "destination" : "main" },
        state: { organization: ctx.org, counts }
      };
    },
    authenticateUser: async (body) => {
      const ctx = await ready();
      const loginOrEmail = String(body.email || body.login || "").trim().toLowerCase().slice(0, 254);
      const email = loginOrEmail.includes("@") ? loginOrEmail : `${loginOrEmail}@grupoabr.com.br`;
      const password = String(body.password || "");
      if (!loginOrEmail || !password || password.length > 256) return { error: "invalid_credentials" };
      const user = await one(`
        select id, email, display_name as name, role, status
        from users
        where organization_id=$1
          and lower(email)=lower($2)
          and status='active'
          and password_hash = crypt($3, password_hash)
        limit 1
      `, [ctx.org.id, email, password]);
      if (!user) return { error: "invalid_credentials" };
      return { user };
    },
    simulateRouting: async (body) => {
      const ctx = await ready();
      const routed = await ensureManualDestination(ctx, body);
      return { destination: { id: routed.user.id, name: routed.name, phone: routed.phone, department: routed.departmentName }, route: routed.route || null, reason: routed.reason };
    },
    listSellers: async () => {
      const ctx = await ready();
      const rows = await many(`
        select sp.id profile_id, u.id user_id, u.email, u.display_name name, u.role,
          sp.profile_title, sp.sales_function, sp.whatsapp_e164, sp.active,
          coalesce(json_agg(json_build_object(
            'id', sr.id,
            'channel', sr.channel,
            'sales_function', sr.sales_function,
            'route_type', sr.route_type,
            'route_value', sr.route_value,
            'region', sr.region,
            'priority', sr.priority,
            'active', sr.active
          ) order by sr.channel, sr.sales_function, sr.priority, sr.route_value) filter (where sr.id is not null), '[]') routes
        from seller_profiles sp
        join users u on u.id=sp.user_id
        left join seller_routes sr on sr.profile_id=sp.id
        where sp.organization_id=$1
          and sp.active=true
        group by sp.id, u.id
        order by sp.sales_function, u.display_name
      `, [ctx.org.id]);
      return { items: rows, total: rows.length };
    },
    createSeller: async (body) => {
      const ctx = await ready();
      const displayName = String(body.name || body.displayName || "").trim();
      const loginOrEmail = String(body.email || body.login || "").trim().toLowerCase();
      const email = loginOrEmail.includes("@") ? loginOrEmail : `${loginOrEmail}@grupoabr.com.br`;
      if (!displayName || !email) return { error: "missing_seller_identity" };
      const salesFunction = inferSalesFunction(body);
      const requestedRole = String(body.role || "").trim().toLowerCase();
      const role = ["admin", "supervisor", "sdr", "seller", "department_staff"].includes(requestedRole)
        ? requestedRole
        : (salesFunction === "adm_sdr" ? "admin" : "seller");
      const user = await ensureUser(ctx.org.id, email, displayName, role);
      await pool.query(
        "update users set display_name=$2, role=$3, status='active', password_hash=coalesce(password_hash, crypt($4, gen_salt('bf'))) where id=$1",
        [user.id, displayName, role, DEFAULT_EMPLOYEE_PASSWORD]
      );
      const whatsapp = normalizePhone(body.whatsapp || body.whatsapp_e164 || "");
      const profile = await one(`
        insert into seller_profiles(organization_id,user_id,profile_title,sales_function,whatsapp_e164,active)
        values($1,$2,$3,$4,$5,true)
        on conflict (organization_id,user_id) do update
          set profile_title=excluded.profile_title,
              sales_function=excluded.sales_function,
              whatsapp_e164=excluded.whatsapp_e164,
              active=true
        returning id, profile_title, sales_function, whatsapp_e164, active
      `, [ctx.org.id, user.id, body.profileTitle || body.profile_title || "Vendedor", salesFunction, whatsapp.ok ? whatsapp.e164 : null]);
      if (whatsapp.ok) {
        const account = await ensureAccount(ctx.org.id, whatsapp.e164, displayName, "employee");
        await ensureBinding(ctx.org.id, user.id, account.id);
      }
      if (Array.isArray(body.routes)) {
        for (const route of body.routes) {
          const channel = String(route.channel || "varejo").toLowerCase() === "atacado" ? "atacado" : "varejo";
          const routeSalesFunction = inferSalesFunction({ salesFunction: route.salesFunction || route.sales_function || salesFunction });
          const routeType = ["region", "city", "ddd"].includes(route.routeType || route.route_type) ? (route.routeType || route.route_type) : (channel === "atacado" ? "ddd" : "region");
          const routeValue = normalizeText(route.routeValue || route.route_value || route.region || route.ddd || route.city);
          if (!routeValue) continue;
          await pool.query(`
            insert into seller_routes(organization_id,profile_id,channel,sales_function,route_type,route_value,region,priority)
            values($1,$2,$3,$4,$5,$6,$7,$8)
          `, [ctx.org.id, profile.id, channel, routeSalesFunction, routeType, routeValue, route.region || null, Number(route.priority || 100)]);
        }
      }
      const seller = await one(`
        select sp.id profile_id, u.id user_id, u.email, u.display_name name, u.role,
          sp.profile_title, sp.sales_function, sp.whatsapp_e164, sp.active
        from seller_profiles sp join users u on u.id=sp.user_id
        where sp.id=$1
      `, [profile.id]);
      return { seller };
    },
    deactivateSeller: async (profileId) => {
      const ctx = await ready();
      const found = await one("select sp.id, sp.user_id from seller_profiles sp where sp.organization_id=$1 and sp.id=$2", [ctx.org.id, profileId]);
      if (!found) return { error: "seller_not_found" };
      await pool.query("update seller_profiles set active=false where id=$1", [profileId]);
      await pool.query("update seller_routes set active=false where profile_id=$1", [profileId]);
      await pool.query("update users set status='disabled' where id=$1", [found.user_id]);
      return { ok: true, profile_id: profileId };
    },
    createCase: async (body) => {
      const ctx = await ready();
      const phone = normalizePhone(body.phone || "");
      if (!phone.ok) return { error: "invalid_phone", detail: phone.reason };
      const saleValue = normalizeSaleValue(body.saleValue);
      if (!saleValue.ok) return { error: "invalid_sale_value" };
      const contactName = String(body.name || "").trim() || null;
      const routed = await ensureManualDestination(ctx, body);
      const segment = await findSegment(ctx.org.id, body.segment);
      const pipeline = await defaultPipeline(ctx.org.id, body.pipeline);
      const stage = await defaultStage(pipeline?.id, body.stage);
      const source = body.source ? await one("select id,name from acquisition_sources where organization_id=$1 and lower(name)=lower($2) limit 1", [ctx.org.id, body.source]) : null;
      const contact = await ensureContact(ctx.org.id, phone, contactName);
      const publicProtocol = protocol();
      const client = await pool.connect();
      try {
        await client.query("begin");
        const crm = await client.query(
          `insert into cases(organization_id,contact_id,status,department_id,owner_user_id,company_name,city,uf,segment_id,source_id,pipeline_id,stage_id,potential,temperature,need,triage_summary,sale_value)
           values($1,$2,'awaiting_arrival',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
          [
            ctx.org.id,
            contact.id,
            routed.department.id,
            routed.user.id,
            body.company || null,
            body.city || null,
            body.uf || null,
            segment?.id || null,
            source?.id || null,
            pipeline?.id || null,
            stage?.id || null,
            normalizePotential(body.potential),
            normalizeTemperature(body.temperature),
            body.need || null,
            body.need ? String(body.need).slice(0, 1000) : null,
            saleValue.value
          ]
        );
        const caseId = crm.rows[0].id;
        const handoff = await client.query(
          `insert into handoffs(organization_id,case_id,source_account_id,destination_account_id,destination_user_id,protocol,routing_inputs,summary_snapshot,expires_at)
           values($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '7 days') returning id`,
          [ctx.org.id, caseId, ctx.mainAccount.id, routed.account.id, routed.user.id, publicProtocol, JSON.stringify({ mvp: true }), body.need || null]
        );
        await client.query("insert into handoff_events(handoff_id,type,payload,idempotency_key) values($1,'created',$2,$3)", [handoff.rows[0].id, JSON.stringify({ reason: routed.reason }), `created:${handoff.rows[0].id}`]);
        await client.query(
          "insert into case_assignments(case_id,user_id,inputs,reason) values($1,$2,$3,$4)",
          [caseId, routed.user.id, JSON.stringify({ mvp: true }), routed.reason]
        );
        if (body.nextTask) {
          await client.query(
            "insert into tasks(organization_id,case_id,assignee_user_id,title) values($1,$2,$3,$4)",
            [ctx.org.id, caseId, routed.user.id, String(body.nextTask).slice(0, 200)]
          );
        }
        await client.query("commit");
        const fullCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]));
        const fullHandoff = shapeHandoff((await many(`
          select h.id, h.case_id, h.protocol, wa.e164 destination_phone, u.display_name destination_name, d.name destination_department,
            co.display_name contact_name, h.created_at::text,
            coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
            case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
          from handoffs h
          join whatsapp_accounts wa on wa.id=h.destination_account_id
          join users u on u.id=h.destination_user_id
          join cases c on c.id=h.case_id
          left join departments d on d.id=c.department_id
          join contacts co on co.id=c.contact_id
          left join handoff_events he on he.handoff_id=h.id
          where h.id=$1
          group by h.id, wa.e164, u.display_name, d.name, co.display_name
        `, [handoff.rows[0].id]))[0]);
        return { case: fullCase, handoff: fullHandoff };
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    updateCase: async (caseId, body) => {
      const ctx = await ready();
      const phone = normalizePhone(body.phone || "");
      if (!phone.ok) return { error: "invalid_phone", detail: phone.reason };
      const saleValue = normalizeSaleValue(body.saleValue);
      if (!saleValue.ok) return { error: "invalid_sale_value" };
      const current = await one("select c.id, c.contact_id from cases c where c.organization_id=$1 and c.id=$2", [ctx.org.id, caseId]);
      if (!current) return { error: "case_not_found" };
      const segment = await findSegment(ctx.org.id, body.segment);
      const source = body.source ? await one("select id from acquisition_sources where organization_id=$1 and lower(name)=lower($2) limit 1", [ctx.org.id, body.source]) : null;
      const department = body.department ? await ensureDepartment(ctx.org.id, body.department) : null;
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`
          insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source,reliable)
          values($1,$2,'phone',$3,$4,'mvp_panel',true)
          on conflict (organization_id,contact_id,e164) do update
            set original=excluded.original, source='mvp_panel', reliable=true
        `, [ctx.org.id, current.contact_id, phone.e164, phone.original]);
        await client.query("update contacts set display_name=$2 where id=$1", [current.contact_id, String(body.name || "").trim() || null]);
        const result = await client.query(`
          update cases
          set department_id=coalesce($3, department_id),
              company_name=$4,
              city=$5,
              uf=$6,
              segment_id=$7,
              source_id=$8,
              potential=$9,
              temperature=$10,
              need=$11,
              sale_value=$12,
              updated_at=now()
          where organization_id=$1 and id=$2
        `, [
          ctx.org.id,
          caseId,
          department?.id || null,
          body.company || null,
          body.city || null,
          body.uf || null,
          segment?.id || null,
          source?.id || null,
          normalizePotential(body.potential),
          normalizeTemperature(body.temperature),
          body.need ? String(body.need).slice(0, 1000) : null,
          saleValue.value
        ]);
        if (!result.rowCount) {
          await client.query("rollback");
          return { error: "case_not_found" };
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      const crmCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]));
      return { case: crmCase };
    },
    listCases: async () => {
      await ready();
      const rows = await many(`${caseSelect} order by c.created_at desc limit 100`);
      const items = rows.map(shapeCase);
      return { items, total: items.length };
    },
    listFunnels: async () => {
      const ctx = await ready();
      const rows = await many(`
        select p.id, p.name, coalesce(json_agg(json_build_object('id', ps.id, 'name', ps.name, 'position', ps.position, 'internal_only', ps.internal_only) order by ps.position) filter (where ps.id is not null), '[]') stages
        from pipelines p
        left join pipeline_stages ps on ps.pipeline_id=p.id
        where p.organization_id=$1
        group by p.id
        order by case when p.name='VAREJO' then 0 when count(ps.id) > 0 then 1 else 2 end, p.name
      `, [ctx.org.id]);
      return { items: rows };
    },
    funnelBoard: async (pipelineId) => {
      const ctx = await ready();
      const pipeline = await one("select id,name from pipelines where organization_id=$1 and (id::text=$2 or lower(name)=lower($2)) limit 1", [ctx.org.id, pipelineId]);
      if (!pipeline) return { funnel: null, columns: [] };
      const stages = await many("select id,name,position,internal_only from pipeline_stages where pipeline_id=$1 order by position", [pipeline.id]);
      const rows = await many(`${caseSelect} where c.pipeline_id=$1 order by c.updated_at desc limit 300`, [pipeline.id]);
      const cards = rows.map(shapeCase);
      const columns = stages.map((stage) => ({
        ...stage,
        cards: cards.filter((card) => card.fields.stage === stage.name)
      }));
      return { funnel: pipeline, columns };
    },
    moveCaseStage: async (caseId, stageId) => {
      await ready();
      const stage = await one("select ps.id, ps.name, ps.pipeline_id from pipeline_stages ps where ps.id=$1", [stageId]);
      if (!stage) return { error: "stage_not_found" };
      const updated = await one("update cases set stage_id=$2, pipeline_id=$3, updated_at=now() where id=$1 returning id", [caseId, stage.id, stage.pipeline_id]);
      if (!updated) return { error: "case_not_found" };
      const crmCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]));
      return { case: crmCase };
    },
    createTask: async (caseId, body) => {
      const ctx = await ready();
      const task = await one(
        "insert into tasks(organization_id,case_id,assignee_user_id,title,due_at) select $1,c.id,c.owner_user_id,$3,$4 from cases c where c.id=$2 returning id, case_id, title, due_at::text, status, created_at::text",
        [ctx.org.id, caseId, String(body.title || "Follow-up").slice(0, 200), body.dueAt || null]
      );
      if (!task) return { error: "case_not_found" };
      return { task };
    },
    listTasks: async () => {
      const ctx = await ready();
      const rows = await many(`
        select t.id, t.case_id, t.title, t.due_at::text, t.status, t.created_at::text, co.display_name contact_name, u.display_name assignee_name
        from tasks t
        join cases c on c.id=t.case_id
        join contacts co on co.id=c.contact_id
        left join users u on u.id=t.assignee_user_id
        where t.organization_id=$1
        order by coalesce(t.due_at, t.created_at), t.created_at desc
        limit 200
      `, [ctx.org.id]);
      return { items: rows, total: rows.length };
    },
    addNote: async (caseId, body) => {
      const ctx = await ready();
      const note = await one(
        "insert into notes(organization_id,case_id,body) select $1,c.id,$3 from cases c where c.id=$2 returning id, case_id, body, created_at::text",
        [ctx.org.id, caseId, String(body.body || "").slice(0, 4000)]
      );
      if (!note) return { error: "case_not_found" };
      return { note };
    },
    closeCase: async (caseId, body) => {
      await ready();
      const outcome = body.outcome === "lost" ? "lost" : "won";
      const current = await one("select pipeline_id from cases where id=$1", [caseId]);
      if (!current) return { error: "case_not_found" };
      const stageName = outcome === "lost" ? "Venda perdida" : "Venda ganha";
      const stage = await one("select id from pipeline_stages where pipeline_id=$1 and lower(name)=lower($2) limit 1", [current.pipeline_id, stageName]);
      const lossReason = outcome === "lost" && body.lossReason
        ? await one("select id from loss_reasons where lower(name)=lower($1) limit 1", [body.lossReason])
        : null;
      await pool.query(`
        update cases
        set status='closed',
            stage_id=coalesce($2, stage_id),
            sale_value=case when $3::numeric is null then sale_value else $3 end,
            loss_reason_id=$4,
            loss_detail=$5,
            won_at=case when $6='won' then now() else won_at end,
            lost_at=case when $6='lost' then now() else lost_at end,
            closed_at=now(),
            updated_at=now()
        where id=$1
      `, [caseId, stage?.id || null, body.saleValue ? Number(body.saleValue) : null, lossReason?.id || null, body.lossDetail || null, outcome]);
      return { case: shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId])) };
    },
    transferCase: async (caseId, body) => {
      const ctx = await ready();
      const existing = await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]);
      if (!existing) return { error: "case_not_found" };
      const routed = await ensureManualDestination(ctx, body);
      const publicProtocol = protocol();
      const result = await one(`
        insert into handoffs(organization_id,case_id,source_account_id,destination_account_id,destination_user_id,protocol,routing_inputs,summary_snapshot,expires_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '7 days')
        returning id, case_id, protocol, created_at::text
      `, [ctx.org.id, caseId, ctx.mainAccount.id, routed.account.id, routed.user.id, publicProtocol, JSON.stringify({ transfer: true }), body.summary || existing.need || null]);
      await pool.query("insert into handoff_events(handoff_id,type,payload,idempotency_key) values($1,'created',$2,$3)", [result.id, JSON.stringify({ reason: "Transferencia manual pelo CRM" }), `transfer:${result.id}`]);
      const link = handoffLink(routed.phone, publicProtocol);
      return {
        case: shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId])),
        handoff: {
          id: result.id,
          case_id: result.case_id,
          protocol: result.protocol,
          destination_phone: routed.phone,
          destination_name: routed.name,
          destination_department: routed.departmentName,
          link,
          message: externalHandoffMessage({ firstName: existing.contact_name ? String(existing.contact_name).split(/\s+/)[0] : null, responsibleName: routed.name, department: routed.departmentName, link, publicProtocol }),
          state: "created",
          created_at: result.created_at,
          events: []
        }
      };
    },
    queueHandoffMessage: async (caseId) => {
      const ctx = await ready();
      const row = await one(`
        select h.id handoff_id, h.protocol, h.case_id, c.version case_version, h.destination_user_id, h.source_account_id,
          wa.e164 destination_phone, u.display_name destination_name, d.name destination_department, co.display_name contact_name
        from handoffs h
        join cases c on c.id=h.case_id
        join contacts co on co.id=c.contact_id
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        left join departments d on d.id=c.department_id
        where h.case_id=$1
        order by h.created_at desc
        limit 1
      `, [caseId]);
      if (!row) return { error: "case_not_found" };
      const link = handoffLink(row.destination_phone, row.protocol);
      const message = externalHandoffMessage({
        firstName: row.contact_name ? String(row.contact_name).split(/\s+/)[0] : null,
        responsibleName: row.destination_name,
        department: row.destination_department || "Vendas",
        link,
        publicProtocol: row.protocol
      });
      const command = await one(`
        insert into outbox_commands(organization_id,account_id,case_id,handoff_id,kind,payload,case_version,context_id,expected_user_id,expires_at)
        values($1,$2,$3,$4,'handoff_link',$5,$6,$7,$8,now()+interval '10 minutes')
        returning id, case_id, handoff_id, kind, payload, state, created_at::text, updated_at::text
      `, [ctx.org.id, row.source_account_id || ctx.mainAccount.id, row.case_id, row.handoff_id, JSON.stringify({ message, link, protocol: row.protocol }), row.case_version, `case:${row.case_id}:handoff:${row.handoff_id}`, ctx.triageUser.id]);
      await pool.query("insert into handoff_events(handoff_id,type,payload,idempotency_key) values($1,'send_requested',$2,$3) on conflict do nothing", [row.handoff_id, JSON.stringify({ outbox_id: command.id }), `send_requested:${command.id}`]);
      return { command };
    },
    listOutbox: async () => {
      const ctx = await ready();
      const rows = await many(`
        select id, account_id, case_id, handoff_id, kind, payload, state, attempts, created_at::text, updated_at::text
        from outbox_commands
        where organization_id=$1 and state in ('created','reserved','prepared','executing','uncertain','failed')
        order by created_at desc
        limit 100
      `, [ctx.org.id]);
      return { items: rows, total: rows.length };
    },
    ackOutbox: async (id, body) => {
      const state = ["observed", "uncertain", "cancelled", "failed"].includes(body.state) ? body.state : "observed";
      const command = await one("update outbox_commands set state=$2, execution_started=case when $2 in ('observed','uncertain') then true else execution_started end, updated_at=now() where id=$1 returning id, case_id, handoff_id, kind, payload, state, created_at::text, updated_at::text", [id, state]);
      if (!command) return { error: "outbox_not_found" };
      if (command.handoff_id && state === "observed") {
        await pool.query("insert into handoff_events(handoff_id,type,payload,idempotency_key) values($1,'send_observed',$2,$3) on conflict do nothing", [command.handoff_id, JSON.stringify({ outbox_id: id }), `send_observed:${id}`]);
      }
      if (command.handoff_id && state === "uncertain") {
        await pool.query("insert into handoff_events(handoff_id,type,payload,idempotency_key) values($1,'send_uncertain',$2,$3) on conflict do nothing", [command.handoff_id, JSON.stringify({ outbox_id: id }), `send_uncertain:${id}`]);
      }
      return { command };
    },
    kpis: async (pipelineId) => {
      const ctx = await ready();
      const funnel = pipelineId
        ? await one("select id, name from pipelines where organization_id=$1 and (id::text=$2 or lower(name)=lower($2)) limit 1", [ctx.org.id, pipelineId])
        : null;
      if (pipelineId && !funnel) {
        return { funnel: null, totals: { cases: 0, closed: 0, won: 0, lost: 0, sale_value: 0 }, handoffs: { total: 0, claimed: 0 }, tasks: { open: 0, overdue: 0 }, byStatus: [], byPipeline: [] };
      }
      const caseFilter = funnel ? " and pipeline_id=$2" : "";
      const caseParams = funnel ? [ctx.org.id, funnel.id] : [ctx.org.id];
      const totals = await one(`
        select
          count(*)::int cases,
          count(*) filter (where status='closed')::int closed,
          count(*) filter (where won_at is not null)::int won,
          count(*) filter (where lost_at is not null)::int lost,
          coalesce(sum(sale_value),0)::numeric sale_value
        from cases where organization_id=$1${caseFilter}
      `, caseParams);
      const byStatus = await many(`select status, count(*)::int count from cases where organization_id=$1${caseFilter} group by status order by status`, caseParams);
      const byPipeline = funnel ? [{ pipeline: funnel.name, count: totals.cases }] : await many(`
        select coalesce(p.name,'Sem funil') pipeline, count(c.id)::int count
        from cases c left join pipelines p on p.id=c.pipeline_id
        where c.organization_id=$1 group by p.name order by count desc
      `, [ctx.org.id]);
      const handoffFilter = funnel ? " and c.pipeline_id=$2" : "";
      const handoffParams = funnel ? [ctx.org.id, funnel.id] : [ctx.org.id];
      const handoffs = await one(`
        select count(*)::int total, count(*) filter (where exists (select 1 from handoff_events he where he.handoff_id=h.id and he.type='claimed'))::int claimed
        from handoffs h join cases c on c.id=h.case_id where h.organization_id=$1${handoffFilter}
      `, handoffParams);
      const tasks = await one(`
        select count(*) filter (where t.status='open')::int open,
               count(*) filter (where t.status='open' and t.due_at < now())::int overdue
        from tasks t join cases c on c.id=t.case_id
        where t.organization_id=$1${funnel ? " and c.pipeline_id=$2" : ""}
      `, caseParams);
      return { funnel: funnel ? { id: funnel.id, name: funnel.name } : null, totals, handoffs, tasks, byStatus, byPipeline };
    },
    exportCasesCsv: async () => {
      await ready();
      const rows = await many(`${caseSelect} order by c.created_at desc limit 5000`);
      const header = ["id", "protocol", "status", "name", "phone", "city", "uf", "segment", "pipeline", "stage", "owner", "created_at"];
      return toCsv([header, ...rows.map((r) => [r.id, r.protocol, r.status, r.contact_name, r.contact_phone, r.city, r.uf, r.segment_label, r.pipeline_name, r.stage_name, r.owner_name, r.created_at])]);
    },
    pendingHandoffs: async (destinationPhone) => {
      await ready();
      const phone = normalizePhone(destinationPhone || "");
      const rows = await many(`
        select h.id, h.case_id, h.protocol, wa.e164 destination_phone, u.display_name destination_name, d.name destination_department,
          co.display_name contact_name, h.created_at::text,
          coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
          case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
        from handoffs h
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        join cases c on c.id=h.case_id
        left join departments d on d.id=c.department_id
        join contacts co on co.id=c.contact_id
        left join handoff_events he on he.handoff_id=h.id
        where ($1::text is null or wa.e164=$1)
        group by h.id, wa.e164, u.display_name, d.name, co.display_name
        having not bool_or(coalesce(he.type='claimed', false))
        order by h.created_at desc
        limit 100
      `, [phone.ok ? phone.e164 : null]);
      const items = rows.map(shapeHandoff);
      return { items, total: items.length };
    },
    claimHandoff: async (id) => {
      await ready();
      const found = await one("select h.id, h.case_id from handoffs h where h.id=$1", [id]);
      if (!found) return { error: "handoff_not_found" };
      await pool.query("insert into handoff_events(handoff_id,type,idempotency_key) values($1,'claimed',$2) on conflict do nothing", [id, `claimed:${id}`]);
      await pool.query("update cases set status='in_service', updated_at=now(), ai_paused=true where id=$1", [found.case_id]);
      const crmCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [found.case_id]));
      const row = await one(`
        select h.id, h.case_id, h.protocol, wa.e164 destination_phone, u.display_name destination_name, d.name destination_department,
          co.display_name contact_name, h.created_at::text,
          coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
          case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
        from handoffs h
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        join cases c on c.id=h.case_id
        left join departments d on d.id=c.department_id
        join contacts co on co.id=c.contact_id
        left join handoff_events he on he.handoff_id=h.id
        where h.id=$1
        group by h.id, wa.e164, u.display_name, d.name, co.display_name
      `, [id]);
      return { handoff: shapeHandoff(row), case: crmCase };
    },
    recordObservation: async (body, headers) => {
      const ctx = await ready();
      const data = { device_id: headers["x-abr-device-id"] || body.device_id || null, kind: body.kind || "diagnostic_snapshot", payload: body.payload || body };
      const row = await one("insert into audit_events(organization_id,action,entity,data) values($1,'observation_received','extension',$2) returning id, at::text", [ctx.org.id, JSON.stringify(data)]);
      return { accepted: true, observation: { id: row.id, ...data, received_at: row.at } };
    },
    close: async () => pool.end()
  };
}
