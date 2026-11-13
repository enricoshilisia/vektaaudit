import type { Metadata } from "next";
import Link from "next/link";
import { RiskFields } from "@/components/RiskFields";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createRisk } from "../../actions";

export const metadata: Metadata = { title: "Add risk" };

export default async function NewRiskPage({ searchParams }: { searchParams: Promise<{ process?: string }> }) {
  const s = await requireUser("manage");
  const { process } = await searchParams;
  const processes = (await db.risk.findMany({ where: { orgId: s.org }, select: { process: true }, distinct: ["process"] })).map((r) => r.process);
  return (
    <>
      <PageHeader eyebrow={<Link href="/controls">Risks & controls</Link>} title="Add risk" />
      <form action={createRisk} className="card flex max-w-3xl flex-col gap-6 p-6">
        <RiskFields processes={processes} process={process} />
        <div className="flex gap-2">
          <button className="btn-primary">Add risk</button>
          <Link href="/controls" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
