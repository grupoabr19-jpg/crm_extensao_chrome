import { describe, it, expect } from "vitest";
import { resolveRouting, requiredInputs, type RoutingRule, type RoutingState, type RoutingInput } from "@abr/domain";

const COM = "dep-com", FIN = "dep-fin";
const tgt = (id: string, o: Partial<{ active: boolean; accepting: boolean }> = {}) => ({ userId: id, active: true, accepting: true, departmentIds: [COM, FIN], ...o });
const st = (over: Partial<RoutingState> = {}): RoutingState => ({
  commercialDepartmentId: COM,
  targets: { ana: tgt("ana"), bia: tgt("bia"), caio: tgt("caio"), fin1: tgt("fin1"), sup: tgt("sup") },
  roundRobinCursor: {}, queueLoad: {}, lastAssignedAt: {}, ...over,
});
const base = (o: Partial<RoutingInput> = {}): RoutingInput => ({
  now: "2026-10-08T12:00:00Z", departmentId: COM,
  municipality: { status: "resolved", municipalityId: "m-jundiai", regionIds: ["r-jundiai"] },
  segmentId: "seg-serralheiros", channel: null, ...o,
});
const rule = (r: Partial<RoutingRule> & { id: string }): RoutingRule => ({
  version: 1, priority: 10, active: true, departmentId: COM, targetUserIds: ["ana"], selection: "fixed", ...r,
});

describe("roteamento determinístico", () => {
  it("caso 4: especialista de segmento vence fallback regional; sem segmento, pergunta", () => {
    const rules = [
      rule({ id: "regional", priority: 10, regionIds: ["r-jundiai"], targetUserIds: ["bia"] }),
      rule({ id: "esp", priority: 50, regionIds: ["r-jundiai"], segmentIds: ["seg-serralheiros"], targetUserIds: ["caio"] }),
    ];
    expect(resolveRouting(rules, st(), base())).toMatchObject({ kind: "assigned", userId: "caio", ruleId: "esp" });
    expect(resolveRouting(rules, st(), base({ segmentId: "seg-outro" }))).toMatchObject({ kind: "assigned", userId: "bia", ruleId: "regional" });
    expect(resolveRouting(rules, st(), base({ segmentId: null }))).toEqual({ kind: "needs_info", missing: ["segment"] });
  });
  it("caso 2: cidade ambígua pede UF (DDD não é usado)", () => {
    const rules = [rule({ id: "r", regionIds: ["r-jundiai"] })];
    expect(resolveRouting(rules, st(), base({ municipality: { status: "ambiguous" } }))).toEqual({ kind: "needs_info", missing: ["uf"] });
  });
  it("caso 3: carteira aplica dono, com exceção por segmento e dono inelegível", () => {
    const rules = [rule({ id: "r", targetUserIds: ["bia"] })];
    const own = { ownerUserId: "ana", exceptionSegmentIds: ["seg-exc"] };
    expect(resolveRouting(rules, st(), base({ ownership: own }))).toMatchObject({ userId: "ana", reason: "customer_ownership" });
    expect(resolveRouting(rules, st(), base({ ownership: own, segmentId: "seg-exc" }))).toMatchObject({ userId: "bia" });
    const s = st(); s.targets.ana = tgt("ana", { active: false });
    expect(resolveRouting(rules, s, base({ ownership: own }))).toMatchObject({ userId: "bia" });
  });
  it("caso 5: sem regra e empate → supervisão", () => {
    expect(resolveRouting([], st(), base())).toEqual({ kind: "supervision", reason: "no_rule" });
    const tie = [rule({ id: "a", regionIds: ["r-jundiai"] }), rule({ id: "b", regionIds: ["r-jundiai"], targetUserIds: ["bia"] })];
    expect(resolveRouting(tie, st(), base())).toEqual({ kind: "supervision", reason: "rule_tie" });
  });
  it("caso 6: Financeiro/SAC não exigem cidade nem segmento", () => {
    const rules = [rule({ id: "fin", departmentId: FIN, targetUserIds: ["fin1"] })];
    expect(resolveRouting(rules, st(), base({ departmentId: FIN, municipality: { status: "unknown" }, segmentId: null })))
      .toMatchObject({ kind: "assigned", userId: "fin1" });
  });
  it("caso 8: pedido de humano com ficha incompleta não pergunta mais", () => {
    const rules = [rule({ id: "r", regionIds: ["r-jundiai"] })];
    expect(resolveRouting(rules, st(), base({ municipality: { status: "unknown" }, humanRequested: true })))
      .toEqual({ kind: "supervision", reason: "human_requested_incomplete" });
  });
  it("caso 26: funcionário desativado/indisponível nunca recebe; sem substituição silenciosa no fixo", () => {
    const rules = [rule({ id: "r", targetUserIds: ["ana", "bia"] })];
    const s = st(); s.targets.ana = tgt("ana", { active: false });
    expect(resolveRouting(rules, s, base())).toEqual({ kind: "supervision", reason: "no_eligible_target" });
  });
  it("regras fora da vigência são ignoradas", () => {
    const rules = [rule({ id: "r", validTo: "2026-01-01T00:00:00Z" })];
    expect(resolveRouting(rules, st(), base())).toEqual({ kind: "supervision", reason: "no_rule" });
  });
  it("rodízio e menor fila têm política explícita", () => {
    const rr = [rule({ id: "rr", selection: "round_robin", targetUserIds: ["ana", "bia", "caio"] })];
    const s = st({ roundRobinCursor: { rr: 1 } }); s.targets.bia = tgt("bia", { accepting: false });
    expect(resolveRouting(rr, s, base())).toMatchObject({ userId: "caio", nextCursor: 0 });
    const lq = [rule({ id: "lq", selection: "least_queue", targetUserIds: ["ana", "bia", "caio"] })];
    const s2 = st({ queueLoad: { ana: 3, bia: 1, caio: 1 }, lastAssignedAt: { bia: "2026-10-08T11:00:00Z", caio: "2026-10-08T10:00:00Z" } });
    expect(resolveRouting(lq, s2, base())).toMatchObject({ userId: "caio", reason: "least_queue" });
  });
  it("admin vê exatamente o que a regra exige", () => {
    expect(requiredInputs(rule({ id: "x", regionIds: ["r"], segmentIds: ["s"] }))).toEqual(["city", "uf", "segment"]);
  });
});
