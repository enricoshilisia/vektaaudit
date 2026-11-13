import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session";

// the auditee portal (/p/<token>) and invitations (/invite/<token>) check their own links
const PUBLIC = ["/features", "/security", "/sa", "/ar", "/api/v1", "/api/microsoft/signin", "/api/microsoft/consent", "/login", "/signup", "/invite", "/p"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(`${publicOrigin(req)}/login${next}`);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
