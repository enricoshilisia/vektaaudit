"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAction, nextNumber } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const score = z.coerce.number().int().min(1).max(5);

const fields = (form: FormData) => ({
  name: z.string().min(3, "Give the auditable entity a name").max(160).parse(str(form, "name") ?? ""),
  category: str(form, "category"),
  owner: str(form, "owner"),
  clientId: str(form, "clientId"),
  impact: score.parse(form.get("impact")),
  likelihood: score.parse(form.get("likelihood")),
  controlEnv: z.enum(["strong", "adequate", "needs_improvement", "weak"]).parse(form.get("controlEnv")),
  cycleMonths: z.coerce.number().int().refine((n) => [12, 24, 36, 48].includes(n)).parse(form.get("cycleMonths")),
  lastAuditedAt: str(form, "lastAuditedAt") ? new Date(str(form, "lastAuditedAt")!) : null,
  notes: str(form, "notes"),
});

async function checkClient(orgId: string, clientId: string | null) {
  if (clientId && !(await db.client.findFirst({ where: { id: clientId, orgId } }))) return fail("Client not found");
}

export async function createEntity(form: FormData) {
  const s = await requireUser("manage");
  const data = fields(form);
  await checkClient(s.org, data.clientId);
  const e = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, s.org, "entity");
    const created = await tx.auditableEntity.create({ data: { ...data, orgId: s.org, code: `AU-${String(n).padStart(3, "0")}` } });
    await logAction(tx, s, "added to audit universe", "entity", created.id, `${created.code} ${created.name}`);
    return created;
  });
  redirect(`/universe/${e.id}`);
}

async function own(orgId: string, id: string) {
  const e = await db.auditableEntity.findFirst({ where: { id, orgId } });
  if (!e) return fail("Auditable entity not found");
  return e;
}

export async function updateEntity(id: string, form: FormData) {
  const s = await requireUser("manage");
  const before = await own(s.org, id);
  const data = fields(form);
  await checkClient(s.org, data.clientId);
  const changed = before.impact !== data.impact || before.likelihood !== data.likelihood ? ` · risk ${before.impact}×${before.likelihood} → ${data.impact}×${data.likelihood}` : "";
  await db.$transaction(async (tx) => {
    await tx.auditableEntity.update({ where: { id }, data });
    await logAction(tx, s, "updated auditable entity", "entity", id, `${before.code} ${data.name}${changed}`);
  });
  revalidatePath("/universe");
  redirect(`/universe/${id}`);
}

export async function setEntityArchived(id: string, archived: boolean) {
  const s = await requireUser("manage");
  const e = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.auditableEntity.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await logAction(tx, s, archived ? "archived auditable entity" : "restored auditable entity", "entity", id, `${e.code} ${e.name}`);
  });
  revalidatePath(`/universe/${id}`);
  revalidatePath("/universe");
}
