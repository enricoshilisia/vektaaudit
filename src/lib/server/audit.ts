import "server-only";
import type { Tx } from "./db";
import type { SessionPayload } from "./session";

/** Appends to the organisation's audit trail. */
export function logAction(tx: Tx, s: Pick<SessionPayload, "org" | "name">, action: string, entity: string, entityId?: string | null, detail?: string) {
  return tx.auditLog.create({ data: { orgId: s.org, actorName: s.name, action, entity, entityId: entityId ?? null, detail } });
}

/** Next running number for an organization (engagements, findings...), atomic. */
export async function nextNumber(tx: Tx, orgId: string, key: string): Promise<number> {
  const c = await tx.counter.upsert({
    where: { orgId_key: { orgId, key } },
    create: { orgId, key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return c.value;
}
