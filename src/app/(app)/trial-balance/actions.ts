"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmount, parseCsv } from "@/lib/csv";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

async function own(orgId: string, id: string) {
  const e = await db.engagement.findFirst({ where: { id, orgId, kind: "financial" } });
  if (!e) return fail("Financial-audit engagement not found");
  return e;
}

/**
 * Replaces the engagement's trial balance with a CSV export from the client's accounting system.
 * Columns (header row required, any order): account, name, lead, prior, current.
 */
export async function importTb(id: string, form: FormData) {
  const s = await requireUser("manage");
  await own(s.org, id);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose a CSV file");
  const rows = parseCsv(await file.text());
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = { account: col("account", "code", "account code"), name: col("name", "account name", "description"), lead: col("lead", "lead schedule", "mapping"), prior: col("prior", "prior year", "py"), current: col("current", "current year", "cy", "balance") };
  if (ix.account < 0 || ix.name < 0 || ix.current < 0) return fail("The CSV needs at least account, name and current columns");
  const lines = rows
    .map((r) => ({
      account: r[ix.account]?.trim() ?? "",
      name: r[ix.name]?.trim() ?? "",
      leadCode: ix.lead >= 0 ? r[ix.lead]?.trim().toUpperCase() || null : null,
      prior: ix.prior >= 0 ? parseAmount(r[ix.prior]) : 0n,
      current: parseAmount(r[ix.current]),
    }))
    .filter((l) => l.account);
  if (!lines.length) return fail("No accounts found in the file");
  if (new Set(lines.map((l) => l.account)).size !== lines.length) return fail("Each account code may appear only once");

  await db.$transaction(async (tx) => {
    await tx.tbLine.deleteMany({ where: { engagementId: id } });
    await tx.tbLine.createMany({ data: lines.map((l) => ({ ...l, engagementId: id })) });
    await tx.engagement.update({ where: { id }, data: { tbImportedAt: new Date(), tbSource: String(form.get("source") ?? "").trim() || file.name } });
    await logAction(tx, s, "imported trial balance", "engagement", id, `${lines.length} accounts from ${file.name}`);
  });
  revalidatePath("/trial-balance");
}

export async function setMateriality(id: string, form: FormData) {
  const s = await requireUser("manage");
  await own(s.org, id);
  const d = z
    .object({ basis: z.string().min(2).max(120), overall: z.coerce.number().positive(), performancePct: z.coerce.number().min(1).max(100), trivialPct: z.coerce.number().min(0.1).max(20) })
    .parse({ basis: form.get("basis"), overall: String(form.get("overall") ?? "").replace(/,/g, ""), performancePct: form.get("performancePct"), trivialPct: form.get("trivialPct") });
  const overall = BigInt(Math.round(d.overall));
  await db.$transaction(async (tx) => {
    await tx.engagement.update({
      where: { id },
      data: { materialityBasis: d.basis, materiality: overall, performanceMat: BigInt(Math.round(d.overall * (d.performancePct / 100))), trivialMat: BigInt(Math.round(d.overall * (d.trivialPct / 100))) },
    });
    await logAction(tx, s, "set materiality", "engagement", id, `${overall} on ${d.basis}`);
  });
  revalidatePath("/trial-balance");
}

export async function updateLead(leadId: string, form: FormData) {
  const s = await requireUser("work");
  const l = await db.leadSchedule.findFirst({ where: { id: leadId, engagement: { orgId: s.org } } });
  if (!l) return fail("Lead schedule not found");
  const risk = z.enum(["normal", "elevated", "significant"]).parse(form.get("risk"));
  const status = z.enum(["not_started", "testing", "in_review", "signed_off"]).parse(form.get("status"));
  await db.$transaction(async (tx) => {
    await tx.leadSchedule.update({ where: { id: leadId }, data: { risk, status } });
    await logAction(tx, s, "updated lead schedule", "engagement", l.engagementId, `${l.code} ${l.name}: ${risk}, ${status}`);
  });
  revalidatePath("/trial-balance");
}

export async function addLead(id: string, form: FormData) {
  const s = await requireUser("manage");
  await own(s.org, id);
  const code = z.string().regex(/^[A-Z0-9]{1,4}$/, "Use a short code like K or K1").parse(String(form.get("code") ?? "").trim().toUpperCase());
  const name = z.string().min(2).parse(String(form.get("name") ?? "").trim());
  const section = z.enum(["bs", "is"]).parse(form.get("section"));
  await db.$transaction(async (tx) => {
    const sort = await tx.leadSchedule.count({ where: { engagementId: id } });
    await tx.leadSchedule.create({ data: { engagementId: id, code, name, section, sort } });
    await logAction(tx, s, "added lead schedule", "engagement", id, `${code} ${name}`);
  });
  revalidatePath("/trial-balance");
}
