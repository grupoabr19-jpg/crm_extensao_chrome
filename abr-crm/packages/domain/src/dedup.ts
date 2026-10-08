import { createHash } from "node:crypto";
export interface MsgIdentity {
  accountId: string; chatId: string; direction: string;
  waMessageId: string | null; renderedTimeLabel: string | null; dayLabel: string | null;
  ordinalInView: number; body: string | null;
}
/**
 * Identidade da MENSAGEM (igual entre dispositivos). Preferir ID verificável.
 * Fallback por fingerprint tem risco documentado: duas mensagens idênticas no MESMO minuto só se
 * distinguem pelo ordinal na tela, que pode divergir entre dispositivos → possível duplicidade ou colisão.
 */
export function messageKey(m: MsgIdentity): { key: string; verifiable: boolean } {
  if (m.waMessageId) return { key: `v:${m.accountId}:${m.waMessageId}`, verifiable: true };
  const h = createHash("sha256").update([m.accountId, m.chatId, m.direction, m.dayLabel ?? "", m.renderedTimeLabel ?? "", m.ordinalInView, m.body ?? ""].join("\u0000")).digest("hex").slice(0, 32);
  return { key: `f:${h}`, verifiable: false };
}
/** Identidade da OBSERVAÇÃO (por dispositivo), usada para idempotência de reenvio. */
export const observationKey = (deviceId: string, msgKey: string) => `${deviceId}|${msgKey}`;
