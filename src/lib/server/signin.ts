import "server-only";
import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { db } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, type RoleName } from "./session";

export const MIN_PASSWORD = 10;

/** Sets the session cookie and records the sign-in. */
export async function startSession(user: User, how = "signed in") {
  const token = await signSession({ sub: user.id, org: user.orgId, role: user.role as RoleName, name: user.name, email: user.email });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({ data: { orgId: user.orgId, actorName: user.name, action: how, entity: "user", entityId: user.id } });
}

/** One account per email address across all organisations, so signing in never has to ask which one. */
export async function emailTaken(email: string) {
  return !!(await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }));
}
