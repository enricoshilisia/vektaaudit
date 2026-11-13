import { NextResponse, type NextRequest } from "next/server";
import { escalation } from "@/lib/issues";
import { band, nextDue, residual } from "@/lib/risk";
import { apiOrg, page, paging } from "@/lib/server/api";
import { db } from "@/lib/server/db";

/**
 * Read-only API. GET /api/v1/engagements | findings | controls | universe | plan
 * Authorization: Bearer <key from Settings → API>. Paging: ?limit= (max 500) &offset=
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const auth = await apiOrg(req);
  if (auth instanceof NextResponse) return auth;
  const { orgId } = auth;
  const { limit, offset } = paging(req);
  const q = req.nextUrl.searchParams;

  switch ((await params).resource) {
    case "engagements": {
      const where = { orgId, ...(q.get("phase") ? { phase: q.get("phase")! } : {}) };
      const [rows, total] = await Promise.all([
        db.engagement.findMany({ where, orderBy: { code: "asc" }, skip: offset, take: limit, include: { client: { select: { name: true } }, lead: { select: { name: true } } } }),
        db.engagement.count({ where }),
      ]);
      return page(
        rows.map((e) => ({ id: e.id, code: e.code, name: e.name, kind: e.kind, phase: e.phase, client: e.client?.name ?? null, lead: e.lead?.name ?? null, periodStart: e.periodStart, periodEnd: e.periodEnd, dueDate: e.dueDate, budgetHours: e.budgetHours, actualHours: e.actualHours, rating: e.rating, closedAt: e.closedAt })),
        total,
        limit,
        offset,
      );
    }
    case "findings": {
      const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
      const status = q.get("status");
      const where = { orgId, ...(status === "open" ? { status: { not: "closed" } } : status ? { status } : {}), ...(q.get("severity") ? { severity: q.get("severity")! } : {}) };
      const [rows, total] = await Promise.all([db.finding.findMany({ where, orderBy: { code: "asc" }, skip: offset, take: limit, include: { engagement: { select: { code: true } } } }), db.finding.count({ where })]);
      return page(
        rows.map((f) => ({ id: f.id, code: f.code, title: f.title, severity: f.severity, status: f.status, engagement: f.engagement.code, owner: f.ownerName, ownerEmail: f.ownerEmail, dueDate: f.dueDate, originalDueDate: f.originalDue, dueDateChanges: f.dueChanges, escalationLevel: escalation(f, org), repeat: f.repeat, createdAt: f.createdAt, closedAt: f.closedAt })),
        total,
        limit,
        offset,
      );
    }
    case "controls": {
      const where = { orgId, ...(q.get("process") ? { process: q.get("process")! } : {}) };
      const [rows, total] = await Promise.all([db.control.findMany({ where, orderBy: { code: "asc" }, skip: offset, take: limit, include: { risks: { select: { code: true } } } }), db.control.count({ where })]);
      return page(
        rows.map((c) => ({ id: c.id, code: c.code, process: c.process, title: c.title, type: c.type, nature: c.nature, frequency: c.frequency, key: c.key, owner: c.ownerName, design: c.design, operating: c.operating, lastTestedAt: c.lastTestedAt, risks: c.risks.map((r) => r.code) })),
        total,
        limit,
        offset,
      );
    }
    case "universe": {
      const where = { orgId, archivedAt: null };
      const [rows, total] = await Promise.all([db.auditableEntity.findMany({ where, orderBy: { code: "asc" }, skip: offset, take: limit, include: { client: { select: { name: true } } } }), db.auditableEntity.count({ where })]);
      return page(
        rows.map((e) => ({ id: e.id, code: e.code, name: e.name, unit: e.client?.name ?? null, category: e.category, owner: e.owner, impact: e.impact, likelihood: e.likelihood, score: e.impact * e.likelihood, inherentRisk: band(e.impact * e.likelihood), controlEnvironment: e.controlEnv, residualRisk: residual(e.impact, e.likelihood, e.controlEnv), lastAuditedAt: e.lastAuditedAt, nextDue: e.lastAuditedAt ? nextDue(e.lastAuditedAt, e.cycleMonths) : null })),
        total,
        limit,
        offset,
      );
    }
    case "plan": {
      const year = Number(q.get("year")) || new Date().getFullYear();
      const plan = await db.auditPlan.findUnique({ where: { orgId_year: { orgId, year } }, include: { items: { orderBy: { startMonth: "asc" }, include: { entity: { select: { code: true } }, engagement: { select: { code: true, phase: true } }, lead: { select: { name: true } } } } } });
      if (!plan) return NextResponse.json({ error: `No audit plan for ${year}` }, { status: 404 });
      const items = plan.items.slice(offset, offset + limit).map((i) => ({ id: i.id, title: i.title, kind: i.kind, entity: i.entity?.code ?? null, lead: i.lead?.name ?? null, hours: i.hours, startMonth: i.startMonth, endMonth: i.endMonth, status: i.status, engagement: i.engagement?.code ?? null, engagementPhase: i.engagement?.phase ?? null }));
      return NextResponse.json({ year, status: plan.status, approvedBy: plan.approvedBy, approvedAt: plan.approvedAt, capacityHours: plan.capacityHours, data: items, total: plan.items.length, limit, offset });
    }
    default:
      return NextResponse.json({ error: "Unknown resource. Use engagements, findings, controls, universe or plan." }, { status: 404 });
  }
}
