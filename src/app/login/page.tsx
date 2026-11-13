import bcrypt from "bcryptjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { db } from "@/lib/server/db";
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
  await startSession(user);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <AuthShell>
      <form action={signIn} className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-2xl font-semibold">Sign in</h2>
        {error && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">That email and password don&apos;t match.</p>}
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
