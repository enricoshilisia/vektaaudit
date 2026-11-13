import type { Prisma } from "@prisma/client";
import clsx from "clsx";
import { Check, Download, Link2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, Empty, Pill, SeverityPill, Tabs } from "@/components/ui";
import { FINDING_PILL, PHASES, RATING_PILL, PROCEDURE_PILL, REQUEST_PILL, SEVERITY, fmtDate, fmtDateTime, fmtSize, isOverdue, phaseIndex } from "@/lib/format";
import { OPERATING_PILL, TEST_STATUS, countExceptions } from "@/lib/risk";
import { isLocked, lockDate } from "@/lib/lock";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import {
  acceptRequest,
  addNote,
  addProcedure,
  createPortalLink,
  emailPortalLink,
  createRequest,
  logHours,
  prepare,
  reopen,
  resolveNote,
  review,
  revokePortalLink,
  saveConclusion,
  sendBack,
  setLegalHold,
  setPhase,
  setRating,
  unlockFile,
} from "../actions";
import { createTest } from "../../tests/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const e = await db.engagement.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: e?.name ?? "Engagement" };
}

type Search = { tab?: string; proc?: string };

const INCLUDE = {
  client: true,
  lead: { select: { name: true } },
  procedures: { orderBy: { sort: "asc" }, include: { preparedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } } },
  reviewNotes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } }, procedure: { select: { ref: true } } } },
  requests: { orderBy: { code: "asc" }, include: { documents: { orderBy: { createdAt: "desc" } } } },
  portalLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
  findings: { orderBy: { createdAt: "desc" } },
  tests: { orderBy: { ref: "asc" }, include: { control: { select: { code: true, title: true, key: true } }, samples: { select: { results: true } } } },
  _count: { select: { documents: true } },
} satisfies Prisma.EngagementInclude;

