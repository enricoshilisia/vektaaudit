import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { can, getSession } from "@/lib/server/auth";
import { adminConsentUrl, msConfigured, signState } from "@/lib/server/microsoft";

/** Sends the admin to Microsoft to approve VektaAudit for their organisation. */
export async function GET(req: NextRequest) {
  const s = await getSession();
  const back = `${publicOrigin(req)}/settings/microsoft`;
  if (!s || !can(s, "admin")) return NextResponse.redirect(`${publicOrigin(req)}/login`);
  if (!msConfigured()) return NextResponse.redirect(`${back}?error=${encodeURIComponent("Microsoft 365 isn't set up on this VektaAudit server yet")}`);
  return NextResponse.redirect(adminConsentUrl(await signState({ o: s.org, u: s.sub })));
}
