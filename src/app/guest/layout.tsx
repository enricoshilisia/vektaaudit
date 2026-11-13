import { LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

/** The guest area: external auditors and regulators, read-only, only the engagements they were given. */
export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "GUEST") redirect("/dashboard");
  const [u, org] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: s.sub } }), db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { name: true, requireMfa: true } })]);
  if (org.requireMfa && s.m !== "mfa" && s.m !== "microsoft") redirect("/setup-mfa");
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy-950 px-4 py-3 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Link href="/guest" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
              <rect width="30" height="30" rx="7" fill="#1F5FAE" />
              <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[15px] font-semibold">{org.name}</span>
          </Link>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-navy-200">Guest access, read-only</span>
          <span className="ml-auto text-xs text-navy-300">
            {u.name} · until {fmtDate(u.guestUntil)}
          </span>
          <form action="/logout" method="post">
            <button aria-label="Sign out" className="flex h-8 w-8 items-center justify-center rounded-md text-navy-300 hover:bg-white/10 hover:text-white">
              <LogOut size={16} aria-hidden />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:px-8">{children}</main>
    </div>
  );
}
