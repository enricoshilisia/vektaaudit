import type { Control, Risk } from "@prisma/client";
import { ASSERTIONS, BAND_PILL, CONTROL_NATURE, CONTROL_TYPES, COSO, FREQUENCIES, type Band } from "@/lib/risk";

const Select = ({ id, label, value, options }: { id: string; label: string; value?: string | null; options: { key: string; label: string }[] }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    <select id={id} name={id} defaultValue={value ?? ""} className="input">
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

/** Control details and the risks it addresses, shared by the add and edit forms. */
export function ControlFields({ c, risks, linked, processes, process }: { c?: Control | null; risks: Risk[]; linked?: string[]; processes: string[]; process?: string }) {
  const on = new Set(linked ?? []);
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">The control</legend>
        <div>
          <label htmlFor="process" className="label">
            Process
          </label>
          <input id="process" name="process" defaultValue={c?.process ?? process ?? ""} required list="processes" className="input" placeholder="e.g. Procure-to-pay" />
          <datalist id="processes">
            {processes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="ownerName" className="label">
            Control owner
          </label>
          <input id="ownerName" name="ownerName" defaultValue={c?.ownerName ?? ""} className="input" placeholder="e.g. AP Manager" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="title" className="label">
            What the control does
          </label>
          <textarea id="title" name="title" rows={2} defaultValue={c?.title ?? ""} required minLength={5} className="textarea" placeholder="Who does what, when, and what evidence is left. e.g. The Finance Controller reviews and signs the monthly bank reconciliation" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="detail" className="label">
            More detail (optional)
          </label>
          <textarea id="detail" name="detail" rows={2} defaultValue={c?.detail ?? ""} className="textarea" placeholder="Thresholds, system settings, reports used…" />
        </div>
        <Select id="type" label="Type" value={c?.type ?? "preventive"} options={CONTROL_TYPES} />
        <Select id="nature" label="How it runs" value={c?.nature ?? "manual"} options={CONTROL_NATURE} />
        <Select id="frequency" label="How often" value={c?.frequency ?? "monthly"} options={FREQUENCIES} />
        <Select id="assertion" label="Assertion" value={c?.assertion ?? ""} options={[{ key: "", label: "—" }, ...ASSERTIONS.map((a) => ({ key: a, label: a }))]} />
        <Select id="component" label="Internal control component (COSO)" value={c?.component ?? "Control activities"} options={[{ key: "", label: "—" }, ...COSO.map((a) => ({ key: a, label: a }))]} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="key" defaultChecked={c ? c.key : true} className="h-4 w-4" />
          Key control (relied on and tested)
        </label>
      </fieldset>

      <fieldset>
        <legend className="eyebrow mb-3">Risks it addresses</legend>
        {risks.length === 0 ? (
          <p className="text-sm text-ink-500">No risks in the library yet. You can add them and link them later.</p>
        ) : (
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {risks.map((r) => (
              <label key={r.id} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-canvas">
                <input type="checkbox" name="riskIds" value={r.id} defaultChecked={on.has(r.id)} className="mt-0.5 h-4 w-4 flex-none" />
                <span className={`pill ${BAND_PILL[r.rating as Band].cls}`}>{BAND_PILL[r.rating as Band].label}</span>
                <span>
                  <span className="font-mono text-[11px] text-ink-500">{r.code}</span> {r.title}
                  <span className="text-ink-500"> · {r.process}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
