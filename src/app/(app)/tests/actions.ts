"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_ATTRIBUTES, type Attribute } from "@/lib/risk";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";
import { assertOpen } from "@/lib/server/lock";
import { notifyTeams } from "@/lib/server/m365";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const page = (id: string) => revalidatePath(`/tests/${id}`);

const DESIGN_ATTRIBUTES: Attribute[] = [
  { key: "A", label: "The control as designed addresses the risk", how: "Compare the control description with the risk and assertion" },
  { key: "B", label: "The control is in place as described", how: "Walk one instance through from start to end and inspect the evidence" },
];

export async function createTest(form: FormData) {
  const s = await requireUser("work");
  const engagementId = z.string().min(1, "Choose the engagement").parse(str(form, "engagementId") ?? "");
  const controlId = z.string().min(1, "Choose a control from the library").parse(str(form, "controlId") ?? "");
  const testType = z.enum(["design", "operating"]).parse(form.get("testType") ?? "operating");
  const [e, c] = await Promise.all([db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }), db.control.findFirst({ where: { id: controlId, orgId: s.org } })]);
  if (!e) return fail("Engagement not found");
  if (!c) return fail("Control not found");
  if (e.phase === "closed") return fail("This engagement is closed");
  await assertOpen(e.id);
  const t = await db.$transaction(async (tx) => {
    const n = (await tx.controlTest.count({ where: { engagementId } })) + 1;
    const created = await tx.controlTest.create({
      data: {
        orgId: s.org,
        engagementId,
        controlId,
        testType,
        ref: `CT-${String(n).padStart(2, "0")}`,
        attributes: testType === "design" ? DESIGN_ATTRIBUTES : DEFAULT_ATTRIBUTES,
        method: testType === "design" ? "judgemental" : c.nature === "automated" ? "judgemental" : "random",
        periodStart: e.periodStart,
        periodEnd: e.periodEnd,
      },
    });
    await logAction(tx, s, `started ${testType} test`, "engagement", engagementId, `${created.ref} ${c.code} ${c.title}`);
    return created;
  });
  redirect(`/tests/${t.id}`);
}

/** The test, if it belongs to the organisation. Editing needs it to be in progress. */
async function own(orgId: string, id: string, editing = true) {
  const t = await db.controlTest.findFirst({ where: { id, orgId }, include: { control: true, engagement: { select: { phase: true } } } });
  if (!t) return fail("Control test not found");
  await assertOpen(t.engagementId);
  if (editing && t.status !== "in_progress") return fail("This test has been submitted. Ask the reviewer to send it back to change it.");
  return t;
}

export async function saveDesign(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  const num = (k: string) => (str(form, k) ? z.coerce.number().int().min(0).parse(str(form, k)) : null);
  const value = str(form, "populationValue")?.replace(/[,\s]/g, "");
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({
      where: { id },
      data: {
        periodStart: str(form, "periodStart") ? new Date(str(form, "periodStart")!) : null,
        periodEnd: str(form, "periodEnd") ? new Date(str(form, "periodEnd")!) : null,
        population: num("population"),
        populationValue: value && /^\d+$/.test(value) ? BigInt(value) : null,
        populationSource: str(form, "populationSource"),
        method: z.enum(["random", "systematic", "haphazard", "judgemental", "full"]).parse(form.get("method")),
        confidence: z.coerce.number().int().refine((n) => [80, 90, 95, 99].includes(n)).parse(form.get("confidence")),
        tolerableRate: z.coerce.number().int().min(1).max(20).parse(form.get("tolerableRate")),
      },
    });
    await logAction(tx, s, "saved test design", "engagement", t.engagementId, t.ref);
  });
  page(id);
}

/** One attribute per line: "what is checked | how it is checked". */
export async function saveAttributes(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  const lines = String(form.get("attributes") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return fail("List at least one attribute to test");
  if (lines.length > 10) return fail("Keep it to 10 attributes or fewer");
  const attributes: Attribute[] = lines.map((l, i) => {
    const [label, how] = l.split("|").map((x) => x.trim());
    return { key: String.fromCharCode(65 + i), label, how: how || undefined };
  });
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({ where: { id }, data: { attributes } });
    await logAction(tx, s, "changed test attributes", "engagement", t.engagementId, `${t.ref}: ${attributes.length} attributes`);
  });
  page(id);
}

/** Paste the sample: one item per line, "reference, description, amount" (comma or tab separated). */
export async function addSamples(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  const lines = String(form.get("items") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return fail("Paste at least one item");
  if (lines.length > 500) return fail("Add at most 500 items at a time");
  const start = await db.testSample.count({ where: { testId: id } });
  await db.$transaction(async (tx) => {
    await tx.testSample.createMany({
      data: lines.map((l, i) => {
        const parts = l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => p.trim().replace(/^"|"$/g, ""));
        const amt = parts[2]?.replace(/[,\s]/g, "");
        return { testId: id, idx: start + i + 1, ref: parts[0].slice(0, 80), description: parts[1]?.slice(0, 300) || null, amount: amt && /^-?\d+(\.\d+)?$/.test(amt) ? BigInt(Math.round(Number(amt))) : null };
      }),
    });
    await logAction(tx, s, "added sample items", "engagement", t.engagementId, `${t.ref}: ${lines.length}`);
  });
  page(id);
}

