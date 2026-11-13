import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { searchPeople } from "@/lib/server/microsoft";

/** Directory search for the people picker: ?q= name, email or job title. */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const org = await db.organization.findUnique({ where: { id: s.org }, select: { msTenantId: true } });
  if (!org?.msTenantId) return NextResponse.json({ people: [], connected: false });
  try {
    return NextResponse.json({ people: await searchPeople(org.msTenantId, req.nextUrl.searchParams.get("q") ?? ""), connected: true });
  } catch (e) {
    return NextResponse.json({ people: [], connected: true, error: (e as Error).message }, { status: 502 });
  }
}
