import bcrypt from "bcryptjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { db } from "@/lib/server/db";
import { msConfigured } from "@/lib/server/microsoft";
import { setPending } from "@/lib/server/mfa";
import { startSession } from "@/lib/server/signin";

export const metadata: Metadata = { title: "Sign in" };

const DUMMY_HASH = bcrypt.hashSync("no-such-user", 10);

async function signIn(form: FormData) {
  "use server";
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "");
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, active: true } });
  // compare even when there is no user, so a wrong email takes as long as a wrong password
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) redirect(`/login?error=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  // two-step sign-in: the password alone doesn't start a session
  if (user.totpEnabledAt && user.totpSecret) {
    await setPending(user.id, next);
    redirect("/login/verify");
  }
  await startSession(user);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; ms?: string }> }) {
  const { error, next, ms } = await searchParams;
  return (
    <AuthShell>
      <form action={signIn} className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-2xl font-semibold">Sign in</h2>
        {error && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{error === "expired" ? "That took too long. Please sign in again." : <>That email and password don&apos;t match.</>}</p>}
        {ms && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{ms}</p>}
        {msConfigured() && (
          <>
            <a href={`/api/microsoft/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn h-11 gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
                <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
                <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
                <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </a>
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span className="h-px flex-1 bg-line" />
              or with your password
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label htmlFor="email" className="label">
            Work email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <button className="btn-primary h-11">Sign in</button>
        <p className="text-center text-sm text-ink-500">
          New to VektaAudit?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Set up your organisation
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
