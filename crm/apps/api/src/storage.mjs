import pg from "pg";
import { randomUUID } from "node:crypto";
import { pgSslConfig } from "./env.mjs";
import { normalizeCustomerName } from "./customer-import.mjs";
import { reactivationReminderAt } from "./customer-lifecycle.mjs";

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

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "";
}

function phoneDigitsForLookup(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits.slice(2);
  return digits.length === 10 || digits.length === 11 ? digits : "";
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
  if (/(GRANDE|GRANDES|MEDIA|MEDIAS|MEDIO PORTE|INDUSTRIA|INDUSTRIAL|REVENDA|REVENDAS|REVENDEDOR|REVENDEDORES|DISTRIBUIDOR|DISTRIBUIDORES)/.test(text)) {
    return "corporativo";
  }
  if (/(PEQUENA|PEQUENAS|PEQUENO PORTE|SERRALHEIRO|SERRALHEIROS|CALHEIRO|CALHEIROS|PESSOA FISICA|PF|CLIENTE FINAL)/.test(text)) {
    return "especialista";
  }
  if (/(CONSTRUCAO|CONSTRUTORA|OBRA|CIVIL|ENGENHARIA)/.test(text)) return "construcao_civil";
  if (/(CORPORATIVO|TRANSPORTE|MANUTENCAO)/.test(text)) return "corporativo";
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

const POTENTIAL_CITY_REGION = new Map(Object.entries({
  GUARULHOS: "BRAGANCA",
  "SANTA ISABEL": "BRAGANCA",
  IGARATA: "BRAGANCA",
  ARUJA: "BRAGANCA",
  ITAQUAQUECETUBA: "BRAGANCA",
  SUZANO: "BRAGANCA",
  "MOGI DAS CRUZES": "BRAGANCA",
  GUARAREMA: "BRAGANCA",
  "BIRITIBA MIRIM": "BRAGANCA",
  "SANTA BRANCA": "BRAGANCA",
  SALESOPOLIS: "BRAGANCA",
  BERTIOGA: "BRAGANCA",
  "SAO PAULO": "BRAGANCA",
  "SAO CAETANO DO SUL": "BRAGANCA",
  "SANTO ANDRE": "BRAGANCA",
  DIADEMA: "BRAGANCA",
  MAUA: "BRAGANCA",
  "SAO BERNARDO DO CAMPO": "BRAGANCA",
  JACAREI: "BRAGANCA",
  "RIBEIRAO PIRES": "BRAGANCA",
  "SAO JOSE DOS CAMPOS": "BRAGANCA",
  CUBATAO: "BRAGANCA",
  "SAO VICENTE": "BRAGANCA",
  SANTOS: "BRAGANCA",
  "PRAIA GRANDE": "BRAGANCA",
  GUARUJA: "BRAGANCA",
  VALINHOS: "JUNDIAI",
  LOUVEIRA: "JUNDIAI",
  CAMPINAS: "JUNDIAI",
  BARUERI: "JUNDIAI",
  INDAIATUBA: "JUNDIAI",
  JANDIRA: "JUNDIAI",
  SALTO: "JUNDIAI",
  ITU: "JUNDIAI",
  HORTOLANDIA: "JUNDIAI",
  "SAO ROQUE": "JUNDIAI",
  "MONTE MOR": "JUNDIAI",
  SUMARE: "JUNDIAI",
  "NOVA ODESSA": "JUNDIAI",
  AMERICANA: "JUNDIAI",
  SOROCABA: "JUNDIAI",
  VOTORANTIM: "JUNDIAI",
  BOITUVA: "JUNDIAI",
  TATUI: "JUNDIAI",
  PIRACICABA: "JUNDIAI",
  OSASCO: "JUNDIAI",
  LIMEIRA: "JUNDIAI",
  CHARQUEADA: "JUNDIAI",
  NEPOMUCENO: "VARGINHA",
  "CARMO DA CACHOEIRA": "VARGINHA",
  LAVRAS: "VARGINHA",
  FORMIGA: "VARGINHA",
  "SOLEDADE DE MINAS": "POUSO ALEGRE",
  CRUZILIA: "POUSO ALEGRE",
  AIURUOCA: "POUSO ALEGRE",
  ANDRELANDIA: "POUSO ALEGRE",
  "AGUAS DE LINDOIA": "POUSO ALEGRE",
  "ESPIRITO SANTO DO PINHAL": "POUSO ALEGRE",
  "CAMPO DO MEIO": "POCOS DE CALDAS",
  SERRANIA: "POCOS DE CALDAS",
  "AGUAS DA PRATA": "POCOS DE CALDAS",
  "SAO JOAO DA BOA VISTA": "POCOS DE CALDAS",
  GUAXUPE: "POCOS DE CALDAS",
  MOCOCA: "POCOS DE CALDAS",
  "WENCESLAU BRAZ": "ITAJUBA",
  PIRANGUCU: "ITAJUBA",
  "SANTO ANTONIO DO PINHAL": "ITAJUBA",
  "PASSA QUATRO": "ITAJUBA",
  "CAMPOS DO JORDAO": "ITAJUBA",
  LORENA: "ITAJUBA",
  CRUZEIRO: "ITAJUBA",
  GUARATINGUETA: "ITAJUBA",
  TAUBATE: "ITAJUBA",
  "MONTE ALEGRE DO SUL": "EXTREMA",
  AMPARO: "EXTREMA",
  TUIUTI: "EXTREMA",
  LINDOIA: "EXTREMA",
  ITAPIRA: "EXTREMA",
  PEDREIRA: "EXTREMA",
  JAGUARIUNA: "EXTREMA",
  "MOGI MIRIM": "EXTREMA",
  HOLAMBRA: "EXTREMA",
  "ARTUR NOGUEIRA": "EXTREMA",
  "TOCOS DO MOJI": "CAMBUI",
  "SANTO ANTONIO DE POSSE": "CAMBUI",
  CONCHAL: "CAMBUI",
  ARARAS: "CAMBUI",
  "RIO CLARO": "CAMBUI"
}));

const NEARBY_10KM_CITY_REGION = new Map(Object.entries({
  CAMBUI: "CAMBUI",
  "CONCEICAO DAS PEDRAS": "POUSO ALEGRE",
  JESUANIA: "POUSO ALEGRE"
}));

function inferRegion(input) {
  const city = normalizeText(input.city);
  return normalizeText(input.region || CITY_REGION.get(city) || NEARBY_10KM_CITY_REGION.get(city) || city || "CAMBUI");
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
    getProfile: async (userId) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) return { error: "user_not_found" };
      const seller = db.sellers.find((item) => item.user_id === userId || item.email === user.email) || {};
      return { profile: { user_id: user.id, email: user.email || null, name: user.name, role: user.role, ...seller, routes: seller.routes || [] } };
    },
    updateProfile: async (userId, body) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) return { error: "user_not_found" };
      user.name = String(body.name || body.displayName || user.name).slice(0, 120);
      const whatsapp = normalizePhone(body.whatsapp || body.whatsapp_e164 || "");
      let seller = db.sellers.find((item) => item.user_id === userId || item.email === user.email);
      if (!seller) {
        seller = { id: randomUUID(), profile_id: randomUUID(), user_id: userId, email: user.email || "", routes: [] };
        db.sellers.unshift(seller);
      }
      seller.name = user.name;
      seller.role = user.role;
      seller.profile_title = body.profileTitle || body.profile_title || seller.profile_title || "Vendedor";
      seller.sales_function = inferSalesFunction(body);
      seller.whatsapp_e164 = whatsapp.ok ? whatsapp.e164 : null;
      seller.routes = Array.isArray(body.routes) ? body.routes : seller.routes || [];
      return { profile: seller };
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
      const link = handoffLink(phone.e164, publicProtocol);
      const createdAt = new Date().toISOString();
      const crmCase = {
        id: randomUUID(),
        protocol: publicProtocol,
        status: "awaiting_arrival",
        contact: { name: String(body.name || "").trim() || null, phone: phone.e164, original_phone: phone.original, customer_code: null },
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
          customerName: crmCase.contact.name,
          firstName: crmCase.contact.name ? crmCase.contact.name.split(/\s+/)[0] : null,
          customerPhone: crmCase.contact.phone,
          customerCode: crmCase.contact.customer_code,
          company: crmCase.fields.company,
          city: crmCase.fields.city,
          uf: crmCase.fields.uf,
          need: crmCase.fields.need,
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
    searchCustomers: async (query) => {
      const term = String(query || "").trim().toLocaleLowerCase("pt-BR");
      const all = Array.from(new Map(db.cases.map((item) => [item.contact.phone, {
        id: item.contact.customer_id || item.contact.phone,
        customer_code: item.contact.customer_code || null,
        name: item.contact.name,
        phone: item.contact.phone,
        city: item.fields.city,
        uf: item.fields.uf,
        profile: {},
        case_count: db.cases.filter((candidate) => candidate.contact.phone === item.contact.phone).length
      }])).values());
      if (term.length < 2) return { items: [], total: all.length };
      const items = all
        .filter((item) => `${item.name || ""} ${item.customer_code || ""}`.toLocaleLowerCase("pt-BR").includes(term)
          || String(item.customer_code || "").toLowerCase().startsWith(term))
        .slice(0, 25);
      return { items, total: all.length };
    },
    getCase: async (caseId) => {
      const found = db.cases.find((item) => item.id === caseId);
      return found ? { case: found } : { error: "case_not_found" };
    },
    importCustomerRegistry: async () => ({ error: "persistent_database_required" }),
    listCases: async (options = {}) => {
      const items = options.customerCode
        ? db.cases.filter((item) => item.contact.customer_code === options.customerCode)
        : db.cases;
      return { items, total: items.length };
    },
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
      const task = { id: randomUUID(), case_id: caseId, title: String(body.title || "Follow-up").slice(0, 200), due_at: body.dueAt || null, kind: "follow_up", status: "open", created_at: new Date().toISOString() };
      db.tasks ||= [];
      db.tasks.unshift(task);
      return { task };
    },
    recordCustomerContact: async (caseId) => {
      const found = db.cases.find((item) => item.id === caseId);
      if (!found) return { error: "case_not_found" };
      const contactedAt = new Date();
      found.last_contact_at = contactedAt.toISOString();
      found.reactivation_reference_at = contactedAt.toISOString();
      found.reactivation_reference_source = "contact";
      db.tasks ||= [];
      for (const task of db.tasks) {
        if (task.case_id === caseId && task.kind === "reactivation" && task.status === "open") task.status = "cancelled";
      }
      const task = {
        id: randomUUID(),
        case_id: caseId,
        title: "Reativar cliente (30 dias antes do limite de 90 dias)",
        due_at: reactivationReminderAt(contactedAt).toISOString(),
        kind: "reactivation",
        status: "open",
        created_at: contactedAt.toISOString()
      };
      db.tasks.unshift(task);
      return { last_contact_at: found.last_contact_at, task };
    },
    listTasks: async (options = {}) => {
      const items = (db.tasks || []).filter((task) => !options.kind || task.kind === options.kind);
      return { items, total: items.length };
    },
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
      const link = handoffLink(found.contact.phone, publicProtocol);
      const handoff = {
        id: randomUUID(),
        case_id: caseId,
        protocol: publicProtocol,
        destination_phone: routed.user.phone,
        destination_name: routed.user.name,
        destination_department: routed.user.department,
        link,
        message: externalHandoffMessage({
          customerName: found.contact.name,
          firstName: found.contact.name ? found.contact.name.split(/\s+/)[0] : null,
          customerPhone: found.contact.phone,
          customerCode: found.contact.customer_code,
          company: found.fields.company,
          city: found.fields.city,
          uf: found.fields.uf,
          need: found.fields.need,
          responsibleName: routed.user.name,
          department: routed.user.department,
          link,
          publicProtocol
        }),
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
    const triageUser = await ensureUser(org.id, "thiago.almeida@grupoabr.com.br", "Thiago Almeida", "admin");
    const sellerUser = await ensureUser(org.id, "mvp-vendedor@abr.local", "Vendedor ABR", "seller");
    const mainAccount = await ensureAccount(org.id, "+5535997709232", "Thiago Almeida - IA ABR", "main");
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
  async function profileForUser(userId) {
    const ctx = await ready();
    const row = await one(`
      select u.id user_id, u.email, u.display_name name, u.role,
        sp.id profile_id, sp.profile_title, sp.sales_function, sp.whatsapp_e164, sp.active,
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
      from users u
      left join seller_profiles sp on sp.user_id=u.id and sp.organization_id=u.organization_id
      left join seller_routes sr on sr.profile_id=sp.id and sr.active=true
      where u.organization_id=$1 and u.id=$2
      group by u.id, sp.id
      limit 1
    `, [ctx.org.id, userId]);
    if (!row) return { error: "user_not_found" };
    return { profile: row };
  }
  async function findRoutedSeller(ctx, input) {
    const channel = normalizeText(input.pipeline) === "ATACADO" ? "atacado" : "varejo";
    const salesFunction = channel === "atacado" ? "vendedor_externo" : inferSalesFunction(input);
    const routeType = channel === "atacado" ? "ddd" : "region";
    const routeValue = channel === "atacado" ? (String(input.ddd || "").replace(/\D/g, "") || dddFromPhone(input.phone)) : inferRegion(input);
    if (!routeValue) return null;
    const tryRoute = async (wantedSalesFunction, wantedRouteValue, anyFunction = false) => one(`
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
        and ($3::text is null or sr.sales_function=$3)
        and sr.route_type=$4
        and lower(sr.route_value)=lower($5)
      order by case when $6::boolean and sr.sales_function='vendedor_externo' then 0 else 1 end,
        sr.priority, u.display_name
      limit 1
    `, [ctx.org.id, channel, wantedSalesFunction, routeType, wantedRouteValue, anyFunction]);
    let row = await tryRoute(salesFunction, routeValue);
    const segmentLocked = ["corporativo", "especialista"].includes(salesFunction);
    if (!row && salesFunction !== "vendedor_externo" && !segmentLocked) row = await tryRoute("vendedor_externo", routeValue);
    if (!row && channel === "varejo") row = await tryRoute(salesFunction, "CAMBUI");
    if (!row && channel === "varejo" && !segmentLocked) row = await tryRoute("vendedor_externo", "CAMBUI");
    if (!row && channel === "varejo") row = await tryRoute(null, "CAMBUI", true);
    if (!row) return null;
    return { ...row, channel, salesFunction: row.sales_function || salesFunction, routeType: row.route_type || routeType, routeValue: row.route_value || routeValue };
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
  async function findCustomerForCase(orgId, body, phone, name) {
    const customerCode = String(body.customerCode || body.customer_code || "").trim().toUpperCase();
    const email = normalizeEmail(body.email || body.contact?.email || "");
    const phoneDigits = phoneDigitsForLookup(phone.e164);
    const exactName = String(name || body.name || body.contact?.name || "").trim();
    const byCode = customerCode ? await one(`
      select id, display_name, customer_code, customer_profile, 'customer_code' as match_source
      from contacts where organization_id=$1 and customer_code=$2 limit 1
    `, [orgId, customerCode]) : null;
    if (byCode) return byCode;
    const byPhone = phoneDigits ? await one(`
      select c.id, c.display_name, c.customer_code, c.customer_profile, 'phone' as match_source
      from contacts c
      join contact_identifiers i on i.organization_id=c.organization_id and i.contact_id=c.id and i.kind='phone'
      where c.organization_id=$1
        and right(regexp_replace(i.e164,'\\D','','g'), $2)=right($3, $2)
      order by i.reliable desc, c.created_at desc
      limit 1
    `, [orgId, phoneDigits.length, phoneDigits]) : null;
    if (byPhone) return byPhone;
    const byEmail = email ? await one(`
      select id, display_name, customer_code, customer_profile, 'email' as match_source
      from contacts
      where organization_id=$1 and lower(coalesce(customer_profile->>'email',''))=$2
      order by created_at desc
      limit 1
    `, [orgId, email]) : null;
    if (byEmail) return byEmail;
    const byName = exactName ? await one(`
      select id, display_name, customer_code, customer_profile, 'name' as match_source
      from contacts
      where organization_id=$1 and lower(display_name)=lower($2)
      order by created_at desc
      limit 1
    `, [orgId, exactName]) : null;
    return byName || null;
  }
  async function ensureContactForCase(orgId, body, phone, name) {
    const email = normalizeEmail(body.email || body.contact?.email || "");
    let contact = await findCustomerForCase(orgId, body, phone, name);
    const provisional = !contact;
    if (!contact) {
      contact = await one("insert into contacts(organization_id,display_name,customer_profile) values($1,$2,$3) returning id, display_name, customer_code, customer_profile, 'provisional' as match_source", [
        orgId,
        name || null,
        JSON.stringify(email ? { email, provisional: true } : { provisional: true })
      ]);
    } else {
      await pool.query(`
        update contacts
        set display_name=coalesce(nullif(display_name,''), $2),
            customer_profile=case when $3::text is null then customer_profile else customer_profile || jsonb_build_object('email',$3::text) end
        where id=$1
      `, [contact.id, name || null, email || null]);
    }
    await pool.query(`
      insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source,reliable)
      values($1,$2,'phone',$3,$4,'mvp_panel',true)
      on conflict (organization_id,contact_id,e164) do update
        set original=excluded.original, source='mvp_panel', reliable=true
    `, [orgId, contact.id, phone.e164, phone.original]);
    const sourceKeys = await many(
      "select source_system, source_key from customer_source_keys where organization_id=$1 and contact_id=$2 order by source_system, source_key limit 10",
      [orgId, contact.id]
    );
    return {
      ...contact,
      provisional,
      email,
      source_keys: sourceKeys,
      note: customerCodeNote({ ...contact, provisional, email, source_keys: sourceKeys })
    };
  }
  function customerCodeNote(contact) {
    const profile = contact.customer_profile || {};
    const codes = [
      `Codigo CRM: ${contact.customer_code}`,
      profile.sourceCustomerCode ? `Codigo origem: ${profile.sourceCustomerCode}` : "",
      ...(contact.source_keys || []).map((item) => `${item.source_system}: ${item.source_key}`)
    ].filter(Boolean);
    return [
      contact.provisional ? "Cliente nao localizado na base: codigo provisório criado para saneamento pelo operador." : `Cliente localizado por ${contact.match_source || "cadastro"}.`,
      ...codes,
      contact.email ? `Email: ${contact.email}` : ""
    ].filter(Boolean).join("\n");
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
      contact: { id: row.contact_id, name: row.contact_name, phone: row.contact_phone, original_phone: row.original_phone, customer_code: row.customer_code },
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
      updated_at: row.updated_at,
      last_contact_at: row.last_contact_at,
      reactivation_reference_at: row.reactivation_reference_at,
      reactivation_reference_source: row.reactivation_reference_source
    };
  }
  function shapeHandoff(row) {
    const link = handoffLink(row.contact_phone, row.protocol);
    return {
      id: row.id,
      case_id: row.case_id,
      protocol: row.protocol,
      destination_phone: row.destination_phone,
      destination_name: row.destination_name,
      destination_department: row.destination_department,
      link,
      message: externalHandoffMessage({
        customerName: row.contact_name || null,
        firstName: row.contact_name ? String(row.contact_name).split(/\s+/)[0] : null,
        customerPhone: row.contact_phone || null,
        customerCode: row.customer_code || null,
        company: row.company_name || null,
        city: row.city || null,
        uf: row.uf || null,
        need: row.need || null,
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
    select c.id, c.contact_id, h.protocol, c.status, co.display_name contact_name, co.customer_code, ci.e164 contact_phone, ci.original original_phone,
      c.company_name, c.city, c.uf, s.label segment_label, c.need, d.name department_name,
      p.name pipeline_name, ps.name stage_name, c.potential, c.temperature, c.sale_value, src.name source_name,
      c.last_contact_at::text, c.reactivation_reference_at::text, c.reactivation_reference_source,
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
    getProfile: async (userId) => profileForUser(userId),
    updateProfile: async (userId, body) => {
      const ctx = await ready();
      const existing = await one("select id, email, role from users where organization_id=$1 and id=$2", [ctx.org.id, userId]);
      if (!existing) return { error: "user_not_found" };
      const displayName = String(body.name || body.displayName || "").trim().slice(0, 120);
      if (displayName) await pool.query("update users set display_name=$2 where id=$1", [userId, displayName]);
      const salesFunction = inferSalesFunction(body);
      const profileTitle = String(body.profileTitle || body.profile_title || (salesFunction === "adm_sdr" ? "ADM - SDR" : "Vendedor")).slice(0, 120);
      const whatsapp = normalizePhone(body.whatsapp || body.whatsapp_e164 || "");
      const profile = await one(`
        insert into seller_profiles(organization_id,user_id,profile_title,sales_function,whatsapp_e164,active)
        values($1,$2,$3,$4,$5,true)
        on conflict (organization_id,user_id) do update
          set profile_title=excluded.profile_title,
              sales_function=excluded.sales_function,
              whatsapp_e164=excluded.whatsapp_e164,
              active=true
        returning id
      `, [ctx.org.id, userId, profileTitle, salesFunction, whatsapp.ok ? whatsapp.e164 : null]);
      if (whatsapp.ok) {
        const kind = existing.email.toLowerCase() === "thiago.almeida@grupoabr.com.br" ? "main" : "employee";
        const account = await ensureAccount(ctx.org.id, whatsapp.e164, displayName || existing.email, kind);
        await ensureBinding(ctx.org.id, userId, account.id);
      }
      if (Array.isArray(body.routes)) {
        await pool.query("update seller_routes set active=false where profile_id=$1", [profile.id]);
        for (const route of body.routes) {
          const channel = String(route.channel || "varejo").toLowerCase() === "atacado" ? "atacado" : "varejo";
          const routeSalesFunction = inferSalesFunction({ salesFunction: route.salesFunction || route.sales_function || salesFunction });
          const routeType = ["region", "city", "ddd"].includes(route.routeType || route.route_type) ? (route.routeType || route.route_type) : (channel === "atacado" ? "ddd" : "region");
          const routeValue = normalizeText(route.routeValue || route.route_value || route.region || route.ddd || route.city);
          if (!routeValue || routeSalesFunction === "adm_sdr") continue;
          await pool.query(`
            insert into seller_routes(organization_id,profile_id,channel,sales_function,route_type,route_value,region,priority,active)
            values($1,$2,$3,$4,$5,$6,$7,$8,true)
          `, [ctx.org.id, profile.id, channel, routeSalesFunction, routeType, routeValue, route.region || null, Number(route.priority || 10)]);
        }
      }
      return profileForUser(userId);
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
      const contact = await ensureContactForCase(ctx.org.id, body, phone, contactName);
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
        await client.query(
          "insert into notes(organization_id,case_id,body) values($1,$2,$3)",
          [ctx.org.id, caseId, contact.note]
        );
        await client.query("commit");
        const fullCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]));
        const fullHandoff = shapeHandoff((await many(`
          select h.id, h.case_id, h.protocol, wa.e164 destination_phone, u.display_name destination_name, d.name destination_department,
            co.display_name contact_name, co.customer_code, ci.e164 contact_phone, c.company_name, c.city, c.uf, c.need, h.created_at::text,
            coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
            case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
          from handoffs h
          join whatsapp_accounts wa on wa.id=h.destination_account_id
          join users u on u.id=h.destination_user_id
          join cases c on c.id=h.case_id
          left join departments d on d.id=c.department_id
          join contacts co on co.id=c.contact_id
          left join lateral (
            select e164
            from contact_identifiers
            where organization_id=co.organization_id and contact_id=co.id and kind='phone'
            order by (source='mvp_panel') desc, reliable desc, id
            limit 1
          ) ci on true
          left join handoff_events he on he.handoff_id=h.id
          where h.id=$1
          group by h.id, wa.e164, u.display_name, d.name, co.display_name, co.customer_code, ci.e164, c.company_name, c.city, c.uf, c.need
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
    searchCustomers: async (query) => {
      const ctx = await ready();
      const term = String(query || "").trim().slice(0, 120);
      if (term.length < 2) {
        const count = await one("select count(*)::int as total from contacts where organization_id=$1", [ctx.org.id]);
        return { items: [], total: count.total };
      }
      const codePrefix = /^\d+$/.test(term) ? `C${term}` : term.toUpperCase();
      const sourceCodeTerm = term.toUpperCase().replace(/[%_\\\\]/g, "");
      const alternateSourceCodeTerm = sourceCodeTerm.replace(/^C(?=\d)/, "");
      const sourceCodePrefix = `${sourceCodeTerm}%`;
      const alternateSourceCodePrefix = `${alternateSourceCodeTerm}%`;
      const emailTerm = normalizeEmail(term);
      const phoneTerm = phoneDigitsForLookup(term);
      const rows = await many(`
        select co.id, co.customer_code, co.display_name as name, co.customer_profile as profile,
          ci.e164 as phone, ci.original as original_phone,
          count(distinct c.id)::int as case_count,
          max(c.updated_at)::text as last_case_at,
          max(coalesce(c.city, co.customer_profile->>'city')) as city,
          max(coalesce(c.uf, co.customer_profile->>'uf')) as uf,
          coalesce(ps.item_count,0)::int as item_count,
          coalesce(ps.order_count,0)::int as order_count,
          coalesce(ps.total_sales,0)::numeric as total_sales,
          ps.last_purchase_at::text as last_purchase_at
        from contacts co
        left join lateral (
          select e164, original
          from contact_identifiers
          where organization_id=co.organization_id and contact_id=co.id and kind='phone'
          order by (source='mvp_panel') desc, reliable desc, id
          limit 1
        ) ci on true
        left join cases c on c.contact_id=co.id and c.organization_id=co.organization_id
        left join customer_purchase_summaries ps on ps.organization_id=co.organization_id and ps.contact_id=co.id
        where co.organization_id=$1
          and (position(lower($2) in lower(coalesce(co.display_name,''))) > 0
            or co.customer_code ilike $3
            or ($9::text is not null and lower(coalesce(co.customer_profile->>'email','')) like ($9 || '%'))
            or ($10::text is not null and right(regexp_replace(coalesce(ci.e164,''),'\\D','','g'), length($10))=$10)
            or coalesce(co.customer_profile->>'sourceCustomerCode','') ilike $5
            or coalesce(co.customer_profile->>'sourceCustomerCode','') ilike $7
            or exists (
              select 1
              from customer_source_keys csk
              where csk.organization_id=co.organization_id
                and csk.contact_id=co.id
                and csk.source_system='clientes_inativos'
                and (csk.source_key ilike $5 or csk.source_key ilike $7)
            ))
        group by co.id, co.customer_code, co.display_name, co.customer_profile, ci.e164, ci.original,
          ps.item_count, ps.order_count, ps.total_sales, ps.last_purchase_at
        order by case when lower(co.customer_code)=$4 then 0 else 1 end,
          case when $10::text is not null and right(regexp_replace(coalesce(ci.e164,''),'\\D','','g'), length($10))=$10 then 0 else 1 end,
          case when $9::text is not null and lower(coalesce(co.customer_profile->>'email',''))=$9 then 0 else 1 end,
          case when lower(coalesce(co.customer_profile->>'sourceCustomerCode',''))=lower($6)
            or lower(coalesce(co.customer_profile->>'sourceCustomerCode',''))=lower($8)
            or exists (
              select 1
              from customer_source_keys csk
              where csk.organization_id=co.organization_id
                and csk.contact_id=co.id
                and csk.source_system='clientes_inativos'
                and (lower(csk.source_key)=lower($6) or lower(csk.source_key)=lower($8))
            ) then 0 else 1 end,
          case when count(distinct c.id)>0 then 0 else 1 end,
          max(c.updated_at) desc nulls last, co.display_name
        limit 25
      `, [
        ctx.org.id,
        term,
        `${codePrefix.replace(/[%_\\\\]/g, "")}%`,
        term.toUpperCase(),
        sourceCodePrefix,
        sourceCodeTerm,
        alternateSourceCodePrefix,
        alternateSourceCodeTerm,
        emailTerm || null,
        phoneTerm || null
      ]);
      return { items: rows, total: rows.length };
    },
    getCase: async (caseId) => {
      const ctx = await ready();
      const row = await one(`${caseSelect} where c.organization_id=$1 and c.id=$2 order by h.created_at desc limit 1`, [ctx.org.id, caseId]);
      return row ? { case: shapeCase(row) } : { error: "case_not_found" };
    },
    importCustomerRegistry: async (plan) => {
      const ctx = await ready();
      if (!Array.isArray(plan.customers) || plan.customers.length === 0) {
        throw new Error("customer_import_has_no_customers");
      }
      const client = await pool.connect();
      try {
        await client.query("begin");
        const existing = (await client.query(`
          select co.id, co.display_name, co.customer_profile, co.customer_code,
            coalesce(array_agg(distinct ci.e164) filter (where ci.e164 is not null), '{}') phones
          from contacts co
          left join contact_identifiers ci on ci.organization_id=co.organization_id and ci.contact_id=co.id and ci.kind='phone'
          where co.organization_id=$1
          group by co.id
        `, [ctx.org.id])).rows;
        const sources = (await client.query(
          "select source_key, contact_id from customer_source_keys where organization_id=$1 and source_system='clientes_inativos'",
          [ctx.org.id]
        )).rows;
        const sourceMap = new Map(sources.map((row) => [row.source_key, row.contact_id]));
        const byPhone = new Map();
        const byEmail = new Map();
        const byName = new Map();
        const addToMap = (map, key, id) => {
          if (!key) return;
          const matches = map.get(key) || new Set();
          matches.add(id);
          map.set(key, matches);
        };
        for (const row of existing) {
          addToMap(byName, normalizeCustomerName(row.display_name), row.id);
          addToMap(byEmail, String(row.customer_profile?.email || "").trim().toLowerCase(), row.id);
          for (const phone of row.phones) addToMap(byPhone, phone, row.id);
        }
        const incomingNameCounts = new Map();
        const incomingPhoneCounts = new Map();
        const incomingEmailCounts = new Map();
        const prepared = plan.customers.map((record) => {
          const phone = normalizePhone(record.phone || "");
          const normalizedPhone = phone.ok ? phone.e164 : null;
          const email = String(record.email || "").trim().toLowerCase() || null;
          incomingNameCounts.set(record.normalizedName, (incomingNameCounts.get(record.normalizedName) || 0) + 1);
          if (normalizedPhone) incomingPhoneCounts.set(normalizedPhone, (incomingPhoneCounts.get(normalizedPhone) || 0) + 1);
          if (email) incomingEmailCounts.set(email, (incomingEmailCounts.get(email) || 0) + 1);
          const profile = Object.fromEntries(Object.entries(record.profile || {}).filter(([, value]) => value != null && value !== ""));
          return { ...record, phone: phone.ok ? phone : null, email, profile, contactId: sourceMap.get(record.sourceCode) || null };
        });
        for (const record of prepared) {
          if (record.contactId) continue;
          const candidates = new Set();
          const collectUnique = (map, key, incomingCount) => {
            if (!key || incomingCount !== 1) return;
            const matches = map.get(key);
            if (matches?.size === 1) candidates.add([...matches][0]);
          };
          collectUnique(byPhone, record.phone?.e164, record.phone ? incomingPhoneCounts.get(record.phone.e164) : 0);
          collectUnique(byEmail, record.email, record.email ? incomingEmailCounts.get(record.email) : 0);
          collectUnique(byName, record.normalizedName, incomingNameCounts.get(record.normalizedName));
          if (candidates.size === 1) record.contactId = [...candidates][0];
        }

        const chunkSize = 500;
        const jsonChunks = async (records, statement) => {
          for (let offset = 0; offset < records.length; offset += chunkSize) {
            await client.query(statement, [ctx.org.id, JSON.stringify(records.slice(offset, offset + chunkSize))]);
          }
        };
        const toSave = prepared.map((record) => ({
          ...record,
          phone: record.phone?.e164 || null,
          phone_original: record.phone?.original || null
        }));
        const updates = toSave.filter((record) => record.contactId);
        await jsonChunks(updates.map((record) => ({
          contact_id: record.contactId,
          display_name: record.name,
          profile: record.profile
        })), `
          update contacts co
          set display_name=coalesce(nullif(x.display_name,''),co.display_name),
              customer_profile=co.customer_profile || x.profile
          from jsonb_to_recordset($2::jsonb) as x(contact_id uuid, display_name text, profile jsonb)
          where co.organization_id=$1 and co.id=x.contact_id
        `);
        const inserts = toSave.filter((record) => !record.contactId);
        const insertedBySource = new Map();
        for (let offset = 0; offset < inserts.length; offset += chunkSize) {
          const batch = inserts.slice(offset, offset + chunkSize);
          const result = await client.query(`
            insert into contacts(organization_id,display_name,customer_profile)
            select $1,x.display_name,x.profile
            from jsonb_to_recordset($2::jsonb) as x(display_name text, profile jsonb)
            returning id, customer_code, customer_profile->>'sourceCustomerCode' as source_code
          `, [ctx.org.id, JSON.stringify(batch.map((record) => ({ display_name: record.name, profile: record.profile })))]);
          for (const row of result.rows) insertedBySource.set(row.source_code, row.id);
        }
        for (const record of toSave) {
          if (!record.contactId) record.contactId = insertedBySource.get(record.sourceCode);
        }

        const phoneRecords = [...new Map(toSave.filter((record) => record.phone)
          .map((record) => [`${record.contactId}:${record.phone}`, {
            contact_id: record.contactId,
            e164: record.phone,
            original: record.phone_original
          }])).values()];
        await jsonChunks(phoneRecords, `
          insert into contact_identifiers(organization_id,contact_id,kind,e164,original,source,reliable)
          select $1,x.contact_id,'phone',x.e164,x.original,'customer_registry_import',false
          from jsonb_to_recordset($2::jsonb) as x(contact_id uuid,e164 text,original text)
          on conflict (organization_id,contact_id,e164) do update
          set original=excluded.original,source=excluded.source
        `);
        const sourceRecords = toSave.map((record) => ({ source_key: record.sourceCode, contact_id: record.contactId }));
        await jsonChunks(sourceRecords, `
          insert into customer_source_keys(organization_id,source_system,source_key,contact_id)
          select $1,'clientes_inativos',x.source_key,x.contact_id
          from jsonb_to_recordset($2::jsonb) as x(source_key text,contact_id uuid)
          on conflict (organization_id,source_system,source_key) do update
          set contact_id=excluded.contact_id,imported_at=now()
        `);

        let historyLinked = 0;
        let historyAmbiguous = 0;
        let historyUnmatched = 0;
        if (Array.isArray(plan.summaries) && plan.summaries.length) {
          const names = (await client.query("select id,display_name from contacts where organization_id=$1", [ctx.org.id])).rows;
          const contactsByName = new Map();
          for (const row of names) addToMap(contactsByName, normalizeCustomerName(row.display_name), row.id);
          const linked = [];
          for (const summary of plan.summaries) {
            const contacts = contactsByName.get(summary.normalizedName);
            if (contacts?.size === 1) {
              linked.push({
                contact_id: [...contacts][0],
                item_count: summary.itemCount,
                order_count: summary.orderCount,
                total_sales: Number(summary.totalSales.toFixed(2)),
                last_purchase_at: summary.lastPurchaseAt
              });
              historyLinked += 1;
            } else if (contacts?.size > 1) {
              historyAmbiguous += 1;
            } else {
              historyUnmatched += 1;
            }
          }
          await jsonChunks(linked, `
            insert into customer_purchase_summaries(organization_id,contact_id,item_count,order_count,total_sales,last_purchase_at,imported_at)
            select $1,x.contact_id,x.item_count,x.order_count,x.total_sales,x.last_purchase_at,now()
            from jsonb_to_recordset($2::jsonb) as x(
              contact_id uuid,item_count integer,order_count integer,total_sales numeric,last_purchase_at timestamptz
            )
            on conflict (organization_id,contact_id) do update
            set item_count=excluded.item_count,order_count=excluded.order_count,total_sales=excluded.total_sales,
                last_purchase_at=excluded.last_purchase_at,imported_at=now()
          `);
          const referenceRecords = linked.filter((record) => record.last_purchase_at).map((record) => ({
            contact_id: record.contact_id,
            reference_at: record.last_purchase_at
          }));
          if (referenceRecords.length) {
            await jsonChunks(referenceRecords, `
              with incoming as (
                select * from jsonb_to_recordset($2::jsonb) as x(contact_id uuid,reference_at timestamptz)
              ), updated as (
                update cases c
                set reactivation_reference_at=i.reference_at,
                    reactivation_reference_source='purchase'
                from incoming i
                where c.organization_id=$1 and c.contact_id=i.contact_id
                  and (c.reactivation_reference_at is null or c.reactivation_reference_at<=i.reference_at)
                returning c.id,c.contact_id,c.owner_user_id,c.reactivation_reference_at,c.updated_at
              ), latest as (
                select distinct on (contact_id) id,owner_user_id,reactivation_reference_at
                from updated
                order by contact_id,updated_at desc,id
              ), cancelled as (
                update tasks t set status='cancelled'
                from latest l
                where t.organization_id=$1 and t.case_id=l.id and t.kind='reactivation' and t.status='open'
                returning t.id
              )
              insert into tasks(organization_id,case_id,assignee_user_id,title,due_at,kind)
              select $1,l.id,l.owner_user_id,'Reativar cliente (30 dias antes do limite de 90 dias)',
                l.reactivation_reference_at + interval '60 days','reactivation'
              from latest l
              left join cancelled on true
            `);
          }
        }
        await client.query("commit");
        return {
          imported: inserts.length,
          updated: updates.length,
          totalCustomers: prepared.length,
          phoneNumbers: phoneRecords.length,
          historyLinked,
          historyAmbiguous,
          historyUnmatched
        };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    listCases: async (options = {}) => {
      const ctx = await ready();
      const rows = options.customerCode
        ? await many(`${caseSelect} where c.organization_id=$1 and co.customer_code=$2 order by c.updated_at desc limit 100`, [ctx.org.id, options.customerCode])
        : await many(`${caseSelect} where c.organization_id=$1 order by c.created_at desc limit 100`, [ctx.org.id]);
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
      const ctx = await ready();
      const stage = await one(`
        select ps.id,ps.name,ps.pipeline_id
        from pipeline_stages ps join pipelines p on p.id=ps.pipeline_id
        where ps.id=$1 and p.organization_id=$2
      `, [stageId, ctx.org.id]);
      if (!stage) return { error: "stage_not_found" };
      const updated = await one("update cases set stage_id=$3, pipeline_id=$4, updated_at=now() where organization_id=$1 and id=$2 returning id", [ctx.org.id, caseId, stage.id, stage.pipeline_id]);
      if (!updated) return { error: "case_not_found" };
      await pool.query("insert into stage_history(case_id,stage_id) values($1,$2)", [caseId, stage.id]);
      const crmCase = shapeCase(await one(`${caseSelect} where c.id=$1 order by h.created_at desc limit 1`, [caseId]));
      return { case: crmCase };
    },
    createTask: async (caseId, body) => {
      const ctx = await ready();
      const task = await one(
        "insert into tasks(organization_id,case_id,assignee_user_id,title,due_at) select $1,c.id,c.owner_user_id,$3,$4 from cases c where c.organization_id=$1 and c.id=$2 returning id, case_id, title, due_at::text, status, created_at::text",
        [ctx.org.id, caseId, String(body.title || "Follow-up").slice(0, 200), body.dueAt || null]
      );
      if (!task) return { error: "case_not_found" };
      return { task };
    },
    recordCustomerContact: async (caseId) => {
      const ctx = await ready();
      const current = await one(
        "select id from cases where organization_id=$1 and id=$2",
        [ctx.org.id, caseId]
      );
      if (!current) return { error: "case_not_found" };
      const contactedAt = new Date();
      const dueAt = reactivationReminderAt(contactedAt);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("update cases set last_contact_at=$3,reactivation_reference_at=$3,reactivation_reference_source='contact',updated_at=now() where organization_id=$1 and id=$2", [ctx.org.id, caseId, contactedAt.toISOString()]);
        await client.query("update tasks set status='cancelled' where organization_id=$1 and case_id=$2 and kind='reactivation' and status='open'", [ctx.org.id, caseId]);
        const task = (await client.query(`
          insert into tasks(organization_id,case_id,assignee_user_id,title,due_at,kind)
          select $1,c.id,c.owner_user_id,'Reativar cliente (30 dias antes do limite de 90 dias)',$3,'reactivation'
          from cases c where c.organization_id=$1 and c.id=$2
          returning id,case_id,title,due_at::text,kind,status,created_at::text
        `, [ctx.org.id, caseId, dueAt.toISOString()])).rows[0];
        await client.query("commit");
        return { last_contact_at: contactedAt.toISOString(), task };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    listTasks: async (options = {}) => {
      const ctx = await ready();
      const rows = await many(`
        select t.id, t.case_id, t.title, t.due_at::text, t.kind, t.status, t.created_at::text, co.display_name contact_name, u.display_name assignee_name
        from tasks t
        join cases c on c.id=t.case_id
        join contacts co on co.id=c.contact_id
        left join users u on u.id=t.assignee_user_id
        where t.organization_id=$1 and ($2::text is null or t.kind=$2)
        order by coalesce(t.due_at, t.created_at), t.created_at desc
        limit 200
      `, [ctx.org.id, options.kind || null]);
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
      const link = handoffLink(existing.contact_phone, publicProtocol);
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
          message: externalHandoffMessage({
            customerName: existing.contact_name || null,
            firstName: existing.contact_name ? String(existing.contact_name).split(/\s+/)[0] : null,
            customerPhone: existing.contact_phone || null,
            customerCode: existing.customer_code || null,
            company: existing.company_name || null,
            city: existing.city || null,
            uf: existing.uf || null,
            need: existing.need || null,
            responsibleName: routed.name,
            department: routed.departmentName,
            link,
            publicProtocol
          }),
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
          wa.e164 destination_phone, u.display_name destination_name, d.name destination_department,
          co.display_name contact_name, co.customer_code, ci.e164 contact_phone, c.company_name, c.city, c.uf, c.need
        from handoffs h
        join cases c on c.id=h.case_id
        join contacts co on co.id=c.contact_id
        left join lateral (
          select e164
          from contact_identifiers
          where organization_id=co.organization_id and contact_id=co.id and kind='phone'
          order by (source='mvp_panel') desc, reliable desc, id
          limit 1
        ) ci on true
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        left join departments d on d.id=c.department_id
        where h.case_id=$1
        order by h.created_at desc
        limit 1
      `, [caseId]);
      if (!row) return { error: "case_not_found" };
      const link = handoffLink(row.contact_phone, row.protocol);
      const message = externalHandoffMessage({
        customerName: row.contact_name || null,
        firstName: row.contact_name ? String(row.contact_name).split(/\s+/)[0] : null,
        customerPhone: row.contact_phone || null,
        customerCode: row.customer_code || null,
        company: row.company_name || null,
        city: row.city || null,
        uf: row.uf || null,
        need: row.need || null,
        responsibleName: row.destination_name,
        department: row.destination_department || "Vendas",
        link,
        publicProtocol: row.protocol
      });
      const command = await one(`
        insert into outbox_commands(organization_id,account_id,case_id,handoff_id,kind,payload,case_version,context_id,expected_user_id,expires_at)
        values($1,$2,$3,$4,'handoff_link',$5,$6,$7,$8,now()+interval '10 minutes')
        returning id, case_id, handoff_id, kind, payload, state, created_at::text, updated_at::text
      `, [ctx.org.id, row.source_account_id || ctx.mainAccount.id, row.case_id, row.handoff_id, JSON.stringify({ message, link, protocol: row.protocol, destination_phone: row.destination_phone }), row.case_version, `case:${row.case_id}:handoff:${row.handoff_id}`, ctx.triageUser.id]);
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
          co.display_name contact_name, co.customer_code, ci.e164 contact_phone, c.company_name, c.city, c.uf, c.need, h.created_at::text,
          coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
          case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
        from handoffs h
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        join cases c on c.id=h.case_id
        left join departments d on d.id=c.department_id
        join contacts co on co.id=c.contact_id
        left join lateral (
          select e164
          from contact_identifiers
          where organization_id=co.organization_id and contact_id=co.id and kind='phone'
          order by (source='mvp_panel') desc, reliable desc, id
          limit 1
        ) ci on true
        left join handoff_events he on he.handoff_id=h.id
        where ($1::text is null or wa.e164=$1)
        group by h.id, wa.e164, u.display_name, d.name, co.display_name, co.customer_code, ci.e164, c.company_name, c.city, c.uf, c.need
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
          co.display_name contact_name, co.customer_code, ci.e164 contact_phone, c.company_name, c.city, c.uf, c.need, h.created_at::text,
          coalesce(json_agg(json_build_object('type', he.type, 'at', he.at::text, 'payload', he.payload) order by he.id) filter (where he.id is not null), '[]') events,
          case when bool_or(he.type='claimed') then 'claimed' else 'created' end state
        from handoffs h
        join whatsapp_accounts wa on wa.id=h.destination_account_id
        join users u on u.id=h.destination_user_id
        join cases c on c.id=h.case_id
        left join departments d on d.id=c.department_id
        join contacts co on co.id=c.contact_id
        left join lateral (
          select e164
          from contact_identifiers
          where organization_id=co.organization_id and contact_id=co.id and kind='phone'
          order by (source='mvp_panel') desc, reliable desc, id
          limit 1
        ) ci on true
        left join handoff_events he on he.handoff_id=h.id
        where h.id=$1
        group by h.id, wa.e164, u.display_name, d.name, co.display_name, co.customer_code, ci.e164, c.company_name, c.city, c.uf, c.need
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
