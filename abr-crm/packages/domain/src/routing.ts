/** Roteamento determinístico. Precedência: MAIOR `priority` vence. Empate entre regras = supervisão. */
export type MunicipalityInput =
  | { status: "resolved"; municipalityId: string; regionIds: string[] }
  | { status: "ambiguous" }          // mesma cidade em mais de uma UF → perguntar UF
  | { status: "unknown" };           // cidade não informada/identificada

export interface RoutingRule {
  id: string; version: number; priority: number; active: boolean;
  validFrom?: string; validTo?: string;
  departmentId: string;
  regionIds?: string[]; municipalityIds?: string[]; segmentIds?: string[]; channel?: string;
  targetUserIds: string[];
  selection: "fixed" | "round_robin" | "least_queue";
}
export interface RoutingTarget { userId: string; active: boolean; accepting: boolean; departmentIds: string[] }
export interface RoutingState {
  commercialDepartmentId: string;
  targets: Record<string, RoutingTarget>;
  roundRobinCursor: Record<string, number>;
  queueLoad: Record<string, number>;
  lastAssignedAt: Record<string, string>;
}
export interface RoutingInput {
  now: string; departmentId: string; municipality: MunicipalityInput;
  segmentId: string | null; channel: string | null;
  ownership?: { ownerUserId: string; exceptionSegmentIds: string[] } | null;
  humanRequested?: boolean;
}
export type MissingField = "city" | "uf" | "segment" | "channel";
export type RoutingDecision =
  | { kind: "assigned"; userId: string; ruleId: string | null; ruleVersion: number | null; reason: string; nextCursor?: number }
  | { kind: "needs_info"; missing: MissingField[] }
  | { kind: "supervision"; reason: "no_rule" | "rule_tie" | "no_eligible_target" | "human_requested_incomplete" };

type Tri = { s: "match" } | { s: "no" } | { s: "unknown"; missing: MissingField[] };

function evalRule(r: RoutingRule, i: RoutingInput): Tri {
  const unknown: MissingField[] = [];
  const geo = (r.regionIds?.length || r.municipalityIds?.length);
  if (geo) {
    const m = i.municipality;
    if (m.status === "resolved") {
      const byMun = r.municipalityIds?.includes(m.municipalityId) ?? false;
      const byReg = r.regionIds?.some((x) => m.regionIds.includes(x)) ?? false;
      if (!byMun && !byReg) return { s: "no" };
    } else unknown.push(m.status === "ambiguous" ? "uf" : "city");
  }
  if (r.segmentIds?.length) {
    if (i.segmentId === null) unknown.push("segment");
    else if (!r.segmentIds.includes(i.segmentId)) return { s: "no" };
  }
  if (r.channel) {
    if (i.channel === null) unknown.push("channel");
    else if (r.channel !== i.channel) return { s: "no" };
  }
  return unknown.length ? { s: "unknown", missing: unknown } : { s: "match" };
}

const eligible = (st: RoutingState, uid: string, dept: string) => {
  const t = st.targets[uid];
  return !!t && t.active && t.accepting && t.departmentIds.includes(dept);
};

/** Campos que a regra exige — para o administrador visualizar exatamente o que ela pede. */
export function requiredInputs(r: RoutingRule): MissingField[] {
  const f: MissingField[] = [];
  if (r.regionIds?.length || r.municipalityIds?.length) f.push("city", "uf");
  if (r.segmentIds?.length) f.push("segment");
  if (r.channel) f.push("channel");
  return f;
}

export function resolveRouting(rules: RoutingRule[], st: RoutingState, i: RoutingInput): RoutingDecision {
  // 1) Carteira existente (somente Comercial, respeitando exceções e elegibilidade do dono)
  const o = i.ownership;
  if (o && i.departmentId === st.commercialDepartmentId
      && !(i.segmentId && o.exceptionSegmentIds.includes(i.segmentId))
      && eligible(st, o.ownerUserId, i.departmentId)) {
    return { kind: "assigned", userId: o.ownerUserId, ruleId: null, ruleVersion: null, reason: "customer_ownership" };
  }
  // 2) Regras vigentes do departamento
  const live = rules.filter((r) => r.active && r.departmentId === i.departmentId
    && (!r.validFrom || r.validFrom <= i.now) && (!r.validTo || i.now < r.validTo));
  const evald = live.map((r) => ({ r, t: evalRule(r, i) }));
  const matches = evald.filter((x) => x.t.s === "match").map((x) => x.r);
  const unknowns = evald.filter((x): x is { r: RoutingRule; t: { s: "unknown"; missing: MissingField[] } } => x.t.s === "unknown");
  const topMatch = matches.length ? Math.max(...matches.map((r) => r.priority)) : -Infinity;
  // 3) Regra de maior precedência ainda indefinida por falta de dado → perguntar, não adivinhar
  const blocking = unknowns.filter((u) => u.r.priority >= topMatch);
  if (blocking.length) {
    if (i.humanRequested) return { kind: "supervision", reason: "human_requested_incomplete" };
    const missing = [...new Set(blocking.flatMap((b) => b.t.missing))];
    return { kind: "needs_info", missing };
  }
  if (!matches.length) return { kind: "supervision", reason: "no_rule" };
  const top = matches.filter((r) => r.priority === topMatch);
  if (top.length > 1) return { kind: "supervision", reason: "rule_tie" };
  const rule = top[0]!;
  const ok = rule.targetUserIds.filter((u) => eligible(st, u, i.departmentId));
  if (!ok.length) return { kind: "supervision", reason: "no_eligible_target" };

  const base = { ruleId: rule.id, ruleVersion: rule.version };
  if (rule.selection === "fixed") {
    const first = rule.targetUserIds[0]!;               // sem substituição silenciosa
    return eligible(st, first, i.departmentId)
      ? { kind: "assigned", userId: first, ...base, reason: "fixed" }
      : { kind: "supervision", reason: "no_eligible_target" };
  }
  if (rule.selection === "round_robin") {
    const n = rule.targetUserIds.length, cur = st.roundRobinCursor[rule.id] ?? 0;
    for (let k = 0; k < n; k++) {
      const idx = (cur + k) % n, uid = rule.targetUserIds[idx]!;
      if (eligible(st, uid, i.departmentId)) return { kind: "assigned", userId: uid, ...base, reason: "round_robin", nextCursor: (idx + 1) % n };
    }
  }
  // least_queue: menor carga; empate → atribuição mais antiga (nunca atribuído = mais antigo); depois userId
  const pick = [...ok].sort((a, b) =>
    (st.queueLoad[a] ?? 0) - (st.queueLoad[b] ?? 0)
    || (st.lastAssignedAt[a] ?? "").localeCompare(st.lastAssignedAt[b] ?? "")
    || a.localeCompare(b))[0]!;
  return { kind: "assigned", userId: pick, ...base, reason: "least_queue" };
}
