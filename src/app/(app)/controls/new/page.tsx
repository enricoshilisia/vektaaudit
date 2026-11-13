import type { Metadata } from "next";
import Link from "next/link";
import { ControlFields } from "@/components/ControlFields";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createControl } from "../actions";

export const metadata: Metadata = { title: "Add control" };

export default async function NewControlPage({ searchParams }: { searchParams: Promise<{ process?: string; risk?: string }> }) {
  const s = await requireUser("manage");
  const { process, risk } = await searchParams;
  const risks = await db.risk.findMany({ where: { orgId: s.org }, orderBy: [{ process: "asc" }, { code: "asc" }] });
  const processes = [...new Set(risks.map((r) => r.process))];
  return (
    <>
      <PageHeader eyebrow={<Link href="/controls">Risks & controls</Link>} title="Add control" />
      <form action={createControl} className="card flex max-w-3xl flex-col gap-6 p-6">
        <ControlFields risks={risks} processes={processes} process={process} linked={risk ? [risk] : []} />
        <div className="flex gap-2">
          <button className="btn-primary">Add control</button>
          <Link href="/controls" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
