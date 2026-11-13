import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { renderPdf, renderWord } from "@/lib/server/render";
import { OPINIONS, TEMPLATES, type Opinion, type TemplateKey, build, loadContext } from "@/lib/server/templates";

/** Downloads a generated letter or report: ?engagement=&template=&format=pdf|doc[&opinion=] */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (s.role === "GUEST") return NextResponse.json({ error: "Not available to guests" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const t = TEMPLATES.find((x) => x.key === p.get("template"));
  if (!t) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  const opinion = OPINIONS.includes(p.get("opinion") as Opinion) ? (p.get("opinion") as Opinion) : undefined;
  let ctx;
  try {
    ctx = await loadContext(s.org, p.get("engagement") ?? "");
  } catch {
    return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  }
  const doc = build(t.key as TemplateKey, ctx, { opinion });
  const word = p.get("format") === "doc";
  const bytes = word ? Buffer.from(renderWord(doc), "utf8") : await renderPdf(doc, ctx.org.name);
  const name = `${ctx.code} ${doc.title}.${word ? "doc" : "pdf"}`.replace(/[^\w .'-]/g, "");
  await db.auditLog.create({ data: { orgId: s.org, actorName: s.name, action: "downloaded generated document", entity: "engagement", entityId: ctx.id, detail: name } });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": word ? "application/msword" : "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
