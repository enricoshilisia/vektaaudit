// Session token helpers. Edge-safe (used by middleware): no Node or Prisma imports here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "va_session";
export const SESSION_DAYS = 14;

export type RoleName = "ADMIN" | "MANAGER" | "AUDITOR" | "VIEWER";

export interface SessionPayload {
  sub: string; // user id
  org: string; // organization id
  role: RoleName;
  name: string;
  email: string;
}

const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short");
  return new TextEncoder().encode(s);
};

export async function signSession(p: SessionPayload) {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
