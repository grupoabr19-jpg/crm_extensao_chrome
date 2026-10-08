export type OutboxState = "created" | "reserved" | "prepared" | "executing" | "observed" | "uncertain" | "cancelled" | "failed";
const NEXT: Record<OutboxState, OutboxState[]> = {
  created: ["reserved", "cancelled"],
  reserved: ["prepared", "cancelled", "failed"],
  prepared: ["executing", "cancelled", "failed"],
  executing: ["observed", "uncertain", "failed"],
  observed: [], uncertain: ["observed", "cancelled"], cancelled: [], failed: ["created", "cancelled"],
};
export const canTransition = (a: OutboxState, b: OutboxState) => NEXT[a].includes(b);

export interface OutboxCommand { state: OutboxState; attempts: number; executionStarted: boolean }

/** Queda entre o clique e o registro: `executing` vira `uncertain`, nunca reenvia. */
export function recoverAfterCrash(c: OutboxCommand): OutboxCommand {
  return c.state === "executing" ? { ...c, state: "uncertain", executionStarted: true } : c;
}
/** Retentativa automática SÓ para falha ocorrida ANTES de qualquer execução na interface. */
export function canAutoRetry(c: OutboxCommand, maxAttempts: number): boolean {
  return c.state === "failed" && !c.executionStarted && c.attempts < maxAttempts;
}
export type ReconcileEvidence = "message_observed" | "not_found" | "no_evidence";
export function reconcileUncertain(evidence: ReconcileEvidence): { next: "observed" | "uncertain"; needsHuman: boolean } {
  return evidence === "message_observed" ? { next: "observed", needsHuman: false } : { next: "uncertain", needsHuman: true };
}

export interface SendContext {
  caseVersion: number; contextId: string; userId: string; accountId: string;
  fencingToken: number; expiresAt: string;
}
export interface LiveContext {
  now: string; caseVersion: number; contextId: string; userId: string; accountId: string;
  accountVerified: boolean; leaseFencingToken: number;
  humanTakeover: boolean; draftPresent: boolean; typing: boolean;
}
export type SendBlock = "account_changed" | "lease_invalid" | "expired" | "user_mismatch" | "version_mismatch"
  | "context_changed" | "human_takeover" | "draft_present" | "typing";

/** Revalidação imediatamente antes de inserir e antes de enviar. */
export function validateBeforeSend(cmd: SendContext, live: LiveContext): { ok: true } | { ok: false; reason: SendBlock } {
  if (!live.accountVerified || live.accountId !== cmd.accountId) return { ok: false, reason: "account_changed" };
  if (live.leaseFencingToken !== cmd.fencingToken) return { ok: false, reason: "lease_invalid" };
  if (live.now >= cmd.expiresAt) return { ok: false, reason: "expired" };
  if (live.userId !== cmd.userId) return { ok: false, reason: "user_mismatch" };
  if (live.humanTakeover) return { ok: false, reason: "human_takeover" };
  if (live.caseVersion !== cmd.caseVersion) return { ok: false, reason: "version_mismatch" };
  if (live.contextId !== cmd.contextId) return { ok: false, reason: "context_changed" };
  if (live.draftPresent) return { ok: false, reason: "draft_present" };
  if (live.typing) return { ok: false, reason: "typing" };
  return { ok: true };
}
