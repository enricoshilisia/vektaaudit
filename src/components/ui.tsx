import clsx from "clsx";
import Link from "next/link";
import { initials } from "@/lib/format";

export function Pill({ p, className }: { p: { label: string; cls: string }; className?: string }) {
  return <span className={clsx("pill", p.cls, className)}>{p.label}</span>;
}

export function SeverityPill({ s }: { s: { label: string; cls: string; dot: string } }) {
  return (
    <span className={clsx("pill font-semibold", s.cls)}>
      <span className={clsx("h-[7px] w-[7px] rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[13px] text-ink-500">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "red" | "amber" }) {
  return (
    <div className="card flex flex-col gap-1.5 px-5 py-[18px]">
      <span className="text-[13px] font-medium text-ink-500">{label}</span>
      <span className="tabular text-[30px] font-semibold tracking-tight">{value}</span>
      {sub && <span className={clsx("text-xs", tone === "red" ? "text-high-fg" : tone === "amber" ? "text-med-fg" : "text-ink-500")}>{sub}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; n?: number }[]; active: string }) {
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={on}
            className={clsx(
              "whitespace-nowrap border-b-2 px-3 pb-3 pt-2.5 text-sm",
              on ? "border-brand-600 font-semibold text-brand-800" : "border-transparent text-ink-500 hover:text-ink",
            )}
          >
            {t.label}
            {t.n !== undefined && t.n > 0 && <span className="ml-1.5 rounded-full bg-line-soft px-1.5 py-px text-[11px] text-ink-700">{t.n}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={clsx("flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#2C5282] text-[11px] font-semibold text-white", className)}>{initials(name)}</span>;
}
