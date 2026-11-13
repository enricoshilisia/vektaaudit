import type { Metadata } from "next";
import { CURRENCIES, fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { updateEscalation, updateOrganisation } from "../actions";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganisationPage() {
  const s = await requireUser("admin");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, include: { _count: { select: { users: true, clients: true, engagements: true } } } });
  return (
    <div className="flex flex-wrap items-start gap-6">
      <form action={updateOrganisation} className="card flex max-w-xl flex-[999_1_420px] flex-col gap-4 p-6">
        <div>
          <label htmlFor="name" className="label">
            Name (appears on letters and reports)
          </label>
          <input id="name" name="name" required minLength={2} defaultValue={org.name} className="input" />
        </div>
        <fieldset>
          <legend className="label">Type</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2">
              <input type="radio" name="kind" value="firm" defaultChecked={org.kind === "firm"} /> Audit firm
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2">
              <input type="radio" name="kind" value="internal" defaultChecked={org.kind === "internal"} /> Internal audit team
            </label>
          </div>
        </fieldset>
        <div className="w-40">
          <label htmlFor="currency" className="label">
            Currency
          </label>
          <select id="currency" name="currency" defaultValue={org.currency} className="input">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary self-start">Save</button>
      </form>
      <form id="escalation" action={updateEscalation} className="card flex max-w-xl flex-[999_1_420px] flex-col gap-4 p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Escalation of overdue findings</h2>
          <p className="mt-1 text-[13px] text-ink-500">Findings past their due date escalate to these people. The top level also applies when a due date has been moved twice.</p>
        </div>
        {([1, 2, 3] as const).map((n) => (
          <div key={n} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor={`esc${n}Days`} className="label">
                Level {n}: days
              </label>
              <input id={`esc${n}Days`} name={`esc${n}Days`} type="number" min={1} defaultValue={org[`esc${n}Days`]} className="input" />
            </div>
            <div>
              <label htmlFor={`esc${n}To`} className="label">
                Escalates to
              </label>
              <input id={`esc${n}To`} name={`esc${n}To`} defaultValue={org[`esc${n}To`]} className="input" />
            </div>
          </div>
        ))}
        <button className="btn-primary self-start">Save escalation rules</button>
      </form>
      <section className="card flex flex-[1_1_260px] flex-col gap-2 p-5 text-[13px]">
        <span className="eyebrow">Account</span>
        {[
          ["Created", fmtDate(org.createdAt)],
          ["People", String(org._count.users)],
          [org.kind === "internal" ? "Auditable units" : "Clients", String(org._count.clients)],
          ["Engagements", String(org._count.engagements)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-ink-500">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
