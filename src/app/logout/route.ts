import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { SESSION_COOKIE } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(`${publicOrigin(req)}/login`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
