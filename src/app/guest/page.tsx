import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Pill } from "@/components/ui";
import { PHASE_PILL, RATING_PILL, fmtDate } from "@/lib/format";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Your access" };

export default async function GuestHome() {
  const s = await getSession();
  if (!s || s.role !== "GUEST") redirect("/login");
  const access = await db.guestAccess.findMany({
    where: { userId: s.sub },
    include: { engagement: { include: { client: { select: { name: true } }, _count: { select: { findings: true, documents: true, procedures: true } } } } },
    orderBy: { engagement: { code: "desc" } },
  });
  return (
    <>
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">Engagements shared with you</h1>
        <p className="mt-1 text-sm text-ink-500">You can read these audit files and download their documents. Nothing can be changed, and each file you open is recorded.</p>
      </div>
      {access.length === 0 ? (
        <p className="card p-6 text-sm text-ink-500">Nothing has been shared with you yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {access.map(({ engagement: e }) => (
            <Link key={e.id} href={`/guest/${e.id}`} className="card flex flex-col gap-2 p-5 hover:border-brand-600">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-ink-500">{e.code}</span>
                <Pill p={PHASE_PILL[e.phase]} />
                {e.rating && <Pill p={RATING_PILL[e.rating]} />}
              </div>
              <p className="text-[16px] font-semibold">{e.name}</p>
              <p className="text-[13px] text-ink-500">
                {[e.client?.name, e.periodEnd ? `period to ${fmtDate(e.periodEnd)}` : null].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[12px] text-ink-500">
                {e._count.procedures} procedures · {e._count.findings} findings · {e._count.documents} documents
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
