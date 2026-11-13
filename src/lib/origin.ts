import type { NextRequest } from "next/server";

/** Behind Caddy the app sees its internal address; rebuild the public one from the forwarded headers. */
export function publicOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
