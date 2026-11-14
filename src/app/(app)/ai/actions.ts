"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { RULES, kindOf, type Kind } from "@/lib/analytics";
import { CONTROL_NATURE, FREQUENCIES, countExceptions, suggestedResult, type Attribute } from "@/lib/risk";
import { logAction, nextNumber } from "@/lib/server/audit";
import { can, getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getFile } from "@/lib/server/storage";
import { AiError, ask, facts, type Content } from "@/lib/server/vekta";

type Result<T> = { data: T } | { error: string };

/** The signed-in person, if their role may use this feature (guests never). */
async function who(perm: "work" | "manage") {
  const s = await getSession();
  if (!s || s.role === "GUEST" || !can(s, perm)) return null;
  return s;
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn() };
  } catch (e) {
    if (e instanceof AiError) return { error: e.message };
    console.error("Vekta AI failed:", e);
    return { error: "Vekta AI couldn't answer just now. Please try again." };
  }
}

// ---- 1. a finding from rough notes ----

const FindingDraft = z.object({
  title: z.string().describe("One line a board member would understand, under 15 words"),
  severity: z.enum(["critical", "high", "medium", "low"]),
  condition: z.string().describe("What was found: facts, numbers and examples from the notes"),
  criteria: z.string().describe("What should happen: the policy, law or accepted good practice"),
  cause: z.string().describe("Why it happened, as far as the notes show"),
  effect: z.string().describe("The risk or consequence for the organisation"),
  recommendation: z.string().describe("A practical, specific action management can take"),
});

export async function draftFinding(engagementId: string, notes: string): Promise<Result<z.infer<typeof FindingDraft>>> {
  const s = await who("work");
  if (!s) return { error: "Your role can't use this" };
  if (notes.trim().length < 15) return { error: "Write a few sentences about what you found first" };
  const e = engagementId ? await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org }, include: { client: { select: { name: true, industry: true } } } }) : null;
  return run(() =>
    ask({
      orgId: s.org,
      user: s.name,
      feature: "finding draft",
      schema: FindingDraft,
      instructions: `Turn the auditor's rough notes into an audit finding in the five-part format: condition, criteria, cause, effect and recommendation.
Criteria: name the policy or law only if the notes mention it; otherwise describe accepted good practice without inventing clause numbers.
Cause: if the notes don't say why, write what the likely causes are and that management should confirm them.
Severity: critical for fraud, significant loss or regulatory breach that needs immediate action; high for a key control not working; medium for a weakness with limited impact; low for an improvement.`,
      content: [{ type: "text", text: `${facts([["Audit", e?.name], ["Client or unit", e?.client?.name], ["Industry", e?.client?.industry], ["Area", e?.area]])}\n\nAuditor's notes:\n${notes.slice(0, 6000)}` }],
    }),
  );
}

// ---- 2. controls for a risk ----

const Suggestions = z.object({
  controls: z
    .array(
      z.object({
        title: z.string().describe("Who does what, when, and what evidence it leaves"),
        type: z.enum(["preventive", "detective"]),
        nature: z.enum(["manual", "it_dependent", "automated"]),
        frequency: z.enum(["per_transaction", "multiple_daily", "daily", "weekly", "monthly", "quarterly", "annual", "continuous"]),
        assertion: z.string().describe("The main financial statement assertion, e.g. Occurrence, Completeness, Accuracy, Existence"),
        why: z.string().describe("One sentence on how it addresses the risk"),
      }),
    )
    .describe("Three to five controls"),
});

export async function suggestControls(riskId: string): Promise<Result<z.infer<typeof Suggestions>>> {
  const s = await who("work");
  if (!s) return { error: "Your role can't use this" };
  const r = await db.risk.findFirst({ where: { id: riskId, orgId: s.org }, include: { controls: { select: { title: true } } } });
  if (!r) return { error: "Risk not found" };
  const same = await db.control.findMany({ where: { orgId: s.org, process: r.process }, select: { title: true } });
  return run(() =>
    ask({
      orgId: s.org,
      user: s.name,
      feature: "control suggestions",
      schema: Suggestions,
      instructions: `Suggest three to five controls that address the risk, practical for a mid-sized organisation. Mix preventive and detective where it makes sense, and prefer automated controls where a system can enforce them. Don't repeat controls the organisation already has.`,
      content: [{ type: "text", text: `${facts([["Process", r.process], ["Risk", r.title], ["Detail", r.detail], ["Rating", r.rating]])}\n\nControls already in place for this process:\n${same.map((c) => `- ${c.title}`).join("\n") || "(none)"}` }],
    }),
  );
}

