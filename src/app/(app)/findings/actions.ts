"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FINDING_PILL } from "@/lib/format";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

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
  severity: z.enum(["high", "medium", "low"]).parse(str(form, "severity") ?? "medium"),
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
    const created = await tx.finding.create({ data: { ...data, orgId: s.org, engagementId, code: `FND-${String(n).padStart(4, "0")}`, raisedById: s.sub } });
    const ref = str(form, "ref");
    await tx.findingEvent.create({ data: { findingId: created.id, kind: "raised", body: `Finding raised${ref ? ` from ${ref}` : ""}`, actorName: s.name } });
    await logAction(tx, s, "raised finding", "finding", created.id, `${created.code} ${created.title}`);
    return created;
  });
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
    await tx.finding.update({ where: { id }, data: fields(form) });
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
