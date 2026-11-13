"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { newKey } from "@/lib/server/api";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

export async function createApiKey(form: FormData) {
  const s = await requireUser("admin");
  const name = z.string().trim().min(2, "Name the key").max(80).parse(form.get("name"));
  const k = newKey();
  await db.$transaction(async (tx) => {
    const created = await tx.apiKey.create({ data: { orgId: s.org, name, prefix: k.prefix, hash: k.hash, createdBy: s.name } });
    await logAction(tx, s, "created API key", "apikey", created.id, `${name} (${k.prefix}…)`);
  });
  // shown once, on this page, for ten minutes
  (await cookies()).set("va_newkey", k.key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/settings/api", maxAge: 600 });
  revalidatePath("/settings/api");
}

export async function revokeApiKey(id: string) {
  const s = await requireUser("admin");
  const k = await db.apiKey.findFirst({ where: { id, orgId: s.org } });
  if (!k) return fail("Key not found");
  await db.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAction(tx, s, "revoked API key", "apikey", id, `${k.name} (${k.prefix}…)`);
  });
  (await cookies()).delete({ name: "va_newkey", path: "/settings/api" });
  revalidatePath("/settings/api");
}
