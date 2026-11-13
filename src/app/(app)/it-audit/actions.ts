"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCsv } from "@/lib/csv";
import { ITGC_DOMAINS } from "@/lib/itaudit";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import { emailHtml, sendMail } from "@/lib/server/m365";
import { appUrl } from "@/lib/server/microsoft";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const RATING = z.enum(["not_tested", "effective", "needs_improvement", "ineffective", "not_applicable"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- systems ----

export async function createSystem(form: FormData) {
  const s = await requireUser("manage");
  const name = z.string().min(2, "Name the system").max(120).parse(str(form, "name") ?? "");
  const ownerEmail = str(form, "ownerEmail");
  if (ownerEmail && !EMAIL.test(ownerEmail)) return fail("The owner's email isn't valid");
  const sys = await db.$transaction(async (tx) => {
    const created = await tx.itSystem.create({ data: { orgId: s.org, name, description: str(form, "description"), ownerName: str(form, "ownerName"), ownerEmail, critical: form.get("critical") === "on" } });
    await logAction(tx, s, "added IT system", "itsystem", created.id, name);
    return created;
  });
  redirect(`/it-audit/${sys.id}`);
}

async function ownSystem(orgId: string, id: string) {
  const x = await db.itSystem.findFirst({ where: { id, orgId } });
  if (!x) return fail("System not found");
  return x;
}

export async function updateSystem(id: string, form: FormData) {
  const s = await requireUser("manage");
  const sys = await ownSystem(s.org, id);
  const ownerEmail = str(form, "ownerEmail");
  if (ownerEmail && !EMAIL.test(ownerEmail)) return fail("The owner's email isn't valid");
  await db.$transaction(async (tx) => {
    await tx.itSystem.update({ where: { id }, data: { name: str(form, "name") ?? sys.name, description: str(form, "description"), ownerName: str(form, "ownerName"), ownerEmail, critical: form.get("critical") === "on", notes: str(form, "notes") } });
    await logAction(tx, s, "updated IT system", "itsystem", id, sys.name);
  });
  revalidatePath(`/it-audit/${id}`);
}

/** The auditor's rating of each IT general control area, after testing. */
export async function rateSystem(id: string, form: FormData) {
  const s = await requireUser("review");
  const sys = await ownSystem(s.org, id);
  const data = Object.fromEntries(ITGC_DOMAINS.map((d) => [d.key, RATING.parse(form.get(d.key))])) as Record<string, string>;
  await db.$transaction(async (tx) => {
    await tx.itSystem.update({ where: { id }, data: { ...data, lastTestedAt: new Date() } });
    await logAction(tx, s, "rated IT general controls", "itsystem", id, `${sys.name}: ${ITGC_DOMAINS.map((d) => `${d.key} ${data[d.key].replace("_", " ")}`).join(", ")}`);
  });
  revalidatePath(`/it-audit/${id}`);
  revalidatePath("/it-audit");
}

export async function addSodRule(id: string, form: FormData) {
  const s = await requireUser("manage");
  const sys = await ownSystem(s.org, id);
  const roleA = z.string().min(1, "Enter both roles").max(80).parse(str(form, "roleA") ?? "");
  const roleB = z.string().min(1, "Enter both roles").max(80).parse(str(form, "roleB") ?? "");
  if (roleA.toLowerCase() === roleB.toLowerCase()) return fail("Choose two different roles");
  await db.$transaction(async (tx) => {
    await tx.sodRule.create({ data: { orgId: s.org, systemId: id, roleA, roleB, risk: z.enum(["critical", "high", "medium"]).parse(form.get("risk") ?? "high"), description: str(form, "description") } });
    await logAction(tx, s, "added segregation-of-duties rule", "itsystem", id, `${sys.name}: ${roleA} + ${roleB}`);
  });
  revalidatePath(`/it-audit/${id}`);
}

export async function removeSodRule(ruleId: string) {
  const s = await requireUser("manage");
  const r = await db.sodRule.findFirst({ where: { id: ruleId, orgId: s.org } });
  if (!r) return fail("Rule not found");
  await db.sodRule.delete({ where: { id: ruleId } });
  revalidatePath(`/it-audit/${r.systemId}`);
}

// ---- access reviews ----

export async function createReview(form: FormData) {
  const s = await requireUser("manage");
  const title = z.string().min(3, "Give the review a title").max(160).parse(str(form, "title") ?? "");
  const ids = form.getAll("systems").map(String);
  const systems = await db.itSystem.findMany({ where: { orgId: s.org, id: { in: ids } } });
  if (!systems.length) return fail("Choose at least one system");
  const r = await db.$transaction(async (tx) => {
    const created = await tx.accessReview.create({
      data: {
        orgId: s.org,
        title,
        dueDate: str(form, "dueDate") ? new Date(`${str(form, "dueDate")}T12:00:00`) : null,
        createdBy: s.name,
        lists: { create: systems.map((x) => ({ systemId: x.id, ownerName: x.ownerName ?? `${x.name} owner`, ownerEmail: x.ownerEmail, token: randomBytes(24).toString("base64url") })) },
      },
    });
    await logAction(tx, s, "started access review", "accessreview", created.id, `${title}: ${systems.length} systems`);
    return created;
  });
  redirect(`/it-audit/reviews/${r.id}`);
}

async function ownList(orgId: string, id: string) {
  const l = await db.accessList.findFirst({ where: { id, review: { orgId } }, include: { review: { include: { org: true } }, system: true } });
  if (!l) return fail("System not found in this review");
  return l;
}

/** The system's user list from IT: account, person, roles, department, last login. */
export async function uploadUsers(listId: string, form: FormData) {
  const s = await requireUser("work");
  const l = await ownList(s.org, listId);
  if (l.review.status !== "open") return fail("This review is closed");
  if (l.submittedAt) return fail("The owner has already finished this list");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose the CSV of users");
  const rows = parseCsv(await file.text());
  if (rows.length < 2) return fail("The file needs a heading row and at least one user");
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)));
  const c = { account: col("account", "username", "user id", "login", "user"), person: col("name", "full name", "display"), roles: col("roles", "role", "profile", "group"), department: col("department", "dept"), lastLogin: col("last login", "last logon", "last sign", "last activity") };
  if (c.account < 0 || c.roles < 0) return fail("The file needs at least an Account (or Username) column and a Roles column");
  const users = rows.slice(1).filter((r) => (r[c.account] ?? "").trim());
  if (users.length > 20_000) return fail("Up to 20,000 accounts per system");
  await db.$transaction(
    async (tx) => {
      await tx.accessEntry.deleteMany({ where: { listId } });
      await tx.accessEntry.createMany({
        data: users.map((r) => ({ listId, account: r[c.account].trim().slice(0, 120), person: c.person >= 0 ? r[c.person]?.trim().slice(0, 120) || null : null, roles: r[c.roles]?.trim().slice(0, 500) ?? "", department: c.department >= 0 ? r[c.department]?.trim().slice(0, 120) || null : null, lastLogin: c.lastLogin >= 0 ? r[c.lastLogin]?.trim().slice(0, 40) || null : null })),
      });
      await logAction(tx, s, "loaded user list for access review", "accessreview", l.reviewId, `${l.system.name}: ${users.length} accounts`);
    },
    { timeout: 60_000 },
  );
  revalidatePath(`/it-audit/reviews/${l.reviewId}`);
}

