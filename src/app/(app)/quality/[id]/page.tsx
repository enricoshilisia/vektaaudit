import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { MET, QA_CRITERIA, qaScore, type QaResult } from "@/lib/quality";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { saveQaReview } from "../actions";

export const metadata: Metadata = { title: "Quality review" };

export default async function QaReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const q = await db.qaReview.findFirst({
    where: { id: (await params).id, orgId: s.org },
    include: { engagement: { include: { lead: { select: { name: true } }, _count: { select: { procedures: true, findings: true, tests: true } } } }, reviewer: { select: { name: true } } },
  });
  if (!q) notFound();
  const r = q.results as QaResult;
  const editable = q.status === "in_progress" && q.reviewerId === s.sub;
  const score = qaScore(r);
  const e = q.engagement;

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/quality" className="hover:text-ink">
          Quality assurance
        </Link>
        <span aria-hidden>/</span>
        <span>Review of {e.code}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Engagement quality review</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">
            <Link href={`/engagements/${e.id}`} className="hover:text-brand-700">
              {e.name}
            </Link>
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {e.code} · led by {e.lead?.name ?? "—"} · {e._count.procedures} procedures, {e._count.tests} control tests, {e._count.findings} findings · reviewer {q.reviewer.name}
          </p>
        </div>
        <div className="card px-5 py-3 text-center">
          <p className="text-xs text-ink-500">Score so far</p>
          <p className="tabular text-2xl font-semibold">{score === null ? "—" : `${score}%`}</p>
        </div>
      </div>
      {q.status === "completed" && <p className="rounded-lg bg-ok-bg px-4 py-3 text-[13px] text-ok-fg">Completed on {fmtDate(q.completedAt)}.</p>}

      <form action={saveQaReview.bind(null, q.id)} className="flex flex-col gap-3">
        {QA_CRITERIA.map((c, i) => {
          const v = r[c.key];
          return (
            <fieldset key={c.key} disabled={!editable} className="card grid gap-3 p-4 lg:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)] lg:items-start">
              <legend className="sr-only">{c.label}</legend>
              <div>
                <p className="text-[13.5px] font-semibold">
                  {i + 1}. {c.label}
                </p>
                <p className="text-[13px] text-ink-700">{c.ask}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MET.map((m) => (
                  <label key={m.key} className={clsx("flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50")}>
                    <input type="radio" name={`m_${c.key}`} value={m.key} defaultChecked={v?.met === m.key} />
                    {m.label}
                  </label>
                ))}
              </div>
              <div>
                <label htmlFor={`n_${c.key}`} className="sr-only">
                  Note on {c.label}
                </label>
                <input id={`n_${c.key}`} name={`n_${c.key}`} defaultValue={v?.note ?? ""} className="input h-9 text-[13px]" placeholder="What you found (needed if partly or not met)" />
              </div>
            </fieldset>
          );
        })}
        <div className="card flex flex-col gap-2 p-4">
          <label htmlFor="notes" className="text-[13.5px] font-semibold">
            Overall comments and lessons for the team
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={q.notes ?? ""} disabled={!editable} className="textarea" />
        </div>
        {editable && (
          <div className="flex gap-2">
            <button className="btn">Save</button>
            <button name="complete" value="1" className="btn-primary">
              Complete review
            </button>
          </div>
        )}
      </form>
    </>
  );
}
