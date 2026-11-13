"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { STARTERS } from "@/lib/frameworks";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

/** Adds a starter framework, or an empty one to import requirements into. */
export async function addFramework(form: FormData) {
  const s = await requireUser("manage");
  const key = str(form, "starter");
  const starter = STARTERS.find((x) => x.key === key);
  const name = starter?.name ?? z.string().min(3, "Name the framework, e.g. ISO/IEC 27001:2022 Annex A").max(160).parse(str(form, "name") ?? "");
  if (starter && (await db.framework.findFirst({ where: { orgId: s.org, source: starter.key } }))) return fail("That framework is already added");
  const f = await db.$transaction(async (tx) => {
    const created = await tx.framework.create({
      data: { orgId: s.org, name, source: starter?.key ?? "imported", requirements: starter ? { create: starter.requirements.map((r, i) => ({ ref: r.ref, title: r.title, sort: i })) } : undefined },
    });
    await logAction(tx, s, "added compliance framework", "framework", created.id, name);
    return created;
  });
  redirect(`/compliance/${f.id}`);
}

async function own(orgId: string, id: string) {
  const f = await db.framework.findFirst({ where: { id, orgId } });
  if (!f) return fail("Framework not found");
  return f;
}

/** Requirements from the customer's own copy of a standard: CSV with ref, title and (optional) detail columns. */
export async function importRequirements(id: string, form: FormData) {
  const s = await requireUser("manage");
  const f = await own(s.org, id);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose a CSV file");
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return fail("The file needs a heading row and at least one requirement");
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...n: string[]) => h.findIndex((x) => n.some((k) => x === k || x.includes(k)));
  const c = { ref: col("ref", "id", "clause", "control", "number"), title: col("title", "requirement", "name"), detail: col("detail", "description", "text", "guidance") };
  if (c.ref < 0 || c.title < 0) return fail("The file needs a Ref (or ID) column and a Title (or Requirement) column");
  const existing = new Set((await db.requirement.findMany({ where: { frameworkId: id }, select: { ref: true } })).map((r) => r.ref.toLowerCase()));
  const start = await db.requirement.count({ where: { frameworkId: id } });
  const add = rows
    .slice(1)
    .filter((r) => r[c.ref]?.trim() && r[c.title]?.trim() && !existing.has(r[c.ref].trim().toLowerCase()))
    .map((r, i) => ({ frameworkId: id, ref: r[c.ref].trim().slice(0, 40), title: r[c.title].trim().slice(0, 500), detail: c.detail >= 0 ? r[c.detail]?.trim().slice(0, 4000) || null : null, sort: start + i }));
  if (!add.length) return fail("No new requirements found in the file");
  await db.$transaction(async (tx) => {
    await tx.requirement.createMany({ data: add });
    await logAction(tx, s, "imported framework requirements", "framework", id, `${f.name}: ${add.length}`);
  });
  revalidatePath(`/compliance/${id}`);
}

async function ownReq(orgId: string, id: string) {
  const r = await db.requirement.findFirst({ where: { id, framework: { orgId } }, include: { framework: true } });
  if (!r) return fail("Requirement not found");
  return r;
}

export async function mapControl(reqId: string, form: FormData) {
  const s = await requireUser("manage");
  const r = await ownReq(s.org, reqId);
  const controlId = str(form, "controlId");
  const c = controlId ? await db.control.findFirst({ where: { id: controlId, orgId: s.org } }) : null;
  if (!c) return fail("Choose a control");
  await db.$transaction(async (tx) => {
    await tx.requirement.update({ where: { id: reqId }, data: { controls: { connect: { id: c.id } } } });
    await logAction(tx, s, "mapped control to requirement", "framework", r.frameworkId, `${r.ref} ← ${c.code}`);
  });
  revalidatePath(`/compliance/${r.frameworkId}`);
}

export async function unmapControl(reqId: string, controlId: string) {
  const s = await requireUser("manage");
  const r = await ownReq(s.org, reqId);
  await db.requirement.update({ where: { id: reqId }, data: { controls: { disconnect: { id: controlId } } } });
  revalidatePath(`/compliance/${r.frameworkId}`);
}

export async function setApplicable(reqId: string, form: FormData) {
  const s = await requireUser("manage");
  const r = await ownReq(s.org, reqId);
  const applicable = form.get("applicable") === "yes";
  const note = str(form, "note");
  if (!applicable && !note) return fail("Say why it doesn't apply");
  await db.$transaction(async (tx) => {
    await tx.requirement.update({ where: { id: reqId }, data: { applicable, note } });
    await logAction(tx, s, applicable ? "marked requirement applicable" : "marked requirement not applicable", "framework", r.frameworkId, `${r.ref}${note ? `: ${note}` : ""}`);
  });
  revalidatePath(`/compliance/${r.frameworkId}`);
}

export async function deleteFramework(id: string) {
  const s = await requireUser("manage");
  const f = await own(s.org, id);
  await db.$transaction(async (tx) => {
    await tx.framework.delete({ where: { id } });
    await logAction(tx, s, "removed compliance framework", "framework", id, f.name);
  });
  redirect("/compliance");
}
