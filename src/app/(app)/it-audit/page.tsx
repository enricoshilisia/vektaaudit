import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { ITGC_DOMAINS, ITGC_RATING } from "@/lib/itaudit";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createReview, createSystem } from "./actions";

export const metadata: Metadata = { title: "IT audit" };

export default async function ItAuditPage() {
  const s = await requireUser();
  const manage = can(s, "manage");
  const [systems, reviews] = await Promise.all([
    db.itSystem.findMany({ where: { orgId: s.org }, orderBy: [{ critical: "desc" }, { name: "asc" }], include: { _count: { select: { sodRules: true } } } }),
    db.accessReview.findMany({
      where: { orgId: s.org },
      orderBy: { createdAt: "desc" },
      include: { lists: { include: { entries: { select: { decision: true, removedAt: true } } } } },
    }),
  ]);
  const ratings = systems.flatMap((x) => ITGC_DOMAINS.map((d) => x[d.key]));
  const tested = ratings.filter((r) => r !== "not_tested" && r !== "not_applicable").length;
  const weak = ratings.filter((r) => r === "ineffective" || r === "needs_improvement").length;
  const open = reviews.find((r) => r.status === "open");
  const pendingRemovals = reviews.flatMap((r) => r.lists.flatMap((l) => l.entries)).filter((e) => (e.decision === "remove" || e.decision === "change") && !e.removedAt).length;

  return (
    <>
      <PageHeader title="IT audit" sub="IT general controls for each key system, and periodic reviews where system owners confirm who should keep access." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Systems in scope" value={systems.length} sub={`${systems.filter((x) => x.critical).length} critical`} />
        <Stat label="Control areas tested" value={`${tested} of ${ratings.filter((r) => r !== "not_applicable").length}`} />
        <Stat label="Areas not working well" value={weak} tone={weak ? "red" : undefined} sub="Needs improvement or ineffective" />
        <Stat label="Access changes waiting for IT" value={pendingRemovals} tone={pendingRemovals ? "amber" : undefined} sub="Removals and role changes" />
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">IT general controls by system</h2>
        {systems.length === 0 ? (
          <Empty title="No systems yet">Add the systems that matter for financial reporting and operations: the ERP, core banking, payroll, and so on.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">System</th>
                  {ITGC_DOMAINS.map((d) => (
                    <th key={d.key} className="th" title={d.hint}>
                      {d.label}
                    </th>
                  ))}
                  <th className="th">Last tested</th>
                </tr>
              </thead>
              <tbody>
                {systems.map((x) => (
                  <tr key={x.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/it-audit/${x.id}`} className="font-medium hover:text-brand-700">
                        {x.name}
                      </Link>
                      <div className="text-[11px] text-ink-500">
                        {x.critical ? "Critical · " : ""}
                        {x.ownerName ?? "No owner set"}
                        {x._count.sodRules ? ` · ${x._count.sodRules} conflict rules` : ""}
                      </div>
                    </td>
                    {ITGC_DOMAINS.map((d) => (
                      <td key={d.key} className="td">
                        <span className={clsx("pill", ITGC_RATING[x[d.key]].cls)}>{ITGC_RATING[x[d.key]].label}</span>
                      </td>
                    ))}
                    <td className="td tabular">{fmtDate(x.lastTestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">User access reviews</h2>
        {reviews.length === 0 ? (
          <Empty title="No access reviews yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Review</th>
                  <th className="th">Due</th>
                  <th className="th text-right">Accounts</th>
                  <th className="th">Decided</th>
                  <th className="th text-right">To remove or change</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => {
                  const es = r.lists.flatMap((l) => l.entries);
                  const decided = es.filter((e) => e.decision).length;
                  return (
                    <tr key={r.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/it-audit/reviews/${r.id}`} className="font-medium hover:text-brand-700">
                          {r.title}
                        </Link>
                        <div className="text-[11px] text-ink-500">{r.lists.length} systems</div>
                      </td>
                      <td className="td tabular">{fmtDate(r.dueDate)}</td>
                      <td className="td tabular text-right">{es.length}</td>
                      <td className="td tabular">
                        {decided} of {es.length}
                      </td>
                      <td className="td tabular text-right">{es.filter((e) => e.decision === "remove" || e.decision === "change").length}</td>
                      <td className="td">{r.status === "open" ? <span className="pill bg-brand-100 text-brand-800">Open</span> : <span className="pill bg-line-soft text-ink-700">Closed</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manage && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-6">
            <h2 className="mb-4 text-[15px] font-semibold">Add a system</h2>
            <form action={createSystem} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className="label">
                  System
                </label>
                <input id="name" name="name" required className="input" placeholder="e.g. ERP (finance and supply chain)" />
              </div>
              <div>
                <label htmlFor="ownerName" className="label">
                  Business owner
                </label>
                <input id="ownerName" name="ownerName" className="input" placeholder="e.g. Finance Director" />
              </div>
              <div>
                <label htmlFor="ownerEmail" className="label">
                  Owner email
                </label>
                <input id="ownerEmail" name="ownerEmail" type="email" className="input" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="description" className="label">
                  What it supports
                </label>
                <input id="description" name="description" className="input" placeholder="e.g. General ledger, purchasing, payments" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="critical" defaultChecked className="h-4 w-4" /> Critical system
              </label>
              <div className="sm:col-span-2">
                <button className="btn-primary">Add system</button>
              </div>
            </form>
          </section>
          <section className="card p-6">
            <h2 className="mb-1 text-[15px] font-semibold">Start an access review</h2>
            <p className="mb-4 text-[13px] text-ink-500">Each system owner gets a link to confirm, change or remove every account.{open ? ` "${open.title}" is still open.` : ""}</p>
            {systems.length === 0 ? (
              <p className="text-sm text-ink-500">Add systems first.</p>
            ) : (
              <form action={createReview} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <div>
                    <label htmlFor="title" className="label">
                      Title
                    </label>
                    <input id="title" name="title" required className="input" placeholder="e.g. Q4 2026 user access review" />
                  </div>
                  <div>
                    <label htmlFor="dueDate" className="label">
                      Due
                    </label>
                    <input id="dueDate" name="dueDate" type="date" className="input" />
                  </div>
                </div>
                <fieldset>
                  <legend className="label">Systems</legend>
                  <div className="flex flex-wrap gap-2">
                    {systems.map((x) => (
                      <label key={x.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                        <input type="checkbox" name="systems" value={x.id} defaultChecked={x.critical} />
                        {x.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button className="btn-primary self-start">Start review</button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
