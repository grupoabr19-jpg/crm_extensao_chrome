export type PhoneResult =
  | { ok: true; e164: string; original: string; source: string }
  | { ok: false; original: string; reason: "empty" | "ambiguous_length" | "invalid_br" | "invalid_length" };

/**
 * Normaliza para E.164 preservando original e origem.
 * NÃO insere nem remove o nono dígito, NÃO infere cidade por DDD, NÃO unifica por semelhança.
 */
export function normalizePhone(raw: string, source: string): PhoneResult {
  const original = raw;
  const t = raw.trim();
  let digits = t.replace(/\D/g, "");
  if (!digits) return { ok: false, original, reason: "empty" };
  let international = t.startsWith("+");
  if (!international && digits.startsWith("00")) { digits = digits.slice(2); international = true; }

  if (international) {
    if (digits.length < 8 || digits.length > 15) return { ok: false, original, reason: "invalid_length" };
    if (digits.startsWith("55")) return brOk(digits, original, source);
    return { ok: true, e164: "+" + digits, original, source };
  }
  // Sem "+": comprimento decide. 10/11 = nacional BR (DDD 55 existe, então não confundir com país).
  if (digits.length === 10 || digits.length === 11) return brOk("55" + digits, original, source);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return brOk(digits, original, source);
  return { ok: false, original, reason: "ambiguous_length" };
}

function brOk(digitsWithCc: string, original: string, source: string): PhoneResult {
  const rest = digitsWithCc.slice(2);
  const ddd = rest.slice(0, 2), sub = rest.slice(2);
  const dddOk = /^[1-9][1-9]$/.test(ddd);
  const subOk = (sub.length === 9 && sub[0] === "9") || (sub.length === 8 && /^[2-9]/.test(sub));
  if (!dddOk || !subOk) return { ok: false, original, reason: "invalid_br" };
  return { ok: true, e164: "+" + digitsWithCc, original, source };
}
