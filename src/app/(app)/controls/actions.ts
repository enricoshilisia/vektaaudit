"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COSO } from "@/lib/risk";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const processName = (f: FormData) => z.string().min(2, "Name the process, e.g. Procure-to-pay").max(120).parse(str(f, "process") ?? "");

// ---- risks ----

const riskFields = (form: FormData) => ({
  process: processName(form),
  title: z.string().min(5, "Describe what could go wrong").max(300).parse(str(form, "title") ?? ""),
  detail: str(form, "detail"),
  rating: z.enum(["critical", "high", "medium", "low"]).parse(form.get("rating")),
});

export async function createRisk(form: FormData) {
  const s = await requireUser("manage");
  const data = riskFields(form);
  await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "risk");
    const r = await tx.risk.create({ data: { ...data, orgId: s.org, code: `R-${String(n).padStart(3, "0")}` } });
    await logAction(tx, s, "added risk to library", "risk", r.id, `${r.code} ${r.title}`);
  });
  redirect(`/controls?process=${encodeURIComponent(data.process)}`);
}

export async function updateRisk(id: string, form: FormData) {
  const s = await requireUser("manage");
  const r = await db.risk.findFirst({ where: { id, orgId: s.org } });
  if (!r) return fail("Risk not found");
  const data = riskFields(form);
  await db.$transaction(async (tx) => {
    await tx.risk.update({ where: { id }, data });
    await logAction(tx, s, "updated risk", "risk", id, `${r.code} ${data.title}`);
  });
  redirect(`/controls?process=${encodeURIComponent(data.process)}`);
}

// ---- controls ----

const controlFields = (form: FormData) => ({
  process: processName(form),
  title: z.string().min(5, "Describe the control: who does what, when").max(400).parse(str(form, "title") ?? ""),
  detail: str(form, "detail"),
  type: z.enum(["preventive", "detective"]).parse(form.get("type")),
  nature: z.enum(["manual", "it_dependent", "automated"]).parse(form.get("nature")),
  frequency: z.enum(["per_transaction", "multiple_daily", "daily", "weekly", "monthly", "quarterly", "annual", "continuous"]).parse(form.get("frequency")),
  key: form.get("key") === "on",
  ownerName: str(form, "ownerName"),
  assertion: str(form, "assertion"),
  component: str(form, "component") && COSO.includes(str(form, "component")!) ? str(form, "component") : null,
});

async function riskIds(orgId: string, form: FormData) {
  const ids = form.getAll("riskIds").map(String).filter(Boolean);
  const found = await db.risk.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } });
  return found.map((r) => ({ id: r.id }));
}

export async function createControl(form: FormData) {
  const s = await requireUser("manage");
  const data = controlFields(form);
  const risks = await riskIds(s.org, form);
  const c = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "control");
    const created = await tx.control.create({ data: { ...data, orgId: s.org, code: `C-${String(n).padStart(3, "0")}`, risks: { connect: risks } } });
    await logAction(tx, s, "added control to library", "control", created.id, `${created.code} ${created.title}`);
    return created;
  });
  redirect(`/controls/${c.id}`);
}

async function own(orgId: string, id: string) {
  const c = await db.control.findFirst({ where: { id, orgId } });
  if (!c) return fail("Control not found");
  return c;
}

export async function updateControl(id: string, form: FormData) {
  const s = await requireUser("manage");
  const c = await own(s.org, id);
  const data = controlFields(form);
  const risks = await riskIds(s.org, form);
  await db.$transaction(async (tx) => {
    await tx.control.update({ where: { id }, data: { ...data, risks: { set: risks } } });
    await logAction(tx, s, "updated control", "control", id, `${c.code} ${data.title}`);
  });
  revalidatePath("/controls");
  redirect(`/controls/${id}`);
}

/** The auditor's view of the control's design, from a walkthrough. */
export async function setDesign(id: string, form: FormData) {
  const s = await requireUser("review");
  const c = await own(s.org, id);
  const design = z.enum(["not_assessed", "effective", "needs_improvement", "ineffective"]).parse(form.get("design"));
  await db.$transaction(async (tx) => {
    await tx.control.update({ where: { id }, data: { design } });
    await logAction(tx, s, "rated control design", "control", id, `${c.code}: ${design.replace("_", " ")}`);
  });
  revalidatePath(`/controls/${id}`);
}
