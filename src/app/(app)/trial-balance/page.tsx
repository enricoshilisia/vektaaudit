import clsx from "clsx";
import { AlertTriangle, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill, Tabs } from "@/components/ui";
import { LEAD_PILL, RISK_PILL, fmtAmount, fmtDate, fmtDateTime, fmtShort } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { movement, tbFlags } from "@/lib/server/insights";
import { addLead, importTb, setMateriality, updateLead } from "./actions";

export const metadata: Metadata = { title: "Trial balance" };

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ engagement?: string; section?: string }> }) {
  const s = await requireUser();
  const q = await searchParams;
  const engagements = await db.engagement.findMany({ where: { orgId: s.org, kind: "financial" }, orderBy: [{ phase: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, client: { select: { name: true } } } });
  const id = q.engagement ?? engagements[0]?.id;
  const e = id
    ? await db.engagement.findFirst({ where: { id, orgId: s.org, kind: "financial" }, include: { client: true, leadsTb: { orderBy: { sort: "asc" } }, tbLines: { orderBy: { account: "asc" } } } })
    : null;
  const section = q.section === "is" ? "is" : q.section === "unmapped" ? "unmapped" : "bs";
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { currency: true } });

  const picker = (
    <form className="flex items-center gap-2">
      <label htmlFor="engagement" className="sr-only">
        Engagement
      </label>
      <select id="engagement" name="engagement" defaultValue={id ?? ""} className="input w-auto min-w-[260px]">
        {engagements.map((x) => (
          <option key={x.id} value={x.id}>
            {x.client?.name ?? x.code} · {x.name}
          </option>
        ))}
      </select>
      <button className="btn">Open</button>
    </form>
  );

  if (!e)
    return (
      <>
        <PageHeader title="Trial balance & lead schedules" actions={engagements.length ? picker : undefined} />
        <div className="card">
          <Empty title="No financial-audit engagements">
            Create an engagement of type <strong>Financial audit</strong> to import a trial balance.
          </Empty>
        </div>
      </>
    );

  const flags = await tbFlags(s.org, e.id);
  const flagged = new Set(flags.map((f) => f.code));
  const leads = e.leadsTb.map((l) => {
    const lines = e.tbLines.filter((t) => t.leadCode === l.code);
    const py = lines.reduce((n, t) => n + t.prior, 0n);
    const cy = lines.reduce((n, t) => n + t.current, 0n);
    const change = movement(py, cy);
    return { ...l, py, cy, change, accounts: lines.length };
  });
  const codes = new Set(e.leadsTb.map((l) => l.code));
  const unmapped = e.tbLines.filter((t) => !t.leadCode || !codes.has(t.leadCode));
  const sum = (k: "prior" | "current") => e.tbLines.reduce((n, t) => n + t[k], 0n);
  const diff = sum("current");
  const shown = leads.filter((l) => l.section === section);
  const base = `/trial-balance?engagement=${e.id}`;

  return (
    <>
      <PageHeader
        eyebrow={`${e.client?.name ?? e.code} · ${e.name}`}
        title="Trial balance & lead schedules"
        sub={e.tbImportedAt ? `Imported from ${e.tbSource ?? "CSV"} · ${fmtDateTime(e.tbImportedAt)} · ${e.tbLines.length} accounts` : "No trial balance imported yet"}
        actions={
          <>
            {engagements.length > 1 && picker}
            <Link href={`/reports?engagement=${e.id}&template=financial-statements`} className="btn-primary">
              Generate financial statements
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <section className="card flex flex-col gap-3 px-5 py-[18px]">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Materiality</h2>
            <span className="text-xs text-ink-500">{e.materialityBasis ?? "Not set"}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Overall", e.materiality],
              ["Performance", e.performanceMat],
              ["Clearly trivial", e.trivialMat],
            ].map(([label, v]) => (
              <div key={String(label)} className="flex flex-col gap-0.5">
                <span className="text-xs text-ink-500">{String(label)}</span>
                <span className="tabular text-xl font-semibold">{fmtShort(v as bigint | null)}</span>
              </div>
            ))}
          </div>
          {can(s, "manage") && (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-medium text-brand-600">{e.materiality ? "Change" : "Set materiality"}</summary>
              <form action={setMateriality.bind(null, e.id)} className="mt-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label htmlFor="basis" className="label">
                    Benchmark
                  </label>
                  <input id="basis" name="basis" required defaultValue={e.materialityBasis ?? "1% of revenue"} className="input" />
                </div>
                <div className="col-span-2">
                  <label htmlFor="overall" className="label">
                    Overall materiality ({org.currency})
                  </label>
                  <input id="overall" name="overall" required inputMode="numeric" defaultValue={e.materiality ? String(e.materiality) : ""} className="input" />
                </div>
                <div>
                  <label htmlFor="performancePct" className="label">
                    Performance, % of overall
                  </label>
                  <input id="performancePct" name="performancePct" type="number" step="0.5" defaultValue={75} className="input" />
                </div>
                <div>
                  <label htmlFor="trivialPct" className="label">
                    Trivial, % of overall
                  </label>
                  <input id="trivialPct" name="trivialPct" type="number" step="0.5" defaultValue={5} className="input" />
                </div>
                <button className="btn btn-sm col-span-2 justify-self-start">Save</button>
              </form>
            </details>
          )}
          <p className="text-xs text-ink-500">All amounts {org.currency}</p>
        </section>

        <section className="card flex flex-col gap-3 px-5 py-[18px]">
          <h2 className="text-[15px] font-semibold">Checks</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            <li className={clsx("flex items-center justify-between gap-2", diff === 0n ? "text-ok-fg" : "text-high-fg")}>
              <span>Trial balance balances</span>
              <span className="tabular font-medium">{e.tbLines.length ? (diff === 0n ? "Difference 0" : `Off by ${fmtAmount(diff)}`) : "—"}</span>
            </li>
            <li className={clsx("flex items-center justify-between gap-2", unmapped.length ? "text-med-fg" : "text-ok-fg")}>
              <span>Accounts mapped to a lead schedule</span>
              <span className="tabular font-medium">
                {e.tbLines.length - unmapped.length} / {e.tbLines.length}
              </span>
            </li>
            <li className={clsx("flex items-center justify-between gap-2", flags.length ? "text-med-fg" : "text-ok-fg")}>
              <span>Large movements above performance materiality</span>
              <span className="tabular font-medium">{flags.length}</span>
            </li>
          </ul>
          {can(s, "manage") && (
            <form action={importTb.bind(null, e.id)} className="mt-auto flex flex-col gap-2 border-t border-line-soft pt-3">
              <label htmlFor="file" className="label mb-0">
                Import trial balance (CSV: account, name, lead, prior, current)
              </label>
              <input id="file" name="file" type="file" accept=".csv,text/csv" required className="text-xs" />
              <div className="flex gap-2">
                <input name="source" className="input h-9" placeholder="Source, e.g. Sage 300" aria-label="Source system" />
                <button className="btn h-9">
                  <Upload size={14} aria-hidden />
                  Import
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-2.5 rounded-xl bg-navy-950 px-5 py-[18px] text-[#E6ECF2]">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <AlertTriangle size={17} className="text-[#7FB2F0]" aria-hidden />
            Analytical review
          </h2>
          {flags.length === 0 ? (
            <p className="text-[13px] text-navy-200">{e.tbLines.length ? "No lead schedule moved by more than 25% and above performance materiality." : "Import a trial balance to see movements."}</p>
          ) : (
            flags.map((f) => (
              <p key={f.code} className="text-[13px] leading-relaxed">
                <span className="font-mono text-white">{f.code}</span> · {f.text.replace(/^[^:]+: /, "")} Plan extra procedures for this area.
              </p>
            ))
          )}
        </section>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 pt-3">
          <h2 className="pb-3 text-base font-semibold">Lead schedules</h2>
          <Tabs
            active={section}
            tabs={[
              { key: "bs", label: "Financial position", href: base },
              { key: "is", label: "Profit or loss", href: `${base}&section=is` },
              { key: "unmapped", label: "Unmapped accounts", href: `${base}&section=unmapped`, n: unmapped.length },
            ]}
          />
        </div>
        {section === "unmapped" ? (
          unmapped.length === 0 ? (
            <Empty title="Every account is mapped" />
          ) : (
            <table className="w-full text-[13px]">
              <tbody>
                {unmapped.map((t) => (
                  <tr key={t.id} className="border-t border-line-soft first:border-t-0">
                    <td className="td font-mono text-xs">{t.account}</td>
                    <td className="td">{t.name}</td>
                    <td className="td text-ink-500">{t.leadCode ? `Unknown lead “${t.leadCode}”` : "No lead"}</td>
                    <td className="td tabular text-right">{fmtAmount(t.current)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th w-14">Lead</th>
                  <th className="th">Line item</th>
                  <th className="th text-right">Prior year</th>
                  <th className="th text-right">Current year</th>
                  <th className="th text-right">Change</th>
                  <th className="th">Risk · status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id} className="border-t border-line-soft">
                    <td className="td font-mono text-xs text-ink-700">{l.code}</td>
                    <td className="td">
                      <span className="font-medium">{l.name}</span>
                      <div className="text-[11px] text-ink-500">
                        {l.accounts} {l.accounts === 1 ? "account" : "accounts"}
                      </div>
                    </td>
                    <td className="td tabular text-right text-ink-500">{fmtAmount(l.py)}</td>
                    <td className="td tabular text-right font-medium">{fmtAmount(l.cy)}</td>
                    <td className={clsx("td tabular text-right", flagged.has(l.code) && "font-semibold text-high-dot")}>{l.change === null ? "—" : `${l.change > 0 ? "+" : ""}${(l.change * 100).toFixed(1)}%`}</td>
                    <td className="td">
                      {can(s, "work") ? (
                        <form action={updateLead.bind(null, l.id)} className="flex flex-wrap items-center gap-1.5">
                          <select name="risk" defaultValue={l.risk} aria-label={`Risk for ${l.name}`} className="input h-8 w-auto py-0 text-xs">
                            {Object.entries(RISK_PILL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                          <select name="status" defaultValue={l.status} aria-label={`Status for ${l.name}`} className="input h-8 w-auto py-0 text-xs">
                            {Object.entries(LEAD_PILL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm h-8">Save</button>
                        </form>
                      ) : (
                        <span className="flex gap-1.5">
                          <Pill p={RISK_PILL[l.risk]} />
                          <Pill p={LEAD_PILL[l.status]} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line-strong bg-[#F8FAFB]">
                  <td className="td" />
                  <td className="td font-semibold">{section === "bs" ? "Net of balance-sheet lines (= profit not yet in equity)" : "Profit / (loss) before tax"}</td>
                  <td className="td tabular text-right text-ink-500">{fmtAmount(shown.reduce((n, l) => n + l.py, 0n) * (section === "is" ? -1n : 1n))}</td>
                  <td className="td tabular text-right font-semibold">{fmtAmount(shown.reduce((n, l) => n + l.cy, 0n) * (section === "is" ? -1n : 1n))}</td>
                  <td className="td" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {can(s, "manage") && section !== "unmapped" && (
          <form action={addLead.bind(null, e.id)} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3">
            <input type="hidden" name="section" value={section} />
            <input name="code" required maxLength={4} className="input h-9 w-20" placeholder="Code" aria-label="Lead code" />
            <input name="name" required className="input h-9 max-w-xs" placeholder="New lead schedule" aria-label="Lead name" />
            <button className="btn h-9">Add</button>
          </form>
        )}
      </section>
      <p className="text-xs text-ink-500">Debits are positive, credits in brackets. Period ended {fmtDate(e.periodEnd)}.</p>
    </>
  );
}
