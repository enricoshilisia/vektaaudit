import { BarChart3, Briefcase, FileSignature, FileStack, Landmark, ListChecks, MessageSquareWarning, ScrollText, Search, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, SectionHead, Ticks } from "@/components/Site";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Features",
  description: "Engagements, work programs, evidence requests, findings, trial balance, document generation and the audit trail in VektaAudit.",
};

const GROUPS = [
  {
    icon: Briefcase,
    title: "Clients and engagements",
    text: "Keep every client and every audit in one list.",
    items: ["Client records with industry, year-end, reporting framework, registration and tax numbers and contacts", "Engagements numbered automatically, with type, lead, dates and budget hours", "Phases from planning through fieldwork, review and reporting to closed", "Internal audit teams work with auditable units instead of clients"],
  },
  {
    icon: ListChecks,
    title: "Work programs",
    text: "The procedures behind every conclusion.",
    items: ["Procedures grouped by area, each with its own status", "Preparer sign-off, then reviewer sign-off", "The preparer can never be the reviewer", "Review notes raised, answered and resolved on the procedure"],
  },
  {
    icon: FileStack,
    title: "Evidence requests",
    text: "Stop chasing documents by email.",
    items: ["Requests with a description and a due date", "The client answers through a secure link, without creating an account", "Uploaded files go straight into the engagement", "Accept the evidence or ask for more information"],
  },
  {
    icon: MessageSquareWarning,
    title: "Findings",
    text: "From what you found to proof that it was fixed.",
    items: ["Condition, criteria, cause, effect and recommendation", "Risk rating, owner, management response and due date", "Remediation, validation and closure, with a history of every step", "Export the findings register to CSV"],
  },
  {
    icon: Landmark,
    title: "Trial balance and materiality",
    text: "The numbers side of a financial statement audit.",
    items: ["Import the trial balance from a CSV file, with prior-year figures", "Map accounts to lead schedules and check the totals tie", "Overall, performance and clearly trivial materiality", "Large movements and balances above materiality flagged for attention"],
  },
  {
    icon: Upload,
    title: "Documents",
    text: "The working papers, versioned.",
    items: ["Upload working papers and evidence to the engagement", "New uploads of the same document become a new version", "Documents marked as reviewed by a manager", "Everything searchable from one box"],
  },
  {
    icon: FileSignature,
    title: "Generated letters and reports",
    text: "Drafts that write themselves from the file.",
    items: ["Engagement letter, bank confirmation request and management representation letter", "Management letter, independent auditor's report and internal audit report", "Summary financial statements from the mapped trial balance", "Audit opinion selected on the engagement", "Download as PDF or Word to finish and sign"],
  },
  {
    icon: BarChart3,
    title: "Dashboard and insights",
    text: "Where every audit stands, at a glance.",
    items: ["Open engagements by phase and progress", "Overdue evidence and findings highlighted", "Findings by risk across all clients", "A getting-started checklist for new organisations"],
  },
  {
    icon: Users,
    title: "Team and access",
    text: "Invite people and decide what they can do.",
    items: ["Admin, manager, auditor and viewer roles", "Invitations by link, valid for a limited time", "Role changes and deactivation take effect immediately", "Read-only access for audit committees"],
  },
  {
    icon: ScrollText,
    title: "Audit trail",
    text: "A record that holds up to scrutiny.",
    items: ["Every sign-off, upload, change and decision logged", "Who did it and when, on one activity page", "History kept on each finding from raised to closed"],
  },
  {
    icon: Search,
    title: "Search",
    text: "Find anything in the file.",
    items: ["One search across engagements, findings, clients and documents", "Filters on the main lists"],
  },
];

export default async function Features() {
  const signedIn = !!(await getSession());
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="Features" title="What VektaAudit does" intro="Everything below is in the product today, for audit firms and internal audit teams alike." />
        </div>
      </section>
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="card p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                  <g.icon size={20} aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-navy-950">{g.title}</h2>
                  <p className="text-sm text-ink-500">{g.text}</p>
                </div>
              </div>
              <div className="mt-5 border-t border-line-soft pt-5">
                <Ticks items={g.items} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBand signedIn={signedIn} />
    </>
  );
}
