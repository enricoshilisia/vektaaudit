import type { Metadata } from "next";
import Link from "next/link";
import { EntityFields } from "@/components/EntityFields";
import { PageHeader } from "@/components/ui";
import { clientWord } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createEntity } from "../actions";

export const metadata: Metadata = { title: "Add auditable entity" };

export default async function NewEntityPage() {
  const s = await requireUser("manage");
  const [org, clients] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } }),
    db.client.findMany({ where: { orgId: s.org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/universe">Audit universe</Link>} title="Add auditable entity" />
      <form action={createEntity} className="card flex max-w-3xl flex-col gap-6 p-6">
        <EntityFields clients={clients} clientLabel={clientWord(org.kind).one} />
        <div className="flex gap-2">
          <button className="btn-primary">Add to universe</button>
          <Link href="/universe" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
