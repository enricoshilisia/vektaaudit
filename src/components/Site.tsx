// Pieces shared by the public website pages.
import { Check } from "lucide-react";
import Link from "next/link";

export const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect width="30" height="30" rx="7" fill="#1F5FAE" />
    <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="23.5" cy="6.5" r="2.5" fill="#7FB2F0" />
  </svg>
);

export function SectionHead({ eyebrow, title, intro, center }: { eyebrow: string; title: string; intro?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[1px] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-[34px]">{title}</h2>
      {intro && <p className="mt-4 text-[17px] leading-relaxed text-ink-500">{intro}</p>}
    </div>
  );
}

export function Ticks({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t) => (
        <li key={t} className={`flex gap-2.5 text-[15px] leading-relaxed ${dark ? "text-navy-200" : "text-ink-700"}`}>
          <Check size={18} className={`mt-0.5 flex-none ${dark ? "text-[#7FB2F0]" : "text-brand-600"}`} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** The closing call to action used at the bottom of every page. */
export function CtaBand({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-navy-950 px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(600px_240px_at_50%_0%,#1F5FAE55,transparent)]" />
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight text-white">Put your next audit on one file.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] text-navy-200">Create your organisation, add a client and plan an engagement in a few minutes. Invite your team when you are ready.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {signedIn ? (
              <Link href="/dashboard" className="btn-primary h-11 px-6">
                Open the app
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn-primary h-11 px-6">
                  Create your organisation
                </Link>
                <Link href="/login" className="btn h-11 border-navy-700 bg-transparent px-6 text-white hover:bg-navy-900">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
