import clsx from "clsx";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { clientWord, fmtDate } from "@/lib/format";
import { BAND_HEAT, BAND_ORDER, BAND_PILL, IMPACT, LIKELIHOOD, band, controlEnv, nextDue, residual, type Band } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Audit universe" };

type Search = { band?: string; client?: string; i?: string; l?: string; q?: string; due?: string };

export default async function UniversePage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireUser();
  const sp = await searchParams;
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } });
  const word = clientWord(org.kind);
  const [all, clients] = await Promise.all([
    db.auditableEntity.findMany({
      where: { orgId: s.org, archivedAt: null },
      include: { client: { select: { name: true } }, planItems: { where: { status: { in: ["planned", "in_progress"] } }, include: { plan: { select: { year: true } } } } },
      orderBy: { code: "asc" },
    }),
    db.client.findMany({ where: { orgId: s.org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const rows = all
    .map((e) => {
      const score = e.impact * e.likelihood;
      const due = nextDue(e.lastAuditedAt, e.cycleMonths);
      return { ...e, score, inherent: band(score), resid: residual(e.impact, e.likelihood, e.controlEnv), due, overdue: due < now, planned: e.planItems[0]?.plan.year ?? null };
    })
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  const term = (sp.q ?? "").trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!sp.band || r.inherent === sp.band) &&
      (!sp.client || (sp.client === "org" ? !r.clientId : r.clientId === sp.client)) &&
      (!sp.i || r.impact === Number(sp.i)) &&
      (!sp.l || r.likelihood === Number(sp.l)) &&
      (!sp.due || (r.due <= yearEnd && !r.planned)) &&
      (!term || `${r.code} ${r.name} ${r.owner ?? ""} ${r.category ?? ""}`.toLowerCase().includes(term)),
  );

  const count = (b: Band) => rows.filter((r) => r.inherent === b).length;
  const dueUnplanned = rows.filter((r) => r.due <= yearEnd && !r.planned);
  const never = rows.filter((r) => !r.lastAuditedAt);
  const covered = rows.filter((r) => r.lastAuditedAt && r.lastAuditedAt >= new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())).length;

  // heat map: rows likelihood 5→1, columns impact 1→5
  const cell = (i: number, l: number) => rows.filter((r) => r.impact === i && r.likelihood === l).length;
  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    const str = p.toString();
    return str ? `/universe?${str}` : "/universe";
  };
  const filtered = Object.values(sp).some(Boolean);

  return (
    <>
      <PageHeader
        title="Audit universe"
        sub="Everything that could be audited, scored for inherent risk. The scores set how often each area is audited and feed the annual plan."
        actions={
          can(s, "manage") && (
            <Link href="/universe/new" className="btn-primary">
              <Plus size={16} aria-hidden />
              Add auditable entity
            </Link>
          )
        }
      />

      {rows.length === 0 ? (
        <section className="card">
          <Empty title="Your audit universe is empty">
            List the processes, functions, systems and locations you could audit, and score each for risk. The annual plan is built from this list.
            {can(s, "manage") && (
              <div className="mt-4">
                <Link href="/universe/new" className="btn-primary">
                  Add the first one
                </Link>
              </div>
            )}
          </Empty>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Auditable entities" value={rows.length} sub={`${new Set(rows.map((r) => r.clientId ?? "org")).size} ${word.many.toLowerCase()} or organisation-wide`} />
            <Stat label="Critical inherent risk" value={count("critical")} sub="Usually audited every year" tone={count("critical") ? "red" : undefined} />
            <Stat label="High inherent risk" value={count("high")} sub="At least every 2 years" tone={count("high") ? "amber" : undefined} />
            <Stat label="Audited in the last 3 years" value={`${Math.round((covered / rows.length) * 100)}%`} sub={`${covered} of ${rows.length}`} />
            <Stat label="Due this year, not planned" value={dueUnplanned.length} sub={`${never.length} never audited`} tone={dueUnplanned.length ? "red" : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <section className="card p-5">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">Inherent risk heat map</h2>
                <span className="text-xs text-ink-500">Click a square to filter</span>
              </div>
              <div className="grid grid-cols-[84px_repeat(5,minmax(0,1fr))] gap-1 text-xs">
                {[5, 4, 3, 2, 1].map((l) => (
                  <div key={l} className="contents">
                    <div className="flex items-center justify-end pr-2 text-right text-ink-500">{LIKELIHOOD[l - 1]}</div>
                    {[1, 2, 3, 4, 5].map((i) => {
                      const n = cell(i, l);
                      const on = sp.i === String(i) && sp.l === String(l);
                      return (
                        <Link
                          key={i}
                          href={on ? q({ i: undefined, l: undefined }) : q({ i: String(i), l: String(l) })}
                          title={`${LIKELIHOOD[l - 1]} × ${IMPACT[i - 1]}: ${n} (score ${i * l})`}
                          className={clsx("tabular flex aspect-[1.5] items-center justify-center rounded-md text-[15px] font-semibold text-ink", on && "ring-2 ring-navy-950")}
                          style={{ background: BAND_HEAT[band(i * l)] }}
                        >
                          {n || ""}
                        </Link>
                      );
                    })}
                  </div>
                ))}
                <div />
                {IMPACT.map((x) => (
                  <div key={x} className="pt-1 text-center text-ink-500">
                    {x}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-ink-400">
                <span>↑ Likelihood</span>
                <span>Impact →</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                {BAND_ORDER.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px]" style={{ background: BAND_HEAT[b] }} />
                    {BAND_PILL[b].label}
                  </span>
                ))}
              </div>
            </section>

            <section className="card flex flex-col">
              <div className="border-b border-line-soft px-5 py-4">
                <h2 className="text-[15px] font-semibold">Due this year and not in a plan</h2>
                <p className="text-xs text-ink-500">Based on each area&apos;s cycle and when it was last audited.</p>
              </div>
              {dueUnplanned.length === 0 ? (
                <Empty title="Everything due this year is planned" />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {dueUnplanned.slice(0, 6).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                      <Pill p={BAND_PILL[r.inherent]} />
                      <Link href={`/universe/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand-700">
                        {r.name}
                      </Link>
                      <span className={clsx("whitespace-nowrap text-xs", r.overdue ? "text-high-fg" : "text-ink-500")}>{r.lastAuditedAt ? `Due ${fmtDate(r.due)}` : "Never audited"}</span>
                    </li>
                  ))}
                </ul>
              )}
              {dueUnplanned.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-3 border-t border-line-soft px-5 py-3 text-[13px]">
                  {dueUnplanned.length > 6 && <Link href={q({ due: "1" })}>See all {dueUnplanned.length}</Link>}
                  <Link href="/plan" className="font-medium">
                    Go to the audit plan →
                  </Link>
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href={q({ band: undefined })} className={chip(!sp.band)}>
              All risks
            </Link>
            {BAND_ORDER.map((b) => (
              <Link key={b} href={q({ band: b })} className={chip(sp.band === b)}>
                {BAND_PILL[b].label}
              </Link>
            ))}
            <form className="ml-auto flex flex-wrap gap-2">
              {Object.entries(sp)
                .filter(([k, v]) => v && k !== "client" && k !== "q")
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <label htmlFor="uclient" className="sr-only">
                {word.one}
              </label>
              <select id="uclient" name="client" defaultValue={sp.client ?? ""} className="input h-9 w-48">
                <option value="">All {word.many.toLowerCase()}</option>
                <option value="org">Organisation-wide</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label htmlFor="uq" className="sr-only">
                Find
              </label>
              <input id="uq" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Find…" className="input h-9 w-44" />
              <button className="btn h-9">Filter</button>
            </form>
          </div>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3 text-[13px] text-ink-500">
              <span>
                Showing {shown.length} of {rows.length}
              </span>
              {filtered && (
                <Link href="/universe" className="font-medium">
                  Clear filters
                </Link>
              )}
            </div>
            {shown.length === 0 ? (
              <Empty title="Nothing matches these filters" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-[13px]">
                  <thead className="bg-[#F8FAFB]">
                    <tr>
                      <th className="th">Auditable entity</th>
                      <th className="th">Owner</th>
                      <th className="th text-right">I × L</th>
                      <th className="th">Inherent</th>
                      <th className="th">Controls</th>
                      <th className="th">Residual</th>
                      <th className="th">Last audited</th>
                      <th className="th">Next due</th>
                      <th className="th">Plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const env = controlEnv(r.controlEnv);
                      return (
                        <tr key={r.id} className="border-t border-line-soft">
                          <td className="td">
                            <Link href={`/universe/${r.id}`} className="font-medium hover:text-brand-700">
                              {r.name}
                            </Link>
                            <div className="text-[11px] text-ink-500">
                              <span className="font-mono">{r.code}</span> · {r.client?.name ?? "Organisation-wide"}
                              {r.category && ` · ${r.category}`}
                            </div>
                          </td>
                          <td className="td">{r.owner ?? "—"}</td>
                          <td className="td tabular text-right">
                            {r.impact} × {r.likelihood} = <strong>{r.score}</strong>
                          </td>
                          <td className="td">
                            <Pill p={BAND_PILL[r.inherent]} />
                          </td>
                          <td className="td">
                            <span className={clsx("pill", env.cls)}>{env.label}</span>
                          </td>
                          <td className="td">
                            <Pill p={BAND_PILL[r.resid]} />
                          </td>
                          <td className="td tabular">{r.lastAuditedAt ? fmtDate(r.lastAuditedAt) : <span className="pill bg-high-bg text-high-fg">Never</span>}</td>
                          <td className={clsx("td tabular", r.overdue && "font-medium text-high-fg")}>{r.lastAuditedAt ? fmtDate(r.due) : "Now"}</td>
                          <td className="td">{r.planned ? <span className="pill bg-brand-100 text-brand-800">{r.planned}</span> : <span className="text-ink-400">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

const chip = (on: boolean) => clsx("flex h-9 items-center rounded-full border px-3.5 text-[13px]", on ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas");
