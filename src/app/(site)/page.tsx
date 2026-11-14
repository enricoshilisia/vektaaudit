import { ArrowRight, BarChart3, Building2, ClipboardCheck, Cpu, Gavel, Globe, Landmark, Leaf, ListChecks, MessageSquareWarning, Presentation, Scale, Search, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, SectionHead, Ticks } from "@/components/Site";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: { absolute: "VektaAudit · Audit management for internal audit and audit firms" },
  description: "Risk-based audit across the whole organisation: audit universe and plan, controls testing, data analytics, IT and compliance audits, findings follow-up and audit committee reporting.",
};

const STEPS = [
  { n: "01", title: "Plan", text: "Rate the risks across your audit universe, build the annual plan and start each audit with a work program." },
  { n: "02", title: "Fieldwork", text: "Auditors test each procedure, request evidence from the client and record what they found." },
  { n: "03", title: "Review", text: "Managers review the work, leave review notes and sign off. Nobody can sign off their own work." },
  { n: "04", title: "Report", text: "Generate the audit report and management letter from the file, and table a committee pack in one click." },
  { n: "05", title: "Follow up", text: "Findings stay open with owners and due dates until the fix is validated and closed." },
];

const FEATURES = [
  { icon: Globe, title: "Audit universe and plan", text: "Every auditable area rated for risk, an annual plan built from it, approved and tracked through the year." },
  { icon: ShieldCheck, title: "Risks, controls and testing", text: "A controls library mapped to risks and requirements, with design and operating tests on real samples." },
  { icon: ListChecks, title: "Work programs and sign-off", text: "Ready-made programs or your own, with preparer and reviewer sign-off and review notes on every step." },
  { icon: BarChart3, title: "Data analytics", text: "Test whole populations of payments, journals and payroll for duplicates, split orders and unusual entries." },
  { icon: MessageSquareWarning, title: "Findings to closure", text: "Risk-rated findings with owners in the business, escalation when they slip, and validation before closing." },
  { icon: Presentation, title: "Audit committee reporting", text: "Committee packs with plan progress, ratings and overdue actions, as PDF or Word, ready to table." },
];

const TYPES = [
  { icon: Settings2, title: "Operational", text: "Procurement, inventory, branches, projects: how the work is done and controlled." },
  { icon: Cpu, title: "IT and cyber", text: "Access reviews with segregation-of-duties rules, change management, backups." },
  { icon: Scale, title: "Compliance", text: "Requirements from laws, regulators and donors, mapped to controls and evidence." },
  { icon: Gavel, title: "Governance and risk", text: "Board oversight, the risk register, policies, conflicts of interest." },
  { icon: Search, title: "Investigations", text: "Whistleblowing reports and suspected fraud, with every step on record." },
  { icon: Leaf, title: "Performance", text: "Whether programmes and projects deliver what they promised, economically." },
  { icon: Sparkles, title: "Advisory and follow-up", text: "Reviews of new systems, and checks that earlier findings were really fixed." },
  { icon: Landmark, title: "Financial statements", text: "For audit firms: trial balance, materiality, lead schedules and the auditor's report." },
];

