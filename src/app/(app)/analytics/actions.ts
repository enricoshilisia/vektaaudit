"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_PARAMS, KINDS, RULES, guessColumns, kindOf, missingFields, runChecks, type Kind, type Params } from "@/lib/analytics";
import { parseCsv } from "@/lib/csv";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

const MAX_ROWS = 100_000;
const MAX_HITS = 1_000;
const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

/** Uploads a CSV extract, guesses which column is which, and stores the rows. */
export async function uploadDataSet(form: FormData) {
  const s = await requireUser("work");
  const kind = z.enum(KINDS.map((k) => k.key) as [Kind, ...Kind[]]).parse(form.get("kind"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file");
  if (!/\.(csv|txt)$/i.test(file.name)) return fail("Save the file as CSV first (in Excel: File → Save As → CSV UTF-8)");
  if (file.size > 25 * 1024 * 1024) return fail("The file is larger than 25 MB. Split it by month and upload each part.");
  const engagementId = str(form, "engagementId");
  if (engagementId && !(await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }))) return fail("Engagement not found");
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return fail("The file needs a heading row and at least one row of data");
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1);
  if (data.length > MAX_ROWS) return fail(`The file has ${data.length.toLocaleString("en-US")} rows; the limit is ${MAX_ROWS.toLocaleString("en-US")}. Split it and upload each part.`);
  const name = str(form, "name") ?? file.name.replace(/\.[^.]+$/, "");
  const d = await db.$transaction(
    async (tx) => {
      const created = await tx.dataSet.create({ data: { orgId: s.org, engagementId, kind, name: name.slice(0, 120), headers, columns: guessColumns(kind, headers), rowCount: data.length, uploadedBy: s.name } });
      for (let i = 0; i < data.length; i += 2000) await tx.dataRow.createMany({ data: data.slice(i, i + 2000).map((cells, j) => ({ dataSetId: created.id, idx: i + j, cells })) });
      await logAction(tx, s, "uploaded data for analytics", "analytics", created.id, `${name}: ${data.length} rows (${kindOf(kind).label})`);
      return created;
    },
    { timeout: 120_000 },
  );
  redirect(`/analytics/${d.id}?map=1`);
}

async function own(orgId: string, id: string) {
  const d = await db.dataSet.findFirst({ where: { id, orgId } });
  if (!d) return fail("Data set not found");
  return d;
}

export async function saveMapping(id: string, form: FormData) {
  const s = await requireUser("work");
  const d = await own(s.org, id);
  const headers = d.headers as string[];
  const columns: Record<string, number> = {};
  for (const f of kindOf(d.kind).fields) {
    const v = str(form, `col_${f.key}`);
    if (v !== null && Number(v) >= 0 && Number(v) < headers.length) columns[f.key] = Number(v);
  }
  const miss = missingFields(d.kind as Kind, columns);
  if (miss.length) return fail(`Choose the column for: ${miss.join(", ")}`);
  await db.dataSet.update({ where: { id }, data: { columns } });
  redirect(`/analytics/${id}`);
}

/** Runs every check for the data set and keeps the exceptions for review. */
export async function runAll(id: string, form: FormData) {
  const s = await requireUser("work");
  const d = await own(s.org, id);
  const columns = d.columns as Record<string, number>;
  const miss = missingFields(d.kind as Kind, columns);
  if (miss.length) return fail(`Map these columns first: ${miss.join(", ")}`);
  const p: Params = { ...DEFAULT_PARAMS };
  for (const k of Object.keys(DEFAULT_PARAMS) as (keyof Params)[]) {
    const v = Number(String(form.get(k) ?? "").replace(/[,\s]/g, ""));
    if (Number.isFinite(v) && v > 0) p[k] = v;
  }
  const rows = (await db.dataRow.findMany({ where: { dataSetId: id }, orderBy: { idx: "asc" }, select: { idx: true, cells: true } })).map((r) => ({ idx: r.idx, cells: r.cells as string[] }));

  // supplier bank accounts are compared with the latest payroll upload (same engagement first)
  let employeeBanks: Map<string, string> | undefined;
  if (d.kind === "payments") {
    const payroll = (await db.dataSet.findFirst({ where: { orgId: s.org, kind: "payroll", engagementId: d.engagementId ?? undefined }, orderBy: { createdAt: "desc" } })) ?? (await db.dataSet.findFirst({ where: { orgId: s.org, kind: "payroll" }, orderBy: { createdAt: "desc" } }));
    const pc = payroll?.columns as Record<string, number> | undefined;
    if (payroll && pc?.bank !== undefined) {
      employeeBanks = new Map();
      for (const r of await db.dataRow.findMany({ where: { dataSetId: payroll.id }, select: { cells: true } })) {
        const c = r.cells as string[];
        const b = (c[pc.bank] ?? "").trim().toLowerCase().replace(/[\s-]/g, "");
        if (b) employeeBanks.set(b, `${c[pc.name] ?? "an employee"} (${c[pc.employee] ?? ""})`);
      }
    }
  }

  const results = runChecks(d.kind as Kind, rows, columns, p, employeeBanks);
  await db.$transaction(
    async (tx) => {
      for (const r of results) {
        await tx.analyticRun.create({
          data: {
            dataSetId: id,
            rule: r.rule,
            params: p,
            tested: r.tested,
            hits: r.hits.length,
            summary: (r.summary ?? (r.skipped ? { skipped: r.skipped } : undefined)) as object | undefined,
            ranBy: s.name,
            exceptions: { create: r.hits.slice(0, MAX_HITS).map((h) => ({ rowIdx: h.row, detail: h.detail.slice(0, 500) })) },
          },
        });
      }
      await logAction(tx, s, "ran analytics", "analytics", id, `${d.name}: ${results.reduce((a, r) => a + r.hits.length, 0)} exceptions from ${results.length} checks`);
    },
    { timeout: 120_000 },
  );
  revalidatePath(`/analytics/${id}`);
  redirect(`/analytics/${id}`);
}

