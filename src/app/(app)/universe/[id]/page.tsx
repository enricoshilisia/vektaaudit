import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EntityFields } from "@/components/EntityFields";
import { Empty, Pill } from "@/components/ui";
import { PHASE_PILL, clientWord, fmtDate } from "@/lib/format";
import { BAND_PILL, CYCLES, IMPACT, ITEM_STATUS, LIKELIHOOD, MONTHS, band, controlEnv, kindLabel, nextDue, residual } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { setEntityArchived, updateEntity } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await db.auditableEntity.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: e?.name ?? "Auditable entity" };
}

export default async function EntityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const s = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const e = await db.auditableEntity.findFirst({
    where: { id, orgId: s.org },
    include: {
      client: { select: { id: true, name: true } },
      org: { select: { kind: true } },
      planItems: { orderBy: { createdAt: "desc" }, include: { plan: { select: { year: true } }, lead: { select: { name: true } }, engagement: { select: { id: true, code: true, phase: true } } } },
    },
  });
  if (!e) notFound();
  const manage = can(s, "manage");
  const word = clientWord(e.org.kind);
  const score = e.impact * e.likelihood;
  const due = nextDue(e.lastAuditedAt, e.cycleMonths);
  const env = controlEnv(e.controlEnv);
  const history = await db.auditLog.findMany({ where: { orgId: s.org, entity: "entity", entityId: e.id }, orderBy: { createdAt: "desc" }, take: 8 });

  if (edit && manage) {
    const clients = await db.client.findMany({ where: { orgId: s.org, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    return (
      <>
        <Crumbs code={e.code} />
        <h1 className="text-[26px] font-semibold tracking-tight">Edit {e.name}</h1>
        <form action={updateEntity.bind(null, e.id)} className="card flex max-w-3xl flex-col gap-6 p-6">
          <EntityFields e={e} clients={clients} clientLabel={word.one} />
          <div className="flex gap-2">
            <button className="btn-primary">Save</button>
            <Link href={`/universe/${e.id}`} className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <Crumbs code={e.code} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{e.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {[e.client?.name ?? "Organisation-wide", e.category, e.owner ? `Owner: ${e.owner}` : null, e.archivedAt ? `Archived ${fmtDate(e.archivedAt)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/universe/${e.id}?edit=1`} className="btn">
              Edit
            </Link>
            <form action={setEntityArchived.bind(null, e.id, !e.archivedAt)}>
              <button className="btn">{e.archivedAt ? "Restore" : "Archive"}</button>
            </form>
            {!e.archivedAt && (
              <Link href={`/plan?add=${e.id}`} className="btn-primary">
                Add to audit plan
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Box label="Inherent risk">
          <Pill p={BAND_PILL[band(score)]} />
          <span className="tabular text-sm text-ink-500">
            {IMPACT[e.impact - 1]} impact × {LIKELIHOOD[e.likelihood - 1].toLowerCase()} = {score}
          </span>
        </Box>
        <Box label="Strength of controls">
          <span className={clsx("pill", env.cls)}>{env.label}</span>
        </Box>
        <Box label="Residual risk">
          <Pill p={BAND_PILL[residual(e.impact, e.likelihood, e.controlEnv)]} />
          <span className="text-sm text-ink-500">After today&apos;s controls</span>
        </Box>
        <Box label="Next audit due">
          <span className={clsx("tabular text-lg font-semibold", due < new Date() && "text-high-fg")}>{e.lastAuditedAt ? fmtDate(due) : "Now"}</span>
          <span className="text-sm text-ink-500">
            {CYCLES.find((c) => c.months === e.cycleMonths)?.label ?? `Every ${e.cycleMonths} months`} · last {e.lastAuditedAt ? fmtDate(e.lastAuditedAt) : "never"}
          </span>
        </Box>
      </div>

      {e.notes && (
        <section className="card p-5">
          <h2 className="eyebrow mb-2">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{e.notes}</p>
        </section>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Audits of this area</h2>
        {e.planItems.length === 0 ? (
          <Empty title="Not in any audit plan yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Plan</th>
                  <th className="th">Audit</th>
                  <th className="th">Timing</th>
                  <th className="th">Lead</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {e.planItems.map((p) => (
                  <tr key={p.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/plan?year=${p.plan.year}`}>{p.plan.year}</Link>
                    </td>
                    <td className="td">
                      {p.engagement ? (
                        <Link href={`/engagements/${p.engagement.id}`} className="font-medium hover:text-brand-700">
                          {p.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{p.title}</span>
                      )}
                      <div className="text-[11px] text-ink-500">
                        {kindLabel(p.kind)}
                        {p.engagement && <span className="font-mono"> · {p.engagement.code}</span>}
                      </div>
                    </td>
                    <td className="td">
                      {MONTHS[p.startMonth - 1]}
                      {p.endMonth !== p.startMonth && `–${MONTHS[p.endMonth - 1]}`}
                    </td>
                    <td className="td">{p.lead?.name ?? "—"}</td>
                    <td className="td">{p.engagement ? <Pill p={PHASE_PILL[p.engagement.phase]} /> : <Pill p={ITEM_STATUS[p.status]} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Changes</h2>
        <ul className="divide-y divide-line-soft text-[13px]">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2 px-5 py-2.5">
              <span className="font-medium">{h.actorName}</span>
              <span>{h.action}</span>
              {h.detail && <span className="text-ink-500">{h.detail}</span>}
              <span className="ml-auto text-ink-500">{fmtDate(h.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Crumbs({ code }: { code: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
      <Link href="/universe" className="hover:text-ink">
        Audit universe
      </Link>
      <span aria-hidden>/</span>
      <span className="font-mono">{code}</span>
    </div>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 px-5 py-4">
      <span className="text-[13px] font-medium text-ink-500">{label}</span>
      {children}
    </div>
  );
}
