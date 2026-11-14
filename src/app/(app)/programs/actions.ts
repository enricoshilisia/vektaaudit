"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { programOf, type Step } from "@/lib/programs";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import { assertOpen } from "@/lib/server/lock";

/** Adds a standard or saved program's procedures to an engagement, after the ones it has; repeats are skipped. */
export async function loadProgram(engagementId: string, form: FormData) {
  const s = await requireUser("work");
  const e = await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org }, include: { procedures: { select: { title: true } } } });
  if (!e) return fail("Engagement not found");
  await assertOpen(e.id);
  const choice = String(form.get("program") ?? "");
  let name: string;
  let steps: Step[];
  if (choice.startsWith("builtin:")) {
    const p = programOf(choice.slice(8));
    if (!p) return fail("Choose a program");
    name = p.name;
    steps = p.steps;
  } else if (choice.startsWith("org:")) {
    const t = await db.programTemplate.findFirst({ where: { id: choice.slice(4), orgId: s.org } });
    if (!t) return fail("Choose a program");
    name = t.name;
    steps = t.steps as Step[];
  } else return fail("Choose a program");
  const have = new Set(e.procedures.map((p) => p.title.trim().toLowerCase()));
  const add = steps.filter((st) => !have.has(st.title.trim().toLowerCase()));
  if (!add.length) return fail("Every procedure in that program is already on this engagement");
  const start = e.procedures.length;
  await db.$transaction(async (tx) => {
    await tx.procedure.createMany({ data: add.map((st, i) => ({ engagementId: e.id, ref: `P-${String(start + i + 1).padStart(2, "0")}`, title: st.title, control: st.control ?? null, sort: start + i })) });
    await logAction(tx, s, "loaded work program", "engagement", e.id, `${name}: ${add.length} procedures`);
  });
  revalidatePath(`/engagements/${e.id}`);
  return notice(`Added ${add.length} procedure${add.length === 1 ? "" : "s"} from ${name}${add.length < steps.length ? ` (${steps.length - add.length} already there)` : ""}`);
}

/** Saves an engagement's procedures as the organisation's own reusable program. */
export async function saveProgram(engagementId: string, form: FormData) {
  const s = await requireUser("manage");
  const e = await db.engagement.findFirst({ where: { id: engagementId, orgId: s.org }, include: { procedures: { orderBy: { sort: "asc" }, select: { title: true, control: true } } } });
  if (!e) return fail("Engagement not found");
  if (!e.procedures.length) return fail("Add procedures to the engagement first");
  const name = z.string().trim().min(3, "Name the program").max(120).parse(form.get("name"));
  await db.$transaction(async (tx) => {
    const t = await tx.programTemplate.create({ data: { orgId: s.org, name, area: e.area, steps: e.procedures.map((p) => ({ title: p.title, control: p.control ?? undefined })), createdBy: s.name } });
    await logAction(tx, s, "saved work program", "program", t.id, `${name}: ${e.procedures.length} procedures`);
  });
  revalidatePath("/programs");
  return notice(`Saved "${name}" to your work programs`);
}

export async function deleteProgram(id: string) {
  const s = await requireUser("manage");
  const t = await db.programTemplate.findFirst({ where: { id, orgId: s.org } });
  if (!t) return fail("Program not found");
  await db.$transaction(async (tx) => {
    await tx.programTemplate.delete({ where: { id } });
    await logAction(tx, s, "deleted work program", "program", id, t.name);
  });
  revalidatePath("/programs");
}
