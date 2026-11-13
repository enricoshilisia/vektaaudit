import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { AuthShell } from "@/components/AuthShell";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { CODES_COOKIE, showCodesOnce } from "@/lib/server/mfa";
import { startSession } from "@/lib/server/signin";
import { clearFailures, newRecoveryCodes, newSecret, otpauthUrl, recordFailure, tooManyTries, verifyCode } from "@/lib/server/totp";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

async function me() {
  const s = await getSession();
  if (!s) redirect("/login");
  return { s, user: await db.user.findUniqueOrThrow({ where: { id: s.sub }, include: { org: { select: { requireMfa: true, name: true } } } }) };
}

/** Confirms the first code from the app, turns two-step sign-in on and makes recovery codes. */
async function enable(form: FormData) {
  "use server";
  const { user } = await me();
  if (user.totpEnabledAt || !user.totpSecret) redirect("/setup-mfa");
  if (tooManyTries(user.id)) redirect("/setup-mfa?error=locked");
  if (!verifyCode(user.totpSecret, String(form.get("code") ?? ""))) {
    recordFailure(user.id);
    redirect("/setup-mfa?error=code");
  }
  clearFailures(user.id);
  const { codes, hashes } = await newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), recoveryCodes: hashes } });
  await db.auditLog.create({ data: { orgId: user.orgId, actorName: user.name, action: "turned on two-step sign-in", entity: "user", entityId: user.id } });
  await showCodesOnce(codes);
  await startSession(user, "confirmed two-step sign-in", "mfa");
  redirect("/setup-mfa?done=1");
}

/** Someone who already has two-step sign-in confirms this session with a code (when it became required). */
async function confirm(form: FormData) {
  "use server";
  const { user } = await me();
  if (!user.totpEnabledAt || !user.totpSecret) redirect("/setup-mfa");
  if (tooManyTries(user.id)) redirect("/setup-mfa?error=locked");
  if (!verifyCode(user.totpSecret, String(form.get("code") ?? ""))) {
    recordFailure(user.id);
    redirect("/setup-mfa?error=code");
  }
  clearFailures(user.id);
  await startSession(user, "confirmed two-step sign-in", "mfa");
  redirect(user.role === "GUEST" ? "/guest" : "/dashboard");
}

const ERRORS: Record<string, string> = {
  code: "That code didn't work. Check the time on your phone is right, and enter the code showing now.",
  locked: "Too many wrong codes. Wait 15 minutes and try again.",
};

export default async function SetupMfaPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { done, error } = await searchParams;
  const { s, user } = await me();
  const home = user.role === "GUEST" ? "/guest" : "/dashboard";
  const err = error && ERRORS[error] ? <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{ERRORS[error]}</p> : null;

  // just turned on: show the recovery codes once
  if (done && user.totpEnabledAt) {
    const raw = (await cookies()).get(CODES_COOKIE)?.value;
    const codes = raw ? (JSON.parse(raw) as string[]) : [];
    return (
      <AuthShell>
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="text-2xl font-semibold">Two-step sign-in is on</h2>
          {codes.length > 0 ? (
            <>
              <p className="text-sm text-ink-700">Keep these recovery codes somewhere safe, away from your phone. Each one works once, if you lose your phone. You won&apos;t see them again.</p>
              <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-4 font-mono text-[15px]">
                {codes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-ink-500">Your recovery codes were shown when you set this up.</p>
          )}
          <Link href={home} className="btn-primary self-start">
            Continue
          </Link>
        </div>
      </AuthShell>
    );
  }

  // already on, but this session hasn't been confirmed with a code
  if (user.totpEnabledAt) {
    if (s.m === "mfa") redirect(home);
    return (
      <AuthShell>
        <form action={confirm} className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="text-2xl font-semibold">Enter your code</h2>
          <p className="text-sm text-ink-500">{user.org.name} requires two-step sign-in. Enter the 6-digit code from your authenticator app to continue.</p>
          {err}
          <input name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" aria-label="Code" className="input text-center font-mono text-lg tracking-[0.3em]" placeholder="123456" />
          <button className="btn-primary h-11">Continue</button>
        </form>
      </AuthShell>
    );
  }

  // set up: a secret waiting for its first code
  let secret = user.totpSecret;
  if (!secret) {
    secret = newSecret();
    await db.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }
  const url = otpauthUrl(secret, user.email, "VektaAudit");
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 200 });
  return (
    <AuthShell>
      <form action={enable} className="flex w-full max-w-sm flex-col gap-4">
        <h2 className="text-2xl font-semibold">Set up two-step sign-in</h2>
        <p className="text-sm text-ink-700">
          {user.org.requireMfa ? `${user.org.name} requires a code from an authenticator app when you sign in with a password. ` : ""}
          Scan this with Microsoft Authenticator, Google Authenticator or a similar app, then enter the 6-digit code it shows.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code to add VektaAudit to your authenticator app" width={200} height={200} className="rounded-lg border border-line" />
        <details className="text-xs text-ink-500">
          <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
          <p className="mt-1 break-all font-mono text-[13px] text-ink">{secret.match(/.{1,4}/g)!.join(" ")}</p>
        </details>
        {err}
        <div>
          <label htmlFor="code" className="label">
            Code from the app
          </label>
          <input id="code" name="code" required autoComplete="one-time-code" inputMode="numeric" className="input text-center font-mono text-lg tracking-[0.3em]" placeholder="123456" />
        </div>
        <button className="btn-primary h-11">Turn on two-step sign-in</button>
        {!user.org.requireMfa && (
          <Link href="/settings/profile" className="text-sm text-ink-500">
            Not now
          </Link>
        )}
      </form>
    </AuthShell>
  );
}
