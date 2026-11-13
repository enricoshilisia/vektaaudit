import type { Metadata } from "next";
import Link from "next/link";
import { FindingFields } from "@/components/FindingFields";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createFinding } from "../actions";

export const metadata: Metadata = { title: "New finding" };

export default async function NewFindingPage({ searchParams }: { searchParams: Promise<{ engagement?: string; ref?: string }> }) {
  const s = await requireUser("work");
  const { engagement, ref } = await searchParams;
  const engagements = await db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } });
  return (
    <>
      <PageHeader eyebrow={<Link href="/findings">Findings</Link>} title="New finding" sub={ref ? `Raised from procedure ${ref}` : undefined} />
      <form action={createFinding} className="card flex max-w-3xl flex-col gap-5 p-6">
        {ref && <input type="hidden" name="ref" value={ref} />}
        <div>
          <label htmlFor="engagementId" className="label">
            Engagement
          </label>
          <select id="engagementId" name="engagementId" required defaultValue={engagement ?? ""} className="input">
            <option value="" disabled>
              Choose…
            </option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} · {e.name}
              </option>
            ))}
          </select>
        </div>
        <FindingFields />
        <div className="flex gap-2">
          <button className="btn-primary">Raise finding</button>
          <Link href="/findings" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
