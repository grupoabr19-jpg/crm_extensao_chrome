import { TriageOutputSchema, type TriageOutput } from "@abr/contracts";

export interface GuardContext {
  segmentIds: Set<string>; ufs: Set<string>;
  inputMessageIds: Set<string>;
  approvedQuestions: Record<string, string>;   // chave → texto aprovado
  neutralMessage: string;
  minConfidence: number;
}
export type Outbound = { kind: "question"; key: string; text: string } | { kind: "neutral"; text: string } | { kind: "none" };
export interface GuardResult {
  ok: boolean; humanNeeded: boolean; fields: Record<string, string | null>;
  outbound: Outbound; action: TriageOutput["recommended_action"] | "none"; issues: string[];
}

const FIELDS = ["name", "company", "city", "uf", "segment_id", "need", "products", "quantity_text"] as const;

/**
 * Texto do cliente e saída do modelo são dados não confiáveis. A saída NUNCA vira texto livre ao cliente,
 * NUNCA define destino/link/número, e todo campo precisa de evidência real e de catálogo válido.
 */
export function guardTriage(raw: unknown, ctx: GuardContext): GuardResult {
  const neutral = (issues: string[]): GuardResult => ({
    ok: false, humanNeeded: true, fields: {}, action: "request_human",
    outbound: { kind: "neutral", text: ctx.neutralMessage }, issues,
  });
  let data: unknown = raw;
  if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { return neutral(["invalid_json"]); } }
  const parsed = TriageOutputSchema.safeParse(data);
  if (!parsed.success) return neutral(["schema_violation"]);
  const o = parsed.data;
  const issues: string[] = [];

  const fields: Record<string, string | null> = {};
  for (const k of FIELDS) {
    const f = o.extracted_fields[k];
    let v = f.value;
    if (v !== null) {
      if (f.evidence_message_ids.length === 0 || !f.evidence_message_ids.every((id) => ctx.inputMessageIds.has(id))) { issues.push(`no_evidence:${k}`); v = null; }
    }
    if (v !== null && k === "segment_id" && !ctx.segmentIds.has(v)) { issues.push("unknown_segment"); v = null; }
    if (v !== null && k === "uf") { v = v.toUpperCase(); if (!ctx.ufs.has(v)) { issues.push("unknown_uf"); v = null; } }
    fields[k] = v;
  }

  if (o.intent === "human_request" || o.human_needed || o.recommended_action === "request_human")
    return { ok: true, humanNeeded: true, fields, action: "request_human", outbound: { kind: "none" }, issues };
  if (o.confidence < ctx.minConfidence)
    return { ok: false, humanNeeded: true, fields, action: "request_human", outbound: { kind: "neutral", text: ctx.neutralMessage }, issues: [...issues, "low_confidence"] };

  let outbound: Outbound = { kind: "none" };
  if (o.recommended_action === "ask_question") {
    const text = o.suggested_question ? ctx.approvedQuestions[o.suggested_question] : undefined;
    if (!text) return { ok: false, humanNeeded: true, fields, action: "request_human", outbound: { kind: "neutral", text: ctx.neutralMessage }, issues: [...issues, "question_not_in_catalog"] };
    outbound = { kind: "question", key: o.suggested_question!, text };
  }
  return { ok: true, humanNeeded: false, fields, action: o.recommended_action, outbound, issues };
}
