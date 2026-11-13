"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { buildPack } from "@/lib/server/committee";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import type { PackData } from "@/lib/server/committee";
import { packDoc } from "@/lib/server/committeePdf";
import { notifyTeams, saveToSharePoint } from "@/lib/server/m365";
import { renderPdf } from "@/lib/server/render";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : null);

export async function createPack(form: FormData) {
  const s = await requireUser("manage");
  const title = z.string().min(3, "Give the pack a title").max(160).parse(str(form, "title") ?? "");
  const periodStart = day(str(form, "periodStart"));
  const periodEnd = day(str(form, "periodEnd"));
  if (!periodStart || !periodEnd) return fail("Choose the period the pack covers");
  if (periodEnd < periodStart) return fail("The period can't end before it starts");
  const p = await db.$transaction(async (tx) => {
    const created = await tx.committeePack.create({ data: { orgId: s.org, title, periodStart, periodEnd, meetingDate: day(str(form, "meetingDate")) } });
    await logAction(tx, s, "started audit committee pack", "committee", created.id, title);
    return created;
  });
  redirect(`/committee/${p.id}`);
}

async function own(orgId: string, id: string) {
  const p = await db.committeePack.findFirst({ where: { id, orgId } });
  if (!p) return fail("Pack not found");
  return p;
}

export async function saveSummary(id: string, form: FormData) {
  const s = await requireUser("manage");
  const p = await own(s.org, id);
  if (p.status === "issued") return fail("This pack has been issued. Reopen it to change it.");
  await db.$transaction(async (tx) => {
    await tx.committeePack.update({ where: { id }, data: { summary: str(form, "summary")?.slice(0, 8000) ?? null, title: str(form, "title") ?? p.title } });
    await logAction(tx, s, "edited audit committee pack", "committee", id, p.title);
  });
  revalidatePath(`/committee/${id}`);
}

/** Issues the pack: the figures are frozen as they are now, so the committee sees exactly what was reported. */
export async function issuePack(id: string) {
  const s = await requireUser("admin");
  const p = await own(s.org, id);
  if (p.status === "issued") return fail("Already issued");
  if (!p.summary || p.summary.length < 20) return fail("Write the Chief Audit Executive's summary before issuing");
  const snapshot = await buildPack(s.org, p.periodStart, p.periodEnd);
  await db.$transaction(async (tx) => {
    await tx.committeePack.update({ where: { id }, data: { status: "issued", snapshot: snapshot as unknown as Prisma.InputJsonValue, issuedAt: new Date(), issuedBy: s.name } });
    await logAction(tx, s, "issued audit committee pack", "committee", id, p.title);
  });
  await notifyTeams(s.org, { title: `Committee pack issued: ${p.title}`, text: `${snapshot.audits.length} audits reported, ${snapshot.overdue.length} actions escalated to the committee.`, path: `/committee/${id}`, tone: "good" });
  revalidatePath(`/committee/${id}`);
}

export async function reopenPack(id: string) {
  const s = await requireUser("admin");
  const p = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.committeePack.update({ where: { id }, data: { status: "draft", snapshot: Prisma.DbNull, issuedAt: null, issuedBy: null } });
    await logAction(tx, s, "reopened audit committee pack", "committee", id, p.title);
  });
  revalidatePath(`/committee/${id}`);
}

export async function deletePack(id: string) {
  const s = await requireUser("manage");
  const p = await own(s.org, id);
  if (p.status === "issued") return fail("An issued pack can't be deleted");
  await db.$transaction(async (tx) => {
    await tx.committeePack.delete({ where: { id } });
    await logAction(tx, s, "deleted draft committee pack", "committee", id, p.title);
  });
  redirect("/committee");
}

/** Saves the pack's PDF to the organisation's SharePoint site. */
export async function savePackToSharePoint(id: string) {
  const s = await requireUser("manage");
  const p = await db.committeePack.findFirst({ where: { id, orgId: s.org }, include: { org: true } });
  if (!p) return fail("Pack not found");
  const issued = p.status === "issued" && p.snapshot ? { at: p.issuedAt!, by: p.issuedBy ?? "" } : null;
  const d = issued ? (p.snapshot as unknown as PackData) : await buildPack(s.org, p.periodStart, p.periodEnd);
  const bytes = await renderPdf(packDoc(d, p.title, p.summary, p.meetingDate, issued), p.org.name);
  let url: string;
  try {
    url = await saveToSharePoint(p.org, "Committee packs", `${p.title}${issued ? "" : " (draft)"}.pdf`, new Uint8Array(bytes), "application/pdf");
  } catch (e) {
    return fail((e as Error).message);
  }
  await db.$transaction(async (tx) => {
    await tx.committeePack.update({ where: { id }, data: { spUrl: url } });
    await logAction(tx, s, "saved committee pack to SharePoint", "committee", id, p.title);
  });
  revalidatePath(`/committee/${id}`);
  return notice("Saved to SharePoint");
}
