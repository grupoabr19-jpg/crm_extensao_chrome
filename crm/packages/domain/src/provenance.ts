export type Source = "customer" | "inference" | "human_confirmed" | "manual";
export interface FieldValue<T> {
  value: T | null; source: Source; evidenceMessageIds: string[];
  confidence: number | null; setAt: string; version: number;
}
export interface AiExtraction<T> { value: T | null; evidenceMessageIds: string[]; confidence: number; baseVersion: number; at: string }
export type ApplyResult<T> =
  | { applied: true; field: FieldValue<T> }
  | { applied: false; field: FieldValue<T>; conflict: boolean; reason: "human_owned" | "stale_base" | "no_value" };

const human = (s: Source) => s === "human_confirmed" || s === "manual";

/** Extração (possivelmente atrasada) da IA nunca sobrescreve dado de humano; divergência vira revisão. */
export function applyAiExtraction<T>(cur: FieldValue<T>, inc: AiExtraction<T>): ApplyResult<T> {
  if (inc.value === null) return { applied: false, field: cur, conflict: false, reason: "no_value" };
  if (human(cur.source) && cur.value !== null)
    return { applied: false, field: cur, conflict: JSON.stringify(cur.value) !== JSON.stringify(inc.value), reason: "human_owned" };
  if (inc.baseVersion !== cur.version)
    return { applied: false, field: cur, conflict: true, reason: "stale_base" };
  return { applied: true, field: { value: inc.value, source: "customer", evidenceMessageIds: inc.evidenceMessageIds, confidence: inc.confidence, setAt: inc.at, version: cur.version + 1 } };
}
