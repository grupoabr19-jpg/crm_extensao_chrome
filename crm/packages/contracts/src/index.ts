import { z } from "zod";

/** Campo extraído pela IA: valor só vale com evidência verificável (IDs de mensagens enviadas ao modelo). */
const evidenced = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ value: v.nullable(), evidence_message_ids: z.array(z.string()).max(20) }).strict();

export const TriageOutputSchema = z.object({
  intent: z.enum(["sales", "finance", "logistics", "support", "human_request", "other", "unknown"]),
  department_candidate: z.string().max(60).nullable(),
  extracted_fields: z.object({
    name: evidenced(z.string().max(120)),
    company: evidenced(z.string().max(160)),
    city: evidenced(z.string().max(120)),
    uf: evidenced(z.string().length(2)),
    segment_id: evidenced(z.string().max(64)),
    need: evidenced(z.string().max(500)),
    products: evidenced(z.string().max(500)),
    quantity_text: evidenced(z.string().max(200)),
  }).strict(),
  missing_required_fields: z.array(z.string()).max(10),
  confidence: z.number().min(0).max(1),
  recommended_action: z.enum(["ask_question", "request_routing", "request_human", "update_summary", "none"]),
  human_needed: z.boolean(),
  /** Chave de pergunta do catálogo aprovado — nunca texto livre para o cliente. */
  suggested_question: z.string().max(64).nullable(),
  summary: z.string().max(1000),
}).strict();
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

export const ChatKind = z.enum(["individual", "group", "status", "broadcast", "unknown"]);
export const ObservationEventSchema = z.object({
  observation_key: z.string().min(8).max(200),          // idempotência da observação (por dispositivo)
  device_id: z.string().uuid(),
  account_id: z.string().uuid(),                        // conta local validada pelo backend, não autoridade do cliente
  chat_kind: ChatKind,
  direction: z.enum(["in", "out", "unknown"]),
  content_kind: z.enum(["text", "media", "system", "unknown"]),
  wa_message_id: z.string().max(200).nullable(),
  rendered_time_label: z.string().max(40).nullable(),
  ordinal_in_view: z.number().int().nonnegative(),
  sender_phone_raw: z.string().max(40).nullable(),
  sender_phone_reliable: z.boolean(),
  body: z.string().max(4000).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  observed_at: z.string().datetime(),
}).strict();
export type ObservationEvent = z.infer<typeof ObservationEventSchema>;

/** Capacidades REAIS reportadas pelo adaptador; nada é presumido. */
export const AdapterCapabilitiesSchema = z.object({
  adapter_version: z.string(),
  selectors_verified_against_real_session: z.boolean(),
  can_read_ready_state: z.boolean(),
  can_resolve_local_identity: z.boolean(),
  can_resolve_open_contact: z.boolean(),
  can_observe_rendered_messages: z.boolean(),
  can_read_draft: z.boolean(),
  can_prepare_text: z.boolean(),
  can_send: z.boolean(),
  notes: z.array(z.string()),
}).strict();
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;
