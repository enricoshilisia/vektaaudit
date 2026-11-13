// Weeks, quarters and time categories, shared by server and client code.

export const TIME_CATEGORIES = [
  { key: "audit", label: "Audit work" },
  { key: "admin", label: "Admin & meetings" },
  { key: "training", label: "Training" },
  { key: "leave", label: "Leave" },
] as const;
export const categoryLabel = (k: string) => TIME_CATEGORIES.find((c) => c.key === k)?.label ?? k;

/** Monday 00:00 of the week containing d. */
export function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function quarterOf(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return { label: `Q${q + 1} ${d.getFullYear()}`, start: new Date(d.getFullYear(), q * 3, 1), end: new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59) };
}

/** Working weeks from start to now (or the end, if earlier), at least one. */
export function weeksElapsed(start: Date, end: Date, now = new Date()) {
  const until = now < end ? now : end;
  return Math.max(1, (until.getTime() - start.getTime()) / (7 * 864e5));
}
