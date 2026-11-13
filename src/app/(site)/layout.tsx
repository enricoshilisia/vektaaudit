import Link from "next/link";
import { Logo } from "@/components/Site";
import { getSession } from "@/lib/server/auth";


const NAV = [
  { href: "/features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#who", label: "Who it's for" },
  { href: "/security", label: "Security" },
];

/** The public website: header, page, footer. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[17px] font-bold tracking-tight text-navy-950">VektaAudit</span>
          </Link>
          <nav aria-label="Site" className="hidden flex-1 items-center gap-6 text-sm font-medium text-ink-700 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-brand-600">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {s ? (
              <Link href="/dashboard" className="btn-primary">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn hidden border-transparent sm:inline-flex">
                  Sign in
                </Link>
                <Link href="/signup" className="btn-primary">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
        <nav aria-label="Site (mobile)" className="flex gap-5 overflow-x-auto border-t border-line-soft px-4 py-2 text-[13px] font-medium text-ink-700 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap">
              {n.label}
            </Link>
          ))}
          {!s && (
            <Link href="/login" className="whitespace-nowrap text-brand-600">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-navy-950 text-navy-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[17px] font-bold text-white">VektaAudit</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-navy-300">Audit management for audit firms and internal audit teams: one file from planning to the final report.</p>
          </div>
          <FooterCol title="Product" links={[["/features", "Features"], ["/#how", "How it works"], ["/security", "Security"]]} />
          <FooterCol title="For" links={[["/#who", "Audit firms"], ["/#who", "Internal audit"], ["/#who", "Audit committees"]]} />
          <FooterCol title="Account" links={[["/signup", "Create an account"], ["/login", "Sign in"]]} />
        </div>
        <div className="border-t border-navy-800">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-navy-300 sm:px-6">© {new Date().getFullYear()} VektaAudit</p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.6px] text-white">{title}</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map(([href, label]) => (
          <li key={label}>
            <Link href={href} className="hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
