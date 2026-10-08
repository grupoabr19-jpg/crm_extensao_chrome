export type HandoffEventType =
  | "created" | "send_requested" | "send_observed" | "send_uncertain"
  | "arrival_observed" | "association_pending" | "association_confirmed"
  | "claimed" | "cancelled" | "superseded";
export interface HandoffEvent { type: HandoffEventType; at: string }

export interface HandoffProjection {
  created: boolean; sendPending: boolean; sendObserved: boolean; sendUncertain: boolean;
  awaitingDestinationMessage: boolean; messageReceived: boolean; associationPending: boolean;
  claimed: boolean; cancelled: boolean; superseded: boolean;
}

export function appendEvent(events: HandoffEvent[], e: HandoffEvent): HandoffEvent[] {
  const closed = events.some((x) => x.type === "cancelled" || x.type === "superseded");
  if (closed) throw new Error("handoff_closed");
  if (e.type !== "created" && !events.some((x) => x.type === "created")) throw new Error("handoff_not_created");
  return [...events, e];
}

/** Estados independentes derivados de eventos (nada sobrescrito). */
export function project(events: HandoffEvent[]): HandoffProjection {
  const has = (t: HandoffEventType) => events.some((e) => e.type === t);
  const lastIdx = (t: HandoffEventType) => events.map((e) => e.type).lastIndexOf(t);
  const sendObserved = has("send_observed");
  const sendUncertain = has("send_uncertain") && lastIdx("send_uncertain") > lastIdx("send_observed");
  const messageReceived = has("arrival_observed") || has("association_confirmed");
  const pendingIdx = lastIdx("association_pending");
  const resolvedIdx = Math.max(lastIdx("arrival_observed"), lastIdx("association_confirmed"));
  const cancelled = has("cancelled"), superseded = has("superseded");
  return {
    created: has("created"),
    sendPending: has("send_requested") && !sendObserved && !sendUncertain,
    sendObserved, sendUncertain,
    awaitingDestinationMessage: sendObserved && !messageReceived && !cancelled && !superseded,
    messageReceived,
    associationPending: pendingIdx > resolvedIdx,
    claimed: has("claimed"), cancelled, superseded,
  };
}
