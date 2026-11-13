import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { TIME_CATEGORIES, addDays, categoryLabel, isoDay, weekStart } from "@/lib/time";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addTime, removeTime } from "./actions";

export const metadata: Metadata = { title: "My time" };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function TimePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const s = await requireUser();
  const { week } = await searchParams;
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T12:00:00`) : new Date());
  const end = addDays(start, 7);
  const [me, entries, engagements] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: s.sub } }),
    db.timeEntry.findMany({ where: { userId: s.sub, date: { gte: start, lt: end } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], include: { engagement: { select: { id: true, code: true, name: true } } } }),
    db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }),
  ]);
  const total = entries.reduce((a, e) => a + e.hours, 0);
  const audit = entries.filter((e) => e.category === "audit").reduce((a, e) => a + e.hours, 0);
  const byDay = DAYS.map((_, i) => entries.filter((e) => isoDay(e.date) === isoDay(addDays(start, i))));
  const today = new Date();
  const canLog = can(s, "work");

  return (
    <>
      <PageHeader title="My time" sub="Log the hours you spend each day. Time on an engagement counts towards its budget." />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/time?week=${isoDay(addDays(start, -7))}`} className="btn h-9 px-2.5" aria-label="Previous week">
          <ChevronLeft size={16} aria-hidden />
        </Link>
        <span className="text-[15px] font-semibold">
          Week of {fmtDate(start)} – {fmtDate(addDays(start, 6))}
        </span>
        <Link href={`/time?week=${isoDay(addDays(start, 7))}`} className="btn h-9 px-2.5" aria-label="Next week">
          <ChevronRight size={16} aria-hidden />
        </Link>
        {isoDay(start) !== isoDay(weekStart(today)) && (
          <Link href="/time" className="text-[13px]">
            This week
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Hours this week" value={total} sub={`of ${me.weeklyHours} working hours`} tone={total > me.weeklyHours ? "amber" : undefined} />
        <Stat label="On audits" value={audit} sub={total ? `${Math.round((audit / total) * 100)}% of logged time` : undefined} />
        <Stat label="Engagements" value={new Set(entries.map((e) => e.engagementId).filter(Boolean)).size} />
        <Stat label="Still to log" value={Math.max(0, me.weeklyHours - total)} sub="Hours" />
      </div>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-line-soft md:grid-cols-7 md:divide-x md:divide-y-0">
          {DAYS.map((d, i) => {
            const date = addDays(start, i);
            const h = byDay[i].reduce((a, e) => a + e.hours, 0);
            return (
              <div key={d} className={clsx("flex min-h-[120px] flex-col gap-1.5 p-3", isoDay(date) === isoDay(today) && "bg-brand-50")}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold text-ink-500">
                    {d} {date.getDate()}
                  </span>
                  <span className="tabular text-[12px] font-semibold">{h ? `${h} h` : ""}</span>
                </div>
                {byDay[i].map((e) => (
                  <div key={e.id} className={clsx("group rounded-md px-2 py-1.5 text-[12px]", e.category === "audit" ? "bg-brand-100 text-brand-800" : e.category === "leave" ? "bg-line-soft text-ink-700" : "bg-violet-bg text-violet-fg")}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium">{e.engagement ? e.engagement.code : categoryLabel(e.category)}</span>
                      <span className="tabular">{e.hours} h</span>
                    </div>
                    {e.note && <p className="truncate opacity-80">{e.note}</p>}
                    {canLog && (
                      <form action={removeTime.bind(null, e.id)}>
                        <button className="text-[11px] underline opacity-70 hover:opacity-100" aria-label={`Remove ${e.hours} hours on ${d}`}>
                          Remove
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {canLog ? (
        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Log time</h2>
          <form action={addTime} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[150px_180px_minmax(0,1fr)_100px]">
            <div>
              <label htmlFor="date" className="label">
                Date
              </label>
              <input id="date" name="date" type="date" required defaultValue={isoDay(today >= start && today < end ? today : start)} className="input" />
            </div>
            <div>
              <label htmlFor="category" className="label">
                Type
              </label>
              <select id="category" name="category" defaultValue="audit" className="input">
                {TIME_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="engagementId" className="label">
                Engagement (for audit work)
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
              <label htmlFor="hours" className="label">
                Hours
              </label>
              <input id="hours" name="hours" type="number" min={1} max={24} step={1} required defaultValue={8} className="input" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="note" className="label">
                Note (optional)
              </label>
              <input id="note" name="note" maxLength={300} className="input" placeholder="e.g. Sample testing, P2P" />
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">Log</button>
            </div>
          </form>
        </section>
      ) : (
        entries.length === 0 && (
          <section className="card">
            <Empty title="Viewers don't log time" />
          </section>
        )
      )}
    </>
  );
}
