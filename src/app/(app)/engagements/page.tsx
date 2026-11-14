import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_TYPES, typeLabel } from "@/lib/auditTypes";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { PHASE_PILL, PHASES, fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Engagements" };

export default async function EngagementsPage({ searchParams }: { searchParams: Promise<{ phase?: string; kind?: string; type?: string }> }) {
  const s = await requireUser();
  const { phase, kind, type } = await searchParams;
  const now = new Date();
  const engagements = await db.engagement.findMany({
    where: { orgId: s.org, ...(phase ? { phase } : {}), ...(kind ? { kind } : {}), ...(type ? { auditType: type } : {}) },
    orderBy: [{ phase: "asc" }, { dueDate: "asc" }],
    include: {
      lead: { select: { name: true } },
      client: { select: { name: true } },
      procedures: { select: { status: true } },
      _count: { select: { findings: { where: { status: { not: "closed" } } } } },
    },
  });
  // a chip for each type of audit the organisation runs
  const used = new Set((await db.engagement.findMany({ where: { orgId: s.org, auditType: { not: null } }, distinct: ["auditType"], select: { auditType: true } })).map((x) => x.auditType));
  const types = AUDIT_TYPES.filter((t) => used.has(t.key));
  const chip = (label: string, href: string, on: boolean) => (
    <Link key={href} href={href} className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${on ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Engagements"
        sub="The audit plan: every audit, its stage and how far the work has got."
        actions={
          can(s, "manage") && (
            <Link href="/engagements/new" className="btn-primary">
              <Plus size={16} aria-hidden />
              New engagement
            </Link>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        {chip("All", "/engagements", !phase && !kind && !type)}
        {types.map((t) => chip(t.short, `/engagements?type=${t.key}`, type === t.key))}
        {PHASES.map((p) => chip(p.label, `/engagements?phase=${p.key}`, phase === p.key))}
      </div>
      <section className="card overflow-hidden">
        {engagements.length === 0 ? (
          <Empty title="No engagements match">Try another filter, or create a new engagement.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Engagement</th>
                  <th className="th">Client / area</th>
                  <th className="th">Phase</th>
                  <th className="th w-[150px]">Work program</th>
                  <th className="th">Open findings</th>
                  <th className="th">Lead</th>
                  <th className="th">Hours</th>
                  <th className="th">Due</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => {
                  const done = e.procedures.filter((p) => p.status === "signed_off").length;
                  const pct = e.procedures.length ? Math.round((done / e.procedures.length) * 100) : 0;
                  return (
                    <tr key={e.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/engagements/${e.id}`} className="font-medium hover:text-brand-700">
                          {e.name}
                        </Link>
                        <div className="font-mono text-[11px] text-ink-500">
                          {e.code} · {typeLabel(e)}
                        </div>
                      </td>
                      <td className="td">{e.client?.name ?? e.area ?? "—"}</td>
                      <td className="td">
                        <Pill p={PHASE_PILL[e.phase]} />
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E8EDF2]">
                            <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular text-ink-500">
                            {done}/{e.procedures.length}
                          </span>
                        </div>
                      </td>
                      <td className="td tabular">{e._count.findings}</td>
                      <td className="td">{e.lead?.name ?? "—"}</td>
                      <td className={`td tabular ${e.budgetHours && e.actualHours > e.budgetHours ? "text-high-dot" : ""}`}>
                        {e.actualHours} / {e.budgetHours || "—"}
                      </td>
                      <td className={`td tabular ${e.dueDate && e.dueDate < now && e.phase !== "closed" ? "font-medium text-high-dot" : ""}`}>{fmtDate(e.dueDate)}</td>
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
