import clsx from "clsx";
import { Pill, SeverityPill } from "@/components/ui";
import { RATING_PILL, SEVERITY, fmtDate } from "@/lib/format";
import { BAND_PILL, OPERATING_PILL, type Band } from "@/lib/risk";
import type { PackData } from "@/lib/server/committee";

const Section = ({ n, title, children, sub }: { n: number; title: string; children: React.ReactNode; sub?: string }) => (
  <section className="card overflow-hidden">
    <div className="flex flex-wrap items-baseline gap-3 border-b border-line-soft px-5 py-4">
      <span className="font-mono text-[12px] text-ink-400">{String(n).padStart(2, "0")}</span>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {sub && <span className="text-xs text-ink-500">{sub}</span>}
    </div>
    {children}
  </section>
);
const None = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-4 text-sm text-ink-500">{children}</p>;
const Table = ({ head, children, min = 640 }: { head: string[]; children: React.ReactNode; min?: number }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[13px]" style={{ minWidth: min }}>
      <thead className="bg-[#F8FAFB]">
        <tr>
          {head.map((h) => (
            <th key={h} className={clsx("th", h.startsWith(">") && "text-right")}>
              {h.replace(/^>/, "")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
const sevLine = (s: { critical: number; high: number; medium: number; low: number }) => `${s.critical} / ${s.high} / ${s.medium} / ${s.low}`;

/** The committee pack's sections, from live data (draft) or the frozen snapshot (issued). */
export function PackView({ d, summary }: { d: PackData; summary: string | null }) {
  const p = d.plan;
  const pct = p && p.total ? Math.round((p.completed / p.total) * 100) : 0;
  return (
    <>
      <Section n={1} title="Chief Audit Executive's summary">
        {summary ? <p className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-relaxed">{summary}</p> : <None>Not written yet.</None>}
        <div className="grid grid-cols-2 gap-px border-t border-line-soft bg-line-soft sm:grid-cols-4">
          {[
            ["Plan completed", p ? `${pct}%` : "—", p ? `${p.completed} of ${p.total} audits` : "No plan for the year"],
            ["Audits reported", String(d.audits.length), "In this period"],
            ["New findings", String(d.newFindings.total), `${d.newFindings.critical + d.newFindings.high} critical or high`],
            ["Escalated to the committee", String(d.overdue.length), "Overdue or moved twice"],
          ].map(([l, v, s]) => (
            <div key={l} className="bg-white px-5 py-4">
              <p className="text-xs text-ink-500">{l}</p>
              <p className="tabular text-2xl font-semibold">{v}</p>
              <p className="text-xs text-ink-500">{s}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section n={2} title={`Progress against the ${p?.year ?? ""} audit plan`} sub={p ? (p.status === "approved" ? `Approved by ${p.approvedBy}` : "Plan not yet approved") : undefined}>
        {!p ? (
          <None>There is no audit plan for this year.</None>
        ) : (
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex h-6 gap-[2px] overflow-hidden rounded">
              {[
                [p.completed, "#12715B", "Completed"],
                [p.inProgress, "#1F5FAE", "In progress"],
                [p.planned, "#D3DAE2", "Not started"],
                [p.deferred, "#DC6803", "Deferred"],
              ].map(([n, c, l]) => (Number(n) ? <div key={String(l)} title={`${l}: ${n}`} style={{ flex: Number(n), background: String(c) }} /> : null))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              <span>
                <strong className="tabular">{p.completed}</strong> completed
              </span>
              <span>
                <strong className="tabular">{p.inProgress}</strong> in progress
              </span>
              <span>
                <strong className="tabular">{p.planned}</strong> not started
              </span>
              <span>
                <strong className="tabular">{p.deferred}</strong> deferred
              </span>
              {p.cancelled > 0 && (
                <span>
                  <strong className="tabular">{p.cancelled}</strong> cancelled
                </span>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section n={3} title="Audits reported this period">
        {d.audits.length === 0 ? (
          <None>No audits were rated in this period.</None>
        ) : (
          <Table head={["Audit", "Client or unit", "Overall rating", ">Findings (C / H / M / L)"]}>
            {d.audits.map((a) => (
              <tr key={a.code} className="border-t border-line-soft">
                <td className="td">
                  <span className="font-medium">{a.name}</span>
                  <div className="font-mono text-[11px] text-ink-500">{a.code}</div>
                </td>
                <td className="td">{a.client ?? "—"}</td>
                <td className="td">
                  <Pill p={RATING_PILL[a.rating]} />
                </td>
                <td className="td tabular text-right">{sevLine(a.findings)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section n={4} title="Significant open findings" sub="Critical and high">
        {d.significant.length === 0 ? (
          <None>No critical or high findings are open.</None>
        ) : (
          <Table head={["Finding", "Severity", "Owner", "Due", ">Days overdue"]} min={720}>
            {d.significant.map((f) => (
              <tr key={f.code} className="border-t border-line-soft">
                <td className="td">
                  <span className="font-medium">{f.title}</span>
                  <div className="text-[11px] text-ink-500">
                    <span className="font-mono">{f.code}</span> · {f.engagement}
                  </div>
                </td>
                <td className="td">
                  <SeverityPill s={SEVERITY[f.severity]} />
                </td>
                <td className="td">{f.owner ?? "—"}</td>
                <td className="td tabular">{fmtDate(f.due)}</td>
                <td className={clsx("td tabular text-right", f.days > 0 && "font-semibold text-high-fg")}>{f.days || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section n={5} title="Actions escalated to the committee" sub="Long overdue, or the due date moved twice">
        {d.overdue.length === 0 ? (
          <None>Nothing is escalated to the committee.</None>
        ) : (
          <Table head={["Finding", "Owner", "First agreed", "Now due", ">Days overdue", ">Moved", "Management's response"]} min={900}>
            {d.overdue.map((f) => (
              <tr key={f.code} className="border-t border-line-soft align-top">
                <td className="td">
                  <span className="font-medium">{f.title}</span>
                  <div className="text-[11px] text-ink-500">
                    <span className="font-mono">{f.code}</span> · {SEVERITY[f.severity].label}
                  </div>
                </td>
                <td className="td">{f.owner ?? "—"}</td>
                <td className="td tabular">{fmtDate(f.firstDue)}</td>
                <td className="td tabular">{fmtDate(f.due)}</td>
                <td className="td tabular text-right font-semibold text-high-fg">{f.days || "—"}</td>
                <td className="td tabular text-right">{f.moved}</td>
                <td className="td max-w-[280px] text-ink-700">{f.response ?? "No response recorded"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section n={6} title="Top risks in the audit universe">
        {d.topRisks.length === 0 ? (
          <None>The audit universe is empty.</None>
        ) : (
          <Table head={["Area", ">Score", "Inherent", "Residual", "Last audited", "Next due"]} min={720}>
            {d.topRisks.map((r) => (
              <tr key={r.code} className="border-t border-line-soft">
                <td className="td">
                  <span className="font-medium">{r.name}</span>
                  <div className="text-[11px] text-ink-500">
                    <span className="font-mono">{r.code}</span> · {r.unit ?? "Organisation-wide"}
                  </div>
                </td>
                <td className="td tabular text-right">{r.score}</td>
                <td className="td">
                  <Pill p={BAND_PILL[r.band as Band]} />
                </td>
                <td className="td">
                  <Pill p={BAND_PILL[r.residual as Band]} />
                </td>
                <td className="td tabular">{r.lastAudited ? fmtDate(r.lastAudited) : "Never"}</td>
                <td className="td tabular">{r.nextDue ? fmtDate(r.nextDue) : "Now"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section n={7} title="Controls and self-assessment">
        <div className="grid gap-px bg-line-soft sm:grid-cols-3">
          <div className="bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Key controls tested this period</p>
            <p className="tabular text-2xl font-semibold">
              {d.controls.keyTested} <span className="text-base font-normal text-ink-500">of {d.controls.keyTotal}</span>
            </p>
          </div>
          <div className="bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Key controls not working</p>
            <p className={clsx("tabular text-2xl font-semibold", d.controls.ineffective.length && "text-high-fg")}>{d.controls.ineffective.length}</p>
          </div>
          <div className="bg-white px-5 py-4">
            <p className="text-xs text-ink-500">Self-assessment{d.csa ? `: ${d.csa.title}` : ""}</p>
            {d.csa ? (
              <p className="text-[13px]">
                <strong className="tabular text-2xl font-semibold">{d.csa.controls ? Math.round((d.csa.answered / d.csa.controls) * 100) : 0}%</strong> answered · {d.csa.notWorking} not fully working · audit disagreed on {d.csa.disagree}
              </p>
            ) : (
              <p className="text-sm text-ink-500">None run yet</p>
            )}
          </div>
        </div>
        {d.controls.ineffective.length > 0 && (
          <Table head={["Control", "Process", "Design", "Operating"]}>
            {d.controls.ineffective.map((c) => (
              <tr key={c.code} className="border-t border-line-soft">
                <td className="td">
                  <span className="font-mono text-[11px] text-ink-500">{c.code}</span> {c.title}
                </td>
                <td className="td">{c.process}</td>
                <td className="td">{c.design === "ineffective" ? <span className="pill bg-high-bg text-high-fg">Ineffective</span> : "—"}</td>
                <td className="td">
                  <Pill p={OPERATING_PILL[c.operating]} />
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section n={8} title="Resources">
        <p className="px-5 py-4 text-[13px]">
          The team logged <strong className="tabular">{Math.round(d.time.total).toLocaleString("en-US")}</strong> hours in the period, of which <strong className="tabular">{Math.round(d.time.audit).toLocaleString("en-US")}</strong> ({d.time.total ? Math.round((d.time.audit / d.time.total) * 100) : 0}%) on audit work. {d.closedFindings} findings were closed after their fixes were validated.
        </p>
      </Section>
    </>
  );
}
