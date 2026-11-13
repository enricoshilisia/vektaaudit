"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CURRENCIES } from "@/lib/format";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { MIN_PASSWORD, emailTaken } from "@/lib/server/signin";
import { fail } from "@/lib/server/flash";

const role = z.enum(["ADMIN", "MANAGER", "AUDITOR", "VIEWER"]);
const INVITE_DAYS = 7;

export async function invite(form: FormData) {
  const s = await requireUser("admin");
  const email = z.string().trim().toLowerCase().email("Enter a valid email").parse(form.get("email"));
  const r = role.parse(form.get("role"));
  if (await emailTaken(email)) return fail("Someone with that email already has a VektaAudit account");
  const open = await db.invite.findFirst({ where: { orgId: s.org, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
  if (open) return fail("That person already has an open invitation. Copy its link below, or revoke it first.");
  await db.$transaction(async (tx) => {
    const i = await tx.invite.create({
      data: {
        orgId: s.org,
        email,
        role: r,
        name: String(form.get("name") ?? "").trim().slice(0, 80) || null,
        title: String(form.get("title") ?? "").trim().slice(0, 80) || null,
        token: randomBytes(24).toString("base64url"),
        invitedBy: s.name,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000),
      },
    });
    await logAction(tx, s, "invited user", "invite", i.id, `${email} as ${r}`);
  });
  revalidatePath("/settings/team");
}

export async function revokeInvite(id: string) {
  const s = await requireUser("admin");
  const i = await db.invite.findFirst({ where: { id, orgId: s.org } });
  if (!i) return fail("Invitation not found");
  await db.$transaction(async (tx) => {
    await tx.invite.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAction(tx, s, "revoked invitation", "invite", id, i.email);
  });
  revalidatePath("/settings/team");
}

/** Keeps at least one active admin, so the organisation can never lock itself out. */
async function otherAdmins(orgId: string, userId: string) {
  return db.user.count({ where: { orgId, role: "ADMIN", active: true, id: { not: userId } } });
}

export async function setRole(userId: string, form: FormData) {
  const s = await requireUser("admin");
  const r = role.parse(form.get("role"));
  const u = await db.user.findFirst({ where: { id: userId, orgId: s.org } });
  if (!u) return fail("User not found");
  if (u.role === "ADMIN" && r !== "ADMIN" && !(await otherAdmins(s.org, userId))) return fail("Make someone else an admin first");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: r } });
    await logAction(tx, s, "changed role", "user", userId, `${u.name}: ${u.role} → ${r}`);
  });
  revalidatePath("/settings/team");
}

export async function setActive(userId: string, active: boolean) {
  const s = await requireUser("admin");
  const u = await db.user.findFirst({ where: { id: userId, orgId: s.org } });
  if (!u) return fail("User not found");
  if (!active && userId === s.sub) return fail("You can't deactivate yourself");
  if (!active && u.role === "ADMIN" && !(await otherAdmins(s.org, userId))) return fail("Make someone else an admin first");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active } });
    await logAction(tx, s, active ? "reactivated user" : "deactivated user", "user", userId, u.name);
  });
  revalidatePath("/settings/team");
}

export async function updateOrganisation(form: FormData) {
  const s = await requireUser("admin");
  const d = z
    .object({ name: z.string().trim().min(2).max(120), kind: z.enum(["firm", "internal"]), currency: z.string().refine((c) => CURRENCIES.includes(c)) })
    .parse({ name: form.get("name"), kind: form.get("kind"), currency: form.get("currency") });
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: d });
    await logAction(tx, s, "updated organisation settings", "organization", s.org, `${d.name}, ${d.kind}, ${d.currency}`);
  });
  revalidatePath("/", "layout");
}

/** When overdue findings escalate, and to whom. */
export async function updateEscalation(form: FormData) {
  const s = await requireUser("admin");
  const day = z.coerce.number().int().min(1).max(730);
  const to = z.string().trim().min(2, "Say who each level escalates to").max(80);
  const d = {
    esc1Days: day.parse(form.get("esc1Days")),
    esc2Days: day.parse(form.get("esc2Days")),
    esc3Days: day.parse(form.get("esc3Days")),
    esc1To: to.parse(form.get("esc1To")),
    esc2To: to.parse(form.get("esc2To")),
    esc3To: to.parse(form.get("esc3To")),
  };
  if (!(d.esc1Days < d.esc2Days && d.esc2Days < d.esc3Days)) return fail("Each level needs more days overdue than the one before");
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: d });
    await logAction(tx, s, "changed escalation rules", "organization", s.org, `${d.esc1Days}/${d.esc2Days}/${d.esc3Days} days`);
  });
  revalidatePath("/settings/organisation");
}

export async function updateProfile(form: FormData) {
  const s = await requireUser();
  const d = z
    .object({ name: z.string().trim().min(2).max(80), title: z.string().trim().max(80), certifications: z.string().trim().max(200), weeklyHours: z.coerce.number().int().min(1).max(80) })
    .parse({ name: form.get("name"), title: form.get("title") ?? "", certifications: form.get("certifications") ?? "", weeklyHours: form.get("weeklyHours") || 40 });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: s.sub }, data: { name: d.name, title: d.title || null, certifications: d.certifications || null, weeklyHours: d.weeklyHours } });
    await logAction(tx, { ...s, name: d.name }, "updated profile", "user", s.sub);
  });
  revalidatePath("/", "layout");
}

export async function changePassword(form: FormData) {
  const s = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters`);
  const u = await db.user.findUniqueOrThrow({ where: { id: s.sub } });
  if (!(await bcrypt.compare(current, u.passwordHash))) return fail("Your current password isn't right");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: s.sub }, data: { passwordHash: await bcrypt.hash(next, 10) } });
    await logAction(tx, s, "changed password", "user", s.sub);
  });
  revalidatePath("/settings/profile");
}
