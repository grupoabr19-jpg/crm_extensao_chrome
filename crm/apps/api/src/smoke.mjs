import { loadDotEnv } from "./env.mjs";

loadDotEnv();

const baseUrl = (process.env.ABR_API_BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:10000").replace(/\/$/, "");
const adminToken = process.env.API_ADMIN_TOKEN || "";

function authHeaders(extra = {}) {
  return {
    ...extra,
    ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {})
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = body?.error || body?.message || response.statusText;
    throw new Error(`${path} returned ${response.status}: ${detail}`);
  }
  return body;
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function printResult(label, payload) {
  console.log(`${label}: OK`);
  if (payload) console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  console.log(`ABR CRM smoke tests against ${baseUrl}`);

  const health = await request("/healthz");
  printResult("healthz", { mode: health.mode, service: health.service });

  const ai = await post("/v1/ai/test", {
    prompt: "Responda somente OK para confirmar o teste tecnico do CRM ABR."
  });
  if (!ai.ok) throw new Error(`AI smoke failed: ${ai.error || "unknown_error"}`);
  printResult("ai", { model: ai.model, content: ai.content, usage: ai.usage || null });

  const transfer = await post("/v1/tests/transfer", {
    customerPhone: process.env.ABR_TEST_CUSTOMER_PHONE || "+5511970000001",
    destinationPhone: process.env.ABR_TEST_DESTINATION_PHONE || "+5511980000001",
    destinationName: process.env.ABR_TEST_DESTINATION_NAME || "Vendedor ABR Teste"
  });
  printResult("transfer", {
    case_id: transfer.case?.id,
    lead_id: transfer.lead?.id,
    outbox_id: transfer.outbox?.id,
    destination: transfer.case?.responsible_phone
  });

  const kpis = await request("/v1/reports/kpis");
  printResult("kpis", kpis);
}

main().catch((error) => {
  console.error(`SMOKE FAILED: ${error.message}`);
  process.exitCode = 1;
});
