"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BAND_ORDER, band, nextDue } from "@/lib/risk";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { insertEngagement } from "@/lib/server/engagements";
import { TYPE_FOR_PLAN } from "@/lib/auditTypes";
import { fail } from "@/lib/server/flash";
import { notifyTeams } from "@/lib/server/m365";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const month = z.coerce.number().int().min(1).max(12);
const done = (year: number) => {
  revalidatePath("/plan");
  redirect(`/plan?year=${year}`);
};

async function ownPlan(orgId: string, id: string) {
  const p = await db.auditPlan.findFirst({ where: { id, orgId } });
  if (!p) return fail("Plan not found");
  return p;
}
async function ownItem(orgId: string, id: string) {
  const i = await db.planItem.findFirst({ where: { id, plan: { orgId } }, include: { plan: true } });
  if (!i) return fail("Planned audit not found");
  return i;
}

export async function createPlan(form: FormData) {
  const s = await requireUser("manage");
  const year = z.coerce.number().int().min(2000).max(2100).parse(form.get("year"));
  const capacityHours = z.coerce.number().int().min(0).max(1_000_000).parse(form.get("capacityHours") || 0);
  if (await db.auditPlan.findUnique({ where: { orgId_year: { orgId: s.org, year } } })) return fail(`There is already a plan for ${year}`);
  await db.$transaction(async (tx) => {
    const p = await tx.auditPlan.create({ data: { orgId: s.org, year, capacityHours } });
    await logAction(tx, s, "started audit plan", "plan", p.id, String(year));
  });
  done(year);
}

export async function setCapacity(planId: string, form: FormData) {
  const s = await requireUser("manage");
  const p = await ownPlan(s.org, planId);
  const capacityHours = z.coerce.number().int().min(0).max(1_000_000).parse(form.get("capacityHours"));
  await db.$transaction(async (tx) => {
    await tx.auditPlan.update({ where: { id: p.id }, data: { capacityHours } });
    await logAction(tx, s, "set plan capacity", "plan", p.id, `${p.year}: ${p.capacityHours} → ${capacityHours} h`);
  });
  done(p.year);
}

const itemFields = async (form: FormData) => {
  const startMonth = month.parse(form.get("startMonth"));
  const endMonth = month.parse(form.get("endMonth"));
  if (endMonth < startMonth) return fail("The audit can't end before it starts");
  return {
    title: str(form, "title"),
    kind: z.enum(["assurance", "it", "compliance", "advisory", "followup"]).parse(form.get("kind")),
    leadId: str(form, "leadId"),
    hours: z.coerce.number().int().min(0).max(100_000).parse(form.get("hours") || 0),
    startMonth,
    endMonth,
  };
};

export async function addItem(planId: string, form: FormData) {
  const s = await requireUser("manage");
  const p = await ownPlan(s.org, planId);
  const data = await itemFields(form);
  const entityId = str(form, "entityId");
  const entity = entityId ? await db.auditableEntity.findFirst({ where: { id: entityId, orgId: s.org } }) : null;
  if (entityId && !entity) return fail("Auditable entity not found");
  const title = data.title ?? entity?.name;
  if (!title || title.length < 3) return fail("Give the audit a title, or choose an area from the universe");
  if (data.leadId && !(await db.user.findFirst({ where: { id: data.leadId, orgId: s.org } }))) return fail("Lead not found");
  await db.$transaction(async (tx) => {
    await tx.planItem.create({ data: { ...data, title, planId: p.id, entityId: entity?.id ?? null } });
    await logAction(tx, s, p.status === "approved" ? "added audit to approved plan" : "added audit to plan", "plan", p.id, `${p.year}: ${title}`);
  });
  done(p.year);
}

const HOURS = { critical: 400, high: 300, medium: 200, low: 120 };

/** Adds every area of the universe that falls due by the end of the plan year and isn't in the plan yet. */
export async function addDue(planId: string) {
  const s = await requireUser("manage");
  const p = await ownPlan(s.org, planId);
  const yearEnd = new Date(p.year, 11, 31);
  const [entities, inPlan] = await Promise.all([
    db.auditableEntity.findMany({ where: { orgId: s.org, archivedAt: null } }),
    db.planItem.findMany({ where: { planId: p.id, entityId: { not: null } }, select: { entityId: true } }),
  ]);
  const have = new Set(inPlan.map((i) => i.entityId));
  const due = entities
    .filter((e) => !have.has(e.id) && nextDue(e.lastAuditedAt, e.cycleMonths) <= yearEnd)
    .sort((a, b) => BAND_ORDER.indexOf(band(a.impact * a.likelihood)) - BAND_ORDER.indexOf(band(b.impact * b.likelihood)) || b.impact * b.likelihood - a.impact * a.likelihood);
  if (due.length === 0) return fail("Nothing more is due this year");
  // highest risk first, spread across the year two months at a time
  await db.$transaction(async (tx) => {
    await tx.planItem.createMany({
      data: due.map((e, i) => {
        const start = Math.min(1 + Math.floor((i * 11) / Math.max(due.length, 1)), 11);
        return { planId: p.id, entityId: e.id, title: e.name, kind: e.category === "Technology" ? "it" : e.category === "Compliance" ? "compliance" : "assurance", hours: HOURS[band(e.impact * e.likelihood)], startMonth: start, endMonth: start + 1 };
      }),
    });
    await logAction(tx, s, "added due areas to plan", "plan", p.id, `${p.year}: ${due.length} audits`);
  });
  done(p.year);
}

