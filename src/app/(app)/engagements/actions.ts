"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PHASES, phaseLabel } from "@/lib/format";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { insertEngagement } from "@/lib/server/engagements";
import { assertOpen } from "@/lib/server/lock";
import { fail, notice } from "@/lib/server/flash";
import { emailHtml, sendMail } from "@/lib/server/m365";
import { appUrl } from "@/lib/server/microsoft";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const date = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? new Date(v) : null;
};

/** The engagement, if it belongs to the signed-in user's organisation. */
async function own(orgId: string, id: string) {
  const e = await db.engagement.findFirst({ where: { id, orgId } });
  if (!e) return fail("Engagement not found");
  await assertOpen(e.id);
  return e;
}

const page = (id: string) => revalidatePath(`/engagements/${id}`);

export async function createEngagement(form: FormData) {
  const s = await requireUser("manage");
  const data = z
    .object({
      name: z.string().min(3, "Give the engagement a name"),
      kind: z.enum(["internal", "financial"]),
      area: z.string().nullable(),
      clientId: z.string().nullable(),
      clientName: z.string().nullable(),
      leadId: z.string().nullable(),
      objective: z.string().nullable(),
      budgetHours: z.coerce.number().int().min(0).max(100000),
    })
    .parse({
      name: str(form, "name"),
      kind: str(form, "kind") ?? "internal",
      area: str(form, "area"),
      clientId: str(form, "clientId"),
      clientName: str(form, "clientName"),
      leadId: str(form, "leadId"),
      objective: str(form, "objective"),
      budgetHours: str(form, "budgetHours") ?? 0,
    });

  const e = await db.$transaction(async (tx) => {
    let clientId = data.clientId;
    if (clientId) {
      const c = await tx.client.findFirst({ where: { id: clientId, orgId: s.org } });
      if (!c) return fail("Client not found");
    } else if (data.clientName) {
      clientId = (await tx.client.create({ data: { orgId: s.org, name: data.clientName } })).id;
    }
    if (data.leadId && !(await tx.user.findFirst({ where: { id: data.leadId, orgId: s.org } }))) return fail("Lead not found");
    const created = await insertEngagement(tx, s.org, {
      name: data.name,
      kind: data.kind,
      area: data.area,
      clientId,
      leadId: data.leadId,
      objective: data.objective,
      budgetHours: data.budgetHours,
      periodStart: date(form, "periodStart"),
      periodEnd: date(form, "periodEnd"),
      dueDate: date(form, "dueDate"),
    });
    await logAction(tx, s, "created engagement", "engagement", created.id, `${created.code} ${created.name}`);
    return created;
  });
  redirect(`/engagements/${e.id}`);
}

export async function setPhase(id: string, form: FormData) {
  const s = await requireUser("manage");
  const phase = z.enum(PHASES.map((p) => p.key) as [string, ...string[]]).parse(form.get("phase"));
  const before = await own(s.org, id);
  await db.$transaction(async (tx) => {
    // the closing date starts the clock on locking the file and on retention
    await tx.engagement.update({ where: { id }, data: { phase, ...(phase === "closed" && before.phase !== "closed" ? { closedAt: new Date() } : phase !== "closed" ? { closedAt: null, unlockedUntil: null } : {}) } });
    await logAction(tx, s, "moved engagement", "engagement", id, `to ${phaseLabel(phase)}`);
    // an audit from the plan: closing it completes the plan item and marks the area as audited
    const item = await tx.planItem.findUnique({ where: { engagementId: id } });
    if (item && phase === "closed" && before.phase !== "closed") {
      await tx.planItem.update({ where: { id: item.id }, data: { status: "completed" } });
      if (item.entityId) await tx.auditableEntity.update({ where: { id: item.entityId }, data: { lastAuditedAt: new Date() } });
    } else if (item && phase !== "closed" && item.status === "completed") {
      await tx.planItem.update({ where: { id: item.id }, data: { status: "in_progress" } });
    }
  });
  page(id);
}

