import "server-only";
import { isLocked } from "../lock";
import { db } from "./db";
import { fail } from "./flash";

/** Stops a change to a locked audit file, with a message saying how to unlock it. */
export async function assertOpen(engagementId: string | null | undefined) {
  if (!engagementId) return;
  const e = await db.engagement.findUnique({ where: { id: engagementId }, select: { phase: true, closedAt: true, unlockedUntil: true, code: true, org: { select: { lockAfterDays: true } } } });
  if (e && isLocked(e, e.org.lockAfterDays)) return fail(`${e.code} is closed and its file is locked, so it can't be changed. An admin can unlock it for a week, with a reason, from the engagement page.`);
}
