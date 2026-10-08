import type { AdapterCapabilities, ObservationEvent } from "@abr/contracts";

/** Toda resposta do adaptador informa confiança e origem; nada é presumido. */
export interface Observed<T> { value: T | null; confidence: "high" | "medium" | "low" | "none"; origin: "dom_visible" | "unavailable"; }
export interface OpenContact { displayName: string | null; phoneRaw: string | null; phoneReliable: boolean; chatKind: "individual" | "group" | "status" | "broadcast" | "unknown"; contextId: string }
export type SendOutcome = { status: "observed_in_ui" } | { status: "uncertain" } | { status: "refused"; reason: string };

export interface WhatsAppWebAdapter {
  capabilities(): AdapterCapabilities;
  checkReady(): Promise<Observed<boolean>>;
  resolveLocalIdentity(): Promise<Observed<{ phoneRaw: string }>>;
  resolveOpenContact(): Promise<Observed<OpenContact>>;
  observeRenderedMessages(onEvent: (e: Omit<ObservationEvent, "device_id" | "account_id" | "observation_key">) => void): () => void; // retorna dispose
  readDraft(): Promise<Observed<{ text: string; typing: boolean }>>;
  prepareText(text: string, expectContextId: string): Promise<{ prepared: boolean; reason?: string }>;
  send(expectContextId: string): Promise<SendOutcome>;
  reconcile(textFingerprint: string): Promise<{ found: boolean | null }>;  // null = não foi possível verificar
}
