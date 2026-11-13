import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { db } from "@/lib/server/db";
import { clearPending, readPending } from "@/lib/server/mfa";
import { startSession } from "@/lib/server/signin";
import { clearFailures, recordFailure, tooManyTries, useRecoveryCode, verifyCode } from "@/lib/server/totp";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

async function verify(form: FormData) {
  "use server";
  const p = await readPending();
  if (!p) redirect("/login?error=expired");
  const user = await db.user.findFirst({ where: { id: p.userId, active: true } });
  if (!user?.totpSecret || !user.totpEnabledAt) redirect("/login");
  if (tooManyTries(user.id)) redirect("/login/verify?error=locked");
  const code = String(form.get("code") ?? "").trim();
  let ok = verifyCode(user.totpSecret, code);
  if (!ok && code.includes("-")) {
    const left = await useRecoveryCode((user.recoveryCodes as string[] | null) ?? [], code);
    if (left) {
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: left } });
      await db.auditLog.create({ data: { orgId: user.orgId, actorName: user.name, action: "used a recovery code", entity: "user", entityId: user.id, detail: `${left.length} left` } });
      ok = true;
    }
  }
  if (!ok) {
    recordFailure(user.id);
    redirect("/login/verify?error=code");
  }
  clearFailures(user.id);
  await clearPending();
  await startSession(user, "signed in with two-step sign-in", "mfa");
  redirect(p.next.startsWith("/") && !p.next.startsWith("//") ? p.next : "/dashboard");
}

const ERRORS: Record<string, string> = {
  code: "That code didn't work. Codes change every 30 seconds; enter the one showing now.",
  locked: "Too many wrong codes. Wait 15 minutes, then sign in again.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const p = await readPending();
  return (
    <AuthShell>
      {!p ? (
        <div className="flex max-w-sm flex-col gap-3">
          <h2 className="text-2xl font-semibold">Sign in again</h2>
          <p className="text-sm text-ink-500">This step took more than five minutes.</p>
          <Link href="/login" className="btn self-start">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form action={verify} className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="text-2xl font-semibold">Enter your code</h2>
          <p className="text-sm text-ink-500">Open your authenticator app and enter the 6-digit code for VektaAudit.</p>
          {error && ERRORS[error] && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{ERRORS[error]}</p>}
          <div>
            <label htmlFor="code" className="label">
              Code
            </label>
            <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" className="input text-center font-mono text-lg tracking-[0.3em]" placeholder="123456" />
          </div>
          <button className="btn-primary h-11">Continue</button>
          <p className="text-xs text-ink-500">Lost your phone? Enter one of your recovery codes instead (like abcd-efgh).</p>
        </form>
      )}
    </AuthShell>
  );
}
