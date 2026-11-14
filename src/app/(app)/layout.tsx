import { Search } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { RAIL_COOKIE } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  const now = new Date();
  const open = { in: ["open", "needs_info"] };
  const [org, user, engagements, requests, requestsLate, findings, findingsLate, recent, financial] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: s.org } }),
    db.user.findUniqueOrThrow({ where: { id: s.sub } }),
    db.engagement.count({ where: { orgId: s.org, phase: { not: "closed" } } }),
    db.evidenceRequest.count({ where: { engagement: { orgId: s.org }, status: { in: ["open", "needs_info", "submitted"] } } }),
    db.evidenceRequest.count({ where: { engagement: { orgId: s.org }, status: open, dueDate: { lt: now } } }),
    db.finding.count({ where: { orgId: s.org, status: { not: "closed" } } }),
    db.finding.count({ where: { orgId: s.org, status: { not: "closed" }, dueDate: { lt: now } } }),
    // the engagements this person leads first, then the soonest due
    db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: [{ dueDate: "asc" }], take: 12, select: { id: true, code: true, name: true, phase: true, leadId: true, client: { select: { name: true } } } }),
    db.engagement.count({ where: { orgId: s.org, kind: "financial" } }),
  ]);
  const mine = [...recent.filter((e) => e.leadId === s.sub), ...recent.filter((e) => e.leadId !== s.sub)].slice(0, 3);
  const rail = (await cookies()).get(RAIL_COOKIE)?.value === "1";
  // two-step sign-in, when the organisation requires it (Microsoft sign-ins follow Microsoft's own rules)
  if (org.requireMfa && s.m !== "mfa" && s.m !== "microsoft") redirect("/setup-mfa");

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        rail={rail}
        org={{ name: org.name, kind: org.kind, currency: org.currency }}
        user={{ name: user.name, title: user.title, role: user.role }}
        counts={{ engagements, requests, findings }}
        late={{ requests: requestsLate > 0, findings: findingsLate > 0 }}
        recent={mine.map((e) => ({ id: e.id, code: e.code, name: e.name, phase: e.phase, client: e.client?.name ?? null }))}
        canCreate={can(s, "manage")}
        financial={financial > 0}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-7">
          <form action="/search" className="flex h-10 max-w-[520px] flex-[1_1_280px] items-center gap-2 rounded-lg border border-line bg-canvas px-3">
            <Search size={16} className="text-ink-500" aria-hidden />
            <label htmlFor="q" className="sr-only">
              Search
            </label>
            <input id="q" name="q" type="search" placeholder="Search engagements, findings, documents…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </form>
        </header>
        <main className="flex w-full max-w-[1280px] flex-col gap-6 p-4 sm:p-7">{children}</main>
      </div>
    </div>
  );
}
