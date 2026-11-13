import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { CONFORMANCE, DOMAINS, type DomainRating } from "@/lib/quality";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { saveConformance, startQaReview } from "./actions";

export const metadata: Metadata = { title: "Quality" };

export default async function QualityPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const s = await requireUser();
  const year = Number((await searchParams).year) || new Date().getFullYear();
  const yearAgo = new Date(Date.now() - 365 * 864e5);
  const [reviews, conf, finished] = await Promise.all([
    db.qaReview.findMany({ where: { orgId: s.org }, orderBy: { createdAt: "desc" }, include: { engagement: { select: { id: true, code: true, name: true } }, reviewer: { select: { name: true } } } }),
    db.conformance.findUnique({ where: { orgId_year: { orgId: s.org, year } } }),
    db.engagement.findMany({ where: { orgId: s.org, phase: { in: ["reporting", "followup", "closed"] } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true, phase: true, createdAt: true } }),
  ]);
  const ratings = (conf?.ratings ?? {}) as Record<string, DomainRating>;
  const completed = reviews.filter((r) => r.status === "completed");
  const recent = completed.filter((r) => r.completedAt && r.completedAt > yearAgo);
  const reviewedIds = new Set(completed.map((r) => r.engagementId));
  const avg = recent.length ? Math.round(recent.reduce((a, r) => a + (r.score ?? 0), 0) / recent.length) : null;
  const overall = DOMAINS.some((d) => ratings[d.key]?.rating === "not") ? "not" : DOMAINS.some((d) => ratings[d.key]?.rating === "partially") ? "partially" : DOMAINS.every((d) => ratings[d.key]?.rating === "generally") ? "generally" : "unassessed";
  const ov = CONFORMANCE.find((c) => c.key === overall)!;
  const admin = can(s, "admin");

  return (
    <>
      <PageHeader title="Quality assurance" sub="How the audit function itself measures up: independent quality reviews of finished audits, and a yearly self-assessment against the professional standards." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`Conformance ${year}`} value={<span className={clsx("pill text-[13px]", ov.cls)}>{ov.label}</span>} sub={conf ? `Updated by ${conf.updatedBy}, ${fmtDate(conf.updatedAt)}` : "Not assessed yet"} />
        <Stat label="Finished audits quality-reviewed" value={finished.length ? `${Math.round((finished.filter((e) => reviewedIds.has(e.id)).length / finished.length) * 100)}%` : "—"} sub={`${finished.filter((e) => reviewedIds.has(e.id)).length} of ${finished.length}`} />
        <Stat label="Average quality score (12 months)" value={avg === null ? "—" : `${avg}%`} tone={avg !== null && avg < 75 ? "amber" : undefined} sub={`${recent.length} reviews`} />
        <Stat label="Reviews in progress" value={reviews.filter((r) => r.status === "in_progress").length} />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Engagement quality reviews</h2>
          {can(s, "review") && finished.length > 0 && (
            <form action={startQaReview} className="ml-auto flex flex-wrap items-center gap-2">
              <label htmlFor="engagementId" className="sr-only">
                Engagement
              </label>
              <select id="engagementId" name="engagementId" required className="input h-9 w-72">
                <option value="">Choose a finished audit…</option>
                {finished.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                    {reviewedIds.has(e.id) ? " (reviewed)" : ""}
                  </option>
                ))}
              </select>
              <button className="btn-primary h-9">Start review</button>
            </form>
          )}
        </div>
        {reviews.length === 0 ? (
          <Empty title="No quality reviews yet">Pick a finished audit and review it against the checklist. The reviewer must not have worked on it.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Audit</th>
                  <th className="th">Reviewer</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/quality/${r.id}`} className="font-medium hover:text-brand-700">
                        {r.engagement.name}
                      </Link>
                      <div className="font-mono text-[11px] text-ink-500">{r.engagement.code}</div>
                    </td>
                    <td className="td">{r.reviewer.name}</td>
                    <td className="td">{r.status === "completed" ? <span className="pill bg-ok-bg text-ok-fg">Completed {fmtDate(r.completedAt)}</span> : <span className="pill bg-brand-100 text-brand-800">In progress</span>}</td>
                    <td className={clsx("td tabular text-right font-semibold", r.score !== null && r.score < 75 && "text-med-fg")}>{r.score === null ? "—" : `${r.score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Conformance self-assessment {year}</h2>
          <span className="text-xs text-ink-500">Against the five domains of the Global Internal Audit Standards. An independent external assessment is needed at least every five years.</span>
          <div className="ml-auto flex gap-1.5 text-[13px]">
            <Link href={`/quality?year=${year - 1}`} className="btn btn-sm">
              {year - 1}
            </Link>
            {year < new Date().getFullYear() && (
              <Link href={`/quality?year=${year + 1}`} className="btn btn-sm">
                {year + 1}
              </Link>
            )}
          </div>
        </div>
        <form action={saveConformance.bind(null, year)}>
          <div className="divide-y divide-line-soft">
            {DOMAINS.map((d) => {
              const r = ratings[d.key];
              const c = CONFORMANCE.find((x) => x.key === (r?.rating ?? "unassessed"))!;
              return (
                <div key={d.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_200px_minmax(0,1.4fr)]">
                  <div>
                    <p className="text-[13.5px] font-semibold">{d.label}</p>
                    <p className="text-xs text-ink-500">{d.about}</p>
                  </div>
                  {admin ? (
                    <div>
                      <label htmlFor={`r_${d.key}`} className="sr-only">
                        Rating for {d.label}
                      </label>
                      <select id={`r_${d.key}`} name={`r_${d.key}`} defaultValue={r?.rating ?? "unassessed"} className="input">
                        {CONFORMANCE.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className={clsx("pill self-start", c.cls)}>{c.label}</span>
                  )}
                  {admin ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`g_${d.key}`} className="label">
                          What falls short
                        </label>
                        <textarea id={`g_${d.key}`} name={`g_${d.key}`} rows={2} defaultValue={r?.gaps ?? ""} className="textarea text-[13px]" />
                      </div>
                      <div>
                        <label htmlFor={`a_${d.key}`} className="label">
                          What we will do
                        </label>
                        <textarea id={`a_${d.key}`} name={`a_${d.key}`} rows={2} defaultValue={r?.actions ?? ""} className="textarea text-[13px]" />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13px]">
                      {r?.gaps && <p>Falls short: {r.gaps}</p>}
                      {r?.actions && <p className="text-ink-500">Action: {r.actions}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {admin && (
            <div className="border-t border-line-soft px-5 py-3">
              <button className="btn-primary">Save self-assessment</button>
            </div>
          )}
        </form>
      </section>
    </>
  );
}
