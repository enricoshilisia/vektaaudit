import type { Metadata } from "next";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { MIN_PASSWORD } from "@/lib/server/signin";
import { changePassword, updateProfile } from "../actions";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const s = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: s.sub } });
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
