import { Mail, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientFields } from "@/components/ClientFields";
import { Empty, Pill } from "@/components/ui";
import { PHASE_PILL, clientWord, fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { setArchived, updateClient } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await db.client.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: c?.name ?? "Client" };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const s = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const c = await db.client.findFirst({
    where: { id, orgId: s.org },
    include: {
      org: { select: { kind: true } },
      engagements: { orderBy: { createdAt: "desc" }, include: { lead: { select: { name: true } }, _count: { select: { findings: { where: { status: { not: "closed" } } } } } } },
    },
  });
  if (!c) notFound();
  const word = clientWord(c.org.kind);
  const internal = c.org.kind === "internal";
  const manage = can(s, "manage");

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/clients" className="hover:text-ink">
          {word.many}
        </Link>
        <span aria-hidden>/</span>
        <span>{c.name}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{c.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {[c.industry, c.yearEnd ? `Year end ${c.yearEnd}` : null, c.archivedAt ? `Archived ${fmtDate(c.archivedAt)}` : null].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </div>
        {manage && !edit && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/clients/${c.id}?edit=1`} className="btn">
              Edit details
            </Link>
            <form action={setArchived.bind(null, c.id, !c.archivedAt)}>
              <button className="btn">{c.archivedAt ? "Restore" : "Archive"}</button>
            </form>
            {!c.archivedAt && (
              <Link href={`/engagements/new?client=${c.id}`} className="btn-primary">
                <Plus size={16} aria-hidden />
                New engagement
              </Link>
            )}
          </div>
        )}
      </div>

      {edit && manage ? (
        <form action={updateClient.bind(null, c.id)} className="card flex max-w-3xl flex-col gap-6 p-6">
          <ClientFields c={c} internal={internal} />
          <div className="flex gap-2">
            <button className="btn-primary">Save</button>
            <Link href={`/clients/${c.id}`} className="btn">
              Cancel
            </Link>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <section className="card min-w-0 flex-[999_1_520px] overflow-hidden">
            <h2 className="border-b border-line px-5 py-3.5 text-base font-semibold">Engagements</h2>
            {c.engagements.length === 0 ? (
              <Empty title="No engagements yet">{manage && !c.archivedAt && <Link href={`/engagements/new?client=${c.id}`} className="btn-primary mt-2">Plan the first engagement</Link>}</Empty>
            ) : (
              <table className="w-full text-[13px]">
                <tbody>
                  {c.engagements.map((e) => (
                    <tr key={e.id} className="border-t border-line-soft first:border-t-0">
                      <td className="td">
                        <Link href={`/engagements/${e.id}`} className="font-medium hover:text-brand-700">
                          {e.name}
                        </Link>
                        <div className="font-mono text-[11px] text-ink-500">
                          {e.code} · {e.kind === "financial" ? "Financial" : "Internal"}
                        </div>
                      </td>
                      <td className="td">
                        <Pill p={PHASE_PILL[e.phase]} />
                      </td>
                      <td className="td">{e.lead?.name ?? "—"}</td>
                      <td className="td tabular">{e._count.findings} open findings</td>
                      <td className="td tabular">{fmtDate(e.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <section className="card flex flex-col gap-2.5 p-5 text-[13px]">
              <span className="eyebrow">Main contact</span>
              {c.contactName ? (
                <>
                  <span className="text-sm font-medium">
                    {c.contactName}
                    {c.contactTitle && <span className="font-normal text-ink-500"> · {c.contactTitle}</span>}
                  </span>
                  {c.contactEmail && (
                    <a href={`mailto:${c.contactEmail}`} className="flex items-center gap-1.5 text-brand-600">
                      <Mail size={14} aria-hidden />
                      {c.contactEmail}
                    </a>
                  )}
                  {c.contactPhone && (
                    <a href={`tel:${c.contactPhone}`} className="flex items-center gap-1.5 text-brand-600">
                      <Phone size={14} aria-hidden />
                      {c.contactPhone}
                    </a>
                  )}
                </>
              ) : (
                <span className="text-ink-500">Not recorded</span>
              )}
            </section>
            <section className="card flex flex-col gap-2 p-5 text-[13px]">
              <span className="eyebrow">Details</span>
              {(internal
                ? [["Address", c.address]]
                : [
                    ["Registration no.", c.regNumber],
                    ["Tax PIN", c.taxId],
                    ["Framework", c.framework],
                    ["Governing law", c.law],
                    ["Address", c.address],
                  ]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-ink-500">{k}</span>
                  <span className="whitespace-pre-line text-right">{v || "—"}</span>
                </div>
              ))}
              {c.notes && <p className="mt-1 whitespace-pre-line border-t border-line-soft pt-2.5 leading-relaxed">{c.notes}</p>}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
