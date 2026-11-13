"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Finding } from "@prisma/client";
import { FINDING_PILL, fmtDate } from "@/lib/format";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import { daysOverdue, escalation, escalationTo } from "@/lib/issues";
import { emailHtml, notifyTeams, sendMail } from "@/lib/server/m365";
import type { Tx } from "@/lib/server/db";

/** Moving an agreed due date is counted and recorded; the second move escalates to the top level. */
async function dueChange(tx: Tx, actor: string, f: Finding, next: Date | null) {
  if (!next || (f.dueDate && next.getTime() === f.dueDate.getTime())) return {};
  if (!f.dueDate) return { originalDue: f.originalDue ?? next };
  await tx.findingEvent.create({ data: { findingId: f.id, kind: "status", body: `Due date moved from ${fmtDate(f.dueDate)} to ${fmtDate(next)}`, actorName: actor } });
  return { originalDue: f.originalDue ?? f.dueDate, dueChanges: { increment: 1 } };
}

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const date = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? new Date(v) : null;
};

const fields = (form: FormData) => ({
  title: z.string().min(5, "Give the finding a clear title").parse(str(form, "title")),
  severity: z.enum(["critical", "high", "medium", "low"]).parse(str(form, "severity") ?? "medium"),
  condition: str(form, "condition"),
  criteria: str(form, "criteria"),
  cause: str(form, "cause"),
  effect: str(form, "effect"),
  recommendation: str(form, "recommendation"),
  ownerName: str(form, "ownerName"),
  ownerEmail: str(form, "ownerEmail"),
  dueDate: date(form, "dueDate"),
  repeat: form.get("repeat") === "on",
});

export async function createFinding(form: FormData) {
  const s = await requireUser("work");
  const engagementId = z.string().min(1, "Choose the engagement").parse(str(form, "engagementId"));
  const e = await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } });
  if (!e) return fail("Engagement not found");
  const data = fields(form);
  const f = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "finding");
    const created = await tx.finding.create({ data: { ...data, originalDue: data.dueDate, orgId: s.org, engagementId, code: `FND-${String(n).padStart(4, "0")}`, raisedById: s.sub } });
    const ref = str(form, "ref");
    await tx.findingEvent.create({ data: { findingId: created.id, kind: "raised", body: `Finding raised${ref ? ` from ${ref}` : ""}`, actorName: s.name } });
    await logAction(tx, s, "raised finding", "finding", created.id, `${created.code} ${created.title}`);
    return created;
  });
  if (f.severity === "critical" || f.severity === "high")
    await notifyTeams(s.org, { title: `${f.severity === "critical" ? "Critical" : "High"} finding raised: ${f.title}`, facts: [["Engagement", `${e.code} ${e.name}`], ["Owner", f.ownerName ?? "Not set"], ["Raised by", s.name]], path: `/findings/${f.id}`, tone: "attention" });
  redirect(`/findings/${f.id}`);
}

async function own(orgId: string, id: string) {
  const f = await db.finding.findFirst({ where: { id, orgId } });
  if (!f) return fail("Finding not found");
  return f;
}

export async function updateFinding(id: string, form: FormData) {
  const s = await requireUser("work");
  const f = await own(s.org, id);
  if (f.status === "closed") return fail("Reopen the finding before editing it");
  await db.$transaction(async (tx) => {
    const data = fields(form);
    await tx.finding.update({ where: { id }, data: { ...data, ...(await dueChange(tx, s.name, f, data.dueDate)) } });
    await logAction(tx, s, "edited finding", "finding", id, f.code);
  });
  revalidatePath(`/findings/${id}`);
}

/** Management's agreed action: moves the finding into remediation. */
export async function recordResponse(id: string, form: FormData) {
  const s = await requireUser("work");
  const f = await own(s.org, id);
  const response = z.string().min(5, "Write management's response").parse(str(form, "mgmtResponse"));
  await db.$transaction(async (tx) => {
    await tx.finding.update({
      where: { id },
      data: {
        mgmtResponse: response,
        ownerName: str(form, "ownerName") ?? f.ownerName,
        dueDate: date(form, "dueDate") ?? f.dueDate,
        status: f.status === "awaiting_response" ? "in_remediation" : f.status,
        ...(await dueChange(tx, s.name, f, date(form, "dueDate"))),
      },
    });
    await tx.findingEvent.create({ data: { findingId: id, kind: "response", body: "Management response agreed", actorName: s.name } });
    await logAction(tx, s, "recorded management response", "finding", id, f.code);
  });
  revalidatePath(`/findings/${id}`);
}

