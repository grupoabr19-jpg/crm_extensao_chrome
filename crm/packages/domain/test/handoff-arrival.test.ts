import { describe, it, expect } from "vitest";
import { matchArrival, appendEvent, project, type HandoffCandidate, type ArrivalInput, type HandoffEvent } from "@abr/domain";

const cand = (o: Partial<HandoffCandidate> & { handoffId: string }): HandoffCandidate => ({
  destinationUserId: "u1", destinationAccountId: "a1", protocol: "ABR-AAAA-0001", expiresAt: "2026-10-09T00:00:00Z",
  contactPhones: ["+5511999990001"], sharedPhone: false, ...o,
});
const inp = (o: Partial<ArrivalInput> = {}): ArrivalInput => ({
  localAccountVerified: true, userId: "u1", accountId: "a1", now: "2026-10-08T12:00:00Z",
  sender: { e164: "+5511999990001", reliable: true }, protocol: null, candidates: [cand({ handoffId: "h1" })], autoLinkPolicy: "auto", ...o,
});

describe("chegada no destinatário", () => {
  it("caso 12: mesmo telefone + um atendimento → associa", () => {
    expect(matchArrival(inp())).toEqual({ kind: "matched", handoffId: "h1", mode: "auto" });
  });
  it("conta local não verificada bloqueia tudo", () => {
    expect(matchArrival(inp({ localAccountVerified: false }))).toEqual({ kind: "blocked_account" });
  });
  it("caso 13: protocolo vindo de telefone diferente exige confirmação humana", () => {
    expect(matchArrival(inp({ protocol: "ABR-AAAA-0001", sender: { e164: "+5511988880000", reliable: true } })))
      .toEqual({ kind: "confirm_required", handoffId: "h1", reason: "phone_mismatch" });
  });
  it("caso 14: várias fichas → escolha assistida; telefone compartilhado e protocolo errado → nunca automático", () => {
    const two = [cand({ handoffId: "h1" }), cand({ handoffId: "h2", protocol: "ABR-AAAA-0002" })];
    expect(matchArrival(inp({ candidates: two }))).toEqual({ kind: "choose", handoffIds: ["h1", "h2"] });
    expect(matchArrival(inp({ candidates: [cand({ handoffId: "h1", sharedPhone: true })] }))).toMatchObject({ kind: "confirm_required", reason: "shared_phone" });
    expect(matchArrival(inp({ protocol: "ABR-ZZZZ-9999" }))).toMatchObject({ kind: "confirm_required", reason: "protocol_not_found" });
  });
  it("caso 15: protocolo de ficha não autorizada ao usuário → mesma resposta de 'inexistente' (sem vazamento)", () => {
    const other = cand({ handoffId: "hX", destinationUserId: "outro", protocol: "ABR-SECR-0000", contactPhones: ["+5511977770000"] });
    const r = matchArrival(inp({ protocol: "ABR-SECR-0000", sender: { e164: "+5511966660000", reliable: true }, candidates: [other] }));
    expect(r).toEqual({ kind: "no_case" });
    expect(JSON.stringify(r)).not.toContain("hX");
  });
  it("telefone não confiável nunca associa sozinho; expirada vai à supervisão", () => {
    expect(matchArrival(inp({ sender: { e164: "+5511999990001", reliable: false } }))).toEqual({ kind: "no_case" });
    expect(matchArrival(inp({ candidates: [cand({ handoffId: "h1", expiresAt: "2026-10-01T00:00:00Z" })] }))).toEqual({ kind: "expired_needs_supervision", handoffId: "h1" });
  });
  it("política 'suggest' sugere em vez de vincular", () => {
    expect(matchArrival(inp({ autoLinkPolicy: "suggest" }))).toMatchObject({ kind: "matched", mode: "suggest" });
  });
});

describe("estados independentes da transferência", () => {
  const ev = (type: HandoffEvent["type"]): HandoffEvent => ({ type, at: "t" });
  const run = (...t: HandoffEvent["type"][]) => t.reduce<HandoffEvent[]>((a, x) => appendEvent(a, ev(x)), []);
  it("caso 11: link observado ≠ chegada; chegada exige evidência do destino", () => {
    const p = project(run("created", "send_requested", "send_observed"));
    expect(p).toMatchObject({ sendObserved: true, awaitingDestinationMessage: true, messageReceived: false });
  });
  it("envio incerto não vira observado; associação pendente é rastreada", () => {
    expect(project(run("created", "send_requested", "send_uncertain"))).toMatchObject({ sendUncertain: true, sendObserved: false, awaitingDestinationMessage: false });
    const p = project(run("created", "send_observed", "association_pending"));
    expect(p).toMatchObject({ associationPending: true, messageReceived: false });
    expect(project(run("created", "send_observed", "association_pending", "association_confirmed"))).toMatchObject({ associationPending: false, messageReceived: true });
  });
  it("reencaminhamento: transferência substituída é fechada e não aceita novos eventos", () => {
    const evs = run("created", "send_observed", "superseded");
    expect(project(evs).superseded).toBe(true);
    expect(() => appendEvent(evs, ev("arrival_observed"))).toThrow("handoff_closed");
  });
});
