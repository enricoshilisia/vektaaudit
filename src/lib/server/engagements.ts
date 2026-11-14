import "server-only";
import type { Tx } from "./db";
import { nextNumber } from "./audit";

/** Creates an engagement with its next code; financial audits get a starting set of lead schedules. */
export async function insertEngagement(
  tx: Tx,
  orgId: string,
  data: { name: string; kind: string; auditType?: string | null; area?: string | null; clientId?: string | null; leadId?: string | null; objective?: string | null; budgetHours?: number; periodStart?: Date | null; periodEnd?: Date | null; dueDate?: Date | null },
) {
  const year = new Date().getFullYear() + 1;
  const n = await nextNumber(tx, orgId, `eng-${year}`);
  const created = await tx.engagement.create({ data: { orgId, code: `ENG-${year}-${String(n).padStart(3, "0")}`, ...data } });
  if (data.kind === "financial") {
    // a starting set of lead schedules; the trial-balance import maps accounts onto them
    const leads: [string, string, string][] = [
      ["A", "Property, plant & equipment", "bs"],
      ["B", "Right-of-use assets", "bs"],
      ["C", "Inventories", "bs"],
      ["D", "Trade & other receivables", "bs"],
      ["E", "Cash & bank balances", "bs"],
      ["F", "Trade & other payables", "bs"],
      ["G", "Borrowings", "bs"],
      ["H", "Equity", "bs"],
      ["R", "Revenue", "is"],
      ["S", "Cost of sales", "is"],
      ["T", "Operating expenses", "is"],
    ];
    await tx.leadSchedule.createMany({ data: leads.map(([code, name, section], i) => ({ engagementId: created.id, code, name, section, sort: i })) });
  }
  return created;
}