const NEXT: Record<string, { to: string; perm: "work" | "review" }> = {
  submit: { to: "pending_validation", perm: "work" }, // owner says it's fixed
  close: { to: "closed", perm: "review" }, // audit validated the fix
  reject: { to: "in_remediation", perm: "review" }, // fix not good enough
  reopen: { to: "in_remediation", perm: "review" },
};

export async function moveFinding(id: string, form: FormData) {
  const step = NEXT[String(form.get("step"))];
  if (!step) return fail("Unknown step");
  const s = await requireUser(step.perm);
  const f = await own(s.org, id);
  const note = str(form, "note");
  await db.$transaction(async (tx) => {
    await tx.finding.update({ where: { id }, data: { status: step.to, closedAt: step.to === "closed" ? new Date() : null } });
    await tx.findingEvent.create({ data: { findingId: id, kind: "status", body: `${FINDING_PILL[step.to].label}${note ? ` — ${note}` : ""}`, actorName: s.name } });
    await logAction(tx, s, "moved finding", "finding", id, `${f.code} to ${FINDING_PILL[step.to].label}`);
  });
  revalidatePath(`/findings/${id}`);
  revalidatePath("/findings");
}

export async function addComment(id: string, form: FormData) {
  const s = await requireUser("work");
  await own(s.org, id);
  const body = z.string().min(1).max(4000).parse(str(form, "body"));
  await db.$transaction(async (tx) => {
    await tx.findingEvent.create({ data: { findingId: id, kind: "comment", body, actorName: s.name } });
    await logAction(tx, s, "commented on finding", "finding", id);
  });
  revalidatePath(`/findings/${id}`);
}

/** Emails the owner of every overdue finding (that has an owner email) from the audit mailbox. */
export async function emailReminders() {
  const s = await requireUser("manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org } });
  const open = await db.finding.findMany({ where: { orgId: s.org, status: { in: ["awaiting_response", "in_remediation"] }, dueDate: { lt: new Date() }, ownerEmail: { not: null } }, include: { engagement: { select: { name: true } } } });
  if (!open.length) return fail("No overdue findings have an owner email");
  // one email per owner, listing all their overdue findings
  const byOwner = new Map<string, typeof open>();
  for (const f of open) byOwner.set(f.ownerEmail!.toLowerCase(), [...(byOwner.get(f.ownerEmail!.toLowerCase()) ?? []), f]);
  let sent = 0;
  for (const [email, fs] of byOwner) {
    const lines = fs.map((f) => {
      const lvl = escalation(f, org);
      return `${f.code} ${f.title} (${f.engagement.name}): ${daysOverdue(f.dueDate)} days overdue${lvl && lvl > 0 ? `, escalated to ${escalationTo(lvl, org)}` : ""}.`;
    });
    try {
      await sendMail(org, {
        to: [email],
        subject: fs.length === 1 ? `Overdue audit action: ${fs[0].title}` : `${fs.length} overdue audit actions`,
        html: emailHtml({
          orgName: org.name,
          heading: `Hello ${fs[0].ownerName ?? ""}`.trim(),
          paragraphs: [
            `The following audit action${fs.length === 1 ? " is" : "s are"} past the agreed date:`,
            ...lines,
            "Please complete the action, or reply to this email with an update and a realistic new date. Moving a date is recorded and reported to the audit committee.",
          ],
          footer: `Sent by ${s.name} for ${org.name} internal audit.`,
        }),
      });
    } catch (e) {
      return fail(sent ? `Sent ${sent}, then stopped: ${(e as Error).message}` : (e as Error).message);
    }
    await db.findingEvent.createMany({ data: fs.map((f) => ({ findingId: f.id, kind: "reminder", body: `Reminder emailed to ${email}`, actorName: s.name })) });
    sent++;
  }
  await db.$transaction(async (tx) => {
    await logAction(tx, s, "emailed overdue reminders", "finding", null, `${open.length} findings, ${sent} owners`);
  });
  revalidatePath("/findings/overview");
  return notice(`Reminders emailed to ${sent} owner${sent === 1 ? "" : "s"} about ${open.length} finding${open.length === 1 ? "" : "s"}`);
}

