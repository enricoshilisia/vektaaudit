import "server-only";
import { SEVERITY, fmtAmount, fmtDate } from "../format";
import { db } from "./db";

/** A run of text, or a value filled in from the audit file (shown highlighted in the preview). */
export type Run = string | { f: string };
export type Block =
  | { t: "title"; runs: Run[] }
  | { t: "h"; runs: Run[] }
  | { t: "p"; runs: Run[] }
  | { t: "list"; items: Run[][] }
  | { t: "table"; head: string[]; rows: string[][]; align?: ("l" | "r")[]; total?: string[] }
  | { t: "note"; runs: Run[] }
  | { t: "sign"; lines: Run[][] };
export type GeneratedDoc = { title: string; ref: string; blocks: Block[] };

export const OPINIONS = ["unmodified", "qualified", "adverse", "disclaimer"] as const;
export type Opinion = (typeof OPINIONS)[number];

export const TEMPLATES = [
  { key: "engagement-letter", label: "Engagement letter", group: "Before the audit", kinds: ["internal", "financial"] },
  { key: "bank-confirmation", label: "Bank confirmation request", group: "During the audit", kinds: ["financial"] },
  { key: "representation-letter", label: "Management representation letter", group: "Completion", kinds: ["financial"] },
  { key: "financial-statements", label: "Financial statements (summary)", group: "Completion", kinds: ["financial"] },
  { key: "auditors-report", label: "Independent auditor's report", group: "Completion", kinds: ["financial"] },
  { key: "internal-audit-report", label: "Internal audit report", group: "Completion", kinds: ["internal"] },
  { key: "management-letter", label: "Management letter", group: "Completion", kinds: ["internal", "financial"] },
] as const;
export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export async function loadContext(orgId: string, engagementId: string) {
  const e = await db.engagement.findFirst({
    where: { id: engagementId, orgId },
    include: {
      org: true,
      client: true,
      lead: { select: { name: true, title: true } },
      findings: { where: { status: { not: "closed" } }, orderBy: { code: "asc" } },
      leadsTb: { orderBy: { sort: "asc" } },
      tbLines: true,
      procedures: { select: { status: true } },
    },
  });
  if (!e) throw new Error("Engagement not found");
  return e;
}
type Ctx = Awaited<ReturnType<typeof loadContext>>;

const f = (v: string | null | undefined, placeholder: string): Run => ({ f: v?.trim() || `[${placeholder}]` });

function leadTotals(e: Ctx) {
  return e.leadsTb.map((l) => {
    const lines = e.tbLines.filter((t) => t.leadCode === l.code);
    return { ...l, py: lines.reduce((n, t) => n + t.prior, 0n), cy: lines.reduce((n, t) => n + t.current, 0n) };
  });
}

