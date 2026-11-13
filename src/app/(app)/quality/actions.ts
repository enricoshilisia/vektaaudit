"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CONFORMANCE, DOMAINS, QA_CRITERIA, qaScore, type QaResult } from "@/lib/quality";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

/** Starts a quality review. The reviewer must not have led or worked on the engagement. */
export async function startQaReview(form: FormData) {
  const s = await requireUser("review");
  const engagementId = z.string().min(1, "Choose the engagement").parse(str(form, "engagementId") ?? "");
  const e = await db.engagement.findFirst({
    where: { id: engagementId, orgId: s.org },
    include: { procedures: { select: { preparedById: true, reviewedById: true } }, tests: { select: { preparedById: true, reviewedById: true } } },
  });
  if (!e) return fail("Engagement not found");
  const worked = e.leadId === s.sub || [...e.procedures, ...e.tests].some((p) => p.preparedById === s.sub || p.reviewedById === s.sub);
  if (worked) return fail("You worked on this engagement, so someone independent of it must do the quality review");
  const existing = await db.qaReview.findFirst({ where: { engagementId, status: "in_progress" } });
  if (existing) redirect(`/quality/${existing.id}`);
  const q = await db.$transaction(async (tx) => {
    const created = await tx.qaReview.create({ data: { orgId: s.org, engagementId, reviewerId: s.sub } });
    await logAction(tx, s, "started quality review", "engagement", engagementId, `${e.code} ${e.name}`);
    return created;
  });
  redirect(`/quality/${q.id}`);
}

export async function saveQaReview(id: string, form: FormData) {
  const s = await requireUser("review");
  const q = await db.qaReview.findFirst({ where: { id, orgId: s.org }, include: { engagement: { select: { code: true } } } });
  if (!q) return fail("Quality review not found");
  if (q.reviewerId !== s.sub) return fail("Only the reviewer can change this review");
  if (q.status === "completed") return fail("This review is completed");
  const results: QaResult = {};
  for (const c of QA_CRITERIA) {
    const met = String(form.get(`m_${c.key}`) ?? "");
    if (met === "yes" || met === "partly" || met === "no" || met === "na") results[c.key] = { met, note: str(form, `n_${c.key}`)?.slice(0, 1000) ?? undefined };
  }
  const complete = form.get("complete") === "1";
  if (complete) {
    const missing = QA_CRITERIA.filter((c) => !results[c.key]);
    if (missing.length) return fail(`Rate every criterion first: ${missing.map((c) => c.label).join(", ")}`);
    const unexplained = QA_CRITERIA.filter((c) => (results[c.key]?.met === "no" || results[c.key]?.met === "partly") && !results[c.key]?.note);
    if (unexplained.length) return fail(`Explain what fell short for: ${unexplained.map((c) => c.label).join(", ")}`);
  }
  const score = qaScore(results);
  await db.$transaction(async (tx) => {
    await tx.qaReview.update({ where: { id }, data: { results, notes: str(form, "notes"), score, ...(complete ? { status: "completed", completedAt: new Date() } : {}) } });
    if (complete) await logAction(tx, s, "completed quality review", "engagement", q.engagementId, `${q.engagement.code}: ${score}%`);
  });
  revalidatePath(`/quality/${id}`);
  if (complete) redirect("/quality");
}

/** The function's own assessment against the five domains, for a year. */
export async function saveConformance(year: number, form: FormData) {
  const s = await requireUser("admin");
  const ratings: Record<string, { rating: string; gaps?: string; actions?: string }> = {};
  for (const d of DOMAINS) {
    const rating = String(form.get(`r_${d.key}`) ?? "unassessed");
    if (!CONFORMANCE.some((c) => c.key === rating)) return fail("Choose a rating for each domain");
    ratings[d.key] = { rating, gaps: str(form, `g_${d.key}`)?.slice(0, 2000) ?? undefined, actions: str(form, `a_${d.key}`)?.slice(0, 2000) ?? undefined };
  }
  await db.$transaction(async (tx) => {
    await tx.conformance.upsert({ where: { orgId_year: { orgId: s.org, year } }, create: { orgId: s.org, year, ratings, updatedBy: s.name }, update: { ratings, updatedBy: s.name } });
    await logAction(tx, s, "updated conformance self-assessment", "quality", null, String(year));
  });
  revalidatePath("/quality");
}