/** The overall rating of the audit, reported to the audit committee. */
export async function setRating(id: string, form: FormData) {
  const s = await requireUser("manage");
  const e = await own(s.org, id);
  const v = String(form.get("rating") ?? "");
  const rating = v ? z.enum(["satisfactory", "needs_improvement", "unsatisfactory"]).parse(v) : null;
  await db.$transaction(async (tx) => {
    await tx.engagement.update({ where: { id }, data: { rating, ratedAt: rating ? new Date() : null } });
    await logAction(tx, s, rating ? "rated engagement" : "cleared engagement rating", "engagement", id, `${e.code}${rating ? `: ${rating.replace("_", " ")}` : ""}`);
  });
  page(id);
}

export async function logHours(id: string, form: FormData) {
  const s = await requireUser("work");
  const hours = z.coerce.number().int().min(1).max(200).parse(form.get("hours"));
  await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.engagement.update({ where: { id }, data: { actualHours: { increment: hours } } });
    await tx.timeEntry.create({ data: { orgId: s.org, userId: s.sub, engagementId: id, date: new Date(), hours, category: "audit" } });
    await logAction(tx, s, "logged time", "engagement", id, `${hours} h`);
  });
  page(id);
}

// ---- work program ----

export async function addProcedure(id: string, form: FormData) {
  const s = await requireUser("work");
  const title = z.string().min(3).parse(str(form, "title"));
  await own(s.org, id);
  await db.$transaction(async (tx) => {
    const count = await tx.procedure.count({ where: { engagementId: id } });
    const p = await tx.procedure.create({
      data: { engagementId: id, ref: str(form, "ref") ?? `P-${String(count + 1).padStart(2, "0")}`, title, control: str(form, "control"), sort: count },
    });
    await logAction(tx, s, "added procedure", "procedure", p.id, `${p.ref} ${p.title}`);
  });
  page(id);
}

async function ownProcedure(orgId: string, procId: string) {
  const p = await db.procedure.findFirst({ where: { id: procId, engagement: { orgId } } });
  if (!p) return fail("Procedure not found");
  await assertOpen(p.engagementId);
  return p;
}

export async function saveConclusion(procId: string, form: FormData) {
  const s = await requireUser("work");
  const p = await ownProcedure(s.org, procId);
  if (p.status === "signed_off") return fail("Reopen the procedure before changing a signed-off conclusion");
  await db.$transaction(async (tx) => {
    await tx.procedure.update({ where: { id: procId }, data: { conclusion: str(form, "conclusion"), status: p.status === "not_started" ? "in_progress" : p.status } });
    await logAction(tx, s, "updated conclusion", "procedure", procId, p.ref);
  });
  page(p.engagementId);
}

/** Preparer sign-off: the work is done and goes to review. */
export async function prepare(procId: string) {
  const s = await requireUser("work");
  const p = await ownProcedure(s.org, procId);
  await db.$transaction(async (tx) => {
    await tx.procedure.update({ where: { id: procId }, data: { status: "in_review", preparedById: s.sub, preparedAt: new Date() } });
    await logAction(tx, s, "signed off as preparer", "procedure", procId, p.ref);
  });
  page(p.engagementId);
}

/** Reviewer sign-off. The reviewer can't be the person who prepared it. */
export async function review(procId: string) {
  const s = await requireUser("review");
  const p = await ownProcedure(s.org, procId);
  if (p.status !== "in_review") return fail("Only work that has been prepared can be reviewed");
  if (p.preparedById === s.sub) return fail("A different person must review this work");
  await db.$transaction(async (tx) => {
    await tx.procedure.update({ where: { id: procId }, data: { status: "signed_off", reviewedById: s.sub, reviewedAt: new Date() } });
    await logAction(tx, s, "signed off as reviewer", "procedure", procId, p.ref);
  });
  page(p.engagementId);
}

