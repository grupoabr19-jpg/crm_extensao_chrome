const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford (sem I L O U)

/** Protocolo público: aleatório, não sequencial, NÃO é credencial de acesso. */
export function generateProtocol(randomBytes: (n: number) => Uint8Array): string {
  const b = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[(b[i] ?? 0) & 31];
  return `ABR-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function extractProtocol(text: string): string | null {
  const m = /\bABR-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})\b/i.exec(text);
  return m ? `ABR-${m[1]!.toUpperCase()}-${m[2]!.toUpperCase()}` : null;
}

/** Link wa.me: número do CADASTRO validado; texto = saudação + protocolo, nada mais. */
export function buildHandoffLink(targetE164: string, protocol: string): string {
  if (!/^\+\d{8,15}$/.test(targetE164)) throw new Error("destination_not_e164");
  if (!/^ABR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(protocol)) throw new Error("bad_protocol");
  const text = `Olá! Meu protocolo de atendimento ABR é ${protocol}.`;
  return `https://wa.me/${targetE164.slice(1)}?text=${encodeURIComponent(text)}`;
}

export type HandoffVariant = "normal" | "incomplete" | "human_requested" | "after_hours";
export const ASSISTANT_INTRO = "Olá! Sou o assistente virtual da ABR.";

export function buildHandoffMessage(p: {
  firstName?: string | null; responsibleName: string; department: string;
  link: string; protocol: string; variant?: HandoffVariant;
}): string {
  const thanks = p.firstName ? `Obrigado, ${p.firstName}.` : "Obrigado.";
  const lead = {
    normal: `${thanks} Registrei sua solicitação.`,
    incomplete: `${thanks} Registrei o que você me informou até aqui.`,
    human_requested: `${thanks} Entendi que você prefere falar com uma pessoa e registrei sua solicitação.`,
    after_hours: `${thanks} Registrei sua solicitação. Fora do horário de atendimento, o retorno pode levar mais tempo.`,
  }[p.variant ?? "normal"];
  return `${lead} Para continuar, fale com ${p.responsibleName}, do ${p.department}: ${p.link}. Clique no link e envie a mensagem que aparecer. Protocolo: ${p.protocol}.`;
}
