import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DORMANT_DAYS, conflictsFor, daysSince, decisionOf } from "@/lib/itaudit";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { emailListOwner, markDone, setListOwner, setReviewStatus, uploadUsers } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await db.accessReview.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: r?.title ?? "Access review" };
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const r = await db.accessReview.findFirst({
    where: { id: (await params).id, orgId: s.org },
    include: { org: { select: { msTenantId: true, msMailbox: true } }, lists: { orderBy: { system: { name: "asc" } }, include: { system: { include: { sodRules: true } }, entries: { orderBy: { account: "asc" } } } } },
  });
  if (!r) notFound();
  const manage = can(s, "manage");
  const work = can(s, "work");
  const canMail = !!(r.org.msTenantId && r.org.msMailbox);
  const appUrl = process.env.APP_URL ?? "http://localhost:3400";
  const all = r.lists.flatMap((l) => l.entries.map((e) => ({ ...e, list: l, conflicts: conflictsFor(e.roles, l.system.sodRules) })));
  const decided = all.filter((e) => e.decision);
  const toAction = all.filter((e) => (e.decision === "remove" || e.decision === "change") && !e.removedAt);
  const conflictsKept = all.filter((e) => e.conflicts.length && e.decision === "keep");

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/it-audit" className="hover:text-ink">
          IT audit
        </Link>
        <span aria-hidden>/</span>
        <span>{r.title}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">{r.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {r.dueDate ? `Due ${fmtDate(r.dueDate)} · ` : ""}Started by {r.createdBy}
          </p>
        </div>
        {manage && (
          <form action={setReviewStatus.bind(null, r.id, r.status === "open" ? "closed" : "open")}>
            <button className="btn">{r.status === "open" ? "Close review" : "Reopen"}</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Accounts" value={all.length} sub={`${r.lists.length} systems`} />
        <Stat label="Decided" value={all.length ? `${Math.round((decided.length / all.length) * 100)}%` : "—"} sub={`${decided.length} of ${all.length}`} />
        <Stat label="To remove or change" value={all.filter((e) => e.decision === "remove" || e.decision === "change").length} sub={`${toAction.length} not yet done by IT`} tone={toAction.length ? "amber" : undefined} />
        <Stat label="Conflicting access" value={all.filter((e) => e.conflicts.length).length} sub={`${conflictsKept.length} kept by the owner`} tone={conflictsKept.length ? "red" : undefined} />
        <Stat label={`No login for ${DORMANT_DAYS}+ days`} value={all.filter((e) => (daysSince(e.lastLogin) ?? 0) >= DORMANT_DAYS).length} />
      </div>

      {r.lists.map((l) => {
        const es = all.filter((e) => e.listId === l.id);
        const done = es.filter((e) => e.decision).length;
        return (
          <section key={l.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">
                  <Link href={`/it-audit/${l.systemId}`} className="hover:text-brand-700">
                    {l.system.name}
                  </Link>
                </h2>
                <p className="text-xs text-ink-500">
                  {es.length ? `${done} of ${es.length} decided` : "No user list loaded yet"}
                  {l.submittedAt && ` · owner finished ${fmtDate(l.submittedAt)}`}
                  {l.lastSeenAt && !l.submittedAt && ` · owner opened ${fmtDateTime(l.lastSeenAt)}`}
                  {l.emailedAt && ` · emailed ${fmtDate(l.emailedAt)}`}
                </p>
              </div>
              {r.status === "open" && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <input readOnly value={`${appUrl}/ar/${l.token}`} aria-label={`Link for the owner of ${l.system.name}`} className="input h-8 w-64 font-mono text-[11px]" />
                  {manage && canMail && l.ownerEmail && es.length > 0 && (
                    <form action={emailListOwner.bind(null, l.id)}>
                      <button className="btn btn-sm">Email {l.ownerName}</button>
                    </form>
                  )}
                </div>
              )}
            </div>
            {r.status === "open" && (manage || work) && (
              <div className="grid gap-4 border-b border-line-soft bg-canvas/50 px-5 py-3 lg:grid-cols-2">
                {manage && (
                  <form action={setListOwner.bind(null, l.id)} className="flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor={`on-${l.id}`} className="label">
                        Owner
                      </label>
                      <input id={`on-${l.id}`} name="name" defaultValue={l.ownerName} className="input h-8 w-40 text-[12px]" />
                    </div>
                    <div>
                      <label htmlFor={`oe-${l.id}`} className="label">
                        Owner email
                      </label>
                      <input id={`oe-${l.id}`} name="email" type="email" defaultValue={l.ownerEmail ?? ""} className="input h-8 w-52 text-[12px]" />
                    </div>
                    <button className="btn btn-sm">Save</button>
                  </form>
                )}
                {work && !l.submittedAt && (
                  <form action={uploadUsers.bind(null, l.id)} className="flex flex-wrap items-end gap-2">
                    <div>
                      <label htmlFor={`f-${l.id}`} className="label">
                        User list from IT (CSV: account, name, roles, department, last login)
                      </label>
                      <input id={`f-${l.id}`} name="file" type="file" accept=".csv,text/csv" required className="block text-[12px]" />
                    </div>
                    <button className="btn btn-sm">{es.length ? "Replace list" : "Load list"}</button>
                  </form>
                )}
              </div>
            )}
            {es.length > 0 && (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[900px] text-[12.5px]">
                  <thead className="sticky top-0 bg-[#F8FAFB]">
                    <tr>
                      <th className="th">Account</th>
                      <th className="th">Roles</th>
                      <th className="th">Last login</th>
                      <th className="th">Owner&apos;s decision</th>
                      <th className="th">IT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {es.map((e) => {
                      const dec = decisionOf(e.decision);
                      const dormant = (daysSince(e.lastLogin) ?? 0) >= DORMANT_DAYS;
                      return (
                        <tr key={e.id} className={clsx("border-t border-line-soft align-top", e.conflicts.length > 0 && "bg-high-bg/30")}>
                          <td className="td">
                            <span className="font-medium">{e.account}</span>
                            <div className="text-[11px] text-ink-500">{[e.person, e.department].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td className="td">
                            {e.roles}
                            {e.conflicts.map((c) => (
                              <div key={c.roleA + c.roleB} className="mt-1 text-[11px] font-medium text-high-fg">
                                Conflict: {c.roleA} + {c.roleB}
                              </div>
                            ))}
                          </td>
                          <td className={clsx("td tabular", dormant && "font-medium text-med-fg")}>
                            {e.lastLogin ?? "—"}
                            {dormant && <div className="text-[11px]">{daysSince(e.lastLogin)} days ago</div>}
                          </td>
                          <td className="td">
                            {dec ? <span className={clsx("pill", dec.cls)}>{dec.label}</span> : <span className="text-ink-400">Waiting</span>}
                            {e.comment && <p className="mt-1 text-ink-700">{e.comment}</p>}
                          </td>
                          <td className="td">
                            {e.decision === "remove" || e.decision === "change" ? (
                              e.removedAt ? (
                                <span className="text-[11px] text-ok-fg">
                                  Done by {e.removedBy}, {fmtDate(e.removedAt)}
                                </span>
                              ) : work ? (
                                <form action={markDone.bind(null, e.id)}>
                                  <button className="btn btn-sm">Mark done</button>
                                </form>
                              ) : (
                                <span className="text-[11px] text-med-fg">Waiting for IT</span>
                              )
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
