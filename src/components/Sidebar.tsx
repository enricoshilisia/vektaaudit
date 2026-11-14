"use client";

import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  BarChart3,
  Building2,
  CalendarRange,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  FileText,
  FolderOpen,
  Scale,
  Server,
  Globe,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Presentation,
  Settings,
  ShieldCheck,
  Table2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RAIL_COOKIE, clientWord, initials } from "@/lib/format";

type CountKey = "engagements" | "requests" | "findings";
type Item = { href: string; label: string; icon: LucideIcon; count?: CountKey };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/clients", label: "Clients", icon: Building2 },
      {
        href: "/engagements",
        label: "Engagements",
        icon: ClipboardList,
        count: "engagements",
      },
    ],
  },
  {
    title: "Planning",
    items: [
      { href: "/universe", label: "Audit universe", icon: Globe },
      { href: "/plan", label: "Audit plan", icon: CalendarRange },
      { href: "/controls", label: "Risks & controls", icon: ShieldCheck },
      { href: "/programs", label: "Work programs", icon: BookOpen },
    ],
  },
  {
    title: "Fieldwork",
    items: [
      { href: "/trial-balance", label: "Trial balance", icon: Table2 },
      { href: "/documents", label: "Documents", icon: FolderOpen },
      {
        href: "/requests",
        label: "Evidence requests",
        icon: MessageSquareText,
        count: "requests",
      },
      {
        href: "/findings",
        label: "Findings",
        icon: AlertTriangle,
        count: "findings",
      },
      { href: "/self-assessment", label: "Self-assessment", icon: ListChecks },
    ],
  },
  {
    title: "Assurance",
    items: [
      { href: "/analytics", label: "Data analytics", icon: BarChart3 },
      { href: "/it-audit", label: "IT audit", icon: Server },
      { href: "/compliance", label: "Compliance", icon: Scale },
    ],
  },
  {
    title: "Reporting",
    items: [
      { href: "/reports", label: "Reports & letters", icon: FileText },
      { href: "/committee", label: "Audit committee", icon: Presentation },
      { href: "/activity", label: "Activity log", icon: Activity },
    ],
  },
  {
    title: "Team",
    items: [
      { href: "/resources", label: "Resources", icon: Users },
      { href: "/time", label: "My time", icon: Clock },
      { href: "/quality", label: "Quality", icon: Award },
    ],
  },
];

// phase → dot colour, matching the phase pills
const PHASE_DOT: Record<string, string> = {
  planning: "#8FA3B8",
  risk: "#8FA3B8",
  fieldwork: "#5C8FD1",
  review: "#E59A3A",
  reporting: "#3FA587",
  followup: "#9C7BD6",
};

const ROLE: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  AUDITOR: "Auditor",
  VIEWER: "Viewer",
};

type Props = {
  rail: boolean;
  org: { name: string; kind: string; currency: string };
  user: { name: string; title: string | null; role: string };
  counts: Record<CountKey, number>;
  late: { requests: boolean; findings: boolean };
  recent: {
    id: string;
    code: string;
    name: string;
    phase: string;
    client: string | null;
  }[];
  canCreate: boolean;
};

function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      aria-hidden="true"
      className="flex-none"
    >
      <rect width="30" height="30" rx="7" fill="#1F5FAE" />
      <path
        d="M8 9l7 13 7-13"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22.5" cy="22.5" r="2.2" fill="#7FB2F0" />
    </svg>
  );
}

