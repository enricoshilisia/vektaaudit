// Escalation of overdue findings, shared by server and client code.

export type EscalationRules = { esc1Days: number; esc2Days: number; esc3Days: number; esc1To: string; esc2To: string; esc3To: string };

const DAY = 864e5;

export const daysOverdue = (due: Date | null, now = new Date()) => (due ? Math.floor((now.getTime() - new Date(due).getTime()) / DAY) : 0);

/**
 * 0: overdue (reminders go to the owner); 1–3: escalated to the organisation's three levels.
 * Level 3 (the audit committee by default) also applies after the due date has been moved twice.
 * null: not overdue and not escalated.
 */
export function escalation(f: { status: string; dueDate: Date | null; dueChanges: number }, r: EscalationRules, now = new Date()): 0 | 1 | 2 | 3 | null {
  if (f.status === "closed") return null;
  const d = daysOverdue(f.dueDate, now);
  if (f.dueChanges >= 2 || (f.dueDate && d >= r.esc3Days)) return 3;
  if (!f.dueDate || d <= 0) return null;
  if (d >= r.esc2Days) return 2;
  if (d >= r.esc1Days) return 1;
  return 0;
}

export const escalationTo = (level: 0 | 1 | 2 | 3, r: EscalationRules) => (level === 0 ? "Owner reminded" : level === 1 ? r.esc1To : level === 2 ? r.esc2To : r.esc3To);

export const ESC_PILL = ["bg-line-soft text-ink-700", "bg-med-bg text-med-fg", "bg-high-bg text-high-fg", "bg-[#7A1F17] text-white"] as const;

/** Ageing buckets for open findings. */
export const AGE_BUCKETS = [
  { key: "notdue", label: "Not yet due", color: "#D3DAE2" },
  { key: "d30", label: "1–30 days overdue", color: "#F9C9C3" },
  { key: "d90", label: "31–90 days overdue", color: "#EE8A80" },
  { key: "d90p", label: "Over 90 days overdue", color: "#C2392F" },
] as const;
export function ageBucket(due: Date | null, now = new Date()) {
  const d = daysOverdue(due, now);
  if (!due || d <= 0) return "notdue";
  if (d <= 30) return "d30";
  if (d <= 90) return "d90";
  return "d90p";
}
