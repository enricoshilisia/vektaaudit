import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { KINDS, kindOf, rulesFor, type Kind } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { uploadDataSet } from "./actions";

export const metadata: Metadata = { title: "Data analytics" };

export default async function AnalyticsPage() {
  const s = await requireUser();
  const [sets, engagements] = await Promise.all([
    db.dataSet.findMany({
      where: { orgId: s.org },
      orderBy: { createdAt: "desc" },
      include: { engagement: { select: { code: true, name: true } }, runs: { orderBy: { ranAt: "desc" }, include: { _count: { select: { exceptions: { where: { status: "open" } } } } } } },
    }),
    db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Data analytics" sub="Upload extracts from the accounting, payments or payroll system and test every transaction, not just a sample. Each exception is reviewed, explained or turned into a finding." />

      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.key} className="card p-5">
            <p className="text-[15px] font-semibold">{k.label}</p>
            <p className="mt-1 text-[13px] text-ink-500">{k.what}</p>
            <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-700">
              {rulesFor(k.key).map((r) => (
                <li key={r.key}>· {r.title}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Uploaded data</h2>
        {sets.length === 0 ? (
          <Empty title="Nothing uploaded yet">Export a CSV from your system and upload it below.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Data</th>
                  <th className="th">Type</th>
                  <th className="th">Engagement</th>
                  <th className="th text-right">Rows</th>
                  <th className="th">Last run</th>
                  <th className="th text-right">Open exceptions</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((d) => {
                  const latest = new Map<string, (typeof d.runs)[number]>();
                  for (const r of d.runs) if (!latest.has(r.rule)) latest.set(r.rule, r);
                  const open = [...latest.values()].reduce((a, r) => a + r._count.exceptions, 0);
                  return (
                    <tr key={d.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/analytics/${d.id}`} className="font-medium hover:text-brand-700">
                          {d.name}
                        </Link>
                        <div className="text-[11px] text-ink-500">
                          Uploaded by {d.uploadedBy}, {fmtDate(d.createdAt)}
                        </div>
                      </td>
                      <td className="td">{kindOf(d.kind as Kind).label}</td>
                      <td className="td">{d.engagement ? `${d.engagement.code} ${d.engagement.name}` : <span className="text-ink-400">—</span>}</td>
                      <td className="td tabular text-right">{d.rowCount.toLocaleString("en-US")}</td>
                      <td className="td">{d.runs[0] ? fmtDate(d.runs[0].ranAt) : <span className="text-ink-400">Not run</span>}</td>
                      <td className={`td tabular text-right ${open ? "font-semibold text-high-fg" : ""}`}>{d.runs.length ? open : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {can(s, "work") && (
        <section className="card p-6">
          <h2 className="mb-1 text-[15px] font-semibold">Upload data</h2>
          <p className="mb-4 text-[13px] text-ink-500">A CSV file with a heading row, up to 100,000 rows. From Excel: File → Save As → CSV UTF-8. You confirm which column is which on the next screen.</p>
          <form action={uploadDataSet} className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="kind" className="label">
                What it is
              </label>
              <select id="kind" name="kind" className="input">
                {KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="name" className="label">
                Name (optional)
              </label>
              <input id="name" name="name" className="input" placeholder="e.g. GL journals Jan–Oct 2026" />
            </div>
            <div>
              <label htmlFor="engagementId" className="label">
                Engagement (for raising findings)
              </label>
              <select id="engagementId" name="engagementId" className="input">
                <option value="">None yet</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="file" className="label">
                CSV file
              </label>
              <input id="file" name="file" type="file" accept=".csv,.txt,text/csv" required className="block text-sm" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary">Upload</button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