export async function addSuggestedControl(riskId: string, c: z.infer<typeof Suggestions>["controls"][number]): Promise<Result<{ id: string }>> {
  const s = await who("manage");
  if (!s) return { error: "Your role can't add controls" };
  const r = await db.risk.findFirst({ where: { id: riskId, orgId: s.org } });
  if (!r) return { error: "Risk not found" };
  const ok = Suggestions.shape.controls.element.safeParse(c);
  if (!ok.success) return { error: "That suggestion couldn't be added" };
  const created = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "control");
    const x = await tx.control.create({
      data: { orgId: s.org, code: `C-${String(n).padStart(3, "0")}`, process: r.process, title: ok.data.title.slice(0, 400), type: ok.data.type, nature: ok.data.nature, frequency: ok.data.frequency, assertion: ok.data.assertion.slice(0, 60), component: "Control activities", risks: { connect: { id: r.id } } },
    });
    await logAction(tx, s, "added control suggested by Vekta AI", "control", x.id, `${x.code} ${x.title}`);
    return x;
  });
  revalidatePath(`/controls/risks/${riskId}`);
  revalidatePath("/controls");
  return { data: { id: created.id } };
}

// ---- 3. a summary of uploaded evidence ----

const Summary = z.object({
  what: z.string().describe("What the document is, in one sentence"),
  summary: z.string().describe("What it shows, in a short paragraph"),
  figures: z.array(z.object({ item: z.string(), value: z.string() })).describe("Key amounts, dates and counts, copied exactly"),
  concerns: z.array(z.string()).describe("Anything an auditor should look at: missing signatures, dates or approvals, inconsistencies, unusual items. Empty if none"),
});

const MAX_BYTES = { pdf: 20 * 1024 * 1024, image: 5 * 1024 * 1024, text: 400 * 1024 };

export async function summariseDocument(docId: string, refresh = false): Promise<Result<z.infer<typeof Summary>>> {
  const s = await who("work");
  if (!s) return { error: "Your role can't use this" };
  const d = await db.document.findFirst({ where: { id: docId, orgId: s.org }, include: { engagement: { select: { name: true } }, request: { select: { code: true, title: true } } } });
  if (!d) return { error: "Document not found" };
  if (d.aiSummary && !refresh) return { data: d.aiSummary as z.infer<typeof Summary> };
  let file: Content[number];
  if (d.ext === "pdf") {
    if (d.size > MAX_BYTES.pdf) return { error: "This PDF is larger than 20 MB. Split it and upload the part you need summarised." };
    file = { type: "document", source: { type: "base64", media_type: "application/pdf", data: (await getFile(d.storageKey)).toString("base64") } };
  } else if (["png", "jpg", "jpeg"].includes(d.ext)) {
    if (d.size > MAX_BYTES.image) return { error: "This image is larger than 5 MB. Save a smaller copy and try again." };
    file = { type: "image", source: { type: "base64", media_type: d.ext === "png" ? "image/png" : "image/jpeg", data: (await getFile(d.storageKey)).toString("base64") } };
  } else if (["txt", "csv", "eml"].includes(d.ext)) {
    if (d.size > MAX_BYTES.text) return { error: "This file is too long to summarise in one go. Upload the part you need, or use Data analytics for large data files." };
    file = { type: "text", text: `File contents:\n${(await getFile(d.storageKey)).toString("utf8")}` };
  } else return { error: "Vekta AI can summarise PDFs, images and text files. Save this file as PDF and upload it again." };
  const result = await run(() =>
    ask({
      orgId: s.org,
      user: s.name,
      feature: "evidence summary",
      schema: Summary,
      maxTokens: 6000,
      instructions: "Summarise this piece of audit evidence for the auditor reviewing it. Copy figures exactly as they appear. Point out anything that weakens it as evidence.",
      content: [file, { type: "text", text: facts([["File", d.name], ["Audit", d.engagement?.name], ["Requested as", d.request ? `${d.request.code} ${d.request.title}` : null], ["Folder", d.folder]]) }],
    }),
  );
  if ("data" in result) await db.document.update({ where: { id: d.id }, data: { aiSummary: result.data, aiSummaryAt: new Date() } });
  return result;
}

// ---- 4. an analytics exception explained ----

const Explanation = z.object({
  explanation: z.string().describe("Why this was flagged and why it matters, in two or three sentences"),
  innocent: z.array(z.string()).describe("Ordinary reasons it could be fine"),
  checks: z.array(z.string()).describe("Up to six specific things to check or documents to ask for, most important first"),
});

