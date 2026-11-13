import "server-only";
// Automatic reminders, once a day per organisation that turned them on and has an audit mailbox in Microsoft 365.
import { daysOverdue, escalation, escalationTo } from "../issues";
import { db } from "./db";
import { emailHtml, sendMail } from "./m365";
import { appUrl } from "./microsoft";

const DAY = 864e5;
const FINDING_EVERY = 7 * DAY; // an overdue owner hears at most once a week
const LINK_EVERY = 3 * DAY; // self-assessment and access-review owners, every three days until they finish
const START_HOUR = 7; // server's local time

type Org = Awaited<ReturnType<typeof db.organization.findUniqueOrThrow>>;

async function overdueFindings(o: Org, now: Date) {
  const due = await db.finding.findMany({
    where: { orgId: o.id, status: { in: ["awaiting_response", "in_remediation"] }, dueDate: { lt: now }, ownerEmail: { not: null }, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(now.getTime() - FINDING_EVERY) } }] },
    include: { engagement: { select: { name: true } } },
  });
  const byOwner = new Map<string, typeof due>();
  for (const f of due) byOwner.set(f.ownerEmail!.toLowerCase(), [...(byOwner.get(f.ownerEmail!.toLowerCase()) ?? []), f]);
  let sent = 0;
  for (const [email, fs] of byOwner) {
    await sendMail(o, {
      to: [email],
      subject: fs.length === 1 ? `Overdue audit action: ${fs[0].title}` : `${fs.length} overdue audit actions`,
      html: emailHtml({
        orgName: o.name,
        heading: `Hello ${fs[0].ownerName ?? ""}`.trim(),
        paragraphs: [
          `The following audit action${fs.length === 1 ? " is" : "s are"} past the agreed date:`,
          ...fs.map((f) => {
            const lvl = escalation(f, o, now);
            return `${f.code} ${f.title} (${f.engagement.name}): ${daysOverdue(f.dueDate, now)} days overdue${lvl && lvl > 0 ? `, escalated to ${escalationTo(lvl, o)}` : ""}.`;
          }),
          "Please complete the action, or reply with an update and a realistic new date. This is an automatic weekly reminder.",
        ],
      }),
    });
    await db.finding.updateMany({ where: { id: { in: fs.map((f) => f.id) } }, data: { remindedAt: now } });
    await db.findingEvent.createMany({ data: fs.map((f) => ({ findingId: f.id, kind: "reminder", body: `Automatic reminder emailed to ${email}`, actorName: "VektaAudit" })) });
    sent++;
  }
  return sent;
}

async function selfAssessments(o: Org, now: Date) {
  const reqs = await db.csaRequest.findMany({
    where: { campaign: { orgId: o.id, status: "open" }, ownerEmail: { not: null }, submittedAt: null, emailedAt: { lt: new Date(now.getTime() - LINK_EVERY) } },
    include: { campaign: true, items: { select: { answer: true } } },
  });
  for (const r of reqs) {
    const left = r.items.filter((i) => !i.answer).length;
    await sendMail(o, {
      to: [r.ownerEmail!],
      subject: `Reminder: ${r.campaign.title}`,
      html: emailHtml({
        orgName: o.name,
        heading: `Hello ${r.ownerName}`,
        paragraphs: [`You still have ${left} of ${r.items.length} control${r.items.length === 1 ? "" : "s"} to answer in the self-assessment.${r.campaign.dueDate ? ` It's due on ${r.campaign.dueDate.toISOString().slice(0, 10)}.` : ""}`],
        button: { label: "Answer the self-assessment", url: `${appUrl()}/sa/${r.token}` },
        footer: `Automatic reminder from ${o.name} internal audit. This link is personal to you; please don't forward it.`,
      }),
    });
    await db.csaRequest.update({ where: { id: r.id }, data: { emailedAt: now } });
  }
  return reqs.length;
}

async function accessReviews(o: Org, now: Date) {
  const lists = await db.accessList.findMany({
    where: { review: { orgId: o.id, status: "open" }, ownerEmail: { not: null }, submittedAt: null, emailedAt: { lt: new Date(now.getTime() - LINK_EVERY) } },
    include: { review: true, system: true, entries: { select: { decision: true } } },
  });
  for (const l of lists) {
    const left = l.entries.filter((e) => !e.decision).length;
    await sendMail(o, {
      to: [l.ownerEmail!],
      subject: `Reminder: review access to ${l.system.name}`,
      html: emailHtml({
        orgName: o.name,
        heading: `Hello ${l.ownerName}`,
        paragraphs: [`${left} of ${l.entries.length} accounts in ${l.system.name} still need your decision.${l.review.dueDate ? ` The review is due on ${l.review.dueDate.toISOString().slice(0, 10)}.` : ""}`],
        button: { label: `Review access to ${l.system.name}`, url: `${appUrl()}/ar/${l.token}` },
        footer: `Automatic reminder from ${o.name} internal audit.`,
      }),
    });
    await db.accessList.update({ where: { id: l.id }, data: { emailedAt: now } });
  }
  return lists.length;
}

/** Runs the day's reminders for one organisation; failures are recorded in its activity log. */
export async function runReminders(orgId: string, now = new Date()) {
  const o = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (!o.autoReminders || !o.msTenantId || !o.msMailbox) return null;
  await db.organization.update({ where: { id: o.id }, data: { remindersRanAt: now } });
  const out = { findings: 0, selfAssessment: 0, access: 0, error: null as string | null };
  try {
    out.findings = await overdueFindings(o, now);
    out.selfAssessment = await selfAssessments(o, now);
    out.access = await accessReviews(o, now);
  } catch (e) {
    out.error = (e as Error).message;
  }
  if (out.findings + out.selfAssessment + out.access > 0 || out.error)
    await db.auditLog.create({
      data: { orgId: o.id, actorName: "VektaAudit", action: out.error ? "automatic reminders stopped" : "sent automatic reminders", entity: "organization", entityId: o.id, detail: out.error ?? `${out.findings} finding owners, ${out.selfAssessment} self-assessment owners, ${out.access} system owners` },
    });
  return out;
}

/** Called every half hour: runs each organisation's reminders once a day, from START_HOUR. */
export async function reminderTick(now = new Date()) {
  if (now.getHours() < START_HOUR) return;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = await db.organization.findMany({ where: { autoReminders: true, msTenantId: { not: null }, msMailbox: { not: null }, OR: [{ remindersRanAt: null }, { remindersRanAt: { lt: today } }] }, select: { id: true } });
  for (const o of due) await runReminders(o.id, now);
}
