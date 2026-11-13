import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_PARAMS, PARAM_LABELS, RULES, kindOf, missingFields, rulesFor, type Kind, type Params } from "@/lib/analytics";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { deleteDataSet, explainException, linkEngagement, raiseFindingFrom, reopenException, runAll, saveMapping } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await db.dataSet.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: d?.name ?? "Data analytics" };
}

type Summary = { observed?: number[]; expected?: number[]; counts?: number[]; mad?: number; fit?: string; skipped?: string };

export default async function DataSetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ map?: string; rule?: string; show?: string }> }) {
  const s = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const d = await db.dataSet.findFirst({ where: { id, orgId: s.org }, include: { engagement: { select: { id: true, code: true, name: true } } } });
  if (!d) notFound();
  const kind = d.kind as Kind;
  const headers = d.headers as string[];
  const columns = d.columns as Record<string, number>;
  const missing = missingFields(kind, columns);
  const work = can(s, "work");
  const fields = kindOf(kind).fields;
  const rules = rulesFor(kind);

  // the latest run of each check
  const runs = await db.analyticRun.findMany({ where: { dataSetId: id }, orderBy: { ranAt: "desc" }, include: { _count: { select: { exceptions: true } } } });
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.rule)) latest.set(r.rule, r);
  const lastParams = { ...DEFAULT_PARAMS, ...((runs[0]?.params as Partial<Params>) ?? {}) };
  const openCounts = new Map(
    await Promise.all([...latest.values()].map(async (r) => [r.rule, await db.analyticException.count({ where: { runId: r.id, status: "open" } })] as const)),
  );
  const selRule = sp.rule && latest.has(sp.rule) ? sp.rule : [...latest.values()].find((r) => r.hits > 0)?.rule;
  const selRun = selRule ? latest.get(selRule) : undefined;
  const show = sp.show ?? "open";
  const exceptions = selRun
    ? await db.analyticException.findMany({ where: { runId: selRun.id, ...(show === "all" ? {} : { status: show }) }, orderBy: { rowIdx: "asc" }, take: 200 })
    : [];
  const rowsFor = exceptions.length ? await db.dataRow.findMany({ where: { dataSetId: id, idx: { in: exceptions.map((e) => e.rowIdx) } } }) : [];
  const rowMap = new Map(rowsFor.map((r) => [r.idx, r.cells as string[]]));
  const shownCols = fields.filter((f) => columns[f.key] !== undefined).slice(0, 6);
  const engagements = work ? await db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }) : [];
  const sample = await db.dataRow.findMany({ where: { dataSetId: id }, orderBy: { idx: "asc" }, take: 3 });

  const mapping = work && (sp.map || missing.length > 0);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/analytics" className="hover:text-ink">
          Data analytics
        </Link>
        <span aria-hidden>/</span>
        <span>{d.name}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">{d.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {kindOf(kind).label} · {d.rowCount.toLocaleString("en-US")} rows · uploaded by {d.uploadedBy}, {fmtDate(d.createdAt)}
            {d.engagement && (
              <>
                {" · "}
                <Link href={`/engagements/${d.engagement.id}`}>
                  {d.engagement.code} {d.engagement.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {work && !mapping && (
            <Link href={`/analytics/${id}?map=1`} className="btn">
              Columns
            </Link>
          )}
          {can(s, "manage") && (
            <form action={deleteDataSet.bind(null, id)}>
              <button className="btn text-high-fg">Delete</button>
            </form>
          )}
        </div>
      </div>

      {mapping ? (
        <form action={saveMapping.bind(null, id)} className="card flex flex-col gap-4 p-6">
          <div>
            <h2 className="text-[15px] font-semibold">Which column is which?</h2>
            <p className="mt-1 text-[13px] text-ink-500">VektaAudit guessed from the headings. Check them against the first rows below; starred fields are needed.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <div key={f.key}>
                <label htmlFor={`col_${f.key}`} className="label">
                  {f.label}
                  {f.required && " *"}
                </label>
                <select id={`col_${f.key}`} name={`col_${f.key}`} defaultValue={columns[f.key] ?? ""} className="input">
                  <option value="">Not in this file</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {kind === "journals" && <p className="text-xs text-ink-500">Journals need either one Amount column (debits positive, credits negative) or separate Debit and Credit columns.</p>}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="th whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft">
                    {(r.cells as string[]).map((c, i) => (
                      <td key={i} className="whitespace-nowrap px-3 py-2">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary self-start">Save columns</button>
        </form>
      ) : (
        <>
          {work && (
            <form action={runAll.bind(null, id)} className="card flex flex-wrap items-end gap-4 p-5">
              {(Object.keys(PARAM_LABELS) as (keyof Params)[])
                .filter((k) => PARAM_LABELS[k].kinds.includes(kind))
                .map((k) => (
                  <div key={k}>
                    <label htmlFor={k} className="label">
                      {PARAM_LABELS[k].label}
                    </label>
                    <input id={k} name={k} defaultValue={lastParams[k].toLocaleString("en-US")} inputMode="numeric" className="input w-44" />
                  </div>
                ))}
              <button className="btn-primary">{latest.size ? "Run the checks again" : "Run all checks"}</button>
              {runs[0] && (
                <span className="text-xs text-ink-500">
                  Last run {fmtDateTime(runs[0].ranAt)} by {runs[0].ranBy}
                </span>
              )}
            </form>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rules.map((r) => {
              const run = latest.get(r.key);
              const sum = (run?.summary ?? {}) as Summary;
              const open = openCounts.get(r.key) ?? 0;
              return (
                <Link
                  key={r.key}
                  href={`/analytics/${id}?rule=${r.key}`}
                  className={clsx("card flex flex-col gap-1.5 p-4 transition-colors hover:border-brand-600", selRule === r.key && "border-brand-600 ring-1 ring-brand-600")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13.5px] font-semibold leading-snug">{r.title}</span>
                    {run && !sum.skipped && r.key !== "benford" && <span className={clsx("pill tabular", run.hits ? "bg-high-bg text-high-fg" : "bg-ok-bg text-ok-fg")}>{run.hits}</span>}
                    {r.key === "benford" && sum.fit && <span className={clsx("pill", sum.fit === "Nonconformity" ? "bg-high-bg text-high-fg" : sum.fit === "Marginal conformity" ? "bg-med-bg text-med-fg" : "bg-ok-bg text-ok-fg")}>{sum.fit}</span>}
                  </div>
                  <span className="text-[12px] text-ink-500">{r.why}</span>
                  <span className="mt-auto pt-1 text-[12px] text-ink-500">
                    {!run ? "Not run yet" : sum.skipped ? sum.skipped : r.key === "benford" ? `${run.tested.toLocaleString("en-US")} amounts tested` : `${run.tested.toLocaleString("en-US")} tested · ${open} to review`}
                  </span>
                </Link>
              );
            })}
          </div>

          {selRun && selRule === "benford" && <Benford s={selRun.summary as Summary} />}

          {selRun && selRule !== "benford" && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
                <h2 className="text-[15px] font-semibold">{RULES[selRule!].title}</h2>
                <span className="text-xs text-ink-500">
                  {selRun.hits} exception{selRun.hits === 1 ? "" : "s"}
                  {selRun.hits > selRun._count.exceptions && ` (first ${selRun._count.exceptions} kept)`}
                </span>
                <div className="ml-auto flex gap-1.5">
                  {[
                    ["open", "To review"],
                    ["explained", "Explained"],
                    ["finding", "Findings"],
                    ["all", "All"],
                  ].map(([k, l]) => (
                    <Link key={k} href={`/analytics/${id}?rule=${selRule}&show=${k}`} className={clsx("rounded-full border px-3 py-1 text-[12px]", show === k ? "border-navy-950 bg-navy-950 text-white" : "border-line-strong hover:bg-canvas")}>
                      {l}
                    </Link>
                  ))}
                </div>
              </div>
              {exceptions.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-500">Nothing here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-[12.5px]">
                    <thead className="bg-[#F8FAFB]">
                      <tr>
                        <th className="th">Row</th>
                        <th className="th w-[30%]">What was found</th>
                        {shownCols.map((f) => (
                          <th key={f.key} className="th whitespace-nowrap">
                            {f.label}
                          </th>
                        ))}
                        <th className="th w-[24%]">Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((e) => {
                        const cells = rowMap.get(e.rowIdx) ?? [];
                        return (
                          <tr key={e.id} className="border-t border-line-soft align-top">
                            <td className="td tabular text-ink-500">{e.rowIdx + 2}</td>
                            <td className="td">{e.detail}</td>
                            {shownCols.map((f) => (
                              <td key={f.key} className="td max-w-[180px] truncate" title={cells[columns[f.key]]}>
                                {cells[columns[f.key]]}
                              </td>
                            ))}
                            <td className="td">
                              {e.status === "open" && work ? (
                                <div className="flex flex-col gap-1.5">
                                  <form action={explainException.bind(null, e.id)} className="flex gap-1.5">
                                    <label htmlFor={`n-${e.id}`} className="sr-only">
                                      Explanation
                                    </label>
                                    <input id={`n-${e.id}`} name="note" required minLength={3} className="input h-8 text-[12px]" placeholder="Explanation" />
                                    <button className="btn btn-sm">Explained</button>
                                  </form>
                                  <form action={raiseFindingFrom.bind(null, e.id)}>
                                    <button className="text-[12px] font-medium text-high-fg">Raise a finding</button>
                                  </form>
                                </div>
                              ) : e.status === "explained" ? (
                                <div>
                                  <span className="pill bg-ok-bg text-ok-fg">Explained</span>
                                  <p className="mt-1 text-ink-700">{e.note}</p>
                                  <p className="text-[11px] text-ink-500">
                                    {e.reviewedBy}, {fmtDate(e.reviewedAt)}
                                  </p>
                                  {work && (
                                    <form action={reopenException.bind(null, e.id)}>
                                      <button className="text-[11px] text-ink-500 underline">Reopen</button>
                                    </form>
                                  )}
                                </div>
                              ) : e.status === "finding" ? (
                                <Link href={`/findings/${e.findingId}`} className="pill bg-high-bg text-high-fg">
                                  Finding raised
                                </Link>
                              ) : (
                                <span className="text-ink-400">To review</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {work && (
            <form action={linkEngagement.bind(null, id)} className="flex flex-wrap items-center gap-2 text-[13px]">
              <label htmlFor="eng" className="text-ink-500">
                Findings from this data go to
              </label>
              <select id="eng" name="engagementId" defaultValue={d.engagementId ?? ""} className="input h-9 w-72">
                <option value="">No engagement</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
              <button className="btn h-9">Save</button>
            </form>
          )}
        </>
      )}
    </>
  );
}

/** Observed first digits as bars, Benford's expected proportions as dots. */
function Benford({ s }: { s: Summary }) {
  if (!s?.observed || !s.expected) return <section className="card p-5 text-sm text-ink-500">{s?.skipped ?? "No result."}</section>;
  const max = Math.max(...s.observed, ...s.expected);
  const W = 560, H = 220, P = 34, bw = (W - P * 2) / 9;
  const y = (v: number) => H - 24 - (v / max) * (H - 48);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[15px] font-semibold">First-digit test</h2>
        <span className="text-xs text-ink-500">
          Mean absolute deviation {s.mad!.toFixed(4)} · {s.fit}
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px] max-w-[640px]" role="img" aria-label="First digits of amounts compared with Benford's law">
          {[0, 0.1, 0.2, 0.3].filter((t) => t <= max + 0.02).map((t) => (
            <g key={t}>
              <line x1={P} x2={W - P} y1={y(t)} y2={y(t)} stroke="#EEF1F4" />
              <text x={P - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#7A8A9C">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {s.observed.map((o, i) => (
            <g key={i}>
              <rect x={P + i * bw + 6} y={y(o)} width={bw - 12} height={H - 24 - y(o)} rx="3" fill="#1F5FAE">
                <title>{`Digit ${i + 1}: ${(o * 100).toFixed(1)}% (${s.counts![i]}), expected ${(s.expected![i] * 100).toFixed(1)}%`}</title>
              </rect>
              <circle cx={P + i * bw + bw / 2} cy={y(s.expected![i])} r="4" fill="#fff" stroke="#DC6803" strokeWidth="2" />
              <text x={P + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#5A6B7D">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-brand-600" />
          Share of amounts starting with each digit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-med-dot bg-white" />
          Expected under Benford&apos;s law
        </span>
      </div>
    </section>
  );
}
