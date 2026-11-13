"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

type Person = { id: string; name: string; email: string; jobTitle: string | null; department: string | null };

/**
 * An email field that, when Microsoft 365 is connected, suggests people from the directory as you type.
 * Picking someone fills the email, and their name into `nameField` (an input id) if given.
 */
export function DirectoryInput({
  id,
  name,
  defaultValue,
  placeholder,
  className,
  enabled,
  nameField,
}: {
  id: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  className?: string;
  enabled: boolean;
  nameField?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);

  useEffect(() => {
    if (!enabled || !typed.current || value.trim().length < 2 || value.includes("@")) {
      setPeople([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/microsoft/people?q=${encodeURIComponent(value.trim())}`, { signal: ctrl.signal });
        const j = (await r.json()) as { people?: Person[] };
        setPeople(j.people ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* typing on: a newer search replaces this one */
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, enabled]);

  const pick = (p: Person) => {
    setValue(p.email);
    setOpen(false);
    setPeople([]);
    typed.current = false;
    if (nameField) {
      const el = document.getElementById(nameField) as HTMLInputElement | null;
      if (el && !el.value) el.value = p.jobTitle ? `${p.name}, ${p.jobTitle}` : p.name;
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => {
          typed.current = true;
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || !people.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, people.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(people[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? (enabled ? "Type a name to search your directory, or an email" : "name@company.com")}
        autoComplete="off"
        role={enabled ? "combobox" : undefined}
        aria-expanded={enabled ? open && people.length > 0 : undefined}
        aria-controls={enabled ? `${id}-list` : undefined}
        className={className ?? "input"}
      />
      {open && people.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {people.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx("cursor-pointer px-3 py-2 text-[13px]", i === active && "bg-brand-50")}
            >
              <span className="font-medium">{p.name}</span>
              <span className="block text-[11px] text-ink-500">
                {p.email}
                {p.jobTitle && ` · ${p.jobTitle}`}
                {p.department && ` · ${p.department}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