export function build(key: TemplateKey, e: Ctx, opts: { opinion?: Opinion } = {}): GeneratedDoc {
  const client = f(e.client?.name, "Client name");
  const firm = f(e.org.name, "Audit firm name");
  const yearEnd = f(e.periodEnd ? fmtDate(e.periodEnd) : null, "Year-end date");
  const framework = f(e.client?.framework, "Financial reporting framework");
  const law = f(e.client?.law, "Applicable law");
  const signer = f(e.lead?.name, "Engagement partner");
  const today = fmtDate(new Date());
  const ref = `${e.code}/${key}`;
  const sign = (role: string): Block => ({ t: "sign", lines: [[signer], [`${role}, for and on behalf of `, firm], [today]] });

  switch (key) {
    case "engagement-letter":
      return {
        title: "Engagement letter",
        ref,
        blocks: [
          { t: "p", runs: [today] },
          { t: "p", runs: ["To the Board of Directors, ", client] },
          { t: "title", runs: [e.kind === "financial" ? "Audit of the financial statements for the year ended " : "Terms of the internal audit engagement: ", e.kind === "financial" ? yearEnd : { f: e.name }] },
          {
            t: "p",
            runs:
              e.kind === "financial"
                ? ["You have requested that we audit the financial statements of ", client, ", which comprise the statement of financial position as at ", yearEnd, ", and the statements of profit or loss, changes in equity and cash flows for the year then ended, and the notes. We are pleased to confirm our acceptance and our understanding of this engagement by means of this letter."]
                : ["This letter sets out the objective, scope and terms of the internal audit of ", { f: e.name }, " under the approved annual audit plan."],
          },
          { t: "h", runs: ["Objective and scope"] },
          { t: "p", runs: [e.objective ? { f: e.objective } : e.kind === "financial" ? "The objective of our audit is to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor's report that includes our opinion." : "[Objective and scope]"] },
          { t: "h", runs: ["Responsibilities of management"] },
          {
            t: "p",
            runs: [
              e.kind === "financial"
                ? "Management is responsible for the preparation of financial statements that give a true and fair view in accordance with "
                : "Management is responsible for designing and operating effective controls, for giving the audit team access to people, systems and records, and for agreeing and carrying out actions on the findings",
              ...(e.kind === "financial" ? [framework, " and ", law, ", and for such internal control as management determines is necessary."] : ["."]),
            ],
          },
          { t: "h", runs: ["Timetable and team"] },
          { t: "p", runs: ["Fieldwork will be led by ", signer, ". We expect to issue our report by ", f(e.dueDate ? fmtDate(e.dueDate) : null, "Report date"), ". The engagement is budgeted at ", { f: `${e.budgetHours} hours` }, "."] },
          { t: "p", runs: ["Please sign and return a copy of this letter to confirm your agreement."] },
          sign(e.kind === "financial" ? "Engagement partner" : "Chief Audit Executive"),
          { t: "sign", lines: [["Acknowledged on behalf of ", client], ["Name, title and date: ______________________"]] },
        ],
      };

    case "bank-confirmation":
      return {
        title: "Bank confirmation request",
        ref,
        blocks: [
          { t: "p", runs: [today] },
          { t: "p", runs: ["To: ", { f: "[Bank name and branch]" }] },
          { t: "title", runs: ["Request for confirmation of balances as at ", yearEnd] },
          { t: "p", runs: ["Our auditors, ", firm, ", are auditing our financial statements. Please send directly to them, and not to us, the information requested below about all accounts, facilities and other arrangements we hold with you as at the close of business on ", yearEnd, "."] },
          {
            t: "list",
            items: [["Account names, numbers, currency and balances (stating debit or credit)"], ["Loans, overdrafts and other facilities, with limits, interest rates and security held"], ["Guarantees, letters of credit and other contingent liabilities"], ["Names of authorised signatories"]],
          },
          { t: "p", runs: ["This letter is your authority to disclose this information. Bank charges may be debited to our account."] },
          { t: "sign", lines: [["Authorised signatory, ", client], ["Name, title and date: ______________________"]] },
        ],
      };

    case "representation-letter":
      return {
        title: "Management representation letter",
        ref,
        blocks: [
          { t: "p", runs: [today] },
          { t: "p", runs: ["To: ", firm] },
          { t: "p", runs: ["This representation letter is provided in connection with your audit of the financial statements of ", client, " for the year ended ", yearEnd, ". We confirm, to the best of our knowledge and belief:"] },
          {
            t: "list",
            items: [
              ["We have fulfilled our responsibility for preparing financial statements that give a true and fair view in accordance with ", framework, "."],
              ["We have given you all information and access you requested, and all transactions are recorded in the accounting records."],
              ["We have disclosed all known instances of fraud or suspected fraud, and all known non-compliance with laws and regulations."],
              ["Related-party relationships and transactions have been properly accounted for and disclosed."],
              ["All events after the reporting date that require adjustment or disclosure have been adjusted or disclosed."],
              ["The effects of uncorrected misstatements are immaterial, individually and in aggregate."],
            ],
          },
          { t: "sign", lines: [["Chief Executive Officer, ", client]] },
          { t: "sign", lines: [["Chief Financial Officer, ", client]] },
        ],
      };

    case "financial-statements": {
      const leads = leadTotals(e);
      const row = (l: (typeof leads)[number], sign: bigint) => [l.name, fmtAmount(l.cy * sign), fmtAmount(l.py * sign)];
      const bs = leads.filter((l) => l.section === "bs");
      const is = leads.filter((l) => l.section === "is");
      const pbt = is.reduce((n, l) => n + l.cy, 0n) * -1n;
      const pbtPy = is.reduce((n, l) => n + l.py, 0n) * -1n;
      return {
        title: "Financial statements",
        ref,
        blocks: [
          { t: "title", runs: [client] },
          { t: "p", runs: ["Summary financial statements for the year ended ", yearEnd, ", prepared from the audited trial balance (", { f: e.org.currency }, ")."] },
          { t: "h", runs: ["Statement of financial position"] },
          { t: "table", head: ["", "Current year", "Prior year"], align: ["l", "r", "r"], rows: bs.map((l) => row(l, 1n)), total: ["Net of lines above (= profit for the year)", fmtAmount(bs.reduce((n, l) => n + l.cy, 0n)), fmtAmount(bs.reduce((n, l) => n + l.py, 0n))] },
          { t: "h", runs: ["Statement of profit or loss"] },
          { t: "table", head: ["", "Current year", "Prior year"], align: ["l", "r", "r"], rows: is.map((l) => row(l, -1n)), total: ["Profit / (loss) before tax", fmtAmount(pbt), fmtAmount(pbtPy)] },
          { t: "note", runs: ["Draft generated from the audit file. Notes to the financial statements are prepared separately."] },
        ],
      };
    }

    case "auditors-report": {
      const op = opts.opinion ?? "unmodified";
      const kams = e.leadsTb.filter((l) => l.risk === "significant");
      const opinionText: Record<Opinion, Run[]> = {
        unmodified: ["In our opinion, the accompanying financial statements give a true and fair view of the financial position of the Company as at ", yearEnd, ", and of its financial performance and cash flows for the year then ended, in accordance with ", framework, " and the requirements of ", law, "."],
        qualified: ["In our opinion, except for the effects of the matter described in the Basis for Qualified Opinion section of our report, the accompanying financial statements give a true and fair view of the financial position of the Company as at ", yearEnd, " in accordance with ", framework, " and the requirements of ", law, "."],
        adverse: ["In our opinion, because of the significance of the matter discussed in the Basis for Adverse Opinion section of our report, the accompanying financial statements do not give a true and fair view of the financial position of the Company as at ", yearEnd, " in accordance with ", framework, "."],
        disclaimer: ["We do not express an opinion on the accompanying financial statements of the Company. Because of the significance of the matter described in the Basis for Disclaimer of Opinion section of our report, we have not been able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion on these financial statements."],
      };
      const heading: Record<Opinion, string> = { unmodified: "Opinion", qualified: "Qualified opinion", adverse: "Adverse opinion", disclaimer: "Disclaimer of opinion" };
      return {
        title: "Independent auditor's report",
        ref,
        blocks: [
          { t: "title", runs: ["INDEPENDENT AUDITOR'S REPORT"] },
          { t: "p", runs: ["To the members of ", client] },
          { t: "h", runs: ["Report on the audit of the financial statements"] },
          { t: "h", runs: [heading[op]] },
          { t: "p", runs: [op === "disclaimer" ? "We were engaged to audit" : "We have audited", " the financial statements of ", client, ", which comprise the statement of financial position as at ", yearEnd, ", and the statements of profit or loss, changes in equity and cash flows for the year then ended, and notes to the financial statements, including a summary of significant accounting policies."] },
          { t: "p", runs: opinionText[op] },
          { t: "h", runs: [op === "unmodified" ? "Basis for opinion" : `Basis for ${heading[op].toLowerCase()}`] },
          ...(op !== "unmodified" ? [{ t: "p", runs: [{ f: "[Describe the matter giving rise to the modification and its effect]" }] } as Block] : []),
          ...(op !== "disclaimer"
            ? [{ t: "p", runs: ["We conducted our audit in accordance with International Standards on Auditing (ISAs). Our responsibilities under those standards are further described in the Auditor's Responsibilities section of our report. We are independent of the Company in accordance with the IESBA Code, and we have fulfilled our other ethical responsibilities. We believe that the audit evidence we have obtained is sufficient and appropriate to provide a basis for our opinion."] } as Block]
            : []),
          ...(op === "unmodified" || op === "qualified"
            ? [
                { t: "h", runs: ["Key audit matters"] } as Block,
                ...(kams.length
                  ? kams.map((k) => ({ t: "p", runs: [{ f: k.name }, " — ", { f: "[Why it was a key audit matter and how our audit addressed it]" }] }) as Block)
                  : [{ t: "p", runs: [{ f: "[No lead schedule is marked significant risk. Describe key audit matters, or state there are none.]" }] } as Block]),
              ]
            : []),
          { t: "h", runs: ["Responsibilities of the directors for the financial statements"] },
          { t: "p", runs: ["The directors are responsible for the preparation of financial statements that give a true and fair view in accordance with ", framework, " and ", law, ", and for such internal control as the directors determine is necessary to enable the preparation of financial statements that are free from material misstatement, whether due to fraud or error."] },
          { t: "h", runs: ["Auditor's responsibilities for the audit of the financial statements"] },
          { t: "p", runs: ["Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor's report that includes our opinion. Reasonable assurance is a high level of assurance, but is not a guarantee that an audit conducted in accordance with ISAs will always detect a material misstatement when it exists."] },
          { t: "sign", lines: [[signer, ", Practising Certificate No. ", { f: "[P/0000]" }], ["For and on behalf of ", firm, ", Certified Public Accountants"], [{ f: "[City]" }, " · ", { f: "[Date of report]" }]] },
        ],
      };
    }

    case "internal-audit-report": {
      const n = (s: string) => e.findings.filter((x) => x.severity === s).length;
      const rating = n("high") ? "Needs significant improvement" : n("medium") ? "Needs improvement" : "Satisfactory";
      return {
        title: "Internal audit report",
        ref,
        blocks: [
          { t: "title", runs: [{ f: e.name }] },
          { t: "p", runs: ["Internal audit report · ", { f: e.code }, " · ", today] },
          { t: "h", runs: ["Executive summary"] },
          { t: "p", runs: ["Overall rating: ", { f: rating }, ". We raised ", { f: String(e.findings.length) }, " findings: ", { f: `${n("high")} high, ${n("medium")} medium and ${n("low")} low` }, "."] },
          { t: "h", runs: ["Objective and scope"] },
          { t: "p", runs: [e.objective ? { f: e.objective } : "[Objective and scope]"] },
          { t: "h", runs: ["Findings"] },
          ...findingBlocks(e),
          sign("Chief Audit Executive"),
        ],
      };
    }

    case "management-letter":
      return {
        title: "Management letter",
        ref,
        blocks: [
          { t: "p", runs: [today] },
          { t: "p", runs: ["To the Board of Directors, ", client] },
          { t: "title", runs: ["Matters arising from our ", e.kind === "financial" ? "audit for the year ended " : "review of ", e.kind === "financial" ? yearEnd : { f: e.name }] },
          { t: "p", runs: ["During our work we identified the matters below. They are not a complete list of all weaknesses that may exist; they are those we consider you should know about. Management's responses are included where received."] },
          { t: "table", head: ["Ref", "Matter", "Rating", "Owner", "Target"], rows: e.findings.map((x) => [x.code, x.title, SEVERITY[x.severity].label, x.ownerName ?? "—", fmtDate(x.dueDate)]) },
          ...findingBlocks(e),
          sign(e.kind === "financial" ? "Engagement partner" : "Chief Audit Executive"),
        ],
      };
  }
}

function findingBlocks(e: Ctx): Block[] {
  if (!e.findings.length) return [{ t: "p", runs: ["No open findings."] }];
  return e.findings.flatMap((x) => [
    { t: "h", runs: [{ f: `${x.code} · ${x.title} (${SEVERITY[x.severity].label})` }] } as Block,
    { t: "p", runs: ["Condition: ", { f: x.condition ?? "—" }] } as Block,
    { t: "p", runs: ["Criteria: ", { f: x.criteria ?? "—" }] } as Block,
    { t: "p", runs: ["Cause: ", { f: x.cause ?? "—" }] } as Block,
    { t: "p", runs: ["Effect: ", { f: x.effect ?? "—" }] } as Block,
    { t: "p", runs: ["Recommendation: ", { f: x.recommendation ?? "—" }] } as Block,
    { t: "p", runs: ["Management response: ", { f: x.mgmtResponse ?? "[Awaiting response]" }, x.ownerName ? ` Owner: ${x.ownerName}.` : "", x.dueDate ? ` Target: ${fmtDate(x.dueDate)}.` : ""] } as Block,
  ]);
}

export const runText = (runs: Run[]) => runs.map((r) => (typeof r === "string" ? r : r.f)).join("");