export async function updateItem(itemId: string, form: FormData) {
  const s = await requireUser("manage");
  const it = await ownItem(s.org, itemId);
  const data = await itemFields(form);
  if (data.leadId && !(await db.user.findFirst({ where: { id: data.leadId, orgId: s.org } }))) return fail("Lead not found");
  await db.$transaction(async (tx) => {
    await tx.planItem.update({ where: { id: it.id }, data: { ...data, title: data.title ?? it.title } });
    await logAction(tx, s, "changed planned audit", "plan", it.planId, `${it.plan.year}: ${data.title ?? it.title}`);
  });
  done(it.plan.year);
}

export async function setItemStatus(itemId: string, status: "deferred" | "cancelled" | "planned", form?: FormData) {
  const s = await requireUser("manage");
  const it = await ownItem(s.org, itemId);
  if (it.engagementId && status !== "planned") return fail("This audit has started. Close or move the engagement instead.");
  const note = form ? str(form, "note") : null;
  if (status !== "planned" && !note) return fail("Say why, so the audit committee can see it");
  await db.$transaction(async (tx) => {
    await tx.planItem.update({ where: { id: it.id }, data: { status, note: status === "planned" ? null : note } });
    await logAction(tx, s, status === "planned" ? "restored planned audit" : `${status} planned audit`, "plan", it.planId, `${it.plan.year}: ${it.title}${note ? ` (${note})` : ""}`);
  });
  done(it.plan.year);
}

export async function removeItem(itemId: string) {
  const s = await requireUser("manage");
  const it = await ownItem(s.org, itemId);
  if (it.plan.status !== "draft") return fail("Once a plan is submitted, defer or cancel audits instead of removing them");
  if (it.engagementId) return fail("This audit has started");
  await db.$transaction(async (tx) => {
    await tx.planItem.delete({ where: { id: it.id } });
    await logAction(tx, s, "removed audit from plan", "plan", it.planId, `${it.plan.year}: ${it.title}`);
  });
  done(it.plan.year);
}

/** Starts a planned audit: creates the engagement from the plan and the universe. */
export async function startItem(itemId: string) {
  const s = await requireUser("manage");
  const it = await ownItem(s.org, itemId);
  if (it.engagementId) redirect(`/engagements/${it.engagementId}`);
  if (it.status !== "planned") return fail("Restore this audit to the plan before starting it");
  const entity = it.entityId ? await db.auditableEntity.findUnique({ where: { id: it.entityId } }) : null;
  const e = await db.$transaction(async (tx) => {
    const created = await insertEngagement(tx, s.org, {
      name: it.title,
      kind: "internal",
      auditType: TYPE_FOR_PLAN[it.kind] ?? "operational",
      area: entity?.category ?? null,
      clientId: entity?.clientId ?? null,
      leadId: it.leadId,
      budgetHours: it.hours,
      dueDate: new Date(it.plan.year, it.endMonth, 0),
    });
    await tx.planItem.update({ where: { id: it.id }, data: { engagementId: created.id, status: "in_progress" } });
    await logAction(tx, s, "started planned audit", "engagement", created.id, `${created.code} ${created.name} (plan ${it.plan.year})`);
    return created;
  });
  redirect(`/engagements/${e.id}`);
}

export async function submitPlan(planId: string) {
  const s = await requireUser("manage");
  const p = await ownPlan(s.org, planId);
  if (p.status !== "draft") return fail("This plan has already been submitted");
  if ((await db.planItem.count({ where: { planId } })) === 0) return fail("Add audits to the plan first");
  await db.$transaction(async (tx) => {
    await tx.auditPlan.update({ where: { id: p.id }, data: { status: "submitted", submittedAt: new Date() } });
    await logAction(tx, s, "submitted audit plan for approval", "plan", p.id, String(p.year));
  });
  await notifyTeams(s.org, { title: `Audit plan ${p.year} submitted for approval`, text: `${s.name} submitted the plan. An admin records the audit committee's approval in VektaAudit.`, path: `/plan?year=${p.year}` });
  done(p.year);
}

export async function approvePlan(planId: string, form: FormData) {
  const s = await requireUser("admin");
  const p = await ownPlan(s.org, planId);
  if (p.status !== "submitted") return fail("Submit the plan for approval first");
  const approvedBy = z.string().min(3, "Record who approved the plan, e.g. Audit Committee").max(200).parse(str(form, "approvedBy") ?? "");
  const approvedAt = str(form, "approvedAt") ? new Date(str(form, "approvedAt")!) : new Date();
  await db.$transaction(async (tx) => {
    await tx.auditPlan.update({ where: { id: p.id }, data: { status: "approved", approvedAt, approvedBy } });
    await logAction(tx, s, "recorded plan approval", "plan", p.id, `${p.year}: ${approvedBy}`);
  });
  await notifyTeams(s.org, { title: `Audit plan ${p.year} approved`, facts: [["Approved by", approvedBy]], path: `/plan?year=${p.year}`, tone: "good" });
  done(p.year);
}

export async function reopenPlan(planId: string) {
  const s = await requireUser("admin");
  const p = await ownPlan(s.org, planId);
  await db.$transaction(async (tx) => {
    await tx.auditPlan.update({ where: { id: p.id }, data: { status: "draft", submittedAt: null, approvedAt: null, approvedBy: null } });
    await logAction(tx, s, "reopened audit plan", "plan", p.id, String(p.year));
  });
  done(p.year);
}