export async function reopen(procId: string) {
  const s = await requireUser("review");
  const p = await ownProcedure(s.org, procId);
  await db.$transaction(async (tx) => {
    await tx.procedure.update({ where: { id: procId }, data: { status: "in_progress", reviewedById: null, reviewedAt: null, preparedById: null, preparedAt: null } });
    await logAction(tx, s, "reopened procedure", "procedure", procId, p.ref);
  });
  page(p.engagementId);
}

// ---- review notes ----

export async function addNote(id: string, form: FormData) {
  const s = await requireUser("work");
  const body = z.string().min(1).max(4000).parse(str(form, "body"));
  const procedureId = str(form, "procedureId");
  await own(s.org, id);
  if (procedureId) await ownProcedure(s.org, procedureId);
  await db.$transaction(async (tx) => {
    const n = await tx.reviewNote.create({ data: { engagementId: id, procedureId, authorId: s.sub, body } });
    await logAction(tx, s, "added review note", "engagement", id, n.id);
  });
  page(id);
}

export async function resolveNote(noteId: string) {
  const s = await requireUser("review");
  const n = await db.reviewNote.findFirst({ where: { id: noteId, engagement: { orgId: s.org } } });
  if (!n) return fail("Note not found");
  await db.$transaction(async (tx) => {
    await tx.reviewNote.update({ where: { id: noteId }, data: { resolvedAt: new Date() } });
    await logAction(tx, s, "resolved review note", "engagement", n.engagementId, noteId);
  });
  page(n.engagementId);
}

// ---- evidence requests and the auditee portal ----

export async function createRequest(id: string, form: FormData) {
  const s = await requireUser("work");
  const title = z.string().min(3).parse(str(form, "title"));
  await own(s.org, id);
  await db.$transaction(async (tx) => {
    const n = (await tx.evidenceRequest.count({ where: { engagementId: id } })) + 1;
    const r = await tx.evidenceRequest.create({
      data: { engagementId: id, code: `PBC-${String(n).padStart(2, "0")}`, title, detail: str(form, "detail"), dueDate: date(form, "dueDate"), assigneeName: str(form, "assigneeName") },
    });
    await logAction(tx, s, "requested evidence", "request", r.id, `${r.code} ${r.title}`);
  });
  page(id);
  revalidatePath("/requests");
}

async function ownRequest(orgId: string, reqId: string) {
  const r = await db.evidenceRequest.findFirst({ where: { id: reqId, engagement: { orgId } } });
  if (!r) return fail("Request not found");
  await assertOpen(r.engagementId);
  return r;
}

export async function acceptRequest(reqId: string) {
  const s = await requireUser("review");
  const r = await ownRequest(s.org, reqId);
  await db.$transaction(async (tx) => {
    await tx.evidenceRequest.update({ where: { id: reqId }, data: { status: "accepted", acceptedAt: new Date(), auditorNote: null } });
    await tx.document.updateMany({ where: { requestId: reqId }, data: { status: "reviewed" } });
    await logAction(tx, s, "accepted evidence", "request", reqId, r.code);
  });
  page(r.engagementId);
  revalidatePath("/requests");
}

export async function sendBack(reqId: string, form: FormData) {
  const s = await requireUser("work");
  const note = z.string().min(3, "Say what is missing").parse(str(form, "note"));
  const r = await ownRequest(s.org, reqId);
  await db.$transaction(async (tx) => {
    await tx.evidenceRequest.update({ where: { id: reqId }, data: { status: "needs_info", auditorNote: note } });
    await logAction(tx, s, "asked for more information", "request", reqId, `${r.code}: ${note}`);
  });
  page(r.engagementId);
  revalidatePath("/requests");
}

export async function createPortalLink(id: string, form: FormData) {
  const s = await requireUser("work");
  const name = z.string().min(2).parse(str(form, "name"));
  await own(s.org, id);
  await db.$transaction(async (tx) => {
    const l = await tx.portalLink.create({ data: { engagementId: id, token: randomBytes(24).toString("base64url"), name, email: str(form, "email"), title: str(form, "title") } });
    await logAction(tx, s, "created auditee portal link", "engagement", id, `for ${name}`);
    return l;
  });
  page(id);
}

