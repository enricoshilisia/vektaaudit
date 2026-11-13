import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const has = { contains: q, mode: "insensitive" as const };
  const [engagements, findings, documents, requests] = q
    ? await Promise.all([
        db.engagement.findMany({ where: { orgId: s.org, OR: [{ name: has }, { code: has }, { area: has }, { client: { name: has } }] }, take: 10 }),
        db.finding.findMany({ where: { orgId: s.org, OR: [{ title: has }, { code: has }, { condition: has }, { ownerName: has }] }, take: 10 }),
        db.document.findMany({ where: { orgId: s.org, OR: [{ name: has }, { linkRef: has }] }, take: 10, orderBy: { createdAt: "desc" } }),
        db.evidenceRequest.findMany({ where: { engagement: { orgId: s.org }, OR: [{ title: has }, { code: has }] }, take: 10 }),
      ])
    : [[], [], [], []];
  const total = engagements.length + findings.length + documents.length + requests.length;
  const group = (title: string, items: { href: string; label: string; sub: string }[]) =>
    items.length > 0 && (
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">{title}</h2>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="flex flex-col border-t border-line-soft px-5 py-2.5 text-[13px] first-of-type:border-t-0 hover:bg-canvas">
            <span className="font-medium">{i.label}</span>
            <span className="text-xs text-ink-500">{i.sub}</span>
          </Link>
        ))}
      </section>
    );
  return (
    <>
      <PageHeader title="Search" sub={q ? `${total} results for “${q}”` : "Type in the search box above."} />
      {q && total === 0 && (
        <div className="card">
          <Empty title="Nothing found" />
        </div>
      )}
      {group("Engagements", engagements.map((e) => ({ href: `/engagements/${e.id}`, label: e.name, sub: e.code })))}
      {group("Findings", findings.map((f) => ({ href: `/findings/${f.id}`, label: f.title, sub: f.code })))}
      {group("Evidence requests", requests.map((r) => ({ href: `/engagements/${r.engagementId}?tab=requests`, label: r.title, sub: r.code })))}
      {group("Documents", documents.map((d) => ({ href: `/documents?engagement=${d.engagementId ?? ""}&doc=${d.id}`, label: d.name, sub: `${d.folder} · v${d.version} · ${fmtDate(d.createdAt)}` })))}
    </>
  );
}
