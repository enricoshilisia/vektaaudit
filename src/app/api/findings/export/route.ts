import { NextResponse, type NextRequest } from "next/server";
import { FINDING_PILL, SEVERITY, fmtDate } from "@/lib/format";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // quote, and stop spreadsheet apps from running a cell as a formula
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  if (s.role === "GUEST") return NextResponse.json({ error: "Not available to guests" }, { status: 403 });
  const status = req.nextUrl.searchParams.get("status") ?? "open";
  const findings = await db.finding.findMany({
    where: { orgId: s.org, ...(status === "open" ? { status: { not: "closed" } } : status === "all" ? {} : { status }) },
    include: { engagement: { select: { code: true, name: true } } },
    orderBy: { code: "asc" },
  });
  const head = ["Code", "Title", "Engagement", "Severity", "Status", "Repeat", "Owner", "Due", "Condition", "Criteria", "Cause", "Effect", "Recommendation", "Management response"];
  const rows = findings.map((f) =>
    [f.code, f.title, `${f.engagement.code} ${f.engagement.name}`, SEVERITY[f.severity].label, FINDING_PILL[f.status].label, f.repeat ? "Yes" : "No", f.ownerName, fmtDate(f.dueDate), f.condition, f.criteria, f.cause, f.effect, f.recommendation, f.mgmtResponse]
      .map(cell)
      .join(","),
  );
  await db.auditLog.create({ data: { orgId: s.org, actorName: s.name, action: "exported findings", entity: "finding", detail: `${findings.length} rows` } });
  return new NextResponse("﻿" + [head.map(cell).join(","), ...rows].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="findings-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
