import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Empty, PageHeader, Pill, SeverityPill, Tabs } from "@/components/ui";
import { ESC_PILL, escalation, escalationTo } from "@/lib/issues";
import { FINDING_PILL, SEVERITY, fmtDate, isOverdue } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Findings" };

type Search = { status?: string; severity?: string; overdue?: string; repeat?: string; engagement?: string };

export default async function FindingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireUser();
  const q = await searchParams;
  const status = q.status ?? "open";
  const where: Prisma.FindingWhereInput = {
    orgId: s.org,
    ...(status === "open" ? { status: { not: "closed" } } : status === "all" ? {} : { status }),
    ...(q.severity ? { severity: q.severity } : {}),
    ...(q.overdue ? { dueDate: { lt: new Date() }, status: { not: "closed" } } : {}),
    ...(q.repeat ? { repeat: true } : {}),
    ...(q.engagement ? { engagementId: q.engagement } : {}),
  };
  const [findings, total, org] = await Promise.all([
    db.finding.findMany({ where, include: { engagement: { select: { name: true, area: true } } }, orderBy: [{ dueDate: "asc" }] }),
    db.finding.count({ where: { orgId: s.org } }),
    db.organization.findUniqueOrThrow({ where: { id: s.org } }),
  ]);
  const rank = { critical: -1, high: 0, medium: 1, low: 2 } as Record<string, number>;
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  const href = (patch: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/findings${p.size ? `?${p}` : ""}`;
  };
  const chip = (label: string, to: string, on: boolean) => (
    <Link key={label} href={to} className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${on ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Findings & remediation"
        sub="Every issue raised, who owns the fix, and whether it's on time."
        actions={
          <>
            <a href={`/api/findings/export?${new URLSearchParams(q as Record<string, string>)}`} className="btn">
              Export CSV
            </a>
            {can(s, "work") && (
              <Link href="/findings/new" className="btn-primary">
                New finding
              </Link>
            )}
          </>
        }
      />
      <Tabs
        active="register"
        tabs={[
          { key: "register", label: "Register", href: "/findings" },
          { key: "overview", label: "Overview & escalation", href: "/findings/overview" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {chip("Open", href({ status: "open" }), status === "open")}
        {chip("Closed", href({ status: "closed" }), status === "closed")}
        {chip("All", href({ status: "all" }), status === "all")}
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
        {chip("Critical", href({ severity: q.severity === "critical" ? undefined : "critical" }), q.severity === "critical")}
        {chip("High", href({ severity: q.severity === "high" ? undefined : "high" }), q.severity === "high")}
        {chip("Medium", href({ severity: q.severity === "medium" ? undefined : "medium" }), q.severity === "medium")}
        {chip("Low", href({ severity: q.severity === "low" ? undefined : "low" }), q.severity === "low")}
        {chip("Overdue only", href({ overdue: q.overdue ? undefined : "1" }), !!q.overdue)}
        {chip("Repeat", href({ repeat: q.repeat ? undefined : "1" }), !!q.repeat)}
        <span className="ml-auto text-[13px] text-ink-500">
          Showing {findings.length} of {total}
        </span>
      </div>
      <section className="card overflow-hidden">
        {findings.length === 0 ? (
          <Empty title="No findings match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Finding</th>
                  <th className="th">Severity</th>
                  <th className="th">Owner</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                  <th className="th">Escalation</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => {
                  const late = isOverdue(f.dueDate, f.status === "closed");
                  const level = escalation(f, org);
                  return (
                    <tr key={f.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/findings/${f.id}`} className="font-medium hover:text-brand-700">
                          {f.title}
                        </Link>
                        <div className="text-[11px] text-ink-500">
                          <span className="font-mono">{f.code}</span> · {f.engagement.name}
                          {f.repeat && <strong className="font-semibold text-med-fg"> · Repeat</strong>}
                        </div>
                      </td>
                      <td className="td">
                        <SeverityPill s={SEVERITY[f.severity]} />
                      </td>
                      <td className="td whitespace-nowrap">{f.ownerName ?? "—"}</td>
                      <td className={`td tabular whitespace-nowrap ${late ? "font-medium text-high-dot" : ""}`}>{fmtDate(f.dueDate)}</td>
                      <td className="td">
                        <Pill p={late ? FINDING_PILL.overdue : FINDING_PILL[f.status]} />
                      </td>
                      <td className="td">
                        {level ? (
                          <span className={clsx("pill", ESC_PILL[level])} title={`Escalated to ${escalationTo(level, org)}`}>
                            Level {level}
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                        {f.dueChanges > 0 && <div className="text-[11px] text-ink-500">date moved {f.dueChanges}×</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
