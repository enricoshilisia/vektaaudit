import type { Client } from "@prisma/client";
import { CURRENCIES } from "@/lib/format";

function Field({ id, label, c, ...rest }: { id: keyof Client; label: string; c?: Client | null } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={id} defaultValue={(c?.[id] as string | null) ?? ""} className="input" {...rest} />
    </div>
  );
}

/** Client details, shared by the add and edit forms. `internal`: the organisation audits its own units. */
export function ClientFields({ c, internal }: { c?: Client | null; internal?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">{internal ? "Unit" : "Company"}</legend>
        <div className="sm:col-span-2">
          <Field id="name" label={internal ? "Name (department, branch or subsidiary)" : "Legal name"} c={c} required minLength={2} />
        </div>
        <Field id="industry" label={internal ? "Function" : "Industry"} c={c} placeholder={internal ? "e.g. Finance" : "e.g. Logistics"} />
        <Field id="yearEnd" label="Financial year end" c={c} placeholder="e.g. 30 June" />
        {!internal && (
          <>
            <Field id="regNumber" label="Registration number" c={c} />
            <Field id="taxId" label="Tax PIN" c={c} />
            <Field id="framework" label="Reporting framework" c={c} placeholder="IFRS Accounting Standards" />
            <Field id="law" label="Governing law" c={c} placeholder="the Companies Act, 2015" />
          </>
        )}
        <Field id="country" label="Country" c={c} placeholder="e.g. Kenya" list="countries" />
        <div>
          <label htmlFor="currency" className="label">
            Reporting currency
          </label>
          <select id="currency" name="currency" defaultValue={c?.currency ?? ""} className="input">
            <option value="">Same as the organisation</option>
            {CURRENCIES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <datalist id="countries">
          {["Kenya", "Uganda", "Tanzania", "Rwanda", "Burundi", "Ethiopia", "South Sudan", "Nigeria", "Ghana", "South Africa", "United Kingdom"].map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="label">
            Address
          </label>
          <textarea id="address" name="address" rows={2} defaultValue={c?.address ?? ""} className="textarea" />
        </div>
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="eyebrow mb-3">Main contact</legend>
        <Field id="contactName" label="Name" c={c} />
        <Field id="contactTitle" label="Title" c={c} placeholder="e.g. Finance Director" />
        <Field id="contactEmail" label="Email" c={c} type="email" />
        <Field id="contactPhone" label="Phone" c={c} type="tel" />
      </fieldset>
      <div>
        <label htmlFor="notes" className="label">
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={c?.notes ?? ""} className="textarea" placeholder="Acceptance and independence notes, key people, anything the team should know" />
      </div>
    </div>
  );
}
