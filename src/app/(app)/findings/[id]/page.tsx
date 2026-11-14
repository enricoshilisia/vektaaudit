import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FindingFields } from "@/components/FindingFields";
import { FindingDraft } from "@/components/VektaAi";
import { aiReady } from "@/lib/server/vekta";
import { Pill, SeverityPill } from "@/components/ui";
import { FINDING_PILL, SEVERITY, fmtDate, fmtDateTime, isOverdue } from "@/lib/format";
import { ESC_PILL, daysOverdue, escalation, escalationTo } from "@/lib/issues";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addComment, moveFinding, recordResponse, updateFinding } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const f = await db.finding.findUnique({ where: { id: (await params).id }, select: { code: true } });
  return { title: f?.code ?? "Finding" };
}

const C5 = [
  ["condition", "Condition — what we found"],
  ["criteria", "Criteria — what should happen"],
  ["cause", "Cause"],
  ["effect", "Effect — the risk"],
  ["recommendation", "Recommendation"],
] as const;

export default async function FindingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const s = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const f = await db.finding.findFirst({
    where: { id, orgId: s.org },
    include: { engagement: { select: { id: true, name: true, code: true } }, raisedBy: { select: { name: true } }, events: { orderBy: { createdAt: "asc" } } },
  });
  if (!f) notFound();
  const late = isOverdue(f.dueDate, f.status === "closed");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org } });
  const level = escalation(f, org);
  const ai = await aiReady(s.org);
  const step = (name: string, label: string, primary = false, withNote = false) => (
    <form action={moveFinding.bind(null, f.id)} className="flex flex-wrap gap-2">
      <input type="hidden" name="step" value={name} />
      {withNote && <input name="note" className="input h-10 min-w-[200px] flex-1" placeholder="Note (optional)" aria-label="Note" />}
      <button className={primary ? "btn-primary" : "btn"}>{label}</button>
    </form>
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/findings" className="hover:text-ink">
          Findings
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono">{f.code}</span>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="card min-w-0 flex-[999_1_560px]">
          <div className="flex flex-col gap-2 border-b border-line px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityPill s={SEVERITY[f.severity]} />
              <Pill p={late ? FINDING_PILL.overdue : FINDING_PILL[f.status]} />
              {f.repeat && <span className="pill bg-med-bg text-med-fg">Repeat finding</span>}
              {level !== null && (
                <span className={`pill ${ESC_PILL[level]}`} title={late ? `${daysOverdue(f.dueDate)} days overdue` : undefined}>
                  {level === 0 ? "Overdue: owner reminded" : `Escalated to ${escalationTo(level, org)}`}
                </span>
              )}
              {f.dueChanges > 0 && (
                <span className="pill bg-line-soft text-ink-700">
                  Due date moved {f.dueChanges}× · first agreed {fmtDate(f.originalDue)}
                </span>
              )}
              {can(s, "work") && f.status !== "closed" && !edit && (
                <Link href={`/findings/${f.id}?edit=1`} className="btn btn-sm ml-auto">
                  Edit
                </Link>
              )}
            </div>
            <h1 className="text-xl font-semibold leading-snug">{f.title}</h1>
            <span className="text-[13px] text-ink-500">
              <Link href={`/engagements/${f.engagement.id}?tab=findings`} className="hover:text-ink">
                {f.engagement.name} · {f.engagement.code}
              </Link>
              {f.raisedBy ? ` · raised by ${f.raisedBy.name}` : ""} · {fmtDate(f.createdAt)}
            </span>
          </div>

          {edit && can(s, "work") ? (
            <form action={updateFinding.bind(null, f.id)} className="flex flex-col gap-4 p-6">
              {ai && <FindingDraft engagementId={f.engagementId} />}
              <FindingFields f={f} directory={!!org.msTenantId} />
              <div className="flex gap-2">
                <button className="btn-primary">Save changes</button>
                <Link href={`/findings/${f.id}`} className="btn">
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4 px-6 py-5 text-sm leading-relaxed">
              {C5.map(([k, label]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="eyebrow">{label}</span>
                  <span className={clsx("whitespace-pre-line", !f[k] && "text-ink-400")}>{f[k] || "Not written yet"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          <section className="card flex flex-col gap-3 p-5">
            <span className="eyebrow">Management response{f.mgmtResponse ? " · agreed" : ""}</span>
            {f.mgmtResponse ? (
              <>
                <p className="whitespace-pre-line text-[13px] leading-relaxed">{f.mgmtResponse}</p>
                <p className="text-[13px] text-ink-500">
                  Owner: {f.ownerName ?? "—"} · Target <span className={late ? "font-medium text-high-dot" : ""}>{fmtDate(f.dueDate)}</span>
                </p>
              </>
            ) : can(s, "work") ? (
              <form action={recordResponse.bind(null, f.id)} className="flex flex-col gap-2">
                <label htmlFor="mgmtResponse" className="sr-only">
                  Management response
                </label>
                <textarea id="mgmtResponse" name="mgmtResponse" rows={3} required className="textarea" placeholder="What management agrees to do" />
                <div className="flex gap-2">
                  <input name="ownerName" defaultValue={f.ownerName ?? ""} className="input" placeholder="Owner" aria-label="Owner" />
                  <input name="dueDate" type="date" defaultValue={f.dueDate?.toISOString().slice(0, 10)} className="input" aria-label="Target date" />
                </div>
                <button className="btn-primary self-start">Record response</button>
              </form>
            ) : (
              <p className="text-[13px] text-ink-500">Waiting for management.</p>
            )}
          </section>

          <section className="card flex flex-col gap-3 p-5">
            <span className="eyebrow">Remediation</span>
            <ol className="flex flex-col">
              {f.events.map((ev, i) => (
                <li key={ev.id} className="flex gap-3">
                  <div className="flex w-3.5 flex-col items-center">
                    <span className={clsx("mt-1 h-3 w-3 flex-none rounded-full", ev.kind === "comment" ? "border-2 border-ink-300" : "bg-ok-dot", i === f.events.length - 1 && ev.kind !== "comment" && "bg-brand-600")} />
                    {i < f.events.length - 1 && <span className="mt-0.5 w-0.5 flex-1 bg-line" />}
                  </div>
                  <div className="flex flex-col gap-px pb-3.5 text-[13px]">
                    <span className={ev.kind === "comment" ? "whitespace-pre-line" : "font-medium"}>{ev.body}</span>
                    <span className="text-xs text-ink-500">
                      {ev.actorName} · {fmtDateTime(ev.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
              {can(s, "work") && f.status === "in_remediation" && step("submit", "Mark fix ready for validation", true, true)}
              {can(s, "review") && f.status === "pending_validation" && (
                <>
                  {step("close", "Validate and close", true, true)}
                  {step("reject", "Fix not sufficient", false, true)}
                </>
              )}
              {can(s, "review") && f.status === "closed" && step("reopen", "Reopen")}
              {can(s, "work") && (
                <form action={addComment.bind(null, f.id)} className="flex flex-col gap-2">
                  <label htmlFor="body" className="sr-only">
                    Comment
                  </label>
                  <textarea id="body" name="body" rows={2} required className="textarea" placeholder="Add a comment or follow-up note" />
                  <button className="btn btn-sm self-start">Comment</button>
                </form>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
