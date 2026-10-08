import type { AdapterCapabilities } from "@abr/contracts";
import { SELECTOR_REGISTRY } from "./selectors";
import type { WhatsAppWebAdapter } from "./types";

const none = { value: null, confidence: "none", origin: "unavailable" } as const;
/** Adaptador honesto: enquanto não houver seletores verificados, nada é lido nem enviado. */
export const nullAdapter: WhatsAppWebAdapter = {
  capabilities: (): AdapterCapabilities => ({
    adapter_version: SELECTOR_REGISTRY.version, selectors_verified_against_real_session: SELECTOR_REGISTRY.verified,
    can_read_ready_state: false, can_resolve_local_identity: false, can_resolve_open_contact: false,
    can_observe_rendered_messages: false, can_read_draft: false, can_prepare_text: false, can_send: false,
    notes: ["Seletores não verificados em sessão real; automação desabilitada."],
  }),
  checkReady: async () => none, resolveLocalIdentity: async () => none, resolveOpenContact: async () => none,
  observeRenderedMessages: () => () => {}, readDraft: async () => none,
  prepareText: async () => ({ prepared: false, reason: "capability_unavailable" }),
  send: async () => ({ status: "refused", reason: "capability_unavailable" }),
  reconcile: async () => ({ found: null }),
};
