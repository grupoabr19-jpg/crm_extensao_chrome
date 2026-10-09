export type TriageMessage = { id: string; direction: "in" | "out"; text: string };
export type TriageGuard = {
  ok: boolean;
  humanNeeded: boolean;
  fields: Record<string, string | null>;
  action: string;
  intent: string;
  confidence: number;
  outbound: { kind: string; key?: string; text?: string };
  summary: string;
  issues: string[];
};

export function normalizeText(value: unknown): string;
export function normalizeTriageMessages(input: { messages?: unknown[] }): TriageMessage[];
export function approvedSegment(value: unknown): string | null;
export function guardTriageOutput(raw: unknown, messages: TriageMessage[], options?: Record<string, unknown>): TriageGuard;
export function buildCasePayload(input: { body: Record<string, any>; guard: TriageGuard }): Record<string, unknown>;
export function callGroqTriage(input: {
  body: Record<string, any>;
  messages: TriageMessage[];
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<Record<string, any>>;
