import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Activity log" };

const PAGE = 100;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const s = await requireUser();
  const { before } = await searchParams;
  const rows = await db.auditLog.findMany({
    where: { orgId: s.org, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE,
  });
  return (
    <>
      <PageHeader title="Activity log" sub="Who did what, and when. Entries can't be edited or deleted." />
      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-[#F8FAFB]">
              <tr>
                <th className="th">When</th>
                <th className="th">Who</th>
                <th className="th">Action</th>
                <th className="th">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line-soft">
                  <td className="td tabular whitespace-nowrap text-ink-500">{fmtDateTime(r.createdAt)}</td>
                  <td className="td whitespace-nowrap font-medium">{r.actorName}</td>
                  <td className="td">{r.action}</td>
                  <td className="td text-ink-700">{r.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {rows.length === PAGE && (
        <Link href={`/activity?before=${rows[rows.length - 1].createdAt.toISOString()}`} className="btn self-start">
          Older entries
        </Link>
      )}
    </>
  );
}
