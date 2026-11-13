import type { Risk } from "@prisma/client";
import { BAND_PILL, RISK_RATINGS } from "@/lib/risk";

/** Risk details, shared by the add and edit forms. */
export function RiskFields({ r, processes, process }: { r?: Risk | null; processes: string[]; process?: string }) {
  return (
    <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <legend className="eyebrow mb-3">The risk</legend>
      <div>
        <label htmlFor="process" className="label">
          Process
        </label>
        <input id="process" name="process" defaultValue={r?.process ?? process ?? ""} required list="processes" className="input" placeholder="e.g. Procure-to-pay" />
        <datalist id="processes">
          {processes.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div>
        <label htmlFor="rating" className="label">
          Rating
        </label>
        <select id="rating" name="rating" defaultValue={r?.rating ?? "medium"} className="input">
          {RISK_RATINGS.map((b) => (
            <option key={b} value={b}>
              {BAND_PILL[b].label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="title" className="label">
          What could go wrong
        </label>
        <input id="title" name="title" defaultValue={r?.title ?? ""} required minLength={5} className="input" placeholder="e.g. Payments made to fictitious or unapproved vendors" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="detail" className="label">
          More detail (optional)
        </label>
        <textarea id="detail" name="detail" rows={3} defaultValue={r?.detail ?? ""} className="textarea" placeholder="Causes, consequences, past incidents…" />
      </div>
    </fieldset>
  );
}