export default async function Home() {
  const signedIn = !!(await getSession());
  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50 to-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(#1F5FAE0d_1px,transparent_1px),linear-gradient(90deg,#1F5FAE0d_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              For internal audit teams and audit firms
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-navy-950 sm:text-5xl">
              Plan, test, review and report — <span className="text-brand-600">on one audit file.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-500">
              VektaAudit runs risk-based audit across the whole organisation — operations, finance, IT, compliance and governance. The plan, the controls, the testing, the findings and the committee report live in one place, with every sign-off on record.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {signedIn ? (
                <Link href="/dashboard" className="btn-primary h-11 px-6">
                  Open the app <ArrowRight size={16} aria-hidden />
                </Link>
              ) : (
                <>
                  <Link href="/signup" className="btn-primary h-11 px-6">
                    Create your organisation <ArrowRight size={16} aria-hidden />
                  </Link>
                  <Link href="/features" className="btn h-11 px-6">
                    See the features
                  </Link>
                </>
              )}
            </div>
            <p className="mt-4 text-sm text-ink-400">Set up in minutes. No installation.</p>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="How it works" title="Built around how an audit actually runs" intro="Each engagement moves through the same five stages, and the file keeps up with it — so anyone can see where an audit stands." />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-white p-6">
                <span className="font-mono text-sm text-brand-600">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold text-navy-950">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* features */}
      <section className="bg-canvas px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="What's inside" title="Everything the audit file needs" center />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6 transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(11,31,51,0.18)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                  <f.icon size={20} aria-hidden />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-navy-950">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{f.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
              All features <ArrowRight size={15} aria-hidden />
            </Link>
          </p>
        </div>
      </section>

      {/* who it's for */}
      <section id="who" className="scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="Who it's for" title="One system, set up for the way you audit" />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <Audience icon={ClipboardCheck} title="Internal audit" text="Audit the whole organisation: operations, finance, IT, compliance and governance.">
              <Ticks items={["Auditable units instead of clients", "Risk-rated findings with owners in the business", "Follow-up until every fix is validated"]} />
            </Audience>
            <Audience icon={Building2} title="Audit firms" text="Run statutory and assurance audits for many clients.">
              <Ticks items={["A client list with year-ends, frameworks and contacts", "Engagements per client, with a lead, dates and budget hours", "Engagement letters and audit opinions generated for you"]} />
            </Audience>
            <Audience icon={Users} title="Audit committees" text="See the results without changing the work.">
              <Ticks items={["Read-only access for board and committee members", "Open findings by risk, owner and due date", "Reports ready to table at the meeting"]} />
            </Audience>
          </div>
        </div>
      </section>

      {/* every kind of audit */}
      <section className="bg-navy-950 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[1px] text-[#7FB2F0]">Every kind of audit</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-[34px]">One method, whatever you are auditing</h2>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-navy-200">Each engagement has a type, and the file adapts: the work programs it suggests, the report it produces and the tools it opens.</p>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-navy-700 bg-navy-700 sm:grid-cols-2 lg:grid-cols-4">
            {TYPES.map((t) => (
              <li key={t.title} className="bg-navy-900 p-5">
                <t.icon size={20} className="text-[#7FB2F0]" aria-hidden />
                <h3 className="mt-3 font-semibold text-white">{t.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-navy-200">{t.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* trust */}
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 rounded-2xl border border-line p-8 sm:p-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <ShieldCheck size={28} className="text-brand-600" aria-hidden />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-navy-950">Controls an auditor would expect</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-500">An audit system should pass its own audit. Access, approvals and history are built in, not bolted on.</p>
              <Link href="/security" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
                Security and access <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
            <dl className="grid gap-6 sm:grid-cols-2">
              {[
                ["Segregation of duties", "The person who prepared work can't review or sign it off."],
                ["Four roles", "Admin, manager, auditor and viewer — each sees and does only what it should."],
                ["Audit trail", "Every action is logged with the person and the time."],
                ["Separate workspaces", "Each organisation's data is kept apart from every other."],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="font-semibold text-navy-950">{t}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink-500">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <CtaBand signedIn={signedIn} />
    </>
  );
}

function Audience({ icon: Icon, title, text, children }: { icon: typeof Users; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col p-7">
      <Icon size={24} className="text-brand-600" aria-hidden />
      <h3 className="mt-4 text-xl font-semibold text-navy-950">{title}</h3>
      <p className="mt-1.5 text-[15px] text-ink-500">{text}</p>
      <div className="mt-6 border-t border-line-soft pt-6">{children}</div>
    </div>
  );
}

/** A drawn picture of the engagement screen: illustrative, not live data. */
function HeroMock() {
  const procs = [
    ["Supplier master data changes", "Signed off", "bg-ok-bg text-ok-fg"],
    ["Payment approvals vs delegation", "In review", "bg-brand-100 text-brand-700"],
    ["ERP access review", "In progress", "bg-med-bg text-med-fg"],
    ["Duplicate payments analytics", "Not started", "bg-canvas text-ink-500"],
  ];
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 rounded-[28px] bg-brand-600/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-30px_rgba(11,31,51,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 truncate font-mono text-[11px] text-ink-400">ENG-2027-014 · Procurement audit</span>
        </div>
        <div className="flex">
          <div className="hidden w-14 flex-none flex-col items-center gap-3 bg-navy-950 py-4 sm:flex">
            <span className="h-7 w-7 rounded-md bg-brand-600" />
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i === 1 ? "bg-[#7FB2F0]" : "bg-navy-700"}`} />
            ))}
          </div>
          <div className="min-w-0 flex-1 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-400">Auditable unit</p>
                <p className="font-semibold text-navy-950">Group procurement</p>
              </div>
              <span className="pill bg-violet-bg text-violet-fg">Fieldwork</span>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-ink-500">
                <span>Work program</span>
                <span className="tabular">18 of 32 signed off</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="h-full w-[56%] rounded-full bg-brand-600" />
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line-soft rounded-lg border border-line">
              {procs.map(([name, status, cls]) => (
                <li key={name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                  <span className="truncate text-ink-700">{name}</span>
                  <span className={`pill ${cls}`}>{status}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["3", "Open findings", "text-high-fg"],
                ["5", "Evidence due", "text-med-fg"],
                ["2", "Review notes", "text-brand-700"],
              ].map(([n, l, c]) => (
                <div key={l} className="rounded-lg bg-canvas px-2 py-2.5">
                  <p className={`text-xl font-semibold tabular ${c}`}>{n}</p>
                  <p className="text-[11px] text-ink-500">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-4 -top-6 hidden rounded-xl border border-line bg-white px-4 py-3 shadow-lg sm:block">
        <p className="flex items-center gap-2 text-[13px] font-medium text-navy-950">
          <span className="h-2 w-2 rounded-full bg-ok-dot" /> Reviewer sign-off recorded
        </p>
        <p className="mt-0.5 text-[11px] text-ink-400">Payment approvals vs delegation · just now</p>
      </div>
    </div>
  );
}
