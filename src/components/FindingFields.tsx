import type { Finding } from "@prisma/client";
import { DirectoryInput } from "./DirectoryInput";

const C5 = [
  { k: "condition", label: "Condition — what we found", ph: "4 of 25 sampled suppliers were activated by a single user…" },
  { k: "criteria", label: "Criteria — what should happen", ph: "Procurement Policy §4.2 requires dual approval…" },
  { k: "cause", label: "Cause — why it happened", ph: "" },
  { k: "effect", label: "Effect — the risk", ph: "" },
  { k: "recommendation", label: "Recommendation", ph: "" },
] as const;

/** The editable parts of a finding, shared by the new and edit forms. */
export function FindingFields({ f, disabled, directory = false }: { f?: Finding | null; disabled?: boolean; directory?: boolean }) {
  const d = f?.dueDate ? f.dueDate.toISOString().slice(0, 10) : "";
  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="title" className="label">
          Title
        </label>
        <input id="title" name="title" required minLength={5} defaultValue={f?.title} className="input" placeholder="One line a board member would understand" />
      </div>
      <div>
        <label htmlFor="severity" className="label">
          Severity
        </label>
        <select id="severity" name="severity" defaultValue={f?.severity ?? "medium"} className="input">
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
        <input type="checkbox" name="repeat" defaultChecked={f?.repeat} /> Repeat of an earlier finding
      </label>
      {C5.map((c) => (
        <div key={c.k} className="sm:col-span-2">
          <label htmlFor={c.k} className="label">
            {c.label}
          </label>
          <textarea id={c.k} name={c.k} rows={2} defaultValue={f?.[c.k] ?? ""} placeholder={c.ph} className="textarea" />
        </div>
      ))}
      <div>
        <label htmlFor="ownerName" className="label">
          Owner of the fix
        </label>
        <input id="ownerName" name="ownerName" defaultValue={f?.ownerName ?? ""} className="input" placeholder="e.g. R. Njoroge, Head of Procurement" />
      </div>
      <div>
        <label htmlFor="ownerEmail" className="label">
          Owner email
        </label>
        <DirectoryInput id="ownerEmail" name="ownerEmail" defaultValue={f?.ownerEmail} enabled={directory} nameField="ownerName" />
      </div>
      <div>
        <label htmlFor="dueDate" className="label">
          Agreed fix date
        </label>
        <input id="dueDate" name="dueDate" type="date" defaultValue={d} className="input" />
      </div>
    </fieldset>
  );
}
