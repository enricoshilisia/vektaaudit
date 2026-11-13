import "server-only";
import { RATING_PILL, SEVERITY, fmtDate } from "../format";
import { BAND_PILL, OPERATING_PILL, type Band } from "../risk";
import type { PackData } from "./committee";
import type { Block, GeneratedDoc } from "./templates";

/** The committee pack as a document for the PDF renderer. */
export function packDoc(d: PackData, title: string, summary: string | null, meeting: Date | null, issued: { at: Date; by: string } | null): GeneratedDoc {
  const sev = (s: { critical: number; high: number; medium: number; low: number }) => `${s.critical} / ${s.high} / ${s.medium} / ${s.low}`;
  const p = d.plan;
  const b: Block[] = [
    { t: "title", runs: [title] },
    { t: "p", runs: [`${d.org} · Internal audit report to the audit committee · Period ${fmtDate(d.periodStart)} to ${fmtDate(d.periodEnd)}${meeting ? ` · Meeting of ${fmtDate(meeting)}` : ""}`] },
    { t: "h", runs: ["1. Chief Audit Executive's summary"] },
    { t: "p", runs: [summary ?? "Not written."] },
    {
      t: "table",
      head: ["Measure", "Value"],
      rows: [
        ["Plan completed", p ? `${p.total ? Math.round((p.completed / p.total) * 100) : 0}% (${p.completed} of ${p.total})` : "No plan"],
        ["Audits reported in the period", String(d.audits.length)],
        ["New findings (critical / high / medium / low)", sev(d.newFindings)],
        ["Findings closed in the period", String(d.closedFindings)],
        ["Actions escalated to the committee", String(d.overdue.length)],
      ],
    },
    { t: "h", runs: [`2. Progress against the ${p?.year ?? ""} audit plan`] },
    p
      ? { t: "p", runs: [`${p.completed} completed, ${p.inProgress} in progress, ${p.planned} not started, ${p.deferred} deferred${p.cancelled ? `, ${p.cancelled} cancelled` : ""}. ${p.status === "approved" ? `The plan was approved by ${p.approvedBy}.` : "The plan has not yet been approved."}`] }
      : { t: "p", runs: ["There is no audit plan for this year."] },
    { t: "h", runs: ["3. Audits reported this period"] },
    d.audits.length
      ? { t: "table", head: ["Audit", "Client or unit", "Rating", "Findings C/H/M/L"], rows: d.audits.map((a) => [`${a.code} ${a.name}`, a.client ?? "-", RATING_PILL[a.rating].label, sev(a.findings)]), align: ["l", "l", "l", "r"] }
      : { t: "p", runs: ["No audits were rated in this period."] },
    { t: "h", runs: ["4. Significant open findings (critical and high)"] },
    d.significant.length
      ? { t: "table", head: ["Finding", "Severity", "Owner", "Due", "Days overdue"], rows: d.significant.map((f) => [`${f.code} ${f.title}`, SEVERITY[f.severity].label, f.owner ?? "-", fmtDate(f.due), f.days ? String(f.days) : "-"]), align: ["l", "l", "l", "l", "r"] }
      : { t: "p", runs: ["No critical or high findings are open."] },
    { t: "h", runs: ["5. Actions escalated to the committee"] },
    d.overdue.length
      ? { t: "table", head: ["Finding", "Owner", "First agreed", "Now due", "Days overdue"], rows: d.overdue.map((f) => [`${f.code} ${f.title}${f.moved ? ` (moved ${f.moved}x)` : ""}`, f.owner ?? "-", fmtDate(f.firstDue), fmtDate(f.due), f.days ? String(f.days) : "-"]), align: ["l", "l", "l", "l", "r"] }
      : { t: "p", runs: ["Nothing is escalated to the committee."] },
    { t: "h", runs: ["6. Top risks in the audit universe"] },
    d.topRisks.length
      ? { t: "table", head: ["Area", "Score", "Inherent", "Residual", "Last audited"], rows: d.topRisks.map((r) => [`${r.code} ${r.name}`, String(r.score), BAND_PILL[r.band as Band].label, BAND_PILL[r.residual as Band].label, r.lastAudited ? fmtDate(r.lastAudited) : "Never"]), align: ["l", "r", "l", "l", "l"] }
      : { t: "p", runs: ["The audit universe is empty."] },
    { t: "h", runs: ["7. Controls and self-assessment"] },
    { t: "p", runs: [`${d.controls.keyTested} of ${d.controls.keyTotal} key controls were tested in the period; ${d.controls.ineffective.length} key controls are rated not working.${d.csa ? ` In the self-assessment "${d.csa.title}", ${d.csa.answered} of ${d.csa.controls} controls were answered, ${d.csa.notWorking} were reported as not fully working, and audit disagreed with ${d.csa.disagree} answers.` : ""}`] },
  ];
  if (d.controls.ineffective.length) b.push({ t: "list", items: d.controls.ineffective.map((c) => [`${c.code} ${c.title} (${c.process}): ${OPERATING_PILL[c.operating].label}`]) });
  b.push(
    { t: "h", runs: ["8. Resources"] },
    { t: "p", runs: [`The team logged ${Math.round(d.time.total)} hours in the period, ${Math.round(d.time.audit)} of them on audit work.`] },
    { t: "note", runs: [issued ? `Issued by ${issued.by} on ${fmtDate(issued.at)}. Figures are as at that date.` : `Draft. Figures are live as at ${fmtDate(d.builtAt)} and will change until the pack is issued.`] },
  );
  return { title, ref: issued ? `Issued ${fmtDate(issued.at)}` : "DRAFT", blocks: b };
}
