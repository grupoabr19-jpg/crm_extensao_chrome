export interface InboundMeta {
  chatKind: "individual" | "group" | "status" | "broadcast" | "unknown";
  direction: "in" | "out" | "unknown";
  contentKind: "text" | "media" | "system" | "unknown";
  identityResolved: boolean; aiPaused: boolean; caseClaimed: boolean;
}
export type Eligibility = { eligible: true } | { eligible: false; reason:
  "not_individual_chat" | "own_or_unknown_direction" | "not_text" | "identity_unresolved" | "ai_paused" | "claimed_by_human" };

/** Conservador: na dúvida, a IA NÃO responde. */
export function aiMayRespond(m: InboundMeta): Eligibility {
  if (m.chatKind !== "individual") return { eligible: false, reason: "not_individual_chat" };
  if (m.direction !== "in") return { eligible: false, reason: "own_or_unknown_direction" };
  if (m.contentKind !== "text") return { eligible: false, reason: "not_text" };   // mídia: registrada, não interpretada
  if (!m.identityResolved) return { eligible: false, reason: "identity_unresolved" };
  if (m.caseClaimed) return { eligible: false, reason: "claimed_by_human" };
  if (m.aiPaused) return { eligible: false, reason: "ai_paused" };
  return { eligible: true };
}
/** Mensagem própria que não é comando conhecido da IA = intervenção humana (pausa a IA). */
export const isHumanIntervention = (direction: string, knownCommandIds: Set<string>, waMessageId: string | null) =>
  direction === "out" && !(waMessageId && knownCommandIds.has(waMessageId));
