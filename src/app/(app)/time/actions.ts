"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAction } from "@/lib/server/audit";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";
import { addCalendarEvent, removeCalendarEvent } from "@/lib/server/m365";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const day = (v: string | null) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T12:00:00`);
};

/** Logs time. Time on an engagement also counts towards its actual hours. */
export async function addTime(form: FormData) {
  const s = await requireUser("work");
  const date = day(str(form, "date"));
  if (!date) return fail("Choose the date");
  if (date.getTime() > Date.now() + 864e5) return fail("You can't log time in the future");
  const hours = z.coerce.number().int("Log whole hours").min(1, "At least 1 hour").max(24).parse(form.get("hours"));
  const category = z.enum(["audit", "admin", "training", "leave"]).parse(form.get("category"));
  const engagementId = category === "audit" ? str(form, "engagementId") : null;
  if (category === "audit" && !engagementId) return fail("Choose the engagement");
  if (engagementId && !(await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }))) return fail("Engagement not found");
  await db.$transaction(async (tx) => {
    await tx.timeEntry.create({ data: { orgId: s.org, userId: s.sub, engagementId, date, hours, category, note: str(form, "note")?.slice(0, 300) ?? null } });
    if (engagementId) await tx.engagement.update({ where: { id: engagementId }, data: { actualHours: { increment: hours } } });
    if (engagementId) await logAction(tx, s, "logged time", "engagement", engagementId, `${hours} h`);
  });
  revalidatePath("/time");
}

export async function removeTime(id: string) {
  const s = await requireUser("work");
  const t = await db.timeEntry.findFirst({ where: { id, orgId: s.org } });
  if (!t) return fail("Entry not found");
  if (t.userId !== s.sub && !can(s, "manage")) return fail("You can only remove your own time");
  await db.$transaction(async (tx) => {
    await tx.timeEntry.delete({ where: { id } });
    if (t.engagementId) await tx.engagement.update({ where: { id: t.engagementId }, data: { actualHours: { decrement: Math.round(t.hours) } } });
    if (t.engagementId) await logAction(tx, s, "removed logged time", "engagement", t.engagementId, `${t.hours} h`);
  });
  revalidatePath("/time");
}

/** Books someone on an engagement, leave or training for a date range. */
export async function addAssignment(form: FormData) {
  const s = await requireUser("manage");
  const userId = z.string().min(1, "Choose the person").parse(str(form, "userId") ?? "");
  const start = day(str(form, "start"));
  const end = day(str(form, "end"));
  if (!start || !end) return fail("Choose the start and end dates");
  if (end < start) return fail("The end can't be before the start");
  const kind = z.enum(["audit", "leave", "training", "other"]).parse(form.get("kind"));
  const engagementId = kind === "audit" ? str(form, "engagementId") : null;
  if (kind === "audit" && !engagementId) return fail("Choose the engagement");
  const [u, e] = await Promise.all([db.user.findFirst({ where: { id: userId, orgId: s.org } }), engagementId ? db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }) : null]);
  if (!u) return fail("Person not found");
  if (engagementId && !e) return fail("Engagement not found");
  const a = await db.$transaction(async (tx) => {
    const created = await tx.assignment.create({ data: { orgId: s.org, userId, engagementId, kind, label: str(form, "label")?.slice(0, 60) ?? null, start, end } });
    await logAction(tx, s, "booked staff", "resource", userId, `${u.name}: ${e ? e.code : kind} ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`);
    return created;
  });
  // in their Outlook calendar too, when Microsoft 365 is connected; the booking stands even if Outlook refuses
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org } });
  if (org.msTenantId) {
    const subject = e ? `Audit: ${e.code} ${e.name}` : kind === "leave" ? "Leave" : kind === "training" ? `Training${a.label ? `: ${a.label}` : ""}` : (a.label ?? "Booked");
    try {
      const eventId = await addCalendarEvent(org, u.email, { subject, start, end, busy: kind === "leave" ? "oof" : "busy", body: `Booked by ${s.name} in VektaAudit.` });
      if (eventId) await db.assignment.update({ where: { id: a.id }, data: { outlookEventId: eventId } });
    } catch (err) {
      revalidatePath("/resources");
      return fail(`Booked, but not added to Outlook: ${(err as Error).message}`);
    }
  }
  revalidatePath("/resources");
}

export async function removeAssignment(id: string) {
  const s = await requireUser("manage");
  const a = await db.assignment.findFirst({ where: { id, orgId: s.org }, include: { user: { select: { name: true, email: true } }, org: true } });
  if (!a) return fail("Booking not found");
  if (a.outlookEventId) {
    try {
      await removeCalendarEvent(a.org, a.user.email, a.outlookEventId);
    } catch (err) {
      return fail(`Not removed: ${(err as Error).message}`);
    }
  }
  await db.$transaction(async (tx) => {
    await tx.assignment.delete({ where: { id } });
    await logAction(tx, s, "removed staff booking", "resource", a.userId, a.user.name);
  });
  revalidatePath("/resources");
}
