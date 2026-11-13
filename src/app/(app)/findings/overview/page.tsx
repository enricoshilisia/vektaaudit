import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, SeverityPill, Stat, Tabs } from "@/components/ui";
import { SEVERITY, fmtDate } from "@/lib/format";
import { AGE_BUCKETS, ESC_PILL, ageBucket, daysOverdue, escalation, escalationTo } from "@/lib/issues";
import { can, requireUser } from "@/lib/server/auth";
import { emailReminders } from "../actions";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Issues overview" };

const SEVS = ["critical", "high", "medium", "low"] as const;

export default async function IssuesOverview() {
  const s = await requireUser();
  const [org, open, closed] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: s.org } }),
    db.finding.findMany({ where: { orgId: s.org, status: { not: "closed" } }, include: { engagement: { select: { id: true, code: true, name: true } } } }),
    db.finding.findMany({ where: { orgId: s.org, status: "closed", closedAt: { gte: new Date(Date.now() - 365 * 864e5) } }, select: { createdAt: true, closedAt: true } }),
  ]);
  const now = new Date();
  const rows = open.map((f) => ({ ...f, level: escalation(f, org, now), days: daysOverdue(f.dueDate, now), bucket: ageBucket(f.dueDate, now) }));
  const overdue = rows.filter((r) => r.days > 0 && r.dueDate);
  const escalated = rows.filter((r) => r.level !== null && r.level > 0).sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || b.days - a.days);
  const avgClose = closed.length ? Math.round(closed.reduce((a, f) => a + (f.closedAt!.getTime() - f.createdAt.getTime()) / 864e5, 0) / closed.length) : null;
  const moved = rows.filter((r) => r.dueChanges > 0).length;

  const bySev = SEVS.map((sev) => {
    const fs = rows.filter((r) => r.severity === sev);
    return { sev, total: fs.length, parts: AGE_BUCKETS.map((b) => fs.filter((f) => f.bucket === b.key).length) };
  }).filter((x) => x.total > 0);
  const max = Math.max(1, ...bySev.map((x) => x.total));

  const owners = Object.values(
    rows.reduce<Record<string, { owner: string; open: number; overdue: number; worst: number }>>((acc, r) => {
      const k = r.ownerName ?? "No owner yet";
      acc[k] ??= { owner: k, open: 0, overdue: 0, worst: 0 };
      acc[k].open++;
      if (r.days > 0 && r.dueDate) {
        acc[k].overdue++;
        acc[k].worst = Math.max(acc[k].worst, r.days);
      }
      return acc;
    }, {}),
  ).sort((a, b) => b.overdue - a.overdue || b.open - a.open);

  const levels = [
    { n: 0 as const, when: "On the due date", who: "The owner is reminded" },
    { n: 1 as const, when: `${org.esc1Days} days overdue`, who: org.esc1To },
    { n: 2 as const, when: `${org.esc2Days} days overdue`, who: org.esc2To },
    { n: 3 as const, when: `${org.esc3Days} days overdue, or the due date moved twice`, who: org.esc3To },
  ];

  return (
    <>
      <PageHeader
        title="Findings & remediation"
        sub="Every issue raised, who owns the fix, and whether it's on time."
        actions={
          can(s, "manage") &&
          org.msTenantId &&
          org.msMailbox && (
            <form action={emailReminders}>
              <button className="btn-primary">Email reminders to overdue owners</button>
            </form>
          )
        }
      />
      <Tabs
        active="overview"
        tabs={[
          { key: "register", label: "Register", href: "/findings" },
          { key: "overview", label: "Overview & escalation", href: "/findings/overview" },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Open" value={rows.length} sub={`${rows.filter((r) => r.severity === "critical" || r.severity === "high").length} critical or high`} />
        <Stat label="Overdue" value={overdue.length} sub={rows.length ? `${Math.round((overdue.length / rows.length) * 100)}% of open` : undefined} tone={overdue.length ? "red" : undefined} />
        <Stat label={`Escalated to ${org.esc3To.toLowerCase()}`} value={rows.filter((r) => r.level === 3).length} tone={rows.some((r) => r.level === 3) ? "red" : undefined} sub="Over the limit or moved twice" />
        <Stat label="Due date moved" value={moved} sub={`${rows.filter((r) => r.repeat).length} repeat findings open`} tone={moved ? "amber" : undefined} />
        <Stat label="Average days to close" value={avgClose ?? "—"} sub={closed.length ? `${closed.length} closed in 12 months` : "None closed in 12 months"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Ageing of open findings</h2>
          {bySev.length === 0 ? (
            <Empty title="No open findings" />
          ) : (
            <div className="flex flex-col gap-3">
              {bySev.map((x) => (
                <div key={x.sev} className="grid grid-cols-[76px_minmax(0,1fr)_32px] items-center gap-3">
                  <span className="text-[13px]">{SEVERITY[x.sev].label}</span>
                  <div style={{ width: `${(x.total / max) * 100}%` }} className="flex h-[22px] gap-[2px] overflow-hidden rounded">
                    {x.parts.map((n, i) =>
                      n ? (
                        <Link
                          key={i}
                          href={`/findings?severity=${x.sev}${i ? "&overdue=1" : ""}`}
                          title={`${SEVERITY[x.sev].label}: ${n} ${AGE_BUCKETS[i].label.toLowerCase()}`}
                          style={{ flex: n, background: AGE_BUCKETS[i].color }}
                          className="h-full first:rounded-l last:rounded-r"
                        />
                      ) : null,
                    )}
                  </div>
                  <span className="tabular text-right text-[13px] font-medium">{x.total}</span>
                </div>
              ))}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                {AGE_BUCKETS.map((b) => (
                  <span key={b.key} className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-[3px]" style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-4">
            <h2 className="text-[15px] font-semibold">Escalation path</h2>
            {can(s, "admin") && (
              <Link href="/settings/organisation#escalation" className="ml-auto text-[13px]">
                Change the rules
              </Link>
            )}
          </div>
          <ul className="divide-y divide-line-soft">
            {levels.map((l) => {
              const n = rows.filter((r) => r.level === l.n).length;
              return (
                <li key={l.n} className="flex items-center gap-3 px-5 py-3">
                  <span className={clsx("pill min-w-[26px] justify-center font-semibold", ESC_PILL[l.n])}>{l.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{l.when}</p>
                    <p className="text-xs text-ink-500">{l.who}</p>
                  </div>
                  <span className={clsx("tabular text-[15px] font-semibold", n ? "text-ink" : "text-ink-300")}>{n}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Escalated findings</h2>
        {escalated.length === 0 ? (
          <Empty title="Nothing is escalated" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Finding</th>
                  <th className="th">Severity</th>
                  <th className="th">Owner</th>
                  <th className="th">Due</th>
                  <th className="th text-right">Days overdue</th>
                  <th className="th text-right">Date moved</th>
                  <th className="th">Escalated to</th>
                </tr>
              </thead>
              <tbody>
                {escalated.map((f) => (
                  <tr key={f.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/findings/${f.id}`} className="font-medium hover:text-brand-700">
                        {f.title}
                      </Link>
                      <div className="text-[11px] text-ink-500">
                        <span className="font-mono">{f.code}</span> · {f.engagement.name}
                        {f.repeat && " · repeat"}
                      </div>
                    </td>
                    <td className="td">
                      <SeverityPill s={SEVERITY[f.severity]} />
                    </td>
                    <td className="td">{f.ownerName ?? "—"}</td>
                    <td className="td tabular">
                      {fmtDate(f.dueDate)}
                      {f.originalDue && f.dueChanges > 0 && <div className="text-[11px] text-ink-500">first agreed {fmtDate(f.originalDue)}</div>}
                    </td>
                    <td className={clsx("td tabular text-right", f.days > 0 && "font-semibold text-high-fg")}>{f.days > 0 ? f.days : "—"}</td>
                    <td className={clsx("td tabular text-right", f.dueChanges >= 2 && "font-semibold text-high-fg")}>{f.dueChanges}</td>
                    <td className="td">
                      <span className={clsx("pill", ESC_PILL[f.level!])}>
                        {f.level} · {escalationTo(f.level!, org)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">By owner</h2>
        {owners.length === 0 ? (
          <Empty title="No open findings" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Owner</th>
                  <th className="th text-right">Open</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th text-right">Longest overdue</th>
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.owner} className="border-t border-line-soft">
                    <td className="td font-medium">{o.owner}</td>
                    <td className="td tabular text-right">{o.open}</td>
                    <td className={clsx("td tabular text-right", o.overdue && "font-semibold text-high-fg")}>{o.overdue}</td>
                    <td className="td tabular text-right">{o.worst ? `${o.worst} days` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
