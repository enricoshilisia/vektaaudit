import clsx from "clsx";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ROLES, can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { invite, inviteGuest, revokeInvite, setActive, setGuestUntil, setRole } from "../actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const s = await requireUser();
  const admin = can(s, "admin");
  const [users, invites] = await Promise.all([
    db.user.findMany({ where: { orgId: s.org }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { guestAccess: { include: { engagement: { select: { code: true } } } } } }),
    admin ? db.invite.findMany({ where: { orgId: s.org, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3400";
  const roleLabel = (r: string) => (r === "GUEST" ? "Guest" : (ROLES.find((x) => x.key === r)?.label ?? r));
  const engagements = admin ? await db.engagement.findMany({ where: { orgId: s.org }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }) : [];
  const day = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="card min-w-0 flex-[999_1_560px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">People · {users.filter((u) => u.active).length} active</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="bg-[#F8FAFB]">
              <tr>
                <th className="th">Name</th>
                <th className="th">Role</th>
                <th className="th">Last sign-in</th>
                {admin && <th className="th" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={clsx("border-t border-line-soft", !u.active && "opacity-60")}>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} />
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">
                          {u.name}
                          {u.id === s.sub && <span className="font-normal text-ink-500"> (you)</span>}
                          {!u.active && <span className="pill ml-2 bg-line-soft text-ink-700">Deactivated</span>}
                        </span>
                        <span className="text-[11px] text-ink-500">
                          {u.email}
                          {u.title ? ` · ${u.title}` : ""}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    {u.role === "GUEST" ? (
                      <div className="flex flex-col gap-1">
                        <span>
                          Guest, read-only
                          {u.guestUntil && <span className={clsx("ml-1", u.guestUntil < new Date() ? "text-high-fg" : "text-ink-500")}>· {u.guestUntil < new Date() ? "ended" : "until"} {fmtDate(u.guestUntil)}</span>}
                        </span>
                        <span className="text-[11px] text-ink-500">{u.guestAccess.map((g) => g.engagement.code).join(", ") || "No engagements"}</span>
                        {admin && u.active && (
                          <form action={setGuestUntil.bind(null, u.id)} className="flex items-center gap-1.5">
                            <label htmlFor={`gu-${u.id}`} className="sr-only">
                              Access ends
                            </label>
                            <input id={`gu-${u.id}`} name="until" type="date" defaultValue={u.guestUntil ? day(u.guestUntil) : ""} className="input h-8 w-auto py-0 text-xs" />
                            <button className="btn btn-sm h-8">Change</button>
                          </form>
                        )}
                      </div>
                    ) : admin && u.active ? (
                      <form action={setRole.bind(null, u.id)} className="flex items-center gap-1.5">
                        <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="input h-8 w-auto py-0 text-xs">
                          {ROLES.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-sm h-8">Save</button>
                      </form>
                    ) : (
                      roleLabel(u.role)
                    )}
                  </td>
                  <td className="td tabular text-ink-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</td>
                  {admin && (
                    <td className="td text-right">
                      {u.id !== s.sub && (
                        <form action={setActive.bind(null, u.id, !u.active)}>
                          <button className={clsx("text-xs font-medium", u.active ? "text-high-fg" : "text-brand-600")}>{u.active ? "Deactivate" : "Reactivate"}</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {admin && (
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <form action={invite} className="card flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-semibold">Invite someone</h2>
            <div>
              <label htmlFor="i-email" className="label">
                Email
              </label>
              <input id="i-email" name="email" type="email" required className="input" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="i-name" className="label">
                  Name
                </label>
                <input id="i-name" name="name" className="input" />
              </div>
              <div className="flex-1">
                <label htmlFor="i-title" className="label">
                  Title
                </label>
                <input id="i-title" name="title" className="input" placeholder="e.g. Senior Auditor" />
              </div>
            </div>
            <fieldset>
              <legend className="label">Role</legend>
              <div className="flex flex-col gap-1.5">
                {ROLES.map((r) => (
                  <label key={r.key} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" name="role" value={r.key} defaultChecked={r.key === "AUDITOR"} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{r.label}</span> <span className="text-ink-500">— {r.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn-primary self-start">Create invitation</button>
            <p className="text-xs text-ink-500">You&apos;ll get a link to send them. It works once and expires after 7 days.</p>
          </form>

          <form action={inviteGuest} className="card flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-[15px] font-semibold">Give an external auditor or regulator access</h2>
              <p className="mt-1 text-xs text-ink-500">They see only the engagements you choose, read-only, until the date you set. Everything they open is recorded in the activity log.</p>
            </div>
            <div>
              <label htmlFor="g-email" className="label">
                Email
              </label>
              <input id="g-email" name="email" type="email" required className="input" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="g-name" className="label">
                  Name
                </label>
                <input id="g-name" name="name" className="input" />
              </div>
              <div className="flex-1">
                <label htmlFor="g-title" className="label">
                  Organisation
                </label>
                <input id="g-title" name="title" className="input" placeholder="e.g. External auditor, ABC LLP" />
              </div>
            </div>
            <div>
              <label htmlFor="g-until" className="label">
                Access ends
              </label>
              <input id="g-until" name="until" type="date" required defaultValue={day(new Date(Date.now() + 60 * 864e5))} className="input w-auto" />
            </div>
            <fieldset>
              <legend className="label">Engagements they may see</legend>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
                {engagements.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-canvas">
                    <input type="checkbox" name="engagements" value={e.id} className="mt-0.5" />
                    <span>
                      <span className="font-mono text-[11px] text-ink-500">{e.code}</span> {e.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn self-start">Create guest invitation</button>
          </form>

          {invites.length > 0 && (
            <section className="card flex flex-col gap-3 p-5">
              <h2 className="text-[15px] font-semibold">Open invitations</h2>
              {invites.map((i) => (
                <div key={i.id} className="flex flex-col gap-1.5 rounded-lg border border-line p-3 text-[13px]">
                  <span className="font-medium">
                    {i.name ?? i.email} <span className="font-normal text-ink-500">· {roleLabel(i.role)}</span>
                  </span>
                  <span className="text-xs text-ink-500">
                    {i.email} · expires {fmtDate(i.expiresAt)}
                  </span>
                  <input readOnly value={`${appUrl}/invite/${i.token}`} aria-label={`Invitation link for ${i.email}`} className="input h-8 font-mono text-[11px]" />
                  <form action={revokeInvite.bind(null, i.id)}>
                    <button className="text-xs font-medium text-high-fg">Revoke</button>
                  </form>
                </div>
              ))}
            </section>
          )}
        </aside>
      )}
    </div>
  );
}
