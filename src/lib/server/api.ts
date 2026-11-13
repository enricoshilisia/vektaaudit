import "server-only";
// The read-only API: keys (only a hash is stored), authentication, paging and a simple rate limit.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "./db";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new key: va_ followed by 32 random characters. Shown once; only its hash is kept. */
export function newKey() {
  const key = `va_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashKey(key) };
}

const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 120; // requests a minute per key

/** The organisation behind the request's API key, or an error response. */
export async function apiOrg(req: NextRequest): Promise<{ orgId: string } | NextResponse> {
  const key = req.headers.get("authorization")?.match(/^Bearer\s+(va_[\w-]+)$/)?.[1];
  if (!key) return NextResponse.json({ error: "Send your API key as: Authorization: Bearer va_…" }, { status: 401 });
  const k = await db.apiKey.findUnique({ where: { hash: hashKey(key) } });
  if (!k || k.revokedAt) return NextResponse.json({ error: "This API key isn't valid or has been revoked" }, { status: 401 });
  const now = Date.now();
  const h = hits.get(k.id);
  if (h && h.reset > now) {
    if (++h.n > LIMIT) return NextResponse.json({ error: "Too many requests; at most 120 a minute" }, { status: 429, headers: { "retry-after": String(Math.ceil((h.reset - now) / 1000)) } });
  } else hits.set(k.id, { n: 1, reset: now + 60_000 });
  if (!k.lastUsedAt || now - k.lastUsedAt.getTime() > 5 * 60_000) await db.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
  return { orgId: k.orgId };
}

/** ?limit= (1–500, default 100) and ?offset= */
export function paging(req: NextRequest) {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset")) || 0);
  return { limit, offset };
}

/** Dates as ISO strings, money (BigInt) as numbers. */
export function page<T>(data: T[], total: number, limit: number, offset: number) {
  return NextResponse.json(JSON.parse(JSON.stringify({ data, total, limit, offset }, (_, v) => (typeof v === "bigint" ? Number(v) : v))), { headers: { "cache-control": "no-store" } });
}
