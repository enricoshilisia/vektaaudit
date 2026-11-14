import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui";
import { fmtAmount, fmtDateTime } from "@/lib/format";
import { CONTROL_NATURE, FREQUENCIES, OPERATING_PILL, TEST_METHODS, TEST_STATUS, countExceptions, labelOf, suggestedResult, suggestedSample, type Attribute } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { ConclusionDraft } from "@/components/VektaAi";
import { aiReady } from "@/lib/server/vekta";
import { db } from "@/lib/server/db";
import { addSamples, pickRandom, removeSample, reopenTest, saveAttributes, saveDesign, saveResults, sendBackTest, signOffTest, submitTest } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = await db.controlTest.findUnique({ where: { id: (await params).id }, select: { ref: true, control: { select: { code: true } } } });
  return { title: t ? `${t.ref} · ${t.control.code}` : "Control test" };
}

const RESULT_LABEL: Record<string, string> = { effective: "Effective", effective_exception: "Effective, with exception", ineffective: "Ineffective" };
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const t = await db.controlTest.findFirst({
    where: { id: (await params).id, orgId: s.org },
    include: {
      control: { include: { risks: { select: { code: true, title: true } } } },
      engagement: { select: { id: true, code: true, name: true } },
      samples: { orderBy: { idx: "asc" } },
      preparedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });
  if (!t) notFound();
  const attrs = t.attributes as Attribute[];
  const editable = t.status === "in_progress" && can(s, "work");
  const exceptions = countExceptions(t.samples);
  const rate = t.samples.length ? (exceptions / t.samples.length) * 100 : 0;
  const suggestion = suggestedResult(t.samples.length, exceptions, t.tolerableRate);
  const size = suggestedSample(t.control, t.confidence, t.tolerableRate, t.population);
  const ai = editable && (await aiReady(s.org));
  const recorded = t.samples.filter((sm) => attrs.every((a) => (sm.results as Record<string, string>)[a.key])).length;

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href={`/engagements/${t.engagement.id}?tab=tests`} className="hover:text-ink">
          <span className="font-mono">{t.engagement.code}</span> {t.engagement.name}
        </Link>
        <span aria-hidden>/</span>
        <span>Control tests</span>
        <span aria-hidden>/</span>
        <span className="font-mono">{t.ref}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <p className="eyebrow">{t.testType === "design" ? "Test of design" : "Test of operating effectiveness"}</p>
          <h1 className="mt-1 text-2xl font-semibold">
            <span className="font-mono text-lg text-ink-500">{t.control.code}</span> {t.control.title}
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            {labelOf(CONTROL_NATURE, t.control.nature)} · {labelOf(FREQUENCIES, t.control.frequency)} · {t.control.type === "preventive" ? "Preventive" : "Detective"}
            {t.control.ownerName && ` · Owner: ${t.control.ownerName}`}
            {t.control.risks.length > 0 && ` · Addresses ${t.control.risks.map((r) => r.code).join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill p={TEST_STATUS[t.status]} />
          <Link href={`/controls/${t.controlId}`} className="btn">
            Control in library
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold">Test design and sampling</h2>
          <form action={saveDesign.bind(null, t.id)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset disabled={!editable} className="contents">
              <div>
                <label htmlFor="periodStart" className="label">
                  Period from
                </label>
                <input id="periodStart" name="periodStart" type="date" defaultValue={day(t.periodStart)} className="input" />
              </div>
              <div>
                <label htmlFor="periodEnd" className="label">
                  Period to
                </label>
                <input id="periodEnd" name="periodEnd" type="date" defaultValue={day(t.periodEnd)} className="input" />
              </div>
              <div>
                <label htmlFor="population" className="label">
                  Population (number of items)
                </label>
                <input id="population" name="population" type="number" min={0} defaultValue={t.population ?? ""} className="input" placeholder="e.g. 4312" />
              </div>
              <div>
                <label htmlFor="populationValue" className="label">
                  Population value (optional)
                </label>
                <input id="populationValue" name="populationValue" defaultValue={t.populationValue?.toString() ?? ""} inputMode="numeric" className="input" placeholder="e.g. 1840000000" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="populationSource" className="label">
                  Where the population came from, and how completeness was checked
                </label>
                <input id="populationSource" name="populationSource" defaultValue={t.populationSource ?? ""} className="input" placeholder="e.g. ERP paid-invoice report, total agreed to the general ledger" />
              </div>
              <div>
                <label htmlFor="method" className="label">
                  Selection method
                </label>
                <select id="method" name="method" defaultValue={t.method} className="input">
                  {TEST_METHODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="confidence" className="label">
                    Confidence
                  </label>
                  <select id="confidence" name="confidence" defaultValue={t.confidence} className="input">
                    {[80, 90, 95, 99].map((c) => (
                      <option key={c} value={c}>
                        {c}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="tolerableRate" className="label">
                    Tolerable deviation
                  </label>
                  <select id="tolerableRate" name="tolerableRate" defaultValue={t.tolerableRate} className="input">
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((c) => (
                      <option key={c} value={c}>
                        {c}%
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editable && (
                <div className="sm:col-span-2">
                  <button className="btn">Save design</button>
                </div>
              )}
            </fieldset>
          </form>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-[15px] font-semibold">Sample size</h2>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-3xl font-semibold">{size.n}</span>
            <span className="text-sm text-ink-500">suggested</span>
          </div>
          <p className="text-[13px] text-ink-500">{size.why}.</p>
          {size.n !== size.stat && t.control.nature !== "automated" && (
            <p className="text-[13px] text-ink-500">
              The statistical size at {t.confidence}% confidence and {t.tolerableRate}% tolerable deviation would be {size.stat}.
            </p>
          )}
          <p className="text-[13px]">
            Selected: <strong className="tabular">{t.samples.length}</strong>
            {t.samples.length > 0 && t.samples.length < size.n && <span className="text-med-fg"> · fewer than suggested, explain in the conclusion</span>}
          </p>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-1 text-[15px] font-semibold">Attributes tested</h2>
        <p className="mb-4 text-[13px] text-ink-500">What is checked on every item. An item with any failed attribute counts as one deviation.</p>
        <ol className="mb-4 grid gap-2 sm:grid-cols-2">
          {attrs.map((a) => (
            <li key={a.key} className="flex gap-3 rounded-lg border border-line px-3 py-2.5 text-[13px]">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-brand-100 font-semibold text-brand-800">{a.key}</span>
              <span>
                <span className="font-medium">{a.label}</span>
                {a.how && <span className="block text-ink-500">{a.how}</span>}
              </span>
            </li>
          ))}
        </ol>
        {editable && (
          <details>
            <summary className="cursor-pointer text-[13px] font-medium text-brand-700">Change attributes</summary>
            <form action={saveAttributes.bind(null, t.id)} className="mt-3 flex flex-col gap-2">
              <label htmlFor="attributes" className="label">
                One per line: what is checked | how it is checked
              </label>
              <textarea id="attributes" name="attributes" rows={5} className="textarea font-mono text-[12px]" defaultValue={attrs.map((a) => (a.how ? `${a.label} | ${a.how}` : a.label)).join("\n")} />
              <button className="btn self-start">Save attributes</button>
            </form>
          </details>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Sample and results</h2>
          <span className="text-xs text-ink-500">
            {recorded} of {t.samples.length} items recorded
          </span>
          {t.samples.length > 0 && (
            <span className={clsx("ml-auto pill", exceptions ? "bg-high-bg text-high-fg" : "bg-ok-bg text-ok-fg")}>
              {exceptions} deviation{exceptions === 1 ? "" : "s"} · {rate.toFixed(1)}%
            </span>
          )}
        </div>
        {t.samples.length > 0 && (
          <form action={saveResults.bind(null, t.id)}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead className="bg-[#F8FAFB]">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Item</th>
                    <th className="th text-right">Amount</th>
                    {attrs.map((a) => (
                      <th key={a.key} className="th text-center" title={a.label}>
                        {a.key}
                      </th>
                    ))}
                    <th className="th">Comment</th>
                    {editable && <th className="th" />}
                  </tr>
                </thead>
                <tbody>
                  {t.samples.map((sm) => {
                    const r = sm.results as Record<string, string>;
                    const bad = Object.values(r).includes("fail");
                    return (
                      <tr key={sm.id} className={clsx("border-t border-line-soft", bad && "bg-high-bg/40")}>
                        <td className="td tabular text-ink-500">{sm.idx}</td>
                        <td className="td">
                          <span className="font-medium">{sm.ref}</span>
                          {sm.description && <div className="text-[11px] text-ink-500">{sm.description}</div>}
                        </td>
                        <td className="td tabular text-right">{sm.amount !== null ? fmtAmount(sm.amount) : "—"}</td>
                        {attrs.map((a) => (
                          <td key={a.key} className="td text-center">
                            {editable ? (
                              <>
                                <label htmlFor={`r_${sm.id}_${a.key}`} className="sr-only">
                                  {a.key} for item {sm.idx}
                                </label>
                                <select id={`r_${sm.id}_${a.key}`} name={`r_${sm.id}_${a.key}`} defaultValue={r[a.key] ?? ""} className={clsx("input h-8 w-[72px] px-1.5 text-[12px]", r[a.key] === "fail" && "border-high-dot text-high-fg")}>
                                  <option value="">—</option>
                                  <option value="pass">✓ Pass</option>
                                  <option value="fail">✕ Fail</option>
                                  <option value="na">N/A</option>
                                </select>
                              </>
                            ) : (
                              <span className={clsx("font-semibold", r[a.key] === "fail" ? "text-high-fg" : r[a.key] === "pass" ? "text-ok-fg" : "text-ink-400")}>{r[a.key] === "pass" ? "✓" : r[a.key] === "fail" ? "✕" : r[a.key] === "na" ? "N/A" : "—"}</span>
                            )}
                          </td>
                        ))}
                        <td className="td min-w-[220px]">
                          {editable ? (
                            <>
                              <label htmlFor={`c_${sm.id}`} className="sr-only">
                                Comment for item {sm.idx}
                              </label>
                              <input id={`c_${sm.id}`} name={`c_${sm.id}`} defaultValue={sm.comment ?? ""} className="input h-8 text-[12px]" placeholder={bad ? "Describe the deviation" : ""} />
                            </>
                          ) : (
                            <span className={clsx(bad && "text-high-fg")}>{sm.comment ?? ""}</span>
                          )}
                        </td>
                        {editable && (
                          <td className="td">
                            <button formAction={removeSample.bind(null, sm.id)} className="text-[12px] text-ink-500 hover:text-high-fg" aria-label={`Remove item ${sm.idx}`}>
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="border-t border-line-soft px-5 py-3">
                <button className="btn-primary">Save results</button>
              </div>
            )}
          </form>
        )}
        {editable && (
          <div className="grid gap-5 border-t border-line-soft p-5 lg:grid-cols-[1.5fr_1fr]">
            <form action={addSamples.bind(null, t.id)} className="flex flex-col gap-2">
              <label htmlFor="items" className="label">
                Add items: paste one per line as reference, description, amount (from Excel works too)
              </label>
              <textarea id="items" name="items" rows={4} className="textarea font-mono text-[12px]" placeholder={"INV-26-04417, Rift Valley Tyres Ltd, 1284500\nINV-26-04502, Pwani Fuel Distributors, 6920000"} />
              <button className="btn self-start">Add items</button>
            </form>
            <form action={pickRandom.bind(null, t.id)} className="flex flex-col gap-2">
              <label htmlFor="count" className="label">
                Or pick random item numbers from the population{t.population ? ` (1–${t.population.toLocaleString("en-US")})` : ""}
              </label>
              <div className="flex gap-2">
                <input id="count" name="count" type="number" min={1} max={500} defaultValue={size.n} className="input w-24" />
                <button className="btn" disabled={!t.population}>
                  Pick at random
                </button>
              </div>
              <p className="text-xs text-ink-500">{t.population ? "Then find each item number in the source listing and record its reference." : "Enter the population size in the test design first."}</p>
            </form>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-[15px] font-semibold">Conclusion</h2>
          {editable ? (
            // keyed on the results, so the suggested result is re-applied after results change
            <form key={`${t.samples.length}-${exceptions}`} action={submitTest.bind(null, t.id)} className="flex flex-col gap-4">
              {suggestion && (
                <p className="rounded-lg bg-brand-100 px-3 py-2 text-[13px] text-brand-800">
                  {exceptions} deviation{exceptions === 1 ? "" : "s"} in {t.samples.length} items ({rate.toFixed(1)}%) against a tolerable rate of {t.tolerableRate}% suggests: <strong>{RESULT_LABEL[suggestion]}</strong>.
                </p>
              )}
              <fieldset className="flex flex-wrap gap-2">
                <legend className="label">Result</legend>
                {Object.entries(RESULT_LABEL).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" name="result" value={k} defaultChecked={(t.result ?? suggestion) === k} />
                    {l}
                  </label>
                ))}
              </fieldset>
              <div>
                <label htmlFor="conclusion" className="label">
                  Conclusion
                </label>
                {ai && t.samples.length > 0 && <ConclusionDraft testId={t.id} />}
                <textarea id="conclusion" name="conclusion" rows={5} defaultValue={t.conclusion ?? ""} className="textarea" placeholder="What was tested, what was found, why the result is what it is, and any finding raised." />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary">Submit for review</button>
                {exceptions > 0 && (
                  <Link href={`/findings/new?engagement=${t.engagementId}&ref=${encodeURIComponent(`${t.ref} ${t.control.code}`)}`} className="btn">
                    Raise a finding
                  </Link>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              {t.result && <Pill p={OPERATING_PILL[t.result]} className="self-start" />}
              <p className="whitespace-pre-wrap text-sm">{t.conclusion ?? "Not concluded yet."}</p>
              {exceptions > 0 && can(s, "work") && (
                <Link href={`/findings/new?engagement=${t.engagementId}&ref=${encodeURIComponent(`${t.ref} ${t.control.code}`)}`} className="btn self-start">
                  Raise a finding
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="text-[15px] font-semibold">Sign-off</h2>
          <Sign label="Prepared" who={t.preparedBy?.name} at={t.preparedAt} />
          <Sign label="Reviewed" who={t.reviewedBy?.name} at={t.reviewedAt} />
          {t.status === "in_review" && can(s, "review") && t.preparedById !== s.sub && (
            <>
              <form action={signOffTest.bind(null, t.id)}>
                <button className="btn-primary w-full">Sign off as reviewer</button>
              </form>
              <form action={sendBackTest.bind(null, t.id)} className="flex flex-col gap-2">
                <label htmlFor="note" className="label">
                  Or send back with a review note
                </label>
                <textarea id="note" name="note" rows={2} className="textarea" required minLength={5} />
                <button className="btn">Send back</button>
              </form>
            </>
          )}
          {t.status === "in_review" && can(s, "review") && t.preparedById === s.sub && <p className="text-xs text-ink-500">You prepared this test, so someone else must review it.</p>}
          {t.status === "concluded" && (
            <>
              <p className="text-xs text-ink-500">The result has been recorded on the control in the library.</p>
              {can(s, "review") && (
                <form action={reopenTest.bind(null, t.id)}>
                  <button className="btn btn-sm">Reopen</button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Sign({ label, who, at }: { label: string; who?: string | null; at?: Date | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className={clsx("flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-semibold", who ? "bg-ok-dot text-white" : "border border-dashed border-ink-300 text-ink-500")}>{label[0]}</span>
      <div className="text-[13px]">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-ink-500">{who ? `${who} · ${at ? fmtDateTime(at) : ""}` : "Not yet"}</p>
      </div>
    </div>
  );
}
