// When a closed audit file locks. Shared by server and client code.

const DAY = 864e5;

/** The date the file locks (closed date + the organisation's lock period), or null while it's open. */
export function lockDate(e: { phase: string; closedAt: Date | null }, lockAfterDays: number) {
  if (e.phase !== "closed" || !e.closedAt) return null;
  return new Date(new Date(e.closedAt).getTime() + lockAfterDays * DAY);
}

/** Locked: closed long enough ago, and not temporarily unlocked by an admin. */
export function isLocked(e: { phase: string; closedAt: Date | null; unlockedUntil: Date | null }, lockAfterDays: number, now = new Date()) {
  const at = lockDate(e, lockAfterDays);
  if (!at || at > now) return false;
  return !(e.unlockedUntil && new Date(e.unlockedUntil) > now);
}

/** When a closed audit may be deleted under the retention rule. */
export function retentionEnds(closedAt: Date | null, retentionYears: number) {
  if (!closedAt) return null;
  const d = new Date(closedAt);
  d.setFullYear(d.getFullYear() + retentionYears);
  return d;
}
