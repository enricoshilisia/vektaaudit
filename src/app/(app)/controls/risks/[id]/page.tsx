import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RiskFields } from "@/components/RiskFields";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { updateRisk } from "../../actions";

export const metadata: Metadata = { title: "Edit risk" };

export default async function RiskPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser("manage");
  const r = await db.risk.findFirst({ where: { id: (await params).id, orgId: s.org }, include: { controls: { select: { id: true, code: true, title: true } } } });
  if (!r) notFound();
  const processes = (await db.risk.findMany({ where: { orgId: s.org }, select: { process: true }, distinct: ["process"] })).map((x) => x.process);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/controls?process=${encodeURIComponent(r.process)}`}>Risks & controls</Link>} title={<>Edit risk <span className="font-mono text-lg text-ink-500">{r.code}</span></>} />
      <form action={updateRisk.bind(null, r.id)} className="card flex max-w-3xl flex-col gap-6 p-6">
        <RiskFields r={r} processes={processes} />
        <div>
          <p className="eyebrow mb-2">Controls addressing it</p>
          {r.controls.length === 0 ? (
            <p className="text-sm text-ink-500">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {r.controls.map((c) => (
                <li key={c.id}>
                  <Link href={`/controls/${c.id}`}>
                    <span className="font-mono text-[11px]">{c.code}</span> {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/controls/new?process=${encodeURIComponent(r.process)}&risk=${r.id}`} className="mt-2 inline-block text-[13px] font-medium">
            + Add a control for this risk
          </Link>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Save</button>
          <Link href="/controls" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
