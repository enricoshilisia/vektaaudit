import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { addDays, isoDay, quarterOf, weekStart, weeksElapsed } from "@/lib/time";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addAssignment, removeAssignment } from "../time/actions";

export const metadata: Metadata = { title: "Resources" };

const WEEKS = 8;
const KIND_CLS: Record<string, string> = { audit: "bg-brand-100 text-brand-800", leave: "bg-line-soft text-ink-500", training: "bg-violet-bg text-violet-fg", other: "bg-med-bg text-med-fg" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const s = await requireUser();
  const { from } = await searchParams;
  const manage = can(s, "manage");
  const start = weekStart(from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T12:00:00`) : new Date());
  const end = addDays(start, WEEKS * 7);
  const q = quarterOf(new Date());
  const [people, assignments, time, engagements] = await Promise.all([
    db.user.findMany({ where: { orgId: s.org, active: true, role: { not: "VIEWER" } }, orderBy: { name: "asc" } }),
    db.assignment.findMany({ where: { orgId: s.org, start: { lt: end }, end: { gte: start } }, include: { engagement: { select: { code: true, name: true } } }, orderBy: { start: "asc" } }),
    db.timeEntry.findMany({ where: { orgId: s.org, date: { gte: q.start, lte: q.end } }, select: { userId: true, hours: true, category: true } }),
    db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, budgetHours: true, actualHours: true, lead: { select: { name: true } } } }),
  ]);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(start, i * 7));
  const inWeek = (a: (typeof assignments)[number], w: Date) => a.start < addDays(w, 7) && a.end >= w;
  const elapsed = weeksElapsed(q.start, q.end);

  const rows = people.map((p) => {
    const mine = time.filter((t) => t.userId === p.id);
    const auditH = mine.filter((t) => t.category === "audit").reduce((a, t) => a + t.hours, 0);
    const leaveH = mine.filter((t) => t.category === "leave").reduce((a, t) => a + t.hours, 0);
    const available = Math.max(1, p.weeklyHours * elapsed - leaveH);
    return { p, auditH, util: Math.round((auditH / available) * 100), cells: weeks.map((w) => assignments.filter((a) => a.userId === p.id && inWeek(a, w))) };
  });
  const clashes = rows.reduce((n, r) => n + r.cells.filter((c) => c.filter((a) => a.kind === "audit").length > 1 || (c.some((a) => a.kind === "leave") && c.some((a) => a.kind === "audit"))).length, 0);
  const unbooked = rows.filter((r) => r.cells.slice(0, 4).every((c) => c.length === 0)).length;
  const avgUtil = rows.length ? Math.round(rows.reduce((a, r) => a + r.util, 0) / rows.length) : 0;
  const over = engagements.filter((e) => e.budgetHours && e.actualHours > e.budgetHours);

  return (
    <>
      <PageHeader title="Resources & time" sub="Who is booked on what, their skills, and how actual hours compare with each audit's budget." actions={<Link href="/time" className="btn">My time</Link>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Audit utilisation, ${q.label}`} value={`${avgUtil}%`} sub="Audit hours ÷ hours available" tone={avgUtil > 100 ? "red" : avgUtil < 60 ? "amber" : undefined} />
        <Stat label="Booking clashes" value={clashes} sub="Next 8 weeks" tone={clashes ? "red" : undefined} />
        <Stat label="Not booked in the next 4 weeks" value={unbooked} sub={`of ${rows.length} people`} tone={unbooked ? "amber" : undefined} />
        <Stat label="Engagements over budget" value={over.length} sub={`of ${engagements.filter((e) => e.budgetHours).length} with a budget`} tone={over.length ? "red" : undefined} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
          <h2 className="text-[15px] font-semibold">Schedule</h2>
          <span className="text-xs text-ink-500">
            {fmtDate(start)} – {fmtDate(addDays(end, -1))}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Link href={`/resources?from=${isoDay(addDays(start, -28))}`} className="btn btn-sm px-2" aria-label="Four weeks earlier">
              <ChevronLeft size={15} aria-hidden />
            </Link>
            <Link href="/resources" className="btn btn-sm">
              Today
            </Link>
            <Link href={`/resources?from=${isoDay(addDays(start, 28))}`} className="btn btn-sm px-2" aria-label="Four weeks later">
              <ChevronRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty title="No team members yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-[12px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th w-[210px]">Team member</th>
                  {weeks.map((w) => (
                    <th key={w.toISOString()} className="th text-center">
                      w/c {fmtDate(w, false)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} className="border-t border-line-soft">
                    <td className="td">
                      <p className="truncate text-[13px] font-medium">{r.p.name}</p>
                      <p className="truncate text-[11px] text-ink-500">{r.p.title ?? r.p.role.toLowerCase()}</p>
                    </td>
                    {r.cells.map((c, i) => {
                      const clash = c.filter((a) => a.kind === "audit").length > 1 || (c.some((a) => a.kind === "leave") && c.some((a) => a.kind === "audit"));
                      return (
                        <td key={i} className={clsx("px-1 py-1.5 align-top", clash && "bg-high-bg")} title={clash ? "Double-booked" : undefined}>
                          <div className="flex flex-col gap-1">
                            {c.map((a) => (
                              <span key={a.id} title={`${a.engagement ? `${a.engagement.code} ${a.engagement.name}` : a.label ?? a.kind}: ${fmtDate(a.start)} – ${fmtDate(a.end)}`} className={clsx("truncate rounded px-1.5 py-1 text-center font-semibold", KIND_CLS[a.kind], a.kind === "audit" && "font-mono text-[11px]")}>
                                {a.engagement?.code ?? a.label ?? a.kind[0].toUpperCase() + a.kind.slice(1)}
                              </span>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-5 py-3 text-xs text-ink-500">
          {[
            ["audit", "Engagement"],
            ["training", "Training"],
            ["leave", "Leave"],
            ["other", "Other"],
          ].map(([k, l]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={clsx("h-3 w-3 rounded-[3px]", KIND_CLS[k])} />
              {l}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-high-bg" />
            Double-booked
          </span>
        </div>
      </section>

      {manage && (
        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Book someone</h2>
          <form action={addAssignment} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.3fr)_150px_150px_auto]">
            <div>
              <label htmlFor="userId" className="label">
                Person
              </label>
              <select id="userId" name="userId" required className="input">
                <option value="">Choose…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="kind" className="label">
                For
              </label>
              <select id="kind" name="kind" defaultValue="audit" className="input">
                <option value="audit">Engagement</option>
                <option value="leave">Leave</option>
                <option value="training">Training</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="engagementId" className="label">
                Engagement
              </label>
              <select id="engagementId" name="engagementId" className="input">
                <option value="">—</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="start" className="label">
                From
              </label>
              <input id="start" name="start" type="date" required defaultValue={isoDay(start)} className="input" />
            </div>
            <div>
              <label htmlFor="end" className="label">
                To
              </label>
              <input id="end" name="end" type="date" required defaultValue={isoDay(addDays(start, 11))} className="input" />
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">Book</button>
            </div>
          </form>
          {assignments.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-medium text-brand-700">Bookings in this view ({assignments.length})</summary>
              <ul className="mt-2 divide-y divide-line-soft text-[13px]">
                {assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{people.find((p) => p.id === a.userId)?.name}</span>
                    <span className="text-ink-500">{a.engagement ? `${a.engagement.code} ${a.engagement.name}` : a.label ?? a.kind}</span>
                    <span className="text-ink-500">
                      {fmtDate(a.start)} – {fmtDate(a.end)}
                    </span>
                    <form action={removeAssignment.bind(null, a.id)} className="ml-auto">
                      <button className="text-[12px] text-ink-500 hover:text-high-fg">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Team, skills and utilisation · {q.label}</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Team member</th>
                  <th className="th">Certifications</th>
                  <th className="th w-[34%]">Audit utilisation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} className="border-t border-line-soft">
                    <td className="td">
                      <span className="font-medium">{r.p.name}</span>
                      <div className="text-[11px] text-ink-500">{r.p.title ?? "—"}</div>
                    </td>
                    <td className="td">{r.p.certifications ?? <span className="text-ink-400">Not set</span>}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
                          <div className={clsx("h-full rounded-full", r.util > 100 ? "bg-high-dot" : r.util < 60 ? "bg-med-dot" : "bg-brand-600")} style={{ width: `${Math.min(r.util, 100)}%` }} />
                        </div>
                        <span className="tabular w-16 text-right text-[12px]">
                          {r.util}% · {Math.round(r.auditH)} h
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line-soft px-5 py-3 text-xs text-ink-500">
            People set their certifications and weekly hours in <Link href="/settings/profile">their profile</Link>.
          </p>
        </section>

        <section className="card overflow-hidden">
          <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Budget vs actual hours</h2>
          {engagements.length === 0 ? (
            <Empty title="No open engagements" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead className="bg-[#F8FAFB]">
                  <tr>
                    <th className="th">Engagement</th>
                    <th className="th text-right">Budget</th>
                    <th className="th text-right">Actual</th>
                    <th className="th w-[30%]">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((e) => {
                    const pct = e.budgetHours ? Math.round((e.actualHours / e.budgetHours) * 100) : null;
                    return (
                      <tr key={e.id} className="border-t border-line-soft">
                        <td className="td">
                          <Link href={`/engagements/${e.id}`} className="font-medium hover:text-brand-700">
                            {e.name}
                          </Link>
                          <div className="text-[11px] text-ink-500">
                            <span className="font-mono">{e.code}</span> · {e.lead?.name ?? "No lead"}
                          </div>
                        </td>
                        <td className="td tabular text-right">{e.budgetHours || "—"}</td>
                        <td className={clsx("td tabular text-right", pct !== null && pct > 100 && "font-semibold text-high-fg")}>{e.actualHours}</td>
                        <td className="td">
                          {pct === null ? (
                            <span className="text-ink-400">No budget</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
                                <div className={clsx("h-full rounded-full", pct > 100 ? "bg-high-dot" : pct > 85 ? "bg-med-dot" : "bg-ok-dot")} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="tabular w-10 text-right text-[12px]">{pct}%</span>
                            </div>
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
      </div>
    </>
  );
}
