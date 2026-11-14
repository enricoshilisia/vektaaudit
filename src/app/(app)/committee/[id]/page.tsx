import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackView } from "@/components/CommitteePack";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { type PackData, buildPack } from "@/lib/server/committee";
import { db } from "@/lib/server/db";
import { deletePack, issuePack, reopenPack, savePackToSharePoint, saveSummary } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await db.committeePack.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: p?.title ?? "Committee pack" };
}

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const p = await db.committeePack.findFirst({ where: { id: (await params).id, orgId: s.org } });
  if (!p) notFound();
  const issued = p.status === "issued" && p.snapshot;
  const d = issued ? (p.snapshot as unknown as PackData) : await buildPack(s.org, p.periodStart, p.periodEnd);
  const manage = can(s, "manage");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { msTenantId: true, spSiteUrl: true } });

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/committee" className="hover:text-ink">
          Audit committee
        </Link>
        <span aria-hidden>/</span>
        <span>{fmtDate(p.periodEnd)}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            Period {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
            {p.meetingDate && ` · Meeting ${fmtDate(p.meetingDate)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/committee/${p.id}`} className="btn">
            <Download size={16} aria-hidden />
            PDF
          </a>
          <a href={`/api/committee/${p.id}?format=docx`} className="btn">
            Word
          </a>
          {manage && org.msTenantId && org.spSiteUrl && (
            <form action={savePackToSharePoint.bind(null, p.id)}>
              <button className="btn">Save to SharePoint</button>
            </form>
          )}
          {p.spUrl && (
            <a href={p.spUrl} target="_blank" rel="noreferrer" className="btn">
              Open in SharePoint
            </a>
          )}
          {can(s, "admin") && !issued && (
            <form action={issuePack.bind(null, p.id)}>
              <button className="btn-primary">Issue to the committee</button>
            </form>
          )}
          {can(s, "admin") && issued && (
            <form action={reopenPack.bind(null, p.id)}>
              <button className="btn">Reopen as draft</button>
            </form>
          )}
          {manage && !issued && (
            <form action={deletePack.bind(null, p.id)}>
              <button className="btn text-high-fg">Delete draft</button>
            </form>
          )}
        </div>
      </div>

      {issued ? (
        <p className="rounded-lg bg-ok-bg px-4 py-3 text-[13px] text-ok-fg">
          Issued by {p.issuedBy} on {fmtDateTime(p.issuedAt!)}. The figures below are frozen as they were then.
        </p>
      ) : (
        <p className="rounded-lg bg-brand-100 px-4 py-3 text-[13px] text-brand-800">Draft. The figures are live and update as work happens. {can(s, "admin") ? "Issuing freezes them." : "An admin issues the pack, which freezes them."}</p>
      )}

      {manage && !issued && (
        <form action={saveSummary.bind(null, p.id)} className="card flex flex-col gap-3 p-5">
          <label htmlFor="summary" className="text-[15px] font-semibold">
            Chief Audit Executive&apos;s summary
          </label>
          <p className="text-[13px] text-ink-500">Your overall view for the committee: the state of control, the most important issues, and what you need from them.</p>
          <textarea id="summary" name="summary" rows={6} defaultValue={p.summary ?? ""} className="textarea" />
          <button className="btn self-start">Save summary</button>
        </form>
      )}

      <PackView d={d} summary={p.summary} />
    </>
  );
}