async function ownException(orgId: string, id: string) {
  const e = await db.analyticException.findFirst({ where: { id, run: { dataSet: { orgId } } }, include: { run: { include: { dataSet: true } } } });
  if (!e) return fail("Exception not found");
  return e;
}

export async function explainException(id: string, form: FormData) {
  const s = await requireUser("work");
  const e = await ownException(s.org, id);
  const note = z.string().min(3, "Write what you found when you looked into it").max(1000).parse(str(form, "note") ?? "");
  await db.analyticException.update({ where: { id }, data: { status: "explained", note, reviewedBy: s.name, reviewedAt: new Date() } });
  revalidatePath(`/analytics/${e.run.dataSetId}`);
}

export async function reopenException(id: string) {
  const s = await requireUser("work");
  const e = await ownException(s.org, id);
  await db.analyticException.update({ where: { id }, data: { status: "open", note: null, reviewedBy: null, reviewedAt: null } });
  revalidatePath(`/analytics/${e.run.dataSetId}`);
}

/** Turns an exception into a finding on the data set's engagement. */
export async function raiseFindingFrom(id: string) {
  const s = await requireUser("work");
  const e = await ownException(s.org, id);
  if (e.findingId) redirect(`/findings/${e.findingId}`);
  const engagementId = e.run.dataSet.engagementId;
  if (!engagementId) return fail("Link this data set to an engagement first, so the finding has somewhere to belong");
  const rule = RULES[e.run.rule];
  const f = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "finding");
    const created = await tx.finding.create({
      data: {
        orgId: s.org,
        engagementId,
        code: `FND-${String(n).padStart(4, "0")}`,
        title: `${rule?.title ?? "Analytics exception"}: ${e.detail}`.slice(0, 200),
        severity: "medium",
        condition: `${e.detail}. Found by the "${rule?.title}" check on ${e.run.dataSet.name} (row ${e.rowIdx + 2} of the file).`,
        effect: rule?.why ?? null,
        raisedById: s.sub,
        events: { create: { kind: "raised", body: `Raised from data analytics (${e.run.dataSet.name})`, actorName: s.name } },
      },
    });
    await tx.analyticException.update({ where: { id }, data: { status: "finding", findingId: created.id, reviewedBy: s.name, reviewedAt: new Date() } });
    await logAction(tx, s, "raised finding from analytics", "finding", created.id, `${created.code} ${created.title}`);
    return created;
  });
  redirect(`/findings/${f.id}?edit=1`);
}

export async function linkEngagement(id: string, form: FormData) {
  const s = await requireUser("work");
  await own(s.org, id);
  const engagementId = str(form, "engagementId");
  if (engagementId && !(await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }))) return fail("Engagement not found");
  await db.dataSet.update({ where: { id }, data: { engagementId } });
  revalidatePath(`/analytics/${id}`);
}

export async function deleteDataSet(id: string) {
  const s = await requireUser("manage");
  const d = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.dataSet.delete({ where: { id } });
    await logAction(tx, s, "deleted analytics data", "analytics", id, d.name);
  });
  redirect("/analytics");
}
