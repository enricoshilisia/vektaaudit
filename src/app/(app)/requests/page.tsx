import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { REQUEST_PILL, fmtDate, isOverdue } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Evidence requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; overdue?: string }> }) {
  const s = await requireUser();
  const q = await searchParams;
  const status = q.status ?? "outstanding";
  const where: Prisma.EvidenceRequestWhereInput = {
    engagement: { orgId: s.org },
    ...(status === "outstanding" ? { status: { in: ["open", "needs_info"] } } : status === "all" ? {} : { status }),
    ...(q.overdue ? { dueDate: { lt: new Date() }, status: { in: ["open", "needs_info"] } } : {}),
  };
  const requests = await db.evidenceRequest.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    include: { engagement: { select: { id: true, name: true, code: true } }, _count: { select: { documents: true } } },
  });
  const chip = (label: string, key: string) => (
    <Link key={key} href={`/requests?status=${key}`} className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${status === key && !q.overdue ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader title="Evidence requests" sub="What you've asked auditees for, across all engagements. Auditees answer from their portal link." />
      <div className="flex flex-wrap gap-2">
        {chip("Outstanding", "outstanding")}
        {chip("Submitted — to review", "submitted")}
        {chip("Accepted", "accepted")}
        {chip("All", "all")}
        <Link href="/requests?overdue=1" className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${q.overdue ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
          Overdue
        </Link>
      </div>
      <section className="card overflow-hidden">
        {requests.length === 0 ? (
          <Empty title="Nothing here" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Request</th>
                  <th className="th">Engagement</th>
                  <th className="th">From</th>
                  <th className="th">Files</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const late = isOverdue(r.dueDate, r.status === "accepted" || r.status === "submitted");
                  return (
                    <tr key={r.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/engagements/${r.engagement.id}?tab=requests`} className="font-medium hover:text-brand-700">
                          {r.title}
                        </Link>
                        <div className="font-mono text-[11px] text-ink-500">{r.code}</div>
                      </td>
                      <td className="td">{r.engagement.name}</td>
                      <td className="td">{r.assigneeName ?? "—"}</td>
                      <td className="td tabular">{r._count.documents}</td>
                      <td className={`td tabular ${late ? "font-medium text-high-dot" : ""}`}>{fmtDate(r.dueDate)}</td>
                      <td className="td">
                        <Pill p={late ? REQUEST_PILL.overdue : REQUEST_PILL[r.status]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
