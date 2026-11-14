import { BarChart3, Briefcase, CalendarClock, ClipboardCheck, FileStack, Globe, Landmark, Lock, Mail, MessageSquareWarning, Presentation, Scale, Server, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, SectionHead, Ticks } from "@/components/Site";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Features",
  description: "Audit universe and plan, controls testing, data analytics, IT and compliance audits, findings follow-up, committee reporting, Microsoft 365 and Vekta AI in VektaAudit.",
};

const GROUPS = [
  {
    icon: Globe,
    title: "Audit universe and annual plan",
    text: "Audit where the risk is.",
    items: ["Every auditable area with an owner, impact and likelihood", "Audit cycles from the risk rating, with overdue areas shown", "An annual plan built from the universe, submitted and approved", "Planned audits started as engagements, and closed back into the plan"],
  },
  {
    icon: ShieldCheck,
    title: "Risks, controls and testing",
    text: "A controls library the whole team works from.",
    items: ["Risks and controls linked, with key controls marked", "Controls mapped to compliance requirements", "Design and operating effectiveness tests with sample sizes by frequency", "Sample results recorded and the conclusion drawn from them"],
  },
  {
    icon: Briefcase,
    title: "Engagements and work programs",
    text: "Each audit typed, scoped and staffed.",
    items: ["Operational, financial controls, IT, compliance, governance, performance, investigation, advisory, follow-up and financial statement audits", "Ten standard work programs, suggested by the type of audit, plus your own saved programs", "Preparer and reviewer sign-off; the preparer can never be the reviewer", "Review notes raised, answered and resolved on the procedure"],
  },
  {
    icon: FileStack,
    title: "Evidence and documents",
    text: "Stop chasing documents by email.",
    items: ["Evidence requests with due dates, answered through a secure link without an account", "Working papers versioned and marked as reviewed", "Files filed in SharePoint when Microsoft 365 is connected", "Everything searchable from one box"],
  },
  {
    icon: MessageSquareWarning,
    title: "Findings and follow-up",
    text: "From what you found to proof that it was fixed.",
    items: ["Condition, criteria, cause, effect and recommendation, with a risk rating", "Owners in the business, management responses and due dates", "Escalation when actions slip, and every due-date change recorded", "Ageing across the organisation and validation before closure"],
  },
  {
    icon: ClipboardCheck,
    title: "Control self-assessment",
    text: "Let the business assess its own controls.",
    items: ["Campaigns sent to control owners through a secure link", "Answers with evidence attached", "Auditors validate each answer before relying on it"],
  },
  {
    icon: BarChart3,
    title: "Data analytics",
    text: "Test the whole population, not a sample.",
    items: ["Payments, journals and payroll imported from CSV", "Duplicates, split purchases, weekend and holiday postings, round amounts and Benford's law", "Suppliers paid into staff bank accounts", "Exceptions reviewed, explained and raised as findings"],
  },
  {
    icon: Server,
    title: "IT audit and access reviews",
    text: "Who can do what in your systems.",
    items: ["A register of key systems and their owners", "Segregation-of-duties rules checked against user lists", "Access reviews sent to system owners to keep or remove each account", "Conflicting roles and long-unused accounts flagged automatically"],
  },
  {
    icon: Scale,
    title: "Compliance",
    text: "Know which obligations are covered.",
    items: ["Frameworks and their requirements, with starters for data protection and internal control", "Requirements mapped to controls and their test results", "Coverage and gaps shown for each framework"],
  },
  {
    icon: Presentation,
    title: "Audit committee",
    text: "Reports ready to table.",
    items: ["Committee packs with plan progress, audit ratings and overdue actions", "Download as PDF or Word", "Read-only access for committee members"],
  },
  {
    icon: CalendarClock,
    title: "Resources, time and quality",
    text: "Run the audit function, not just the audits.",
    items: ["Staff bookings across audits, leave and training, with clashes shown", "Timesheets against budget hours", "Quality reviews of completed files and conformance with standards"],
  },
  {
    icon: Mail,
    title: "Microsoft 365",
    text: "Work where your organisation already works.",
    items: ["Sign in with Microsoft", "Requests and reminders sent from your Outlook mailbox", "Audit bookings in Outlook calendars", "Updates posted to a Teams channel and files kept in SharePoint"],
  },
  {
    icon: Sparkles,
    title: "Vekta AI",
    text: "Drafts for the auditor to check and finish.",
    items: ["A finding drafted from rough notes", "Controls suggested for a risk", "Evidence summarised, with what is worth checking", "Analytics exceptions explained, and test conclusions drafted from the samples"],
  },
  {
    icon: Landmark,
    title: "Financial statement audits",
    text: "For audit firms giving an opinion on the accounts.",
    items: ["Trial balance imported with prior-year figures and mapped to lead schedules", "Overall, performance and clearly trivial materiality", "Large movements above materiality flagged", "Engagement, confirmation and representation letters and the auditor's report"],
  },
  {
    icon: Lock,
    title: "Security and records",
    text: "An audit system that passes its own audit.",
    items: ["Admin, manager, auditor and viewer roles, and time-limited guest access for external auditors and regulators", "Two-step sign-in, required for everyone if you choose", "Closed files lock; retention periods and legal holds", "Every action in the audit trail, and a read-only API for reporting tools"],
  },
];

export default async function Features() {
  const signedIn = !!(await getSession());
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="Features" title="What VektaAudit does" intro="Everything below is in the product today, for internal audit teams in large organisations and for audit firms." />
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
