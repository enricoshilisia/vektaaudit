import bcrypt from "bcryptjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { CURRENCIES } from "@/lib/format";
import { db } from "@/lib/server/db";
import { MIN_PASSWORD, emailTaken, startSession } from "@/lib/server/signin";

export const metadata: Metadata = { title: "Set up your organisation" };

const ERRORS: Record<string, string> = {
  fields: "Fill in every field.",
  email: "That doesn't look like an email address.",
  password: `Use a password of at least ${MIN_PASSWORD} characters.`,
  taken: "An account with that email already exists. Sign in instead, or ask your admin to invite you.",
};

async function signUp(form: FormData) {
  "use server";
  const v = (k: string) => String(form.get(k) ?? "").trim();
  const [orgName, name, email, password] = [v("orgName"), v("name"), v("email").toLowerCase(), String(form.get("password") ?? "")];
  const kind = v("kind") === "internal" ? "internal" : "firm";
  const currency = CURRENCIES.includes(v("currency")) ? v("currency") : "KES";
  if (orgName.length < 2 || name.length < 2 || !email || !password) redirect("/signup?error=fields");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/signup?error=email");
  if (password.length < MIN_PASSWORD) redirect("/signup?error=password");
  if (await emailTaken(email)) redirect("/signup?error=taken");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName.slice(0, 120), kind, currency } });
    const u = await tx.user.create({ data: { orgId: org.id, email, name: name.slice(0, 80), title: v("title").slice(0, 80) || null, role: "ADMIN", passwordHash } });
    await tx.auditLog.create({ data: { orgId: org.id, actorName: u.name, action: "created organisation", entity: "organization", entityId: org.id, detail: org.name } });
    return u;
  });
  await startSession(user, "signed up");
  redirect("/dashboard");
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <form action={signUp} className="flex w-full max-w-md flex-col gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Set up your organisation</h2>
          <p className="mt-1 text-sm text-ink-500">You&apos;ll be its admin. Add your clients and invite your team next.</p>
        </div>
        {error && ERRORS[error] && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{ERRORS[error]}</p>}
        <fieldset>
          <legend className="label">You are</legend>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-start gap-2 rounded-lg border border-line-strong p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="kind" value="firm" defaultChecked className="mt-1" />
              <span>
                <span className="font-medium">An audit firm</span>
                <span className="block text-xs text-ink-500">You audit other companies</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-line-strong p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="kind" value="internal" className="mt-1" />
              <span>
                <span className="font-medium">An internal audit team</span>
                <span className="block text-xs text-ink-500">You audit your own organisation</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="flex gap-3">
          <div className="flex-[3]">
            <label htmlFor="orgName" className="label">
              Firm or organisation name
            </label>
            <input id="orgName" name="orgName" required minLength={2} className="input" />
          </div>
          <div className="flex-1">
            <label htmlFor="currency" className="label">
              Currency
            </label>
            <select id="currency" name="currency" defaultValue="KES" className="input">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" name="name" required minLength={2} autoComplete="name" className="input" />
          </div>
          <div className="flex-1">
            <label htmlFor="title" className="label">
              Your title
            </label>
            <input id="title" name="title" className="input" placeholder="e.g. Audit Partner" />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="label">
            Work email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password (at least {MIN_PASSWORD} characters)
          </label>
          <input id="password" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
        </div>
        <button className="btn-primary h-11">Create organisation</button>
        <p className="text-center text-sm text-ink-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
