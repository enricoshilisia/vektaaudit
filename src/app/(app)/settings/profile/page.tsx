import type { Metadata } from "next";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { MIN_PASSWORD } from "@/lib/server/signin";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { changePassword, disableMfa, newCodes, updateProfile } from "../actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const s = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: s.sub }, include: { org: { select: { requireMfa: true } } } });
  const codesLeft = Array.isArray(u.recoveryCodes) ? u.recoveryCodes.length : 0;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <form action={updateProfile} className="card flex max-w-md flex-[1_1_340px] flex-col gap-4 p-6">
        <h2 className="text-[15px] font-semibold">Profile</h2>
        <div>
          <label htmlFor="name" className="label">
            Name (used on sign-offs and letters)
          </label>
          <input id="name" name="name" required minLength={2} defaultValue={u.name} className="input" />
        </div>
        <div>
          <label htmlFor="title" className="label">
            Title
          </label>
          <input id="title" name="title" defaultValue={u.title ?? ""} className="input" />
        </div>
        <div>
          <label htmlFor="certifications" className="label">
            Certifications
          </label>
          <input id="certifications" name="certifications" defaultValue={u.certifications ?? ""} className="input" placeholder="e.g. CIA, CISA, CPA(K)" />
        </div>
        <div className="w-40">
          <label htmlFor="weeklyHours" className="label">
            Working hours a week
          </label>
          <input id="weeklyHours" name="weeklyHours" type="number" min={1} max={80} defaultValue={u.weeklyHours} className="input" />
        </div>
        <p className="text-xs text-ink-500">Email: {u.email}</p>
        <button className="btn-primary self-start">Save</button>
      </form>
      <section className="card flex max-w-md flex-[1_1_340px] flex-col gap-3 p-6">
        <h2 className="text-[15px] font-semibold">Two-step sign-in</h2>
        {u.totpEnabledAt ? (
          <>
            <p className="text-sm">
              <span className="pill bg-ok-bg text-ok-fg">On</span> <span className="text-ink-500">since {fmtDate(u.totpEnabledAt)} · {codesLeft} recovery code{codesLeft === 1 ? "" : "s"} left</span>
            </p>
            <form action={newCodes} className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="nc-code" className="label">
                  Code from your app
                </label>
                <input id="nc-code" name="code" required inputMode="numeric" className="input w-32 font-mono" placeholder="123456" />
              </div>
              <button className="btn">New recovery codes</button>
            </form>
            {!u.org.requireMfa && (
              <form action={disableMfa} className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="off-code" className="label">
                    Code from your app
                  </label>
                  <input id="off-code" name="code" required inputMode="numeric" className="input w-32 font-mono" placeholder="123456" />
                </div>
                <button className="btn text-high-fg">Turn off</button>
              </form>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-500">Add a code from an authenticator app to your password, so a stolen password alone can&apos;t open your account.</p>
            <Link href="/setup-mfa" className="btn-primary self-start">
              Set up two-step sign-in
            </Link>
          </>
        )}
      </section>
      <form action={changePassword} className="card flex max-w-md flex-[1_1_340px] flex-col gap-4 p-6">
        <h2 className="text-[15px] font-semibold">Change password</h2>
        <div>
          <label htmlFor="current" className="label">
            Current password
          </label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
        </div>
        <div>
          <label htmlFor="next" className="label">
            New password (at least {MIN_PASSWORD} characters)
          </label>
          <input id="next" name="next" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
        </div>
        <button className="btn self-start">Change password</button>
      </form>
    </div>
  );
}
