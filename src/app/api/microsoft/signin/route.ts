import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { db } from "@/lib/server/db";
import { msConfigured, redeemSignInCode, signInUrl, signState, verifyState } from "@/lib/server/microsoft";
import { startSession } from "@/lib/server/signin";

const NONCE = "va_ms_nonce";

/**
 * "Sign in with Microsoft". Without a code: off to Microsoft. With a code: Microsoft sent the person back.
 * Only people who already have a VektaAudit account, in an organisation connected to their Microsoft tenant, get in.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const origin = publicOrigin(req);
  const fail = (msg: string) => NextResponse.redirect(`${origin}/login?ms=${encodeURIComponent(msg)}`);
  if (!msConfigured()) return fail("Signing in with Microsoft isn't set up on this server yet");

  if (!p.get("code") && !p.get("error")) {
    const nonce = randomBytes(16).toString("base64url");
    const next = p.get("next") ?? "";
    const res = NextResponse.redirect(signInUrl(await signState({ n: nonce, next: next.startsWith("/") && !next.startsWith("//") ? next : "" }), nonce, p.get("email") ?? undefined));
    res.cookies.set(NONCE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/microsoft", maxAge: 900 });
    return res;
  }

  if (p.get("error")) return fail(p.get("error_description")?.split(/\r?\n/)[0] ?? "Microsoft sign-in was cancelled");
  const state = await verifyState(p.get("state"));
  const nonce = req.cookies.get(NONCE)?.value;
  if (!state || !nonce || state.n !== nonce) return fail("The sign-in took too long. Please try again.");
  let who;
  try {
    who = await redeemSignInCode(p.get("code")!, nonce);
  } catch (e) {
    return fail((e as Error).message);
  }
  const user = who.email ? await db.user.findFirst({ where: { email: { equals: who.email, mode: "insensitive" }, active: true, org: { msTenantId: who.tid } } }) : null;
  if (!user) return fail(`There's no VektaAudit account for ${who.email || "that Microsoft account"} in an organisation connected to Microsoft 365. Ask your admin to invite you.`);
  if (who.oid && user.msObjectId !== who.oid) await db.user.update({ where: { id: user.id }, data: { msObjectId: who.oid } });
  await startSession(user, "signed in with Microsoft");
  const res = NextResponse.redirect(`${origin}${state.next || "/dashboard"}`);
  res.cookies.delete({ name: NONCE, path: "/api/microsoft" });
  return res;
}
