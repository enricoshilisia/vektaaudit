"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addDocument } from "@/lib/server/documents";
import { fail } from "@/lib/server/flash";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const folderName = z.string().min(1).max(120);

export async function uploadDocuments(form: FormData) {
  const s = await requireUser("work");
  const engagementId = str(form, "engagementId");
  if (engagementId && !(await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org } }))) return fail("Engagement not found");
  const folder = folderName.parse(str(form, "folder") ?? "C · Fieldwork");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Choose at least one file");
  const linkRef = str(form, "linkRef");
  await db.$transaction(
    async (tx) => {
      for (const file of files) {
        const d = await addDocument(tx, { orgId: s.org, engagementId, folder, name: file.name, bytes: Buffer.from(await file.arrayBuffer()), linkRef, source: "auditor", uploadedBy: s.name });
        await logAction(tx, s, "uploaded document", "document", d.id, `${d.name} v${d.version} → ${folder}`);
      }
    },
    { timeout: 60000 },
  );
  revalidatePath("/documents");
}

async function own(orgId: string, id: string) {
  const d = await db.document.findFirst({ where: { id, orgId } });
  if (!d) return fail("Document not found");
  return d;
}

export async function markReviewed(id: string) {
  const s = await requireUser("review");
  const d = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: "reviewed" } });
    await logAction(tx, s, "reviewed document", "document", id, `${d.name} v${d.version}`);
  });
  revalidatePath("/documents");
}

export async function updateDocument(id: string, form: FormData) {
  const s = await requireUser("work");
  const d = await own(s.org, id);
  const folder = folderName.parse(str(form, "folder") ?? d.folder);
  const linkRef = str(form, "linkRef");
  await db.$transaction(async (tx) => {
    // the whole version history moves together
    await tx.document.updateMany({ where: { orgId: s.org, engagementId: d.engagementId, folder: d.folder, name: d.name }, data: { folder, linkRef } });
    await logAction(tx, s, "filed document", "document", id, `${d.name}: ${folder}${linkRef ? `, ref ${linkRef}` : ""}`);
  });
  revalidatePath("/documents");
}
