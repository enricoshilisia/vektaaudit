import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/auth";
import { type PackData, buildPack } from "@/lib/server/committee";
import { packDoc } from "@/lib/server/committeePdf";
import { db } from "@/lib/server/db";
import { renderPdf } from "@/lib/server/render";

/** The committee pack as a PDF: the frozen figures once issued, live figures while a draft. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const p = await db.committeePack.findFirst({ where: { id: (await params).id, orgId: s.org }, include: { org: { select: { name: true } } } });
  if (!p) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  const issued = p.status === "issued" && p.snapshot ? { at: p.issuedAt!, by: p.issuedBy ?? "" } : null;
  const d = issued ? (p.snapshot as unknown as PackData) : await buildPack(s.org, p.periodStart, p.periodEnd);
  const bytes = await renderPdf(packDoc(d, p.title, p.summary, p.meetingDate, issued), p.org.name);
  const name = `${p.title}${issued ? "" : " (draft)"}.pdf`.replace(/[^\w .'(),-]/g, "");
  await db.auditLog.create({ data: { orgId: s.org, actorName: s.name, action: "downloaded committee pack", entity: "committee", entityId: p.id, detail: name } });
  return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" } });
}
