"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";
import { CURRENCIES } from "@/lib/format";

const opt = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const schema = z.object({
  name: z.string().trim().min(2, "Give the client a name").max(160),
  industry: opt(),
  yearEnd: opt(40),
  framework: opt(),
  law: opt(),
  regNumber: opt(60),
  taxId: opt(60),
  address: opt(400),
  contactName: opt(120),
  contactTitle: opt(120),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Contact email isn't valid")
    .transform((v) => v || null),
  contactPhone: opt(40),
  notes: opt(4000),
  country: opt(60),
  currency: z
    .string()
    .trim()
    .refine((v) => !v || CURRENCIES.includes(v), "Choose a currency from the list")
    .transform((v) => v || null),
});

const read = (form: FormData) => schema.parse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, String(form.get(k) ?? "")])));

export async function createClient(form: FormData) {
  const s = await requireUser("manage");
  const data = read(form);
  const c = await db.$transaction(async (tx) => {
    const created = await tx.client.create({ data: { ...data, orgId: s.org } });
    await logAction(tx, s, "added client", "client", created.id, created.name);
    return created;
  });
  redirect(`/clients/${c.id}`);
}

async function own(orgId: string, id: string) {
  const c = await db.client.findFirst({ where: { id, orgId } });
  if (!c) return fail("Client not found");
  return c;
}

export async function updateClient(id: string, form: FormData) {
  const s = await requireUser("manage");
  await own(s.org, id);
  const data = read(form);
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data });
    await logAction(tx, s, "updated client", "client", id, data.name);
  });
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function setArchived(id: string, archived: boolean) {
  const s = await requireUser("manage");
  const c = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await logAction(tx, s, archived ? "archived client" : "restored client", "client", id, c.name);
  });
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}
