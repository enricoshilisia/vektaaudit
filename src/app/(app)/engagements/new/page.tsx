import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { clientWord } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createEngagement } from "../actions";

export const metadata: Metadata = { title: "New engagement" };

export default async function NewEngagementPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const s = await requireUser("manage");
  const { client } = await searchParams;
  const [users, clients, org] = await Promise.all([
    db.user.findMany({ where: { orgId: s.org, role: { not: "VIEWER" }, active: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { orgId: s.org, archivedAt: null }, orderBy: { name: "asc" } }),
    db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } }),
  ]);
  const word = clientWord(org.kind);
  return (
    <>
      <PageHeader eyebrow={<Link href="/engagements">Engagements</Link>} title="New engagement" />
      <form action={createEngagement} className="card grid max-w-3xl grid-cols-1 gap-5 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="label">
            Name
          </label>
          <input id="name" name="name" required minLength={3} className="input" placeholder="e.g. Procurement & supplier onboarding" />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">Type</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2">
              <input type="radio" name="kind" value="internal" defaultChecked={org.kind === "internal"} /> Internal audit — processes and controls
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2">
              <input type="radio" name="kind" value="financial" defaultChecked={org.kind !== "internal"} /> Financial audit — opinion on the accounts
            </label>
          </div>
        </fieldset>
        <div>
          <label htmlFor="clientId" className="label">
            {word.one}
          </label>
          <select id="clientId" name="clientId" className="input" defaultValue={clients.some((c) => c.id === client) ? client : ""}>
            <option value="">— New or none —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="clientName" className="label">
            …or add a new {word.one.toLowerCase()} by name
          </label>
          <input id="clientName" name="clientName" className="input" placeholder="Name (add details later)" />
        </div>
        <div>
          <label htmlFor="area" className="label">
            Area
          </label>
          <input id="area" name="area" className="input" placeholder="Finance, Technology, Operations…" />
        </div>
        <div>
          <label htmlFor="leadId" className="label">
            Lead auditor
          </label>
          <select id="leadId" name="leadId" className="input" defaultValue={s.sub}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="periodStart" className="label">
            Period from
          </label>
          <input id="periodStart" name="periodStart" type="date" className="input" />
        </div>
        <div>
          <label htmlFor="periodEnd" className="label">
            Period to
          </label>
          <input id="periodEnd" name="periodEnd" type="date" className="input" />
        </div>
        <div>
          <label htmlFor="dueDate" className="label">
            Report due
          </label>
          <input id="dueDate" name="dueDate" type="date" className="input" />
        </div>
        <div>
          <label htmlFor="budgetHours" className="label">
            Budget (hours)
          </label>
          <input id="budgetHours" name="budgetHours" type="number" min={0} className="input" defaultValue={120} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="objective" className="label">
            Objective and scope
          </label>
          <textarea id="objective" name="objective" rows={3} className="textarea" />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn-primary">Create engagement</button>
          <Link href="/engagements" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