export async function explainException(exceptionId: string): Promise<Result<z.infer<typeof Explanation>>> {
  const s = await who("work");
  if (!s) return { error: "Your role can't use this" };
  const e = await db.analyticException.findFirst({ where: { id: exceptionId, run: { dataSet: { orgId: s.org } } }, include: { run: { include: { dataSet: true } } } });
  if (!e) return { error: "Exception not found" };
  if (e.aiNote) return { data: e.aiNote as z.infer<typeof Explanation> };
  const ds = e.run.dataSet;
  const row = await db.dataRow.findFirst({ where: { dataSetId: ds.id, idx: e.rowIdx } });
  const headers = ds.headers as string[];
  const cells = (row?.cells as string[] | undefined) ?? [];
  const rule = RULES[e.run.rule];
  const result = await run(() =>
    ask({
      orgId: s.org,
      user: s.name,
      feature: "analytics explanation",
      schema: Explanation,
      maxTokens: 3000,
      instructions: "Explain a data analytics exception to an auditor in plain language: why the check flagged it, the ordinary reasons it could be fine, and exactly what to check next to clear or confirm it.",
      content: [
        {
          type: "text",
          text: `${facts([["Data", `${kindOf(ds.kind as Kind).label}: ${ds.name}`], ["Check", rule?.title], ["Why the check exists", rule?.why], ["What was found", e.detail]])}\n\nThe row in the file:\n${headers.map((h, i) => `${h}: ${cells[i] ?? ""}`).join("\n")}`,
        },
      ],
    }),
  );
  if ("data" in result) await db.analyticException.update({ where: { id: e.id }, data: { aiNote: result.data } });
  return result;
}

// ---- 5. a control test conclusion from the results ----

const Conclusion = z.object({ conclusion: z.string().describe("The conclusion paragraph, under 160 words") });

export async function draftConclusion(testId: string): Promise<Result<z.infer<typeof Conclusion>>> {
  const s = await who("work");
  if (!s) return { error: "Your role can't use this" };
  const t = await db.controlTest.findFirst({ where: { id: testId, orgId: s.org }, include: { control: true, samples: { orderBy: { idx: "asc" } } } });
  if (!t) return { error: "Control test not found" };
  if (!t.samples.length) return { error: "Record the sample results first" };
  const attrs = t.attributes as Attribute[];
  const exceptions = countExceptions(t.samples);
  const suggestion = suggestedResult(t.samples.length, exceptions, t.tolerableRate);
  const failed = t.samples
    .filter((sm) => Object.values(sm.results as Record<string, string>).includes("fail"))
    .map((sm) => `Item ${sm.idx} (${sm.ref}): failed ${Object.entries(sm.results as Record<string, string>).filter(([, v]) => v === "fail").map(([k]) => k).join(", ")}${sm.comment ? ` — ${sm.comment}` : ""}`);
  const label: Record<string, string> = { effective: "effective", effective_exception: "effective, with an exception noted", ineffective: "not effective" };
  return run(() =>
    ask({
      orgId: s.org,
      user: s.name,
      feature: "test conclusion",
      schema: Conclusion,
      maxTokens: 2000,
      instructions: `Write the conclusion of a test of a control, in the style of an audit working paper: the population and how the sample was chosen, what was checked, the deviations found (with item numbers), how the deviation rate compares with the tolerable rate, and the result. Use the result given; don't change it.`,
      content: [
        {
          type: "text",
          text: `${facts([
            ["Control", `${t.control.code} ${t.control.title}`],
            ["How it runs", `${CONTROL_NATURE.find((x) => x.key === t.control.nature)?.label}, ${FREQUENCIES.find((x) => x.key === t.control.frequency)?.label}`],
            ["Test", t.testType === "design" ? "Design (walkthrough)" : "Operating effectiveness"],
            ["Period", t.periodStart || t.periodEnd ? `${t.periodStart?.toISOString().slice(0, 10) ?? "?"} to ${t.periodEnd?.toISOString().slice(0, 10) ?? "?"}` : null],
            ["Population", t.population ? `${t.population} items${t.populationSource ? ` (${t.populationSource})` : ""}` : null],
            ["Selection", t.method],
            ["Confidence", `${t.confidence}%`],
            ["Tolerable deviation rate", `${t.tolerableRate}%`],
            ["Sample size", t.samples.length],
            ["Deviations", exceptions],
            ["Result", suggestion ? label[suggestion] : null],
          ])}\n\nAttributes checked:\n${attrs.map((a) => `${a.key}. ${a.label}`).join("\n")}\n\nDeviations:\n${failed.join("\n") || "None"}`,
        },
      ],
    }),
  );
}
