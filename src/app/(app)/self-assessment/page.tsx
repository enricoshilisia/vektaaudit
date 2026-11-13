import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate, isOverdue } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createCampaign } from "./actions";

export const metadata: Metadata = { title: "Self-assessment" };

export default async function CsaPage() {
  const s = await requireUser();
  const manage = can(s, "manage");
  const [campaigns, processes] = await Promise.all([
    db.csaCampaign.findMany({
      where: { orgId: s.org },
      orderBy: { createdAt: "desc" },
      include: { requests: { include: { items: { select: { answer: true, validation: true } } } } },
    }),
    db.control.groupBy({ by: ["process"], where: { orgId: s.org }, _count: { _all: true }, orderBy: { process: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Control self-assessment"
        sub="Control owners confirm that their controls worked, with evidence, through a link sent to them. Audit checks the answers, so assurance reaches far more controls than audits alone."
      />

      <section className="card overflow-hidden">
        {campaigns.length === 0 ? (
          <Empty title="No self-assessments yet">Start one below. Each control owner gets one link covering all their controls.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Campaign</th>
                  <th className="th">Due</th>
                  <th className="th text-right">Owners</th>
                  <th className="th">Answered</th>
                  <th className="th text-right">Not working</th>
                  <th className="th text-right">Audit disagrees</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const items = c.requests.flatMap((r) => r.items);
                  const answered = items.filter((i) => i.answer).length;
                  const pct = items.length ? Math.round((answered / items.length) * 100) : 0;
                  return (
                    <tr key={c.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/self-assessment/${c.id}`} className="font-medium hover:text-brand-700">
                          {c.title}
                        </Link>
                        <div className="text-[11px] text-ink-500">{c.period ?? `Started ${fmtDate(c.createdAt)}`}</div>
                      </td>
                      <td className={`td tabular ${isOverdue(c.dueDate, c.status === "closed" || pct === 100) ? "font-medium text-high-fg" : ""}`}>{fmtDate(c.dueDate)}</td>
                      <td className="td tabular text-right">{c.requests.length}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-line-soft">
                            <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular text-xs text-ink-500">
                            {answered}/{items.length}
                          </span>
                        </div>
                      </td>
                      <td className="td tabular text-right">{items.filter((i) => i.answer && i.answer !== "effective").length}</td>
                      <td className="td tabular text-right">{items.filter((i) => i.validation === "disagree").length}</td>
                      <td className="td">{c.status === "open" ? <span className="pill bg-brand-100 text-brand-800">Open</span> : <span className="pill bg-line-soft text-ink-700">Closed</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manage && (
        <section className="card p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Start a self-assessment</h2>
          {processes.length === 0 ? (
            <p className="text-sm text-ink-500">
              Add controls with owners to the <Link href="/controls">risk & control library</Link> first.
            </p>
          ) : (
            <form action={createCampaign} className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="title" className="label">
                  Title
                </label>
                <input id="title" name="title" required minLength={3} className="input" placeholder="e.g. Q4 2026 control self-assessment" />
              </div>
              <div>
                <label htmlFor="period" className="label">
                  Period the owners answer for
                </label>
                <input id="period" name="period" className="input" placeholder="e.g. October – December 2026" />
              </div>
              <div>
                <label htmlFor="dueDate" className="label">
                  Answers due
                </label>
                <input id="dueDate" name="dueDate" type="date" className="input" />
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="label">Processes to include</legend>
                <div className="flex flex-wrap gap-2">
                  {processes.map((p) => (
                    <label key={p.process} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                      <input type="checkbox" name="processes" value={p.process} defaultChecked />
                      {p.process} <span className="text-ink-500">({p._count._all})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="keyOnly" defaultChecked className="h-4 w-4" />
                Key controls only
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary">Create the owners&apos; links</button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  );
}
