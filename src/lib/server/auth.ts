import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { SESSION_COOKIE, verifySession, type RoleName, type SessionPayload } from "./session";
import { fail } from "./flash";

/** What each role may do. Admin may do everything; viewers only read. */
export const PERMS = {
  work: ["MANAGER", "AUDITOR"], // prepare procedures, raise findings, request and upload evidence
  review: ["MANAGER"], // reviewer sign-off, resolve review notes, accept evidence, validate and close findings
  manage: ["MANAGER"], // create engagements and clients, move phases, set materiality, import trial balances
  admin: [], // team, invitations and organisation settings
} satisfies Record<string, RoleName[]>;
export type Perm = keyof typeof PERMS;

export const ROLES: { key: RoleName; label: string; hint: string }[] = [
  { key: "ADMIN", label: "Admin", hint: "Everything, including team and settings" },
  { key: "MANAGER", label: "Manager", hint: "Reviews and signs off, runs engagements" },
  { key: "AUDITOR", label: "Auditor", hint: "Does the work, raises findings" },
  { key: "VIEWER", label: "Viewer", hint: "Reads only (e.g. audit committee)" },
];

export function can(s: Pick<SessionPayload, "role">, perm: Perm) {
  return s.role === "ADMIN" || (PERMS[perm] as RoleName[]).includes(s.role);
}

/**
 * The signed-in user, re-read from the database on every request: a deactivated account stops working at once,
 * and a role change applies without signing in again.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const u = await db.user.findUnique({ where: { id: s.sub }, select: { active: true, role: true, name: true, email: true, orgId: true, guestUntil: true } });
  if (!u || !u.active || u.orgId !== s.org) return null;
  // a guest's access ends on its date
  if (u.role === "GUEST" && (!u.guestUntil || u.guestUntil < new Date())) return null;
  return { ...s, role: u.role as RoleName, name: u.name, email: u.email };
});

/** For pages and server actions: signed-in user, optionally with a permission. */
export async function requireUser(perm?: Perm): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) redirect("/login");
  // guests have their own read-only area
  if (s.role === "GUEST") redirect("/guest");
  if (perm && !can(s, perm)) return fail("Your role is not allowed to do this");
  return s;
}
