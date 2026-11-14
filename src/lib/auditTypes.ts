// The kinds of audit an engagement can be. Only a financial statement audit uses the trial balance, materiality and
// the auditor's report; every other type is an internal-audit style engagement with its own report.

export type AuditType = { key: string; label: string; short: string; about: string; kind: "internal" | "financial"; programs: string[] };

export const AUDIT_TYPES: AuditType[] = [
  { key: "operational", label: "Operational audit", short: "Operational", about: "How a process or department works, and the controls around it", kind: "internal", programs: ["p2p", "inventory", "assets"] },
  { key: "financial_controls", label: "Financial controls review", short: "Financial controls", about: "Controls over payments, payroll, cash and reporting", kind: "internal", programs: ["p2p", "payroll", "cash", "revenue"] },
  { key: "it", label: "IT and cyber security audit", short: "IT", about: "Access, changes, backups and security of systems", kind: "internal", programs: ["itgc"] },
  { key: "compliance", label: "Compliance audit", short: "Compliance", about: "Laws, regulations, policies and donor or contract conditions", kind: "internal", programs: ["dataprotection", "grants"] },
  { key: "governance", label: "Governance and risk management", short: "Governance", about: "Board oversight, the risk register, ethics and policies", kind: "internal", programs: ["governance"] },
  { key: "performance", label: "Performance (value for money)", short: "Performance", about: "Whether a programme or project meets its goals economically", kind: "internal", programs: [] },
  { key: "investigation", label: "Investigation", short: "Investigation", about: "Suspected fraud, whistleblowing reports or misconduct", kind: "internal", programs: [] },
  { key: "advisory", label: "Advisory review", short: "Advisory", about: "Advice on a new system, project or control design, without an opinion", kind: "internal", programs: [] },
  { key: "followup", label: "Follow-up review", short: "Follow-up", about: "Whether earlier findings have really been fixed", kind: "internal", programs: [] },
  { key: "statutory", label: "Financial statement audit", short: "Financial statements", about: "An opinion on the accounts, with trial balance, materiality and the auditor's report", kind: "financial", programs: ["revenue", "cash", "inventory", "assets", "payroll"] },
];

export const auditTypeOf = (key: string | null | undefined) => AUDIT_TYPES.find((t) => t.key === key);

/** The short label for an engagement, falling back on its kind for engagements made before types existed. */
export const typeLabel = (e: { auditType?: string | null; kind: string }) => auditTypeOf(e.auditType)?.short ?? (e.kind === "financial" ? "Financial statements" : "Internal audit");

/** Plan item kinds map onto engagement types when a planned audit is started. */
export const TYPE_FOR_PLAN: Record<string, string> = { assurance: "operational", it: "it", compliance: "compliance", advisory: "advisory", followup: "followup" };
