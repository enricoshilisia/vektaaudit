import type { Metadata } from "next";
import Link from "next/link";
import { ClientFields } from "@/components/ClientFields";
import { PageHeader } from "@/components/ui";
import { clientWord } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createClient } from "../actions";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const s = await requireUser("manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } });
  const word = clientWord(org.kind);
  return (
    <>
      <PageHeader eyebrow={<Link href="/clients">{word.many}</Link>} title={`Add ${word.one.toLowerCase()}`} />
      <form action={createClient} className="card flex max-w-3xl flex-col gap-6 p-6">
        <ClientFields internal={org.kind === "internal"} />
        <div className="flex gap-2">
          <button className="btn-primary">Add {word.one.toLowerCase()}</button>
          <Link href="/clients" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
