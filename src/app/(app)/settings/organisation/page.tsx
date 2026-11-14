import type { Metadata } from "next";
import { CURRENCIES, fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { setAi, updateEscalation, updateGovernance, updateOrganisation } from "../actions";
import { aiConfigured } from "@/lib/server/vekta";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganisationPage() {
  const s = await requireUser("admin");
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usage = await db.aiUsage.groupBy({ by: ["feature"], where: { orgId: s.org, createdAt: { gte: monthStart } }, _count: { _all: true }, orderBy: { feature: "asc" } });
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
      <form id="ai" action={setAi} className="card flex max-w-xl flex-[999_1_420px] flex-col gap-3 p-6">
        <h2 className="text-[15px] font-semibold">Vekta AI</h2>
        <p className="text-[13px] text-ink-500">Drafts findings and test conclusions, summarises uploaded evidence, suggests controls for risks and explains analytics exceptions. Everything it writes is a draft for your team to check.</p>
        {!aiConfigured() ? (
          <p className="text-[13px] text-med-fg">Vekta AI isn&apos;t set up on this server yet.</p>
        ) : (
          <>
            <label className="flex items-center gap-2.5 text-[13px]">
              <input type="checkbox" name="aiEnabled" defaultChecked={org.aiEnabled} className="h-4 w-4" />
              Vekta AI is available to the team
            </label>
            <button className="btn self-start">Save</button>
            <div className="text-[13px]">
              <p className="label">Used this month</p>
              {usage.length === 0 ? (
                <p className="text-ink-500">Not used yet this month.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {usage.map((u) => (
                    <li key={u.feature} className="flex justify-between">
                      <span className="first-letter:uppercase">{u.feature}</span>
                      <span className="tabular font-medium">{u._count._all}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </form>
      <form id="governance" action={updateGovernance} className="card flex max-w-xl flex-[999_1_420px] flex-col gap-4 p-6">
        <div>
          <h2 className="text-[15px] font-semibold">Audit files and sign-in</h2>
          <p className="mt-1 text-[13px] text-ink-500">Locking keeps closed audit files exactly as they were reported. Retention decides when they may be deleted.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lockAfterDays" className="label">
              Lock closed files after (days)
            </label>
            <input id="lockAfterDays" name="lockAfterDays" type="number" min={1} max={3650} defaultValue={org.lockAfterDays} className="input" />
          </div>
          <div>
            <label htmlFor="retentionYears" className="label">
              Keep closed files for (years)
            </label>
            <input id="retentionYears" name="retentionYears" type="number" min={1} max={30} defaultValue={org.retentionYears} className="input" />
          </div>
        </div>
        <label className="flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" name="requireMfa" defaultChecked={org.requireMfa} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="font-medium">Require two-step sign-in</span>
            <span className="block text-ink-500">Everyone who signs in with a password must also enter a code from an authenticator app. People without one are asked to set it up. Signing in with Microsoft uses your Microsoft sign-in rules instead.</span>
          </span>
        </label>
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
