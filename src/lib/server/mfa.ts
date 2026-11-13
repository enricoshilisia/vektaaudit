import "server-only";
// The step between a correct password and a session, for people with two-step sign-in.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const PENDING_COOKIE = "va_mfa";
const key = () => new TextEncoder().encode(`${process.env.AUTH_SECRET}:mfa-pending`);

/** Remembers, for five minutes, that this browser got the password right. */
export async function setPending(userId: string, next: string) {
  const token = await new SignJWT({ sub: userId, next }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(key());
  (await cookies()).set(PENDING_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/login", maxAge: 300 });
}

export async function readPending() {
  const t = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key(), { algorithms: ["HS256"] });
    return { userId: String(payload.sub), next: String(payload.next ?? "") };
  } catch {
    return null;
  }
}

export async function clearPending() {
  (await cookies()).delete({ name: PENDING_COOKIE, path: "/login" });
}

/** Recovery codes shown once, right after they are made (ten minutes, this browser only). */
export const CODES_COOKIE = "va_codes";
export async function showCodesOnce(codes: string[]) {
  (await cookies()).set(CODES_COOKIE, JSON.stringify(codes), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/setup-mfa", maxAge: 600 });
}
