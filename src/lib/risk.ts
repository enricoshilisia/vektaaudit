// Risk scoring, audit cycles, control labels and sample sizes. Shared by server and client code.

type Pill = { label: string; cls: string };
const pill = (label: string, cls: string): Pill => ({ label, cls });
const GREY = "bg-line-soft text-ink-700";
const BLUE = "bg-brand-100 text-brand-800";
const AMBER = "bg-med-bg text-med-fg";
const GREEN = "bg-ok-bg text-ok-fg";
const RED = "bg-high-bg text-high-fg";
const DARK_RED = "bg-[#7A1F17] text-white";

export const IMPACT = ["Minor", "Moderate", "Major", "Severe", "Critical"];
export const LIKELIHOOD = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];

export type Band = "critical" | "high" | "medium" | "low";

/** Impact × likelihood (1–25) into a rating band. */
export function band(score: number): Band {
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export const BAND_PILL: Record<Band, Pill> = {
  critical: pill("Critical", DARK_RED),
  high: pill("High", RED),
  medium: pill("Medium", AMBER),
  low: pill("Low", GREEN),
};
export const BAND_ORDER: Band[] = ["critical", "high", "medium", "low"];

/** Heat-map cell colours by band (light tints; the number is the label). */
export const BAND_HEAT: Record<Band, string> = { critical: "#F8C3BD", high: "#FDDCC0", medium: "#FEF4C6", low: "#E3F3EC" };

export const CONTROL_ENV = [
  { key: "strong", label: "Strong", factor: 0.5, cls: GREEN },
  { key: "adequate", label: "Adequate", factor: 0.75, cls: BLUE },
  { key: "needs_improvement", label: "Needs improvement", factor: 0.9, cls: AMBER },
  { key: "weak", label: "Weak", factor: 1, cls: RED },
] as const;
export const controlEnv = (k: string) => CONTROL_ENV.find((c) => c.key === k) ?? CONTROL_ENV[1];

/** Residual risk: inherent risk reduced by how strong the controls are. */
export function residual(impact: number, likelihood: number, env: string): Band {
  return band(Math.round(impact * likelihood * controlEnv(env).factor));
}

/** How often an area should be audited, by inherent risk. */
export const DEFAULT_CYCLE: Record<Band, number> = { critical: 12, high: 24, medium: 36, low: 48 };
export const CYCLES = [
  { months: 12, label: "Every year" },
  { months: 24, label: "Every 2 years" },
  { months: 36, label: "Every 3 years" },
  { months: 48, label: "Every 4 years" },
];

/** When the next audit is due: last audit + cycle, or now if never audited. */
export function nextDue(lastAuditedAt: Date | null, cycleMonths: number): Date {
  if (!lastAuditedAt) return new Date(0);
  const d = new Date(lastAuditedAt);
  d.setMonth(d.getMonth() + cycleMonths);
  return d;
}

export const PLAN_KINDS = [
  { key: "assurance", label: "Assurance" },
  { key: "it", label: "IT audit" },
  { key: "compliance", label: "Compliance" },
  { key: "advisory", label: "Advisory" },
  { key: "followup", label: "Follow-up" },
] as const;
export const kindLabel = (k: string) => PLAN_KINDS.find((x) => x.key === k)?.label ?? k;

export const PLAN_STATUS: Record<string, Pill> = {
  draft: pill("Draft", GREY),
  submitted: pill("Awaiting approval", AMBER),
  approved: pill("Approved", GREEN),
};

export const ITEM_STATUS: Record<string, Pill> = {
  planned: pill("Planned", GREY),
  in_progress: pill("In progress", BLUE),
  completed: pill("Completed", GREEN),
  deferred: pill("Deferred", AMBER),
  cancelled: pill("Cancelled", GREY),
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- controls ----

export const CONTROL_TYPES = [
  { key: "preventive", label: "Preventive" },
  { key: "detective", label: "Detective" },
];
export const CONTROL_NATURE = [
  { key: "manual", label: "Manual" },
  { key: "it_dependent", label: "IT-dependent manual" },
  { key: "automated", label: "Automated" },
];
export const FREQUENCIES = [
  { key: "per_transaction", label: "Each transaction" },
  { key: "multiple_daily", label: "Several times a day" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annually" },
  { key: "continuous", label: "Continuous (system)" },
];
export const ASSERTIONS = ["Occurrence", "Completeness", "Accuracy", "Cut-off", "Classification", "Existence", "Rights and obligations", "Valuation", "Presentation"];
export const COSO = ["Control environment", "Risk assessment", "Control activities", "Information and communication", "Monitoring activities"];

export const labelOf = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;

export const DESIGN_PILL: Record<string, Pill> = {
  not_assessed: pill("Not assessed", GREY),
  effective: pill("Effective", GREEN),
  needs_improvement: pill("Needs improvement", AMBER),
  ineffective: pill("Ineffective", RED),
};
export const OPERATING_PILL: Record<string, Pill> = {
  not_tested: pill("Not tested", GREY),
  effective: pill("Effective", GREEN),
  effective_exception: pill("Effective, with exception", AMBER),
  ineffective: pill("Ineffective", RED),
};
export const RISK_RATINGS: Band[] = ["critical", "high", "medium", "low"];

export const TEST_STATUS: Record<string, Pill> = {
  in_progress: pill("In progress", BLUE),
  in_review: pill("In review", AMBER),
  concluded: pill("Concluded", GREEN),
};
export const TEST_METHODS = [
  { key: "random", label: "Random" },
  { key: "systematic", label: "Systematic (every nth item)" },
  { key: "haphazard", label: "Haphazard" },
  { key: "judgemental", label: "Judgemental" },
  { key: "full", label: "Whole population" },
];

export type Attribute = { key: string; label: string; how?: string };
export const DEFAULT_ATTRIBUTES: Attribute[] = [
  { key: "A", label: "The control was performed", how: "Evidence the control ran for this item" },
  { key: "B", label: "Performed by an authorised person", how: "Compare the performer with the approved list or delegation of authority" },
  { key: "C", label: "Performed on time", how: "Compare the date performed with when it was due" },
  { key: "D", label: "Exceptions were followed up", how: "Any issue the control picked up was resolved" },
];

/**
 * Suggested sample size.
 * Manual controls follow the usual frequency guide. For controls that run many times a day or per transaction,
 * the statistical size for zero expected deviations: n = ln(1 − confidence) / ln(1 − tolerable rate).
 * Automated controls: one item, relying on IT general controls over change management.
 */
export function suggestedSample(c: { nature: string; frequency: string }, confidence: number, tolerable: number, population?: number | null) {
  const stat = Math.ceil(Math.log(1 - confidence / 100) / Math.log(1 - Math.max(tolerable, 1) / 100));
  let n: number;
  let why: string;
  if (c.nature === "automated") {
    n = 1;
    why = "Automated control: test one instance, provided IT general controls over changes are effective";
  } else {
    const guide: Record<string, number> = { annual: 1, quarterly: 2, monthly: 2, weekly: 5, daily: 20 };
    if (guide[c.frequency]) {
      n = guide[c.frequency];
      why = `Usual minimum for a ${labelOf(FREQUENCIES, c.frequency).toLowerCase()} manual control`;
    } else {
      n = stat;
      why = `Statistical size for ${confidence}% confidence, ${tolerable}% tolerable deviation and no expected deviations`;
    }
  }
  if (population && population > 0 && n > population) n = population;
  return { n, why, stat };
}

/** Exceptions in a sample: items where any attribute failed. */
export function countExceptions(samples: { results: unknown }[]) {
  return samples.filter((s) => Object.values((s.results ?? {}) as Record<string, string>).includes("fail")).length;
}

/** What the result suggests, given the deviations found. */
export function suggestedResult(size: number, exceptions: number, tolerable: number) {
  if (size === 0) return null;
  if (exceptions === 0) return "effective";
  return (exceptions / size) * 100 <= tolerable ? "effective_exception" : "ineffective";
}
