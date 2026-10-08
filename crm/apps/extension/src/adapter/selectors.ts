/**
 * ÚNICO lugar com seletores do WhatsApp Web. Registro propositalmente VAZIO e `verified:false`.
 * Seletores só entram aqui depois de verificados em sessão real autorizada, com versão e data da verificação.
 * Enquanto vazio, o adaptador reporta todas as capacidades como indisponíveis e a automação fica desabilitada.
 */
export const SELECTOR_REGISTRY = { version: "unverified-0", verifiedAt: null as string | null, verified: false, selectors: {} as Record<string, string> };
