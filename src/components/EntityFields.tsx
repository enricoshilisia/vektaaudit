import type { AuditableEntity } from "@prisma/client";
import { CONTROL_ENV, CYCLES, IMPACT, LIKELIHOOD } from "@/lib/risk";

/** Auditable entity details, shared by the add and edit forms. */
export function EntityFields({ e, clients, clientLabel }: { e?: AuditableEntity | null; clients: { id: string; name: string }[]; clientLabel: string }) {
  const date = e?.lastAuditedAt ? new Date(e.lastAuditedAt).toISOString().slice(0, 10) : "";
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">What it is</legend>
        <div className="sm:col-span-2">
          <label htmlFor="name" className="label">
            Name (a process, function, system or location)
          </label>
          <input id="name" name="name" defaultValue={e?.name ?? ""} required minLength={3} className="input" placeholder="e.g. Procure-to-pay" />
        </div>
        <div>
          <label htmlFor="clientId" className="label">
            {clientLabel}
          </label>
          <select id="clientId" name="clientId" defaultValue={e?.clientId ?? ""} className="input">
            <option value="">Organisation-wide</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="label">
            Category
          </label>
          <input id="category" name="category" defaultValue={e?.category ?? ""} className="input" placeholder="e.g. Finance, Operations, Technology" list="categories" />
          <datalist id="categories">
            {["Finance", "Operations", "Technology", "Compliance", "Governance", "People", "Commercial"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="owner" className="label">
            Owner in the business
          </label>
          <input id="owner" name="owner" defaultValue={e?.owner ?? ""} className="input" placeholder="e.g. Head of Procurement" />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Risk</legend>
        <div>
          <label htmlFor="impact" className="label">
            Impact if things go wrong
          </label>
          <select id="impact" name="impact" defaultValue={e?.impact ?? 3} className="input">
            {IMPACT.map((l, i) => (
              <option key={l} value={i + 1}>
                {i + 1} · {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="likelihood" className="label">
            Likelihood
          </label>
          <select id="likelihood" name="likelihood" defaultValue={e?.likelihood ?? 3} className="input">
            {LIKELIHOOD.map((l, i) => (
              <option key={l} value={i + 1}>
                {i + 1} · {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="controlEnv" className="label">
            Strength of controls today
          </label>
          <select id="controlEnv" name="controlEnv" defaultValue={e?.controlEnv ?? "adequate"} className="input">
            {CONTROL_ENV.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cycleMonths" className="label">
            Audit at least
          </label>
          <select id="cycleMonths" name="cycleMonths" defaultValue={e?.cycleMonths ?? 24} className="input">
            {CYCLES.map((c) => (
              <option key={c.months} value={c.months}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-ink-500 sm:col-span-2">Inherent risk is impact × likelihood (1–25). Critical areas (20+) are usually audited every year, high (12–16) every two years.</p>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">History</legend>
        <div>
          <label htmlFor="lastAuditedAt" className="label">
            Last audited
          </label>
          <input id="lastAuditedAt" name="lastAuditedAt" type="date" defaultValue={date} className="input" />
          <p className="mt-1 text-xs text-ink-500">Leave empty if it has never been audited. Closing an audit from the plan updates this.</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="label">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={e?.notes ?? ""} className="textarea" placeholder="Why it is rated this way, recent changes, known issues…" />
        </div>
      </fieldset>
    </div>
  );
}