/** Emails the auditee their portal link from the audit mailbox, with the open requests listed. */
export async function emailPortalLink(linkId: string) {
  const s = await requireUser("work");
  const l = await db.portalLink.findFirst({
    where: { id: linkId, revokedAt: null, engagement: { orgId: s.org } },
    include: { engagement: { include: { org: true, requests: { where: { status: { in: ["open", "needs_info"] } }, orderBy: { code: "asc" } } } } },
  });
  if (!l) return fail("Portal link not found");
  if (!l.email) return fail("Add the auditee's email to the link first");
  const e = l.engagement;
  const due = (d: Date | null) => (d ? `, due ${d.toISOString().slice(0, 10)}` : "");
  try {
    await sendMail(e.org, {
      to: [l.email],
      subject: `${e.name}: documents requested by internal audit`,
      html: emailHtml({
        orgName: e.org.name,
        heading: `Hello ${l.name}`,
        paragraphs: [
          `As part of the audit "${e.name}", we need some documents from you. You can see each request and upload files through the secure link below. You don't need an account.`,
          ...(e.requests.length ? [`Open requests: ${e.requests.map((r) => `${r.code} ${r.title}${due(r.dueDate)}`).join("; ")}.`] : []),
        ],
        button: { label: "Open the requests", url: `${appUrl()}/p/${l.token}` },
        footer: `Sent by ${s.name} for ${e.org.name} internal audit. Please don't forward this link: anyone with it can see these requests.`,
      }),
    });
  } catch (err) {
    return fail((err as Error).message);
  }
  await db.$transaction(async (tx) => {
    await logAction(tx, s, "emailed auditee portal link", "engagement", e.id, `to ${l.name} <${l.email}>`);
  });
  return notice(`Link emailed to ${l.email}`);
}

export async function revokePortalLink(linkId: string) {
  const s = await requireUser("work");
  const l = await db.portalLink.findFirst({ where: { id: linkId, engagement: { orgId: s.org } } });
  if (!l) return fail("Link not found");
  await db.$transaction(async (tx) => {
    await tx.portalLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await logAction(tx, s, "revoked auditee portal link", "engagement", l.engagementId, `for ${l.name}`);
  });
  page(l.engagementId);
}

/** An admin reopens a locked file for a week, with a reason that goes into the audit trail. */
export async function unlockFile(id: string, form: FormData) {
  const s = await requireUser("admin");
  const e = await db.engagement.findFirst({ where: { id, orgId: s.org } });
  if (!e) return fail("Engagement not found");
  const reason = z.string().min(5, "Give the reason for unlocking the file").max(500).parse(str(form, "reason") ?? "");
  const until = new Date(Date.now() + 7 * 864e5);
  await db.$transaction(async (tx) => {
    await tx.engagement.update({ where: { id }, data: { unlockedUntil: until } });
    await logAction(tx, s, "unlocked closed audit file", "engagement", id, `${e.code} until ${until.toISOString().slice(0, 10)}: ${reason}`);
  });
  page(id);
}

/** Legal hold: the audit file is never deleted, whatever the retention period says. */
export async function setLegalHold(id: string, form: FormData) {
  const s = await requireUser("admin");
  const e = await db.engagement.findFirst({ where: { id, orgId: s.org } });
  if (!e) return fail("Engagement not found");
  const on = form.get("hold") === "on";
  const note = str(form, "note");
  if (on && !note) return fail("Say why the file is on legal hold");
  await db.$transaction(async (tx) => {
    await tx.engagement.update({ where: { id }, data: { legalHold: on, legalHoldNote: on ? note : null } });
    await logAction(tx, s, on ? "put audit file on legal hold" : "released legal hold", "engagement", id, `${e.code}${note ? `: ${note}` : ""}`);
  });
  page(id);
}
