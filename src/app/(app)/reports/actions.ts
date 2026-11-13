"use server";

import { redirect } from "next/navigation";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addDocument } from "@/lib/server/documents";
import { renderPdf } from "@/lib/server/render";
import { OPINIONS, TEMPLATES, type Opinion, type TemplateKey, build, loadContext } from "@/lib/server/templates";
import { fail } from "@/lib/server/flash";
import { assertOpen } from "@/lib/server/lock";

/** Files the generated PDF on the engagement's audit file (Completion & reporting), as a new version if it exists. */
export async function saveToFile(engagementId: string, template: string, opinion: string | null) {
  const s = await requireUser("work");
  const t = TEMPLATES.find((x) => x.key === template);
  if (!t) return fail("Unknown template");
  await assertOpen(engagementId);
  const ctx = await loadContext(s.org, engagementId);
  const doc = build(t.key as TemplateKey, ctx, { opinion: OPINIONS.includes(opinion as Opinion) ? (opinion as Opinion) : undefined });
  const bytes = await renderPdf(doc, ctx.org.name);
  const d = await db.$transaction(async (tx) => {
    const created = await addDocument(tx, { orgId: s.org, engagementId, folder: "D · Completion & reporting", name: `${doc.title}.pdf`, bytes, linkRef: "D", source: "generated", uploadedBy: s.name, template: t.key });
    await logAction(tx, s, "generated document", "document", created.id, `${created.name} v${created.version}`);
    return created;
  });
  redirect(`/documents?engagement=${engagementId}&folder=${encodeURIComponent("D · Completion & reporting")}&doc=${d.id}`);
}
