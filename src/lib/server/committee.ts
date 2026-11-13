import "server-only";
import { escalation, daysOverdue } from "../issues";
import { band, residual, nextDue } from "../risk";
import { db } from "./db";

type Sev = { critical: number; high: number; medium: number; low: number };
const sev = (): Sev => ({ critical: 0, high: 0, medium: 0, low: 0 });

/** Everything the audit committee pack shows, as plain JSON so it can be frozen when issued. */
export type PackData = {
  org: string;
  periodStart: string;
  periodEnd: string;
  builtAt: string;
  plan: { year: number; status: string; approvedBy: string | null; total: number; completed: number; inProgress: number; planned: number; deferred: number; cancelled: number } | null;
  audits: { code: string; name: string; client: string | null; rating: string; ratedAt: string; findings: Sev }[];
  newFindings: Sev & { total: number };
  closedFindings: number;
  significant: { code: string; title: string; severity: string; owner: string | null; due: string | null; days: number; engagement: string; status: string }[];
  overdue: { code: string; title: string; severity: string; owner: string | null; firstDue: string | null; due: string | null; days: number; moved: number; response: string | null; escalatedTo: string }[];
  topRisks: { code: string; name: string; unit: string | null; score: number; band: string; residual: string; lastAudited: string | null; nextDue: string | null }[];
  controls: { keyTotal: number; keyTested: number; ineffective: { code: string; title: string; process: string; operating: string; design: string }[] };
  csa: { title: string; controls: number; answered: number; notWorking: number; disagree: number } | null;
  time: { audit: number; total: number };
};

export async function buildPack(orgId: string, start: Date, end: Date): Promise<PackData> {
  const endOfDay = new Date(end);
  endOfDay.setHours(23, 59, 59, 999);
  const within = { gte: start, lte: endOfDay };
  const [org, plan, rated, newF, closed, open, entities, controls, csa, time] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    db.auditPlan.findUnique({ where: { orgId_year: { orgId, year: end.getFullYear() } }, include: { items: { select: { status: true } } } }),
    db.engagement.findMany({ where: { orgId, rating: { not: null }, ratedAt: within }, orderBy: { ratedAt: "asc" }, include: { client: { select: { name: true } }, findings: { select: { severity: true } } } }),
    db.finding.findMany({ where: { orgId, createdAt: within }, select: { severity: true } }),
    db.finding.count({ where: { orgId, closedAt: within } }),
    db.finding.findMany({ where: { orgId, status: { not: "closed" } }, include: { engagement: { select: { name: true } } } }),
    db.auditableEntity.findMany({ where: { orgId, archivedAt: null }, include: { client: { select: { name: true } } } }),
    db.control.findMany({ where: { orgId, key: true } }),
    db.csaCampaign.findFirst({ where: { orgId, createdAt: { lte: endOfDay } }, orderBy: { createdAt: "desc" }, include: { requests: { include: { items: { select: { answer: true, validation: true } } } } } }),
    db.timeEntry.findMany({ where: { orgId, date: within }, select: { hours: true, category: true } }),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const count = (fs: { severity: string }[]) => fs.reduce((a, f) => ({ ...a, [f.severity]: (a[f.severity as keyof Sev] ?? 0) + 1 }), sev());
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const items = plan?.items ?? [];
  const nf = count(newF);
  const csaItems = csa?.requests.flatMap((r) => r.items) ?? [];

  return {
    org: org.name,
    periodStart: start.toISOString(),
    periodEnd: endOfDay.toISOString(),
    builtAt: new Date().toISOString(),
    plan: plan
      ? {
          year: plan.year,
          status: plan.status,
          approvedBy: plan.approvedBy,
          total: items.filter((i) => i.status !== "cancelled").length,
          completed: items.filter((i) => i.status === "completed").length,
          inProgress: items.filter((i) => i.status === "in_progress").length,
          planned: items.filter((i) => i.status === "planned").length,
          deferred: items.filter((i) => i.status === "deferred").length,
          cancelled: items.filter((i) => i.status === "cancelled").length,
        }
      : null,
    audits: rated.map((e) => ({ code: e.code, name: e.name, client: e.client?.name ?? null, rating: e.rating!, ratedAt: e.ratedAt!.toISOString(), findings: count(e.findings) })),
    newFindings: { ...nf, total: newF.length },
    closedFindings: closed,
    significant: open
      .filter((f) => f.severity === "critical" || f.severity === "high")
      .sort((a, b) => rank[a.severity] - rank[b.severity] || daysOverdue(b.dueDate) - daysOverdue(a.dueDate))
      .slice(0, 15)
      .map((f) => ({ code: f.code, title: f.title, severity: f.severity, owner: f.ownerName, due: iso(f.dueDate), days: Math.max(0, daysOverdue(f.dueDate)), engagement: f.engagement.name, status: f.status })),
    overdue: open
      .filter((f) => escalation(f, org) === 3)
      .sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate))
      .map((f) => ({ code: f.code, title: f.title, severity: f.severity, owner: f.ownerName, firstDue: iso(f.originalDue), due: iso(f.dueDate), days: Math.max(0, daysOverdue(f.dueDate)), moved: f.dueChanges, response: f.mgmtResponse, escalatedTo: org.esc3To })),
    topRisks: entities
      .map((e) => ({ e, score: e.impact * e.likelihood }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ e, score }) => ({ code: e.code, name: e.name, unit: e.client?.name ?? null, score, band: band(score), residual: residual(e.impact, e.likelihood, e.controlEnv), lastAudited: iso(e.lastAuditedAt), nextDue: e.lastAuditedAt ? iso(nextDue(e.lastAuditedAt, e.cycleMonths)) : null })),
    controls: {
      keyTotal: controls.length,
      keyTested: controls.filter((c) => c.lastTestedAt && c.lastTestedAt >= start && c.lastTestedAt <= endOfDay).length,
      ineffective: controls.filter((c) => c.operating === "ineffective" || c.design === "ineffective").map((c) => ({ code: c.code, title: c.title, process: c.process, operating: c.operating, design: c.design })),
    },
    csa: csa
      ? { title: csa.title, controls: csaItems.length, answered: csaItems.filter((i) => i.answer).length, notWorking: csaItems.filter((i) => i.answer && i.answer !== "effective").length, disagree: csaItems.filter((i) => i.validation === "disagree").length }
      : null,
    time: { audit: time.filter((t) => t.category === "audit").reduce((a, t) => a + t.hours, 0), total: time.reduce((a, t) => a + t.hours, 0) },
  };
}
