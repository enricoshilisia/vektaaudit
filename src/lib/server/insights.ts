import "server-only";
import { db } from "./db";
import { fmtShort } from "../format";

export type Insight = { text: string; href: string; tone: "risk" | "info" };

/** Rule-based observations over the organisation's live data, most important first. */
export async function orgInsights(orgId: string): Promise<Insight[]> {
  const now = new Date();
  const [repeats, overdueHigh, overdueReq, flagged] = await Promise.all([
    db.finding.findMany({ where: { orgId, repeat: true, status: { not: "closed" } }, select: { engagement: { select: { area: true } } } }),
    db.finding.count({ where: { orgId, severity: { in: ["critical", "high"] }, status: { not: "closed" }, dueDate: { lt: now } } }),
    db.evidenceRequest.count({ where: { engagement: { orgId }, status: { in: ["open", "needs_info"] }, dueDate: { lt: now } } }),
    tbFlags(orgId),
  ]);

  const out: Insight[] = [];
  const byArea = new Map<string, number>();
  for (const r of repeats) {
    const a = r.engagement.area ?? "Other";
    byArea.set(a, (byArea.get(a) ?? 0) + 1);
  }
  const [topArea, topN] = [...byArea.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (topArea && topN && topN >= 2) out.push({ text: `${topArea} has ${topN} open repeat findings. Consider a thematic review.`, href: "/findings?repeat=1", tone: "risk" });
  if (overdueHigh) out.push({ text: `${overdueHigh} critical or high finding${overdueHigh > 1 ? "s are" : " is"} past the agreed fix date.`, href: "/findings?overdue=1", tone: "risk" });
  for (const f of flagged.slice(0, 2)) out.push({ text: f.text, href: `/trial-balance?engagement=${f.engagementId}`, tone: "risk" });
  if (overdueReq) out.push({ text: `${overdueReq} evidence request${overdueReq > 1 ? "s are" : " is"} overdue from auditees.`, href: "/requests?overdue=1", tone: "info" });
  return out;
}

/** Year-on-year change in the size of a balance, so a credit balance that grows reads as an increase. */
export function movement(py: bigint, cy: bigint) {
  if (py === 0n) return null;
  const a = Math.abs(Number(py));
  return (Math.abs(Number(cy)) - a) / a;
}

/** Lead schedules that moved a lot and by more than performance materiality. */
export async function tbFlags(orgId: string, engagementId?: string) {
  const engagements = await db.engagement.findMany({
    where: { orgId, kind: "financial", ...(engagementId ? { id: engagementId } : { phase: { not: "closed" } }) },
    select: { id: true, performanceMat: true, client: { select: { name: true } }, leadsTb: true, tbLines: { select: { leadCode: true, prior: true, current: true } } },
  });
  const out: { engagementId: string; code: string; text: string }[] = [];
  for (const e of engagements) {
    for (const l of e.leadsTb) {
      let py = 0n,
        cy = 0n;
      for (const t of e.tbLines) if (t.leadCode === l.code) (py += t.prior), (cy += t.current);
      const change = movement(py, cy);
      if (change === null) continue;
      const delta = cy - py < 0n ? py - cy : cy - py;
      if (Math.abs(change) >= 0.25 && (!e.performanceMat || delta > e.performanceMat)) {
        out.push({
          engagementId: e.id,
          code: l.code,
          text: `${e.client?.name ?? "A client"}: ${l.name.toLowerCase()} moved ${change > 0 ? "+" : ""}${Math.round(change * 100)}% (${fmtShort(delta)}), above performance materiality.`,
        });
      }
    }
  }
  return out;
}
