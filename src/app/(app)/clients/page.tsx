import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { clientWord, fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string; q?: string }> }) {
  const s = await requireUser();
  const { archived, q } = await searchParams;
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { kind: true } });
  const word = clientWord(org.kind);
  const term = (q ?? "").trim();
  const clients = await db.client.findMany({
    where: { orgId: s.org, archivedAt: archived ? { not: null } : null, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { contactName: { contains: term, mode: "insensitive" } }] } : {}) },
    orderBy: { name: "asc" },
    include: { engagements: { select: { phase: true, dueDate: true }, orderBy: { dueDate: "desc" } }, _count: { select: { engagements: true } } },
  });
  const open = await db.finding.findMany({ where: { orgId: s.org, status: { not: "closed" } }, select: { engagement: { select: { clientId: true } } } });
  const findingsFor = (clientId: string) => open.filter((f) => f.engagement.clientId === clientId).length;

  return (
    <>
      <PageHeader
        title={word.many}
        sub={org.kind === "internal" ? "The departments, branches and subsidiaries you audit." : "The companies you audit. Each engagement belongs to a client."}
        actions={
          can(s, "manage") && (
            <Link href="/clients/new" className="btn-primary">
              <Plus size={16} aria-hidden />
              Add {word.one.toLowerCase()}
            </Link>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/clients" className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${!archived ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
          Active
        </Link>
        <Link href="/clients?archived=1" className={`flex h-9 items-center rounded-full border px-3.5 text-[13px] ${archived ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas"}`}>
          Archived
        </Link>
        <form className="ml-auto">
          {archived && <input type="hidden" name="archived" value="1" />}
          <label htmlFor="cq" className="sr-only">
            Find
          </label>
          <input id="cq" name="q" defaultValue={term} type="search" placeholder={`Find a ${word.one.toLowerCase()}…`} className="input h-9 w-64" />
        </form>
      </div>
      <section className="card overflow-hidden">
        {clients.length === 0 ? (
          <Empty title={term ? "No match" : archived ? "Nothing archived" : `No ${word.many.toLowerCase()} yet`}>
            {!term && !archived && can(s, "manage") && (
              <Link href="/clients/new" className="btn-primary mt-2">
                Add your first {word.one.toLowerCase()}
              </Link>
            )}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">{word.one}</th>
                  <th className="th">Main contact</th>
                  <th className="th">Year end</th>
                  <th className="th">Engagements</th>
                  <th className="th">Open findings</th>
                  <th className="th">Last audit due</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const active = c.engagements.filter((e) => e.phase !== "closed").length;
                  return (
                    <tr key={c.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/clients/${c.id}`} className="font-medium hover:text-brand-700">
                          {c.name}
                        </Link>
                        <div className="text-[11px] text-ink-500">{[c.industry, c.country, c.currency].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="td">
                        {c.contactName ?? "—"}
                        {c.contactEmail && <div className="text-[11px] text-ink-500">{c.contactEmail}</div>}
                      </td>
                      <td className="td">{c.yearEnd ?? "—"}</td>
                      <td className="td tabular">
                        {c._count.engagements}
                        {active > 0 && <span className="text-ink-500"> · {active} active</span>}
                      </td>
                      <td className="td tabular">{findingsFor(c.id)}</td>
                      <td className="td tabular">{fmtDate(c.engagements[0]?.dueDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
