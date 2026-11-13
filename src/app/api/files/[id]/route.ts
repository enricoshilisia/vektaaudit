import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getFile } from "@/lib/server/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const d = await db.document.findFirst({ where: { id: (await params).id, orgId: s.org } });
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = await getFile(d.storageKey);
  await db.auditLog.create({ data: { orgId: s.org, actorName: s.name, action: "downloaded document", entity: "document", entityId: d.id, detail: `${d.name} v${d.version}` } });
  const inline = req.nextUrl.searchParams.get("inline") === "1" && /^(application\/pdf|image\/)/.test(d.mime);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": d.mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
