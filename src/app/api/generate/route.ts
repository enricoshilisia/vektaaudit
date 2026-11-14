import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { DOCX_MIME, renderDocx } from "@/lib/server/docx";
import { renderPdf } from "@/lib/server/render";
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
  // Word: a real .docx ("doc" is still accepted from older links)
  const word = p.get("format") === "docx" || p.get("format") === "doc";
  const bytes = word ? renderDocx(doc, ctx.org.name) : await renderPdf(doc, ctx.org.name);
  const name = `${ctx.code} ${doc.title}.${word ? "docx" : "pdf"}`.replace(/[^\w .'-]/g, "");
  await db.auditLog.create({ data: { orgId: s.org, actorName: s.name, action: "downloaded generated document", entity: "engagement", entityId: ctx.id, detail: name } });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": word ? DOCX_MIME : "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
