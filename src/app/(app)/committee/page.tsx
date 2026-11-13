import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { quarterOf } from "@/lib/time";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createPack } from "./actions";

export const metadata: Metadata = { title: "Audit committee" };

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CommitteePage() {
  const s = await requireUser();
  const packs = await db.committeePack.findMany({ where: { orgId: s.org }, orderBy: { periodEnd: "desc" } });
  const q = quarterOf(new Date());
  return (
    <>
      <PageHeader title="Audit committee" sub="Reports to the audit committee, built from live data in VektaAudit. When a pack is issued, its figures are frozen so it always shows what was reported." />
      <section className="card overflow-hidden">
        {packs.length === 0 ? (
          <Empty title="No committee packs yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Pack</th>
                  <th className="th">Period</th>
                  <th className="th">Meeting</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/committee/${p.id}`} className="font-medium hover:text-brand-700">
                        {p.title}
                      </Link>
                    </td>
                    <td className="td tabular">
                      {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                    </td>
                    <td className="td tabular">{fmtDate(p.meetingDate)}</td>
                    <td className="td">{p.status === "issued" ? <span className="pill bg-ok-bg text-ok-fg">Issued {fmtDate(p.issuedAt)}</span> : <span className="pill bg-line-soft text-ink-700">Draft</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {can(s, "manage") && (
        <section className="card p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Prepare a pack</h2>
          <form action={createPack} className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label htmlFor="title" className="label">
                Title
              </label>
              <input id="title" name="title" required defaultValue={`Internal audit report to the audit committee, ${q.label}`} className="input" />
            </div>
            <div>
              <label htmlFor="periodStart" className="label">
                Period from
              </label>
              <input id="periodStart" name="periodStart" type="date" required defaultValue={day(q.start)} className="input" />
            </div>
            <div>
              <label htmlFor="periodEnd" className="label">
                Period to
              </label>
              <input id="periodEnd" name="periodEnd" type="date" required defaultValue={day(q.end)} className="input" />
            </div>
            <div>
              <label htmlFor="meetingDate" className="label">
                Meeting date
              </label>
              <input id="meetingDate" name="meetingDate" type="date" className="input" />
            </div>
            <div className="sm:col-span-3">
              <button className="btn-primary">Prepare pack</button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