export default async function EngagementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const s = await requireUser();
  const { id } = await params;
  const { tab = "program", proc } = await searchParams;
  const e = await db.engagement.findFirst({ where: { id, orgId: s.org }, include: INCLUDE });
  if (!e) notFound();

  const base = `/engagements/${e.id}`;
  const openNotes = e.reviewNotes.filter((n) => !n.resolvedAt);
  const done = e.procedures.filter((p) => p.status === "signed_off").length;
  const inReview = e.procedures.filter((p) => p.status === "in_review").length;
  const cur = phaseIndex(e.phase);
  const work = can(s, "work");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { lockAfterDays: true } });
  const locked = isLocked(e, org.lockAfterDays);
  const locksOn = lockDate(e, org.lockAfterDays);

  return (
    <>
      <header className="-mx-4 -mt-4 flex flex-col gap-3.5 border-b border-line bg-white px-4 pt-5 sm:-mx-7 sm:-mt-7 sm:px-7">
        <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
          <Link href="/engagements" className="hover:text-ink">
            Engagements
          </Link>
          <span aria-hidden>/</span>
          <span className="font-mono">{e.code}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold">{e.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
              {e.client && <span>{e.client.name}</span>}
              <span>
                Lead: <strong className="font-medium text-ink">{e.lead?.name ?? "—"}</strong>
              </span>
              {(e.periodStart || e.periodEnd) && (
                <span>
                  Period: {fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}
                </span>
              )}
              <span>Due: {fmtDate(e.dueDate)}</span>
              <span>
                Budget:{" "}
                <strong className={clsx("font-medium", e.budgetHours && e.actualHours > e.budgetHours ? "text-high-dot" : "text-ink")}>
                  {e.actualHours} / {e.budgetHours} h
                </strong>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {work && (
              <form action={logHours.bind(null, e.id)} className="flex items-center gap-1.5">
                <label htmlFor="hours" className="sr-only">
                  Hours
                </label>
                <input id="hours" name="hours" type="number" min={1} max={200} placeholder="Hours" className="input w-24" required />
                <button className="btn">Log time</button>
              </form>
            )}
            {e.kind === "financial" && (
              <Link href={`/trial-balance?engagement=${e.id}`} className="btn">
                Trial balance
              </Link>
            )}
            <Link href={`/reports?engagement=${e.id}`} className="btn">
              Letters & reports
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ol aria-label="Engagement phase" className="flex flex-wrap gap-2">
            {PHASES.map((p, i) => {
              const isDone = i < cur;
              const isCur = i === cur;
              return (
                <li key={p.key} className={clsx("flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[13px]", isCur ? "bg-brand-100 font-semibold text-brand-800" : isDone ? "text-ink" : "text-ink-500")}>
                  <span className={clsx("flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold", isDone ? "bg-ok-dot text-white" : isCur ? "bg-brand-600 text-white" : "bg-line-soft text-ink-500")}>
                    {isDone ? <Check size={12} strokeWidth={3} aria-label="done" /> : i + 1}
                  </span>
                  {p.label}
                </li>
              );
            })}
          </ol>
          {e.rating && <Pill p={RATING_PILL[e.rating]} />}
          {can(s, "manage") && (
            <form action={setRating.bind(null, e.id)} className="ml-auto flex items-center gap-1.5">
              <label htmlFor="rating" className="sr-only">
                Overall rating
              </label>
              <select id="rating" name="rating" defaultValue={e.rating ?? ""} className="input h-9 w-48">
                <option value="">Overall rating: not set</option>
                <option value="satisfactory">Satisfactory</option>
                <option value="needs_improvement">Needs improvement</option>
                <option value="unsatisfactory">Unsatisfactory</option>
              </select>
              <button className="btn h-9">Rate</button>
            </form>
          )}
          {can(s, "manage") && (
            <form action={setPhase.bind(null, e.id)} className="flex items-center gap-1.5">
              <label htmlFor="phase" className="sr-only">
                Phase
              </label>
              <select id="phase" name="phase" defaultValue={PHASES[Math.min(cur + 1, PHASES.length - 1)].key} className="input h-9 w-auto">
                {PHASES.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button className="btn h-9">Move</button>
            </form>
          )}
        </div>

        <Tabs
          active={tab}
          tabs={[
            { key: "program", label: "Work program", href: base, n: e.procedures.length },
            { key: "notes", label: "Review notes", href: `${base}?tab=notes`, n: openNotes.length },
            { key: "requests", label: "Evidence requests", href: `${base}?tab=requests`, n: e.requests.filter((r) => r.status !== "accepted").length },
            { key: "tests", label: "Control tests", href: `${base}?tab=tests`, n: e.tests.length },
            { key: "findings", label: "Findings", href: `${base}?tab=findings`, n: e.findings.length },
            { key: "documents", label: "Documents", href: `/documents?engagement=${e.id}`, n: e._count.documents },
          ]}
        />
      </header>

      {(locked || locksOn || e.legalHold) && (
        <div className={clsx("flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-[13px]", locked ? "bg-line-soft text-ink-700" : "bg-brand-100 text-brand-800")}>
          <span className="min-w-0 flex-1">
            {locked
              ? `This audit file is locked: it closed on ${fmtDate(e.closedAt)} and nothing on it can be changed. Findings can still be followed up.`
              : e.unlockedUntil && e.unlockedUntil > new Date()
                ? `Unlocked by an admin until ${fmtDate(e.unlockedUntil)}.`
                : locksOn
                  ? `Closed. The file locks on ${fmtDate(locksOn)}; after that nothing on it can be changed.`
                  : null}
            {e.legalHold && <strong className="ml-1 font-semibold">On legal hold{e.legalHoldNote ? `: ${e.legalHoldNote}` : ""}. It won't be deleted.</strong>}
          </span>
          {locked && can(s, "admin") && (
            <form action={unlockFile.bind(null, e.id)} className="flex flex-wrap items-center gap-2">
              <label htmlFor="reason" className="sr-only">
                Reason for unlocking
              </label>
              <input id="reason" name="reason" required minLength={5} className="input h-8 w-64 text-[12px]" placeholder="Reason (kept in the audit trail)" />
              <button className="btn btn-sm">Unlock for a week</button>
            </form>
          )}
          {can(s, "admin") && e.phase === "closed" && (
            <form action={setLegalHold.bind(null, e.id)} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="hold" value={e.legalHold ? "off" : "on"} />
              {!e.legalHold && (
                <>
                  <label htmlFor="holdNote" className="sr-only">
                    Reason for legal hold
                  </label>
                  <input id="holdNote" name="note" className="input h-8 w-56 text-[12px]" placeholder="Reason for legal hold" />
                </>
              )}
              <button className="btn btn-sm">{e.legalHold ? "Release legal hold" : "Put on legal hold"}</button>
            </form>
          )}
        </div>
      )}

      {tab === "program" && <Program e={e} proc={proc} s={s} done={done} inReview={inReview} />}
      {tab === "notes" && <Notes e={e} s={s} />}
      {tab === "requests" && <Requests e={e} s={s} />}
      {tab === "tests" && <TestsTab e={e} s={s} />}
      {tab === "findings" && <FindingsTab e={e} s={s} />}
    </>
  );
}

type E = Prisma.EngagementGetPayload<{ include: typeof INCLUDE }>;
type S = Awaited<ReturnType<typeof requireUser>>;

function SignBox({ label, who, at }: { label: string; who?: string | null; at?: Date | null }) {
  return who ? (
    <span title={`${label}: ${who}, ${at ? fmtDateTime(at) : ""}`} className="flex h-6 w-6 items-center justify-center rounded-md bg-ok-dot text-[11px] font-semibold text-white">
      {label[0]}
    </span>
  ) : (
    <span title={`${label}: not signed`} className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-ink-300 text-[11px] font-semibold text-ink-500">
      {label[0]}
    </span>
  );
}

async function Program({ e, proc, s, done, inReview }: { e: E; proc?: string; s: S; done: number; inReview: number }) {
  const sel = e.procedures.find((p) => p.id === proc) ?? null;
  const docs = sel ? await db.document.findMany({ where: { engagementId: e.id, linkRef: sel.ref }, orderBy: { createdAt: "desc" } }) : [];
  const base = `/engagements/${e.id}`;
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="card min-w-0 flex-[999_1_520px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">Work program · {e.procedures.length} procedures</h2>
          <span className="text-[13px] text-ink-500">
            {done} signed off · {inReview} in review · {e.procedures.length - done - inReview} open
          </span>
        </div>
        {e.procedures.length === 0 ? (
          <Empty title="No procedures yet">Add the tests you will perform below.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th w-16">Ref</th>
                  <th className="th">Procedure</th>
                  <th className="th">Status</th>
                  <th className="th">Sign-off</th>
                </tr>
              </thead>
              <tbody>
                {e.procedures.map((p) => (
                  <tr key={p.id} className={clsx("border-t border-line-soft", p.id === sel?.id && "bg-brand-50 shadow-[inset_3px_0_0_#1F5FAE]")}>
                    <td className="td font-mono text-xs text-ink-700">{p.ref}</td>
                    <td className="td">
                      <Link href={`${base}?proc=${p.id}`} scroll={false} className="font-medium hover:text-brand-700">
                        {p.title}
                      </Link>
                      {p.control && <div className="text-xs text-ink-500">{p.control}</div>}
                    </td>
                    <td className="td">
                      <Pill p={PROCEDURE_PILL[p.status]} />
                    </td>
                    <td className="td">
                      <div className="flex gap-1">
                        <SignBox label="Preparer" who={p.preparedBy?.name} at={p.preparedAt} />
                        <SignBox label="Reviewer" who={p.reviewedBy?.name} at={p.reviewedAt} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {can(s, "work") && (
          <form action={addProcedure.bind(null, e.id)} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-4">
            <div className="w-20">
              <label htmlFor="ref" className="label">
                Ref
              </label>
              <input id="ref" name="ref" className="input" placeholder="auto" />
            </div>
            <div className="min-w-[200px] flex-[2]">
              <label htmlFor="title" className="label">
                New procedure
              </label>
              <input id="title" name="title" required minLength={3} className="input" placeholder="e.g. Test three-way match on invoices" />
            </div>
            <div className="min-w-[160px] flex-1">
              <label htmlFor="control" className="label">
                Control / assertion
              </label>
              <input id="control" name="control" className="input" placeholder="optional" />
            </div>
            <button className="btn">
              <Plus size={15} aria-hidden />
              Add
            </button>
          </form>
        )}
      </section>

      <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
        {!sel ? (
          <section className="card p-5 text-sm text-ink-500">Select a procedure to record the work done, link evidence and sign it off.</section>
        ) : (
          <section className="card flex flex-col gap-3.5 px-5 py-[18px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-xs text-ink-500">{sel.ref}</span>
                <h2 className="mt-0.5 text-base font-semibold">{sel.title}</h2>
                {sel.control && <p className="text-xs text-ink-500">{sel.control}</p>}
              </div>
              <Pill p={PROCEDURE_PILL[sel.status]} />
            </div>
            <form action={saveConclusion.bind(null, sel.id)} className="flex flex-col gap-2">
              <label htmlFor="conclusion" className="label">
                Work done and conclusion
              </label>
              <textarea id="conclusion" name="conclusion" rows={5} defaultValue={sel.conclusion ?? ""} disabled={sel.status === "signed_off" || !can(s, "work")} className="textarea" placeholder="Population, sample, what was tested, exceptions, conclusion…" />
              {sel.status !== "signed_off" && can(s, "work") && <button className="btn btn-sm self-start">Save</button>}
            </form>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="eyebrow">Evidence linked ({docs.length})</span>
              {docs.length === 0 && <span className="text-ink-500">No files yet. Upload in Documents with reference {sel.ref}.</span>}
              {docs.map((d) => (
                <a key={d.id} href={`/api/files/${d.id}`} className="flex items-center gap-2 text-brand-600 hover:text-brand-700">
                  <Download size={14} aria-hidden />
                  {d.name} <span className="text-ink-500">v{d.version} · {fmtSize(d.size)}</span>
                </a>
              ))}
              <Link href={`/documents?engagement=${e.id}&ref=${encodeURIComponent(sel.ref)}`} className="text-[13px] font-medium text-brand-600">
                Upload evidence for {sel.ref}
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3.5">
              {can(s, "work") && (sel.status === "in_progress" || sel.status === "not_started") && (
                <form action={prepare.bind(null, sel.id)}>
                  <button className="btn-primary">Sign off as preparer</button>
                </form>
              )}
              {can(s, "review") && sel.status === "in_review" && sel.preparedById !== s.sub && (
                <form action={review.bind(null, sel.id)}>
                  <button className="btn-primary">Sign off as reviewer</button>
                </form>
              )}
              {can(s, "review") && sel.status === "in_review" && sel.preparedById === s.sub && <p className="text-xs text-ink-500">You prepared this work, so someone else must review it.</p>}
              {can(s, "review") && (sel.status === "in_review" || sel.status === "signed_off") && (
                <form action={reopen.bind(null, sel.id)}>
                  <button className="btn">Reopen</button>
                </form>
              )}
              {can(s, "work") && (
                <Link href={`/findings/new?engagement=${e.id}&ref=${encodeURIComponent(sel.ref)}`} className="btn">
                  Raise finding
                </Link>
              )}
            </div>
            <div className="text-xs text-ink-500">
              {sel.preparedBy && (
                <p>
                  Prepared by {sel.preparedBy.name}, {fmtDateTime(sel.preparedAt!)}
                </p>
              )}
              {sel.reviewedBy && (
                <p>
                  Reviewed by {sel.reviewedBy.name}, {fmtDateTime(sel.reviewedAt!)}
                </p>
              )}
            </div>
          </section>
        )}
        <NoteList e={e} s={s} procedureId={sel?.id} compact />
      </aside>
    </div>
  );
}

function NoteList({ e, s, procedureId, compact }: { e: E; s: S; procedureId?: string; compact?: boolean }) {
  const notes = procedureId ? e.reviewNotes.filter((n) => n.procedureId === procedureId) : e.reviewNotes;
  const open = notes.filter((n) => !n.resolvedAt).length;
  return (
    <section className="card flex flex-col gap-3.5 px-5 py-[18px]">
      <h2 className="text-[15px] font-semibold">
        Review notes · {open} open{procedureId ? " on this procedure" : ""}
      </h2>
      {notes.length === 0 && <p className="text-[13px] text-ink-500">No notes yet.</p>}
      {notes.map((n) => (
        <div key={n.id} className={clsx("flex gap-2.5", n.resolvedAt && "opacity-60")}>
          <Avatar name={n.author.name} className={n.author.role === "MANAGER" ? "bg-[#5B3E96]" : undefined} />
          <div className="flex min-w-0 flex-col gap-0.5 text-[13px]">
            <div className="flex flex-wrap items-baseline gap-2">
              <strong className="font-semibold">{n.author.name}</strong>
              <span className="text-xs text-ink-500">
                {!compact && n.procedure ? `${n.procedure.ref} · ` : ""}
                {fmtDateTime(n.createdAt)}
                {n.resolvedAt ? " · resolved" : ""}
              </span>
            </div>
            <span className="whitespace-pre-line leading-relaxed">{n.body}</span>
            {!n.resolvedAt && can(s, "review") && (
              <form action={resolveNote.bind(null, n.id)}>
                <button className="text-xs font-medium text-brand-600 hover:text-brand-700">Resolve</button>
              </form>
            )}
          </div>
        </div>
      ))}
      {can(s, "work") && (
        <form action={addNote.bind(null, e.id)} className="flex flex-col gap-2">
          {procedureId && <input type="hidden" name="procedureId" value={procedureId} />}
          <label htmlFor="body" className="label mb-0">
            Add a note
          </label>
          <textarea id="body" name="body" rows={2} required className="textarea" placeholder="Ask the preparer, or explain the work done…" />
          <button className="btn btn-sm self-start">Post note</button>
        </form>
      )}
    </section>
  );
}

function Notes({ e, s }: { e: E; s: S }) {
  return (
    <div className="max-w-3xl">
      <NoteList e={e} s={s} />
    </div>
  );
}

function Requests({ e, s }: { e: E; s: S }) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3400";
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
        {e.requests.length === 0 && (
          <div className="card">
            <Empty title="No evidence requested yet">Ask the auditee for documents. They answer from a portal link, without an account.</Empty>
          </div>
        )}
        {e.requests.map((r) => {
          const late = isOverdue(r.dueDate, r.status === "accepted" || r.status === "submitted");
          return (
            <div key={r.id} className="card flex flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] text-ink-500">{r.code}</span>
                    <span className="font-medium">{r.title}</span>
                  </div>
                  <p className="text-xs text-ink-500">
                    Due {fmtDate(r.dueDate)}
                    {r.assigneeName ? ` · ${r.assigneeName}` : ""}
                  </p>
                  {r.detail && <p className="mt-1 text-[13px] text-ink-700">{r.detail}</p>}
                  {r.status === "needs_info" && r.auditorNote && <p className="mt-1 text-[13px] text-med-fg">Asked for: {r.auditorNote}</p>}
                  {r.clientNote && <p className="mt-1 text-[13px] text-ink-700">Auditee note: “{r.clientNote}”</p>}
                </div>
                <Pill p={late ? REQUEST_PILL.overdue : REQUEST_PILL[r.status]} />
              </div>
              {r.documents.length > 0 && (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {r.documents.map((d) => (
                    <li key={d.id}>
                      <a href={`/api/files/${d.id}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700">
                        <Download size={14} aria-hidden />
                        {d.name}
                      </a>{" "}
                      <span className="text-ink-500">
                        {fmtSize(d.size)} · {d.uploadedBy} · {fmtDate(d.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.status === "submitted" && (
                <div className="flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
                  {can(s, "review") && (
                    <form action={acceptRequest.bind(null, r.id)}>
                      <button className="btn-primary btn-sm">Accept</button>
                    </form>
                  )}
                  {can(s, "work") && (
                    <form action={sendBack.bind(null, r.id)} className="flex flex-1 flex-wrap gap-2">
                      <label htmlFor={`note-${r.id}`} className="sr-only">
                        What is missing
                      </label>
                      <input id={`note-${r.id}`} name="note" required minLength={3} className="input h-8 min-w-[200px] flex-1" placeholder="What is missing?" />
                      <button className="btn btn-sm">Ask for more</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        {can(s, "work") && (
          <form action={createRequest.bind(null, e.id)} className="card flex flex-col gap-3 p-5">
            <h2 className="text-[15px] font-semibold">Request evidence</h2>
            <div>
              <label htmlFor="r-title" className="label">
                What you need
              </label>
              <input id="r-title" name="title" required minLength={3} className="input" placeholder="e.g. Bank reconciliations, March–June" />
            </div>
            <div>
              <label htmlFor="r-detail" className="label">
                Details
              </label>
              <textarea id="r-detail" name="detail" rows={2} className="textarea" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="r-due" className="label">
                  Due
                </label>
                <input id="r-due" name="dueDate" type="date" className="input" />
              </div>
              <div className="flex-1">
                <label htmlFor="r-who" className="label">
                  From
                </label>
                <input id="r-who" name="assigneeName" className="input" placeholder="Name" />
              </div>
            </div>
            <button className="btn-primary self-start">Send request</button>
          </form>
        )}

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Link2 size={16} aria-hidden />
            Auditee portal links
          </h2>
          <p className="text-xs text-ink-500">Anyone with a link can see and answer this engagement&apos;s requests. Revoke it when the audit is done.</p>
          {e.portalLinks.map((l) => (
            <div key={l.id} className="flex flex-col gap-1 rounded-lg border border-line p-3 text-[13px]">
              <span className="font-medium">
                {l.name}
                {l.title ? ` · ${l.title}` : ""}
              </span>
              <input readOnly value={`${appUrl}/p/${l.token}`} aria-label={`Portal link for ${l.name}`} className="input h-8 font-mono text-[11px]" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-500">
                  {l.lastSeenAt ? `Last opened ${fmtDateTime(l.lastSeenAt)}` : "Not opened yet"}
                  {l.email && ` · ${l.email}`}
                </span>
                {can(s, "work") && (
                  <div className="flex items-center gap-3">
                    {l.email && (
                      <form action={emailPortalLink.bind(null, l.id)}>
                        <button className="text-xs font-medium text-brand-700">Email the link</button>
                      </form>
                    )}
                    <form action={revokePortalLink.bind(null, l.id)}>
                      <button className="text-xs font-medium text-high-fg">Revoke</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}
          {can(s, "work") && (
            <form action={createPortalLink.bind(null, e.id)} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input name="name" required minLength={2} className="input" placeholder="Auditee name" aria-label="Auditee name" />
                <input name="title" className="input" placeholder="Role" aria-label="Role" />
              </div>
              <input name="email" type="email" className="input" placeholder="Their email (to send the link from Outlook)" aria-label="Auditee email" />
              <button className="btn btn-sm self-start">Create link</button>
            </form>
          )}
        </section>
      </aside>
    </div>
  );
}

function FindingsTab({ e, s }: { e: E; s: S }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold">Findings from this engagement</h2>
        {can(s, "work") && (
          <Link href={`/findings/new?engagement=${e.id}`} className="btn-primary btn-sm">
            New finding
          </Link>
        )}
      </div>
      {e.findings.length === 0 ? (
        <Empty title="No findings raised" />
      ) : (
        <table className="w-full text-[13px]">
          <tbody>
            {e.findings.map((f) => (
              <tr key={f.id} className="border-t border-line-soft first:border-t-0">
                <td className="td">
                  <Link href={`/findings/${f.id}`} className="font-medium hover:text-brand-700">
                    {f.title}
                  </Link>
                  <div className="font-mono text-[11px] text-ink-500">{f.code}</div>
                </td>
                <td className="td">
                  <SeverityPill s={SEVERITY[f.severity]} />
                </td>
                <td className="td">
                  <Pill p={isOverdue(f.dueDate, f.status === "closed") ? FINDING_PILL.overdue : FINDING_PILL[f.status]} />
                </td>
                <td className="td tabular">{fmtDate(f.dueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

async function TestsTab({ e, s }: { e: E; s: S }) {
  const controls = can(s, "work") && e.phase !== "closed" ? await db.control.findMany({ where: { orgId: s.org }, orderBy: [{ process: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, process: true } }) : [];
  const processes = [...new Set(controls.map((c) => c.process))];
  return (
    <>
      {controls.length > 0 && (
        <form action={createTest} className="card flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="engagementId" value={e.id} />
          <div className="min-w-0 flex-[1_1_360px]">
            <label htmlFor="controlId" className="label">
              Control from the library
            </label>
            <select id="controlId" name="controlId" required className="input">
              <option value="">Choose a control…</option>
              {processes.map((p) => (
                <optgroup key={p} label={p}>
                  {controls
                    .filter((c) => c.process === p)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.title.length > 90 ? `${c.title.slice(0, 90)}…` : c.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="testType" className="label">
              Test
            </label>
            <select id="testType" name="testType" className="input">
              <option value="operating">Operating effectiveness</option>
              <option value="design">Design (walkthrough)</option>
            </select>
          </div>
          <button className="btn-primary">
            <Plus size={16} aria-hidden />
            Add control test
          </button>
          <Link href="/controls" className="btn">
            Open the library
          </Link>
        </form>
      )}
      <section className="card overflow-hidden">
        {e.tests.length === 0 ? (
          <Empty title="No control tests yet">
            {controls.length === 0 && can(s, "work") ? (
              <>
                Add risks and controls to the <Link href="/controls">library</Link> first, then test them here.
              </>
            ) : (
              "Pick a control from the library to test it on this engagement."
            )}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Test</th>
                  <th className="th">Control</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Items</th>
                  <th className="th text-right">Deviations</th>
                  <th className="th">Status</th>
                  <th className="th">Result</th>
                </tr>
              </thead>
              <tbody>
                {e.tests.map((t) => {
                  const dev = countExceptions(t.samples);
                  return (
                    <tr key={t.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/tests/${t.id}`} className="font-mono font-medium">
                          {t.ref}
                        </Link>
                      </td>
                      <td className="td">
                        <Link href={`/tests/${t.id}`} className="hover:text-brand-700">
                          {t.control.title}
                        </Link>
                        <div className="font-mono text-[11px] text-ink-500">
                          {t.control.code}
                          {t.control.key ? " · key" : ""}
                        </div>
                      </td>
                      <td className="td">{t.testType === "design" ? "Design" : "Operating"}</td>
                      <td className="td tabular text-right">{t.samples.length}</td>
                      <td className={clsx("td tabular text-right", dev > 0 && "font-semibold text-high-fg")}>{dev}</td>
                      <td className="td">
                        <Pill p={TEST_STATUS[t.status]} />
                      </td>
                      <td className="td">{t.result ? <Pill p={OPERATING_PILL[t.result]} /> : "—"}</td>
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
