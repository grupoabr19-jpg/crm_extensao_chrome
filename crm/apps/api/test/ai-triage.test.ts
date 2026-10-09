import { describe, expect, it } from "vitest";
import { buildCasePayload, guardTriageOutput, normalizeTriageMessages } from "../src/ai-triage.mjs";

const messages = normalizeTriageMessages({
  messages: [
    { id: "m1", direction: "in", text: "Oi, sou Ana da Construtora Alfa em Jundiai SP." },
    { id: "m2", direction: "in", text: "Preciso de vergalhao 10mm, 2 toneladas." }
  ]
});

const field = (value: string | null, ids = ["m1"]) => ({ value, evidence_message_ids: value ? ids : [] });
const output = (over: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) => ({
  intent: "sales",
  department_candidate: "Vendas",
  extracted_fields: {
    name: field("Ana"),
    company: field("Construtora Alfa"),
    city: field("Jundiai"),
    uf: field("SP"),
    segment_id: field("Construtoras"),
    need: field("vergalhao 10mm", ["m2"]),
    products: field("vergalhao 10mm", ["m2"]),
    quantity_text: field("2 toneladas", ["m2"]),
    ...fields
  },
  missing_required_fields: [],
  confidence: 0.92,
  recommended_action: "request_routing",
  human_needed: false,
  suggested_question: null,
  summary: "Cliente de construtora pede vergalhao.",
  ...over
});

describe("AI triage backend guard", () => {
  it("accepts evidenced main fields and builds a routed case payload", () => {
    const guard = guardTriageOutput(output({}, { email: field("ana@alfa.com.br") }), messages);
    expect(guard).toMatchObject({
      ok: true,
      humanNeeded: false,
      fields: {
        name: "Ana",
        company: "Construtora Alfa",
        email: "ana@alfa.com.br",
        city: "Jundiai",
        uf: "SP",
        segment_id: "Construtoras"
      }
    });
    expect(buildCasePayload({ body: { phone: "+5511999990001", salesFunction: "construcao_civil" }, guard })).toMatchObject({
      name: "Ana",
      phone: "+5511999990001",
      email: "ana@alfa.com.br",
      company: "Construtora Alfa",
      city: "Jundiai",
      uf: "SP",
      segment: "Construtoras",
      department: "Vendas",
      pipeline: "VAREJO",
      salesFunction: "construcao_civil"
    });
  });

  it("drops fields without message evidence and unknown segments", () => {
    const guard = guardTriageOutput(output({}, {
      city: field("Campinas", ["missing"]),
      segment_id: field("Segmento inventado")
    }), messages);
    expect(guard.fields.city).toBeNull();
    expect(guard.fields.segment_id).toBeNull();
    expect(guard.issues).toEqual(expect.arrayContaining(["no_evidence:city", "unknown_segment"]));
  });

  it("blocks unsafe model attempts to choose destination or free text reply", () => {
    const guard = guardTriageOutput({ ...output(), destination_phone: "+5500000000000" }, messages);
    expect(guard).toMatchObject({ ok: false, humanNeeded: true });
    expect(guard.issues).toContain("unsafe_output");
  });

  it("only emits approved customer questions", () => {
    expect(guardTriageOutput(output({ recommended_action: "ask_question", suggested_question: "ask_city_uf" }), messages).outbound)
      .toMatchObject({ kind: "question", key: "ask_city_uf" });
    expect(guardTriageOutput(output({ recommended_action: "ask_question", suggested_question: "qualquer texto" }), messages).outbound)
      .toMatchObject({ kind: "neutral" });
  });
});