export async function setListOwner(listId: string, form: FormData) {
  const s = await requireUser("manage");
  const l = await ownList(s.org, listId);
  const email = str(form, "email");
  if (email && !EMAIL.test(email)) return fail("That email isn't valid");
  await db.accessList.update({ where: { id: listId }, data: { ownerEmail: email, ownerName: str(form, "name") ?? l.ownerName } });
  revalidatePath(`/it-audit/reviews/${l.reviewId}`);
}

export async function emailListOwner(listId: string) {
  const s = await requireUser("manage");
  const l = await ownList(s.org, listId);
  if (!l.ownerEmail) return fail("Add the system owner's email first");
  const n = await db.accessEntry.count({ where: { listId } });
  if (!n) return fail("Load the system's user list first");
  try {
    await sendMail(l.review.org, {
      to: [l.ownerEmail],
      subject: `${l.review.title}: please review who has access to ${l.system.name}`,
      html: emailHtml({
        orgName: l.review.org.name,
        heading: `Hello ${l.ownerName}`,
        paragraphs: [
          `As the owner of ${l.system.name}, please confirm who should keep access. There are ${n} accounts to review. For each one, choose keep, change roles or remove.`,
          l.review.dueDate ? `Please finish by ${l.review.dueDate.toISOString().slice(0, 10)}.` : "Please finish as soon as you can.",
        ],
        button: { label: `Review access to ${l.system.name}`, url: `${appUrl()}/ar/${l.token}` },
        footer: `Sent by ${s.name} for ${l.review.org.name} internal audit. This link is personal to you; please don't forward it.`,
      }),
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  await db.accessList.update({ where: { id: listId }, data: { emailedAt: new Date() } });
  return notice(`Emailed ${l.ownerEmail}`);
}

/** IT confirms a removal or role change was made in the system. */
export async function markDone(entryId: string) {
  const s = await requireUser("work");
  const e = await db.accessEntry.findFirst({ where: { id: entryId, list: { review: { orgId: s.org } } }, include: { list: { include: { system: true } } } });
  if (!e) return fail("Account not found");
  await db.$transaction(async (tx) => {
    await tx.accessEntry.update({ where: { id: entryId }, data: { removedAt: new Date(), removedBy: s.name } });
    await logAction(tx, s, e.decision === "remove" ? "confirmed access removed" : "confirmed roles changed", "accessreview", e.list.reviewId, `${e.list.system.name}: ${e.account}`);
  });
  revalidatePath(`/it-audit/reviews/${e.list.reviewId}`);
}

export async function setReviewStatus(id: string, status: "open" | "closed") {
  const s = await requireUser("manage");
  const r = await db.accessReview.findFirst({ where: { id, orgId: s.org } });
  if (!r) return fail("Review not found");
  await db.$transaction(async (tx) => {
    await tx.accessReview.update({ where: { id }, data: { status } });
    await logAction(tx, s, status === "closed" ? "closed access review" : "reopened access review", "accessreview", id, r.title);
  });
  revalidatePath(`/it-audit/reviews/${id}`);
}
