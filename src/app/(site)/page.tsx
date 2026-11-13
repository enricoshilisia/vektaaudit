import { ArrowRight, Building2, ClipboardCheck, FileSignature, FileStack, Landmark, ListChecks, MessageSquareWarning, ScrollText, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, SectionHead, Ticks } from "@/components/Site";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: { absolute: "VektaAudit · Audit management for firms and internal audit" },
  description: "Plan, test, review and report on one audit file. Work programs with sign-off, evidence requests, findings tracking, trial balance and generated reports.",
};

const STEPS = [
  { n: "01", title: "Plan", text: "Open an engagement for a client, set the scope, lead, dates and materiality, and load a work program." },
  { n: "02", title: "Fieldwork", text: "Auditors test each procedure, request evidence from the client and record what they found." },
  { n: "03", title: "Review", text: "Managers review the work, leave review notes and sign off. Nobody can sign off their own work." },
  { n: "04", title: "Report", text: "Generate the engagement letter, management letter and audit report straight from the file." },
  { n: "05", title: "Follow up", text: "Findings stay open with owners and due dates until the fix is validated and closed." },
];

const FEATURES = [
  { icon: ListChecks, title: "Work programs and sign-off", text: "Procedures with preparer and reviewer sign-off, review notes and a clear status on every step." },
  { icon: MessageSquareWarning, title: "Findings to closure", text: "Condition, cause, effect and recommendation, a risk rating, an owner and a due date, tracked until validated." },
  { icon: FileStack, title: "Evidence requests", text: "Ask the client for documents with a due date. They upload through a secure link, without an account." },
  { icon: Landmark, title: "Trial balance and materiality", text: "Import the trial balance, map accounts to lead schedules, set materiality and see unusual movements flagged." },
  { icon: FileSignature, title: "Generated documents", text: "Engagement letters, confirmations, representation letters, management letters and audit reports as PDF or Word." },
  { icon: ScrollText, title: "Complete audit trail", text: "Every sign-off, upload, change and decision is recorded with who did it and when." },
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
              For audit firms and internal audit teams
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-navy-950 sm:text-5xl">
              Plan, test, review and report — <span className="text-brand-600">on one audit file.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-500">
              VektaAudit replaces the spreadsheets, email threads and shared folders behind an audit. Work programs, evidence, findings, the trial balance and the final report live in one place, with every sign-off on record.
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
            <Audience icon={Building2} title="Audit firms" text="Run statutory and assurance audits for many clients.">
              <Ticks items={["A client list with year-ends, frameworks and contacts", "Engagements per client, with a lead, dates and budget hours", "Engagement letters and audit opinions generated for you"]} />
            </Audience>
            <Audience icon={ClipboardCheck} title="Internal audit" text="Audit your own organisation's departments and processes.">
              <Ticks items={["Auditable units instead of clients", "Risk-rated findings with owners in the business", "Follow-up until every fix is validated"]} />
            </Audience>
            <Audience icon={Users} title="Audit committees" text="See the results without changing the work.">
              <Ticks items={["Read-only access for board and committee members", "Open findings by risk, owner and due date", "Reports ready to table at the meeting"]} />
            </Audience>
          </div>
        </div>
      </section>

      {/* accounting audit */}
      <section className="bg-navy-950 px-4 py-20 sm:px-6">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[1px] text-[#7FB2F0]">Financial statement audits</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-[34px]">From the trial balance to the opinion</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-navy-200">Import the client&apos;s trial balance as a CSV file, compare it with last year and let the system point you to what deserves a closer look.</p>
            <div className="mt-8">
              <Ticks dark items={["Accounts mapped to lead schedules, with totals that tie", "Overall, performance and trivial materiality on the engagement", "Large movements and balances above materiality flagged automatically", "Audit opinion chosen and the report generated from the file"]} />
            </div>
          </div>
          <TbMock />
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
    ["Revenue cut-off testing", "Signed off", "bg-ok-bg text-ok-fg"],
    ["Bank reconciliations", "In review", "bg-brand-100 text-brand-700"],
    ["Inventory count attendance", "In progress", "bg-med-bg text-med-fg"],
    ["Payroll analytical review", "Not started", "bg-canvas text-ink-500"],
  ];
  return (
    <div aria-hidden className="relative">
      <div className="absolute -inset-6 rounded-[28px] bg-brand-600/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-30px_rgba(11,31,51,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="ml-3 truncate font-mono text-[11px] text-ink-400">ENG-2026-014 · Statutory audit FY2026</span>
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-ink-400">Client</p>
                <p className="font-semibold text-navy-950">Example Manufacturing Ltd</p>
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
        <p className="mt-0.5 text-[11px] text-ink-400">Bank reconciliations · just now</p>
      </div>
    </div>
  );
}

/** A drawn picture of a lead schedule: illustrative figures. */
function TbMock() {
  const rows = [
    ["Revenue", "84,210", "96,540", "+15%", false],
    ["Cost of sales", "51,300", "58,120", "+13%", false],
    ["Trade receivables", "12,480", "19,870", "+59%", true],
    ["Inventory", "9,940", "10,310", "+4%", false],
    ["Trade payables", "7,620", "7,980", "+5%", false],
  ] as const;
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-navy-700 bg-navy-900">
      <div className="flex items-center justify-between border-b border-navy-700 px-5 py-3.5">
        <p className="text-sm font-semibold text-white">Lead schedule · FY2026</p>
        <p className="font-mono text-[11px] text-navy-300">Materiality 2,400</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.5px] text-navy-300">
              <th className="px-5 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 text-right font-medium">Prior</th>
              <th className="px-3 py-2.5 text-right font-medium">Current</th>
              <th className="px-5 py-2.5 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map(([a, py, cy, ch, flag]) => (
              <tr key={a} className={`border-t border-navy-800 ${flag ? "bg-[#F9706614]" : ""}`}>
                <td className="px-5 py-2.5 text-navy-200">
                  {a}
                  {flag && <span className="ml-2 rounded bg-[#F9706633] px-1.5 py-0.5 text-[10px] font-semibold text-[#FDA29B]">Look at this</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-navy-300">{py}</td>
                <td className="px-3 py-2.5 text-right text-white">{cy}</td>
                <td className={`px-5 py-2.5 text-right ${flag ? "text-[#FDA29B]" : "text-navy-200"}`}>{ch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-navy-700 px-5 py-3 text-[12px] text-navy-300">Trial balance balanced · 5 accounts mapped · 1 flag</p>
    </div>
  );
}
