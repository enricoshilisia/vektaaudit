import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { db } from "@/lib/server/db";
import { graph, graphToken, verifyState } from "@/lib/server/microsoft";

/** Microsoft sends the admin back here after they approve (or decline) VektaAudit. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(`${publicOrigin(req)}/settings/microsoft?${q}`);
  const state = await verifyState(p.get("state"));
  if (!state) return back(`error=${encodeURIComponent("That approval link expired. Please try again.")}`);
  if (p.get("error")) return back(`error=${encodeURIComponent(p.get("error_description")?.split(/\r?\n/)[0] ?? "Microsoft didn't approve VektaAudit")}`);
  const tid = p.get("tenant") ?? "";
  if (p.get("admin_consent")?.toLowerCase() !== "true" || !/^[0-9a-f-]{36}$/i.test(tid)) return back(`error=${encodeURIComponent("Microsoft didn't confirm the approval")}`);

  const other = await db.organization.findFirst({ where: { msTenantId: tid, NOT: { id: state.o } }, select: { id: true } });
  if (other) return back(`error=${encodeURIComponent("That Microsoft 365 organisation is already connected to another VektaAudit organisation")}`);
  const user = await db.user.findFirst({ where: { id: state.u, orgId: state.o, role: "ADMIN", active: true } });
  if (!user) return back(`error=${encodeURIComponent("Only an admin can connect Microsoft 365")}`);

  // the organisation's name in Microsoft, if VektaAudit is allowed to read it; the connection works without it
  let name: string | null = null;
  try {
    await graphToken(tid, true);
    const r = await graph(tid, "/organization?$select=displayName");
    if (r.ok) name = ((await r.json()) as { value: { displayName: string }[] }).value[0]?.displayName ?? null;
  } catch {
    /* not essential */
  }
  await db.$transaction([
    db.organization.update({ where: { id: state.o }, data: { msTenantId: tid, msTenantName: name, msConnectedAt: new Date(), msConnectedBy: user.name } }),
    db.auditLog.create({ data: { orgId: state.o, actorName: user.name, action: "connected Microsoft 365", entity: "organization", entityId: state.o, detail: name ?? tid } }),
  ]);
  return back("connected=1");
}
