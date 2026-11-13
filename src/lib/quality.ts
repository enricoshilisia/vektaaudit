// Quality assurance of the audit function: engagement quality reviews and the yearly conformance self-assessment.
// Checklist and descriptions are VektaAudit's own wording.

export const QA_CRITERIA = [
  { key: "planning", label: "Planning", ask: "Objectives, scope and the key risks were documented and approved before fieldwork started" },
  { key: "program", label: "Work program", ask: "The work program addressed each key risk, and every procedure was completed or its omission explained" },
  { key: "sampling", label: "Sampling", ask: "Sample sizes and selection methods were justified and fit the population" },
  { key: "evidence", label: "Evidence", ask: "Working papers reference sufficient, relevant evidence that someone else could follow" },
  { key: "conclusions", label: "Conclusions", ask: "Each conclusion follows from the work done and the evidence on file" },
  { key: "review", label: "Supervision", ask: "Work was reviewed by someone other than the preparer, and review notes were cleared before sign-off" },
  { key: "findings", label: "Findings", ask: "Findings state the condition, criteria, root cause, effect and a practical recommendation" },
  { key: "responses", label: "Management responses", ask: "Management's agreed actions, owners and dates were obtained for every finding" },
  { key: "reporting", label: "Reporting", ask: "The report was clear, balanced, rated consistently and issued on time" },
  { key: "independence", label: "Independence", ask: "No member of the team had a conflict of interest, or it was declared and managed" },
] as const;
export type Criterion = (typeof QA_CRITERIA)[number]["key"];
export type QaResult = Partial<Record<Criterion, { met: "yes" | "partly" | "no" | "na"; note?: string }>>;

/** Score out of 100: yes counts fully, partly half; not-applicable criteria are left out. */
export function qaScore(r: QaResult) {
  const scored = QA_CRITERIA.map((c) => r[c.key]?.met).filter((m) => m && m !== "na");
  if (!scored.length) return null;
  return Math.round((scored.reduce((a, m) => a + (m === "yes" ? 1 : m === "partly" ? 0.5 : 0), 0) / scored.length) * 100);
}
export const MET = [
  { key: "yes", label: "Met", cls: "bg-ok-bg text-ok-fg" },
  { key: "partly", label: "Partly", cls: "bg-med-bg text-med-fg" },
  { key: "no", label: "Not met", cls: "bg-high-bg text-high-fg" },
  { key: "na", label: "N/A", cls: "bg-line-soft text-ink-500" },
] as const;

/** The five domains of the Global Internal Audit Standards, described in VektaAudit's words. */
export const DOMAINS = [
  { key: "purpose", label: "I. Purpose of internal auditing", about: "Why the function exists and the value it should add" },
  { key: "ethics", label: "II. Ethics and professionalism", about: "Integrity, objectivity, competence, due care and confidentiality of auditors" },
  { key: "governing", label: "III. Governing the internal audit function", about: "The mandate, the charter, independence, and oversight by the board" },
  { key: "managing", label: "IV. Managing the internal audit function", about: "Strategy, planning, resources, methodology, communication and quality" },
  { key: "performing", label: "V. Performing internal audit services", about: "Planning, doing, communicating and following up engagements" },
] as const;
export const CONFORMANCE = [
  { key: "generally", label: "Generally conforms", cls: "bg-ok-bg text-ok-fg" },
  { key: "partially", label: "Partially conforms", cls: "bg-med-bg text-med-fg" },
  { key: "not", label: "Does not conform", cls: "bg-high-bg text-high-fg" },
  { key: "unassessed", label: "Not assessed", cls: "bg-line-soft text-ink-500" },
] as const;
export type DomainRating = { rating: string; gaps?: string; actions?: string };