function Nav({
  p,
  rail,
  onNavigate,
}: {
  p: Props;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const word = clientWord(p.org.kind);
  const isOn = (href: string) => path === href || path.startsWith(href + "/");

  const link = (it: Item) => {
    const on = isOn(it.href);
    const n = it.count ? p.counts[it.count] : 0;
    const late =
      it.count === "requests"
        ? p.late.requests
        : it.count === "findings"
          ? p.late.findings
          : false;
    const label = it.href === "/clients" ? word.many : it.label;
    return (
      <Link
        key={it.href}
        href={it.href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        title={rail ? label : undefined}
        className={clsx(
          "group relative flex h-[34px] flex-none items-center gap-3 rounded-md text-[13.5px] transition-colors",
          rail ? "justify-center px-0" : "px-3",
          on
            ? "bg-white/[0.08] font-medium text-white"
            : "text-navy-200 hover:bg-white/[0.04] hover:text-white",
        )}
      >
        {on && (
          <span
            className="absolute -left-3 top-1.5 h-6 w-[3px] rounded-r bg-[#7FB2F0]"
            aria-hidden
          />
        )}
        <it.icon
          size={17}
          strokeWidth={1.7}
          className={clsx(
            "flex-none",
            on ? "text-[#7FB2F0]" : "text-navy-300 group-hover:text-white",
          )}
          aria-hidden
        />
        {!rail && <span className="flex-1 truncate">{label}</span>}
        {n > 0 &&
          (rail ? (
            <span
              className={clsx(
                "absolute right-1.5 top-1.5 h-2 w-2 rounded-full",
                late ? "bg-[#F97066]" : "bg-[#7FB2F0]",
              )}
              aria-label={`${n}${late ? ", some overdue" : ""}`}
            />
          ) : (
            <span
              className={clsx(
                "tabular rounded px-1.5 text-[11px] font-semibold leading-5",
                late
                  ? "bg-[#F97066]/15 text-[#FDA29B]"
                  : "bg-white/[0.07] text-navy-200",
              )}
              title={late ? "Some are overdue" : undefined}
            >
              {n}
            </span>
          ))}
      </Link>
    );
  };

  return (
    <>
      {/* organisation */}
      <Link
        href="/settings/organisation"
        onClick={onNavigate}
        title={rail ? p.org.name : undefined}
        className={clsx(
          "mb-2 flex flex-none items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
          rail ? "justify-center p-1.5" : "p-2.5",
        )}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#E8F0FB] text-[12px] font-bold text-[#163F78]">
          {initials(p.org.name)}
        </span>
        {!rail && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13px] font-semibold text-white">
              {p.org.name}
            </span>
            <span className="truncate text-[11px] text-navy-300">
              {p.org.kind === "internal" ? "Internal audit" : "Audit firm"} ·{" "}
              {p.org.currency}
            </span>
          </span>
        )}
      </Link>

      {p.canCreate && (
        <Link
          href="/engagements/new"
          onClick={onNavigate}
          title={rail ? "New engagement" : undefined}
          className={clsx(
            "mb-3 flex h-9 flex-none items-center gap-2 rounded-md bg-brand-600 text-[13px] font-medium text-white hover:bg-brand-700",
            rail ? "justify-center" : "px-3",
          )}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          {!rail && "New engagement"}
        </Link>
      )}

      {/* the links scroll on short screens; settings and the user stay pinned at the bottom */}
      <div
        className={clsx(
          "flex min-h-0 !flex-1 flex-col overflow-y-auto [scrollbar-color:rgba(255,255,255,.15)_transparent] [scrollbar-width:thin]",
          rail ? "-mx-2.5 px-2.5" : "-mx-3 px-3",
        )}
      >
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-2 flex flex-none flex-col gap-0.5">
            {rail ? (
              <span
                className="mx-auto my-1.5 h-px w-6 bg-white/10"
                aria-hidden
              />
            ) : (
              <span className="px-3 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.9px] text-navy-300/80">
                {g.title}
              </span>
            )}
            {g.items.map(link)}
          </div>
        ))}

        {!rail && p.recent.length > 0 && (
          <div className="mb-2 flex flex-none flex-col gap-0.5">
            <span className="px-3 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.9px] text-navy-300/80">
              Your engagements
            </span>
            {p.recent.map((e) => {
              const on = path.startsWith(`/engagements/${e.id}`);
              return (
                <Link
                  key={e.id}
                  href={`/engagements/${e.id}`}
                  onClick={onNavigate}
                  className={clsx(
                    "flex items-start gap-2.5 rounded-md px-3 py-1.5",
                    on ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className="mt-[7px] h-[7px] w-[7px] flex-none rounded-full"
                    style={{ background: PHASE_DOT[e.phase] ?? "#8FA3B8" }}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span
                      className={clsx(
                        "truncate text-[13px]",
                        on ? "text-white" : "text-navy-200",
                      )}
                    >
                      {e.name}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-navy-300">
                      {e.code}
                      {e.client ? ` · ${e.client}` : ""}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-none flex-col gap-0.5 border-t border-white/[0.08] pt-3">
        {link({ href: "/settings", label: "Settings", icon: Settings })}
        <div
          className={clsx(
            "mt-1 flex items-center gap-2.5 rounded-md py-2",
            rail ? "flex-col px-0" : "px-3",
          )}
        >
          <Link
            href="/settings/profile"
            onClick={onNavigate}
            title={rail ? p.user.name : "Your profile"}
            className="flex min-w-0 flex-1 items-center gap-2.5"
          >
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#2C5282] text-[12px] font-semibold text-white ring-2 ring-white/10">
              {initials(p.user.name)}
            </span>
            {!rail && (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-medium text-white">
                  {p.user.name}
                </span>
                <span className="truncate text-[11px] text-navy-300">
                  {ROLE[p.user.role] ?? p.user.role}
                  {p.user.title ? ` · ${p.user.title}` : ""}
                </span>
              </span>
            )}
          </Link>
          <form action="/logout" method="post">
            <button
              aria-label="Sign out"
              title="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-md text-navy-300 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut size={16} aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function Sidebar(p: Props) {
  const [rail, setRail] = useState(p.rail);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const toggle = () => {
    const next = !rail;
    setRail(next);
    document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      {/* phones and tablets: a bar with a menu button; the navigation slides in */}
      <div className="flex h-14 items-center gap-3 bg-navy-950 px-4 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/[0.06]"
        >
          <Menu size={20} aria-hidden />
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Mark size={26} />
          <span className="text-[15px] font-bold text-white">VektaAudit</span>
        </Link>
        <span className="ml-auto truncate text-xs text-navy-300">
          {p.org.name}
        </span>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            className="absolute inset-0 bg-[#06121F]/60"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <nav
            aria-label="Main"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-navy-950 px-3 pb-4 pt-3 [&>*]:flex-none"
          >
            <div className="mb-4 flex items-center justify-between px-1">
              <span className="flex items-center gap-2">
                <Mark size={26} />
                <span className="text-[15px] font-bold text-white">
                  VektaAudit
                </span>
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-md text-navy-200 hover:bg-white/[0.06]"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <Nav p={p} rail={false} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      )}

      {/* desktop */}
      <nav
        aria-label="Main"
        className={clsx(
          "sticky top-0 hidden h-screen flex-none flex-col overflow-y-auto border-r border-black/20 bg-navy-950 pb-3 pt-4 transition-[width] duration-200 lg:flex [&>*]:flex-none",
          rail ? "w-[72px] px-2.5" : "w-[264px] px-3",
        )}
      >
        <div
          className={clsx(
            "mb-4 flex items-center",
            rail ? "flex-col gap-3" : "justify-between pl-1",
          )}
        >
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5"
            title={rail ? "VektaAudit" : undefined}
          >
            <Mark />
            {!rail && (
              <span className="text-[16px] font-bold tracking-[0.2px] text-white">
                VektaAudit
              </span>
            )}
          </Link>
          <button
            onClick={toggle}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            title={rail ? "Expand" : "Collapse"}
            className="flex h-8 w-8 items-center justify-center rounded-md text-navy-300 hover:bg-white/[0.06] hover:text-white"
          >
            {rail ? (
              <ChevronsRight size={16} aria-hidden />
            ) : (
              <ChevronsLeft size={16} aria-hidden />
            )}
          </button>
        </div>
        <Nav p={p} rail={rail} />
      </nav>
    </>
  );
}
