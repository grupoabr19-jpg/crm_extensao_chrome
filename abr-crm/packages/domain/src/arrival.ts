/** Correspondência no destino. O chamador (backend) só passa candidatos que o usuário JÁ está autorizado a ver. */
export interface HandoffCandidate {
  handoffId: string; destinationUserId: string; destinationAccountId: string;
  protocol: string; expiresAt: string; contactPhones: string[]; sharedPhone: boolean;
}
export interface ArrivalInput {
  localAccountVerified: boolean; userId: string; accountId: string; now: string;
  sender: { e164: string; reliable: boolean } | null;
  protocol: string | null;
  candidates: HandoffCandidate[];
  autoLinkPolicy: "auto" | "suggest";
}
export type ArrivalResult =
  | { kind: "blocked_account" }
  | { kind: "matched"; handoffId: string; mode: "auto" | "suggest" }
  | { kind: "confirm_required"; handoffId: string; reason: "phone_mismatch" | "phone_unavailable" | "shared_phone" | "protocol_not_found" }
  | { kind: "choose"; handoffIds: string[] }
  | { kind: "expired_needs_supervision"; handoffId: string }
  | { kind: "no_case" };   // inclui "protocolo desconhecido OU sem acesso": mesma resposta, sem vazar existência

export function matchArrival(i: ArrivalInput): ArrivalResult {
  if (!i.localAccountVerified) return { kind: "blocked_account" };
  const mine = i.candidates.filter((c) => c.destinationUserId === i.userId && c.destinationAccountId === i.accountId);
  const live = mine.filter((c) => c.expiresAt > i.now);
  const phone = i.sender?.reliable ? i.sender.e164 : null;
  const mode = i.autoLinkPolicy;

  if (i.protocol) {
    const byProto = live.find((c) => c.protocol === i.protocol);
    if (!byProto) {
      const expired = mine.find((c) => c.protocol === i.protocol);
      if (expired) return { kind: "expired_needs_supervision", handoffId: expired.handoffId };
      // protocolo desconhecido/de outro destino: nunca associar automaticamente
      const byPhone = phone ? live.filter((c) => c.contactPhones.includes(phone)) : [];
      return byPhone.length === 1 ? { kind: "confirm_required", handoffId: byPhone[0]!.handoffId, reason: "protocol_not_found" } : { kind: "no_case" };
    }
    if (byProto.sharedPhone) return { kind: "confirm_required", handoffId: byProto.handoffId, reason: "shared_phone" };
    if (!phone) return { kind: "confirm_required", handoffId: byProto.handoffId, reason: "phone_unavailable" };
    if (!byProto.contactPhones.includes(phone)) return { kind: "confirm_required", handoffId: byProto.handoffId, reason: "phone_mismatch" };
    return { kind: "matched", handoffId: byProto.handoffId, mode };
  }
  if (!phone) return { kind: "no_case" };
  const byPhone = live.filter((c) => c.contactPhones.includes(phone));
  if (byPhone.length === 0) {
    const old = mine.find((c) => c.contactPhones.includes(phone));
    return old ? { kind: "expired_needs_supervision", handoffId: old.handoffId } : { kind: "no_case" };
  }
  if (byPhone.length > 1) return { kind: "choose", handoffIds: byPhone.map((c) => c.handoffId) };  // nunca "a mais recente"
  const only = byPhone[0]!;
  if (only.sharedPhone) return { kind: "confirm_required", handoffId: only.handoffId, reason: "shared_phone" };
  return { kind: "matched", handoffId: only.handoffId, mode };
}
