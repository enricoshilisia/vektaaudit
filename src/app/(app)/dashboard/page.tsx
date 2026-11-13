import { Check, Lightbulb, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { PHASE_PILL, SEVERITY, clientWord, daysBetween, fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { orgInsights } from "@/lib/server/insights";

export const metadata: Metadata = { title: "Dashboard" };

const AGING = [
  { label: "0–30 d", max: 30, color: "#A9C4E8" },
  { label: "31–60 d", max: 60, color: "#5C8FD1" },
  { label: "61–90 d", max: 90, color: "#2E68B4" },
  { label: "90+ d", max: Infinity, color: "#163F78" },
];

export default async function DashboardPage() {
  const s = await requireUser();
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86400000);
  const [engagements, total, closed, findings, reqOpen, reqOverdue, insights, dueFindings, dueRequests] = await Promise.all([
    db.engagement.findMany({
      where: { orgId: s.org, phase: { not: "closed" } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { lead: { select: { name: true } }, procedures: { select: { status: true } } },
    }),
    db.engagement.count({ where: { orgId: s.org } }),
    db.engagement.count({ where: { orgId: s.org, phase: "closed" } }),
    db.finding.findMany({ where: { orgId: s.org, status: { not: "closed" } }, select: { severity: true, dueDate: true, repeat: true } }),
    db.evidenceRequest.count({ where: { engagement: { orgId: s.org }, status: { in: ["open", "needs_info"] } } }),
    db.evidenceRequest.count({ where: { engagement: { orgId: s.org }, status: { in: ["open", "needs_info"] }, dueDate: { lt: now } } }),
    orgInsights(s.org),
    db.finding.findMany({ where: { orgId: s.org, status: { not: "closed" }, dueDate: { gte: now, lte: soon } }, orderBy: { dueDate: "asc" }, take: 4, select: { id: true, code: true, title: true, dueDate: true, ownerName: true } }),
    db.evidenceRequest.findMany({ where: { engagement: { orgId: s.org }, status: { in: ["open", "needs_info"] }, dueDate: { gte: now, lte: soon } }, orderBy: { dueDate: "asc" }, take: 4, select: { id: true, code: true, title: true, dueDate: true, engagementId: true } }),
  ]);

  const [clientCount, userCount, inviteCount, org] = await Promise.all([
    db.client.count({ where: { orgId: s.org } }),
    db.user.count({ where: { orgId: s.org } }),
    db.invite.count({ where: { orgId: s.org } }),
    db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } }),
  ]);
  const word = clientWord(org.kind);
  const steps = [
    { done: clientCount > 0, label: `Add your first ${word.one.toLowerCase()}`, sub: org.kind === "internal" ? "A department, branch or subsidiary you audit" : "The company you'll audit, with its contact person", href: "/clients/new" },
    { done: userCount > 1 || inviteCount > 0, label: "Invite your team", sub: "Auditors do the work, managers review it", href: "/settings/team" },
    { done: total > 0, label: "Plan an engagement", sub: "Scope, team, budget and due date", href: "/engagements/new" },
  ];
  const overdue = findings.filter((f) => f.dueDate && f.dueDate < now);
  const bySev = (["critical", "high", "medium", "low"] as const).map((k) => ({ k, n: findings.filter((f) => f.severity === k).length }));
  const aging = AGING.map((b, i) => ({ ...b, n: overdue.filter((f) => { const d = daysBetween(f.dueDate!, now); return d <= b.max && d > (AGING[i - 1]?.max ?? -1); }).length }));
  const agingMax = Math.max(1, ...aging.map((a) => a.n));
  const week = [
    ...engagements.filter((e) => e.dueDate && e.dueDate <= soon).map((e) => ({ at: e.dueDate!, title: `${e.name} due`, sub: e.code, href: `/engagements/${e.id}` })),
    ...dueFindings.map((f) => ({ at: f.dueDate!, title: `Fix due: ${f.title}`, sub: `${f.code} · ${f.ownerName ?? "No owner"}`, href: `/findings/${f.id}` })),
    ...dueRequests.map((r) => ({ at: r.dueDate!, title: `Evidence due: ${r.title}`, sub: r.code, href: `/engagements/${r.engagementId}?tab=requests` })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow={fmtDate(now)}
        title="Audit overview"
        actions={
          can(s, "manage") && (
            <Link href="/engagements/new" className="btn-primary">
              <Plus size={16} aria-hidden />
              New engagement
            </Link>
          )
        }
      />

      {can(s, "manage") && steps.some((x) => !x.done) && (
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">Get started</h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {steps.map((x, i) => (
              <li key={x.href}>
                <Link href={x.href} className={`flex items-start gap-3 rounded-[10px] border p-3.5 ${x.done ? "border-line-soft" : "border-brand-200 bg-brand-50 hover:border-brand-300"}`}>
                  <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold ${x.done ? "bg-ok-dot text-white" : "bg-brand-600 text-white"}`}>{x.done ? <Check size={14} strokeWidth={3} aria-label="done" /> : i + 1}</span>
                  <span className="flex flex-col gap-0.5 text-[13px]">
                    <span className={`font-medium ${x.done ? "text-ink-500 line-through" : ""}`}>{x.label}</span>
                    <span className="text-xs text-ink-500">{x.sub}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Stat label="Plan completion" value={total ? `${Math.round((closed / total) * 100)}%` : "—"} sub={`${closed} of ${total} engagements closed`} />
        <Stat label="Open findings" value={findings.length} sub={`${bySev[0].n + bySev[1].n} rated critical or high`} tone={bySev[0].n + bySev[1].n ? "red" : undefined} />
        <Stat label="Overdue action plans" value={overdue.length} sub={overdue.length ? "Past the agreed fix date" : "Nothing overdue"} tone={overdue.length ? "amber" : undefined} />
        <Stat label="Evidence requests outstanding" value={reqOpen} sub={`${reqOverdue} overdue from auditees`} tone={reqOverdue ? "amber" : undefined} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="card min-w-0 flex-[999_1_560px]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold">Engagements in progress</h2>
            <Link href="/engagements" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {engagements.length === 0 ? (
            <Empty title="No engagements yet">Create your first engagement to start the audit plan.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-[#F8FAFB]">
                  <tr>
                    <th className="th">Engagement</th>
                    <th className="th">Phase</th>
                    <th className="th w-[150px]">Progress</th>
                    <th className="th">Lead</th>
                    <th className="th">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((e) => {
                    const pct = e.procedures.length ? Math.round((e.procedures.filter((p) => p.status === "signed_off").length / e.procedures.length) * 100) : 0;
                    const late = e.dueDate && e.dueDate < now;
                    return (
                      <tr key={e.id} className="border-t border-line-soft">
                        <td className="td">
                          <Link href={`/engagements/${e.id}`} className="font-medium hover:text-brand-700">
                            {e.name}
                          </Link>
                          <div className="font-mono text-[11px] text-ink-500">
                            {e.code}
                            {e.area ? ` · ${e.area}` : ""}
                          </div>
                        </td>
                        <td className="td">
                          <Pill p={PHASE_PILL[e.phase]} />
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E8EDF2]">
                              <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="tabular w-9 text-right text-ink-500">{pct}%</span>
                          </div>
                        </td>
                        <td className="td">{e.lead?.name ?? "—"}</td>
                        <td className={`td tabular ${late ? "font-medium text-high-dot" : ""}`}>{fmtDate(e.dueDate, false)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <section className="card flex flex-col gap-3.5 px-5 py-[18px]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Open findings by severity</h2>
              <Link href="/findings" className="text-[13px] font-medium text-brand-600">
                Tracker
              </Link>
            </div>
            {bySev.map(({ k, n }) => (
              <Link key={k} href={`/findings?severity=${k}`} className="flex flex-col gap-1.5" title={`${SEVERITY[k].label}: ${n} open`}>
                <span className="flex justify-between text-[13px]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SEVERITY[k].bar }} />
                    {SEVERITY[k].label}
                  </span>
                  <span className="tabular font-semibold">{n}</span>
                </span>
                <span className="h-2 rounded bg-line-soft">
                  <span className="block h-2 rounded" style={{ background: SEVERITY[k].bar, width: `${findings.length ? (n / findings.length) * 100 : 0}%` }} />
                </span>
              </Link>
            ))}
            <p className="text-xs text-ink-500">
              {findings.length} open · {findings.filter((f) => f.repeat).length} repeat findings
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-xl bg-navy-950 px-5 py-[18px] text-[#E6ECF2]">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <Lightbulb size={18} className="text-[#7FB2F0]" aria-hidden />
              Insights
            </h2>
            {insights.length === 0 ? (
              <p className="text-[13px] text-navy-200">Nothing needs attention right now.</p>
            ) : (
              insights.slice(0, 4).map((i) => (
                <Link key={i.text} href={i.href} className="text-[13px] leading-relaxed hover:text-white">
                  {i.text}
                </Link>
              ))
            )}
          </section>

          <section className="card flex flex-col gap-3.5 px-5 py-[18px]">
            <h2 className="text-base font-semibold">Action plans past due date</h2>
            <div className="flex h-[120px] items-end gap-2.5 border-b border-line-strong px-1">
              {aging.map((a) => (
                <div key={a.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${a.label}: ${a.n}`}>
                  <span className="tabular text-xs font-semibold">{a.n}</span>
                  <div className="w-full max-w-[44px] rounded-t" style={{ background: a.color, height: `${(a.n / agingMax) * 80}%`, minHeight: a.n ? 4 : 0 }} />
                </div>
              ))}
            </div>
            <div className="-mt-1.5 flex gap-2.5 px-1">
              {aging.map((a) => (
                <span key={a.label} className="flex-1 text-center text-[11px] text-ink-500">
                  {a.label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card flex flex-col gap-3 px-5 py-[18px]">
        <h2 className="text-base font-semibold">Next two weeks</h2>
        {week.length === 0 ? (
          <p className="text-sm text-ink-500">No deadlines in the next 14 days.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {week.map((w) => (
              <Link key={w.href + w.title} href={w.href} className="flex items-start gap-3 rounded-[10px] border border-line-soft p-3 hover:border-line-strong">
                <div className="w-11 flex-none rounded-lg bg-canvas py-1.5 text-center">
                  <div className="text-[11px] uppercase text-ink-500">{w.at.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-lg font-semibold">{String(w.at.getDate()).padStart(2, "0")}</div>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
                  <span className="font-medium">{w.title}</span>
                  <span className="text-xs text-ink-500">{w.sub}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
