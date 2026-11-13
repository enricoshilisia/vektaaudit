// Labels, formatting and pill colours shared by server and client code.

export const PHASES = [
  { key: "planning", label: "Planning" },
  { key: "risk", label: "Risk assessment" },
  { key: "fieldwork", label: "Fieldwork" },
  { key: "review", label: "Review" },
  { key: "reporting", label: "Reporting" },
  { key: "followup", label: "Follow-up" },
  { key: "closed", label: "Closed" },
] as const;
export type Phase = (typeof PHASES)[number]["key"];
export const phaseLabel = (p: string) => PHASES.find((x) => x.key === p)?.label ?? p;
export const phaseIndex = (p: string) => PHASES.findIndex((x) => x.key === p);

type Pill = { label: string; cls: string };
const pill = (label: string, cls: string): Pill => ({ label, cls });
const GREY = "bg-line-soft text-ink-700";
const BLUE = "bg-brand-100 text-brand-800";
const AMBER = "bg-med-bg text-med-fg";
const GREEN = "bg-ok-bg text-ok-fg";
const RED = "bg-high-bg text-high-fg";
const VIOLET = "bg-violet-bg text-violet-fg";

export const PHASE_PILL: Record<string, Pill> = {
  planning: pill("Planning", GREY),
  risk: pill("Risk assessment", GREY),
  fieldwork: pill("Fieldwork", BLUE),
  review: pill("Review", AMBER),
  reporting: pill("Reporting", GREEN),
  followup: pill("Follow-up", VIOLET),
  closed: pill("Closed", GREY),
};

export const PROCEDURE_PILL: Record<string, Pill> = {
  not_started: pill("Not started", GREY),
  in_progress: pill("In progress", BLUE),
  in_review: pill("In review", AMBER),
  signed_off: pill("Signed off", GREEN),
};

export const FINDING_PILL: Record<string, Pill> = {
  awaiting_response: pill("Awaiting response", AMBER),
  in_remediation: pill("In remediation", BLUE),
  pending_validation: pill("Pending validation", VIOLET),
  closed: pill("Closed", GREEN),
  overdue: pill("Overdue", RED),
};

export const SEVERITY: Record<string, { label: string; cls: string; dot: string; bar: string }> = {
  critical: { label: "Critical", cls: "bg-[#7A1F17] text-white", dot: "bg-white", bar: "#7A1F17" },
  high: { label: "High", cls: RED, dot: "bg-high-dot", bar: "#B42318" },
  medium: { label: "Medium", cls: AMBER, dot: "bg-med-dot", bar: "#DC6803" },
  low: { label: "Low", cls: GREY, dot: "bg-ink-400", bar: "#7A8A9C" },
};

export const REQUEST_PILL: Record<string, Pill> = {
  open: pill("Open", BLUE),
  submitted: pill("Submitted", VIOLET),
  needs_info: pill("Needs more info", AMBER),
  accepted: pill("Accepted", GREEN),
  overdue: pill("Overdue", RED),
};

export const DOC_PILL: Record<string, Pill> = {
  uploaded: pill("Uploaded", BLUE),
  reviewed: pill("Reviewed", GREEN),
  client_upload: pill("Client upload", GREY),
};

export const RISK_PILL: Record<string, Pill> = {
  normal: pill("Normal", GREY),
  elevated: pill("Elevated", AMBER),
  significant: pill("Significant", RED),
};

export const LEAD_PILL: Record<string, Pill> = {
  not_started: pill("Not started", GREY),
  testing: pill("Testing", BLUE),
  in_review: pill("In review", AMBER),
  signed_off: pill("Signed off", GREEN),
};

export const RATING_PILL: Record<string, Pill> = {
  satisfactory: pill("Satisfactory", GREEN),
  needs_improvement: pill("Needs improvement", AMBER),
  unsatisfactory: pill("Unsatisfactory", RED),
};

/** Remembers a collapsed sidebar, so the server draws it that way (no flicker). */
export const RAIL_COOKIE = "va_rail";

export const CURRENCIES = ["KES", "UGX", "TZS", "RWF", "ETB", "NGN", "GHS", "ZAR", "USD", "EUR", "GBP"];

/** What the organisation calls the entities it audits. */
export const clientWord = (kind: string) => (kind === "internal" ? { one: "Auditable unit", many: "Auditable units" } : { one: "Client", many: "Clients" });

export const FOLDERS = [
  "Permanent file",
  "A · Planning & acceptance",
  "B · Risk assessment",
  "C · Fieldwork",
  "D · Completion & reporting",
  "Correspondence",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d: Date | string | null | undefined, withYear = true) {
  if (!d) return "—";
  const x = new Date(d);
  const day = String(x.getDate()).padStart(2, "0");
  return withYear ? `${day} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` : `${day} ${MONTHS[x.getMonth()]}`;
}

export function fmtDateTime(d: Date | string) {
  const x = new Date(d);
  return `${fmtDate(x)}, ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

/** Whole currency units with thousands separators; negatives (credits) in brackets. */
export function fmtAmount(v: bigint | number | null | undefined, brackets = true) {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "bigint" ? Number(v) : v;
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return n < 0 ? (brackets ? `(${s})` : `-${s}`) : s;
}

/** 12,500,000 → 12.5M */
export function fmtShort(v: bigint | number | null | undefined) {
  if (v === null || v === undefined) return "—";
  const n = Math.abs(typeof v === "bigint" ? Number(v) : v);
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

export const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86400000);

export const isOverdue = (due: Date | null | undefined, done: boolean) => !!due && !done && due.getTime() < Date.now();
