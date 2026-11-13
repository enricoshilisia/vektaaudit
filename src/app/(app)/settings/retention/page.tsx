import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isLocked, retentionEnds } from "@/lib/lock";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { deleteExpired } from "../actions";

export const metadata: Metadata = { title: "Retention" };

export default async function RetentionPage() {
  const s = await requireUser("admin");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org } });
  const closed = await db.engagement.findMany({ where: { orgId: s.org, phase: "closed" }, orderBy: { closedAt: "asc" }, include: { client: { select: { name: true } }, _count: { select: { documents: true, findings: true } } } });
  const now = new Date();
  const rows = closed.map((e) => ({ ...e, ends: retentionEnds(e.closedAt, org.retentionYears), locked: isLocked(e, org.lockAfterDays) }));
  const due = rows.filter((r) => r.ends && r.ends <= now && !r.legalHold);

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-[13px] text-ink-500">
        Closed audit files lock {org.lockAfterDays} days after closing and are kept for {org.retentionYears} years, then they can be deleted with everything on them. Files on legal hold are never deleted. Change these rules in{" "}
        <Link href="/settings/organisation#governance">Organisation</Link>.
      </p>
      <section className="card overflow-hidden">
        <div className="border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Closed audit files</h2>
          <p className="text-xs text-ink-500">{due.length ? `${due.length} past the retention period` : "None past the retention period"}</p>
        </div>
        {rows.length === 0 ? (
          <Empty title="No closed audits yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Audit</th>
                  <th className="th">Closed</th>
                  <th className="th">File</th>
                  <th className="th">Keep until</th>
                  <th className="th text-right">Documents</th>
                  <th className="th">Delete</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const expired = !!r.ends && r.ends <= now;
                  return (
                    <tr key={r.id} className="border-t border-line-soft align-top">
                      <td className="td">
                        <Link href={`/engagements/${r.id}`} className="font-medium hover:text-brand-700">
                          {r.name}
                        </Link>
                        <div className="text-[11px] text-ink-500">
                          <span className="font-mono">{r.code}</span>
                          {r.client && ` · ${r.client.name}`}
                        </div>
                      </td>
                      <td className="td tabular">{fmtDate(r.closedAt)}</td>
                      <td className="td">{r.locked ? <span className="pill bg-line-soft text-ink-700">Locked</span> : <span className="pill bg-brand-100 text-brand-800">Open for changes</span>}</td>
                      <td className={clsx("td tabular", expired && !r.legalHold && "font-medium text-high-fg")}>
                        {r.legalHold ? <span className="pill bg-violet-bg text-violet-fg">Legal hold</span> : fmtDate(r.ends)}
                      </td>
                      <td className="td tabular text-right">{r._count.documents}</td>
                      <td className="td">
                        {expired && !r.legalHold ? (
                          <form action={deleteExpired.bind(null, r.id)} className="flex flex-wrap gap-1.5">
                            <label htmlFor={`c-${r.id}`} className="sr-only">
                              Type {r.code} to confirm
                            </label>
                            <input id={`c-${r.id}`} name="confirm" required className="input h-8 w-36 font-mono text-[11px]" placeholder={`Type ${r.code}`} />
                            <button className="btn btn-sm text-high-fg">Delete for good</button>
                          </form>
                        ) : (
                          <span className="text-ink-400">—</span>
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
    </div>
  );
}