/** Picks random item numbers from the population, without repeats, to trace back to the source listing. */
export async function pickRandom(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  if (!t.population) return fail("Enter the population size in the test design first");
  const n = z.coerce.number().int().min(1).max(500).parse(form.get("count"));
  if (n > t.population) return fail("The sample can't be bigger than the population");
  const picked = new Set<number>();
  while (picked.size < n) picked.add(randomInt(1, t.population + 1));
  const nums = [...picked].sort((a, b) => a - b);
  const start = await db.testSample.count({ where: { testId: id } });
  await db.$transaction(async (tx) => {
    await tx.testSample.createMany({ data: nums.map((num, i) => ({ testId: id, idx: start + i + 1, ref: `Item ${num.toLocaleString("en-US")}`, description: "Randomly selected item number" })) });
    await logAction(tx, s, "selected random sample", "engagement", t.engagementId, `${t.ref}: ${n} of ${t.population}`);
  });
  page(id);
}

export async function saveResults(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  const samples = await db.testSample.findMany({ where: { testId: id } });
  const keys = (t.attributes as Attribute[]).map((a) => a.key);
  await db.$transaction(async (tx) => {
    for (const sm of samples) {
      const results: Record<string, string> = {};
      for (const k of keys) {
        const v = String(form.get(`r_${sm.id}_${k}`) ?? "");
        if (v === "pass" || v === "fail" || v === "na") results[k] = v;
      }
      await tx.testSample.update({ where: { id: sm.id }, data: { results, comment: str(form, `c_${sm.id}`)?.slice(0, 1000) ?? null } });
    }
    await logAction(tx, s, "recorded test results", "engagement", t.engagementId, `${t.ref}: ${samples.length} items`);
  });
  page(id);
}

export async function removeSample(sampleId: string) {
  const s = await requireUser("work");
  const sm = await db.testSample.findFirst({ where: { id: sampleId, test: { orgId: s.org } } });
  if (!sm) return fail("Item not found");
  await own(s.org, sm.testId);
  await db.testSample.delete({ where: { id: sampleId } });
  page(sm.testId);
}

export async function submitTest(id: string, form: FormData) {
  const s = await requireUser("work");
  const t = await own(s.org, id);
  const result = z.enum(["effective", "effective_exception", "ineffective"], { message: "Choose the result" }).parse(form.get("result"));
  const conclusion = z.string().min(20, "Write the conclusion: what was tested, what was found and what it means").parse(str(form, "conclusion") ?? "");
  const samples = await db.testSample.findMany({ where: { testId: id } });
  if (samples.length === 0) return fail("Add the sample items you tested");
  const keys = (t.attributes as Attribute[]).map((a) => a.key);
  const blank = samples.filter((sm) => keys.some((k) => !(sm.results as Record<string, string>)[k])).length;
  if (blank) return fail(`${blank} item${blank === 1 ? " has" : "s have"} attributes without a result`);
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({ where: { id }, data: { result, conclusion, status: "in_review", preparedById: s.sub, preparedAt: new Date() } });
    await logAction(tx, s, "submitted control test for review", "engagement", t.engagementId, `${t.ref} ${t.control.code}: ${result.replace("_", " ")}`);
  });
  const label = { effective: "Effective", effective_exception: "Effective, with exception", ineffective: "Ineffective" }[result];
  await notifyTeams(s.org, {
    title: `Control test waiting for review: ${t.ref} ${t.control.code}`,
    text: t.control.title,
    facts: [["Prepared by", s.name], ["Result", label], ["Items tested", String(samples.length)]],
    path: `/tests/${id}`,
    tone: result === "ineffective" ? "attention" : "accent",
  });
  page(id);
}

const DESIGN_FROM_RESULT: Record<string, string> = { effective: "effective", effective_exception: "needs_improvement", ineffective: "ineffective" };

/** Reviewer sign-off. The result becomes the control's rating in the library. */
export async function signOffTest(id: string) {
  const s = await requireUser("review");
  const t = await own(s.org, id, false);
  if (t.status !== "in_review") return fail("Only a submitted test can be signed off");
  if (t.preparedById === s.sub) return fail("You prepared this test, so someone else must review it");
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({ where: { id }, data: { status: "concluded", reviewedById: s.sub, reviewedAt: new Date() } });
    await tx.control.update({
      where: { id: t.controlId },
      data: t.testType === "design" ? { design: DESIGN_FROM_RESULT[t.result!], lastTestedAt: new Date() } : { operating: t.result!, lastTestedAt: new Date() },
    });
    await logAction(tx, s, "signed off control test", "engagement", t.engagementId, `${t.ref} ${t.control.code}: ${t.result?.replace("_", " ")}`);
    await logAction(tx, s, `rated control ${t.testType === "design" ? "design" : "operation"} from test`, "control", t.controlId, `${t.ref}: ${t.result?.replace("_", " ")}`);
  });
  page(id);
}

export async function sendBackTest(id: string, form: FormData) {
  const s = await requireUser("review");
  const t = await own(s.org, id, false);
  if (t.status !== "in_review") return fail("Only a submitted test can be sent back");
  const note = z.string().min(5, "Say what needs to change").parse(str(form, "note") ?? "");
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({ where: { id }, data: { status: "in_progress", preparedById: null, preparedAt: null } });
    await tx.reviewNote.create({ data: { engagementId: t.engagementId, authorId: s.sub, body: `${t.ref} (${t.control.code}): ${note}` } });
    await logAction(tx, s, "sent control test back", "engagement", t.engagementId, `${t.ref}: ${note}`);
  });
  page(id);
}

export async function reopenTest(id: string) {
  const s = await requireUser("review");
  const t = await own(s.org, id, false);
  if (t.status !== "concluded") return fail("This test is not concluded");
  await db.$transaction(async (tx) => {
    await tx.controlTest.update({ where: { id }, data: { status: "in_progress", preparedById: null, preparedAt: null, reviewedById: null, reviewedAt: null } });
    await logAction(tx, s, "reopened control test", "engagement", t.engagementId, t.ref);
  });
  page(id);
}
