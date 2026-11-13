// Starter frameworks, summarised in VektaAudit's own words. Licensed standards (ISO 27001, PCI DSS, CBK guidelines)
// are imported by the customer from their own copy, as CSV.

type Starter = { key: string; name: string; note: string; requirements: { ref: string; title: string }[] };

export const STARTERS: Starter[] = [
  {
    key: "kenya-dpa-2019",
    name: "Kenya Data Protection Act, 2019 — key obligations",
    note: "A plain-language summary of the main obligations for organisations that handle personal data. Check each against the Act and the Data Protection (General) Regulations, 2021.",
    requirements: [
      { ref: "DPA-01", title: "Register with the Office of the Data Protection Commissioner as a data controller or processor, and keep the registration current" },
      { ref: "DPA-02", title: "Appoint a data protection officer where the law requires one, and make their contact details known" },
      { ref: "DPA-03", title: "Process personal data lawfully, fairly and transparently, for clear purposes, and only as much as needed" },
      { ref: "DPA-04", title: "Have a lawful basis for each processing activity, and record it" },
      { ref: "DPA-05", title: "Where consent is the basis, be able to show it was given freely, and let people withdraw it" },
      { ref: "DPA-06", title: "Tell people what data is collected, why, who it is shared with and how long it is kept, when it is collected" },
      { ref: "DPA-07", title: "Respond to people's requests to see, correct, delete or object to the use of their data, within the time allowed" },
      { ref: "DPA-08", title: "Keep personal data accurate, and no longer than needed for its purpose; delete or anonymise it after" },
      { ref: "DPA-09", title: "Protect personal data with suitable technical and organisational security measures" },
      { ref: "DPA-10", title: "Build data protection into new systems and processes from the start (by design and by default)" },
      { ref: "DPA-11", title: "Assess the impact on people before high-risk processing, and act on the results" },
      { ref: "DPA-12", title: "Use processors only under a written contract that protects the data, and check they comply" },
      { ref: "DPA-13", title: "Report personal data breaches to the Data Commissioner promptly, and tell affected people where required" },
      { ref: "DPA-14", title: "Transfer personal data outside Kenya only with appropriate safeguards or another permitted basis" },
      { ref: "DPA-15", title: "Handle sensitive personal data (health, biometrics, children's data and similar) only on the permitted grounds, with extra care" },
    ],
  },
  {
    key: "coso-2013",
    name: "Internal control — the 17 COSO principles",
    note: "The 17 principles of the COSO Internal Control framework, paraphrased. Map your key controls to the principles they support.",
    requirements: [
      { ref: "P1", title: "Control environment: the organisation shows commitment to integrity and ethical values" },
      { ref: "P2", title: "Control environment: the board is independent of management and oversees internal control" },
      { ref: "P3", title: "Control environment: management sets structures, reporting lines and authorities, with board oversight" },
      { ref: "P4", title: "Control environment: the organisation attracts, develops and keeps competent people" },
      { ref: "P5", title: "Control environment: people are held accountable for their internal control responsibilities" },
      { ref: "P6", title: "Risk assessment: objectives are clear enough to identify and assess the risks to them" },
      { ref: "P7", title: "Risk assessment: risks to objectives are identified and analysed to decide how to manage them" },
      { ref: "P8", title: "Risk assessment: the possibility of fraud is considered when assessing risks" },
      { ref: "P9", title: "Risk assessment: significant changes that could affect internal control are identified and assessed" },
      { ref: "P10", title: "Control activities: control activities are chosen and developed to bring risks down to acceptable levels" },
      { ref: "P11", title: "Control activities: general controls over technology are chosen and developed" },
      { ref: "P12", title: "Control activities: controls are put in place through policies and the procedures that carry them out" },
      { ref: "P13", title: "Information and communication: relevant, good-quality information supports internal control" },
      { ref: "P14", title: "Information and communication: internal control information is communicated within the organisation" },
      { ref: "P15", title: "Information and communication: matters affecting internal control are communicated with outside parties" },
      { ref: "P16", title: "Monitoring: ongoing and separate evaluations check that controls are present and working" },
      { ref: "P17", title: "Monitoring: deficiencies are assessed and reported in time to those who must act, including the board" },
    ],
  },
];

export type ReqStatus = "gap" | "not_working" | "untested" | "covered" | "na";
export const REQ_STATUS: Record<ReqStatus, { label: string; cls: string }> = {
  gap: { label: "No control", cls: "bg-high-bg text-high-fg" },
  not_working: { label: "Control not working", cls: "bg-[#7A1F17] text-white" },
  untested: { label: "Mapped, not tested", cls: "bg-med-bg text-med-fg" },
  covered: { label: "Covered and tested", cls: "bg-ok-bg text-ok-fg" },
  na: { label: "Not applicable", cls: "bg-line-soft text-ink-500" },
};

/** Where a requirement stands, from the controls mapped to it. */
export function reqStatus(applicable: boolean, controls: { design: string; operating: string }[]): ReqStatus {
  if (!applicable) return "na";
  if (!controls.length) return "gap";
  if (controls.some((c) => c.operating === "ineffective" || c.design === "ineffective")) return "not_working";
  if (controls.some((c) => c.operating === "effective" || c.operating === "effective_exception")) return "covered";
  return "untested";
}
