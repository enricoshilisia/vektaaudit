import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ControlFields } from "@/components/ControlFields";
import { Empty, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { BAND_PILL, CONTROL_NATURE, DESIGN_PILL, FREQUENCIES, OPERATING_PILL, TEST_STATUS, labelOf, type Band } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { createTest } from "../../tests/actions";
import { setDesign, updateControl } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await db.control.findUnique({ where: { id: (await params).id }, select: { code: true } });
  return { title: c?.code ?? "Control" };
}

export default async function ControlPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const s = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const c = await db.control.findFirst({
    where: { id, orgId: s.org },
    include: {
      risks: { orderBy: { code: "asc" } },
      tests: { orderBy: { createdAt: "desc" }, include: { engagement: { select: { id: true, code: true, name: true } }, _count: { select: { samples: true } }, reviewedBy: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const manage = can(s, "manage");

  if (edit && manage) {
    const risks = await db.risk.findMany({ where: { orgId: s.org }, orderBy: [{ process: "asc" }, { code: "asc" }] });
    return (
      <>
        <Crumbs process={c.process} code={c.code} />
        <h1 className="text-[26px] font-semibold tracking-tight">Edit control {c.code}</h1>
        <form action={updateControl.bind(null, c.id)} className="card flex max-w-3xl flex-col gap-6 p-6">
          <ControlFields c={c} risks={risks} linked={c.risks.map((r) => r.id)} processes={[...new Set(risks.map((r) => r.process))]} />
          <div className="flex gap-2">
            <button className="btn-primary">Save</button>
            <Link href={`/controls/${c.id}`} className="btn">
              Cancel
            </Link>
          </div>
        </form>
      </>
    );
  }

  const engagements = can(s, "work") ? await db.engagement.findMany({ where: { orgId: s.org, phase: { not: "closed" } }, orderBy: { code: "desc" }, select: { id: true, code: true, name: true } }) : [];

  return (
    <>
      <Crumbs process={c.process} code={c.code} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          <p className="mt-1 text-[13px] text-ink-500">
            {c.process} · {labelOf(CONTROL_NATURE, c.nature)} · {labelOf(FREQUENCIES, c.frequency)} · {c.type === "preventive" ? "Preventive" : "Detective"}
            {c.key ? " · Key control" : ""}
          </p>
        </div>
        {manage && (
          <Link href={`/controls/${c.id}?edit=1`} className="btn">
            Edit
          </Link>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 text-[13px]">
            <dt className="text-ink-500">Owner</dt>
            <dd>{c.ownerName ?? "—"}</dd>
            <dt className="text-ink-500">Assertion</dt>
            <dd>{c.assertion ?? "—"}</dd>
            <dt className="text-ink-500">COSO component</dt>
            <dd>{c.component ?? "—"}</dd>
            <dt className="text-ink-500">Last tested</dt>
            <dd>{fmtDate(c.lastTestedAt)}</dd>
            {c.detail && (
              <>
                <dt className="text-ink-500">Detail</dt>
                <dd className="whitespace-pre-wrap">{c.detail}</dd>
              </>
            )}
            <dt className="text-ink-500">Risks addressed</dt>
            <dd className="flex flex-col gap-1.5">
              {c.risks.length === 0
                ? "—"
                : c.risks.map((r) => (
                    <span key={r.id} className="flex items-start gap-2">
                      <Pill p={BAND_PILL[r.rating as Band]} />
                      <span>
                        <span className="font-mono text-[11px] text-ink-500">{r.code}</span> {r.title}
                      </span>
                    </span>
                  ))}
            </dd>
          </dl>
        </section>
        <section className="card flex flex-col gap-4 p-5">
          <div>
            <p className="text-[13px] font-medium text-ink-500">Design</p>
            <Pill p={DESIGN_PILL[c.design]} className="mt-1.5" />
            {can(s, "review") && (
              <form action={setDesign.bind(null, c.id)} className="mt-3 flex gap-2">
                <label htmlFor="design" className="sr-only">
                  Design rating
                </label>
                <select id="design" name="design" defaultValue={c.design} className="input h-8 text-[13px]">
                  {Object.entries(DESIGN_PILL).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm">Set</button>
              </form>
            )}
          </div>
          <div>
            <p className="text-[13px] font-medium text-ink-500">Operating effectiveness</p>
            <Pill p={OPERATING_PILL[c.operating]} className="mt-1.5" />
            <p className="mt-1.5 text-xs text-ink-500">Set by the latest signed-off test.</p>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Tests of this control</h2>
          {engagements.length > 0 && (
            <form action={createTest} className="ml-auto flex flex-wrap items-center gap-2">
              <input type="hidden" name="controlId" value={c.id} />
              <label htmlFor="engagementId" className="sr-only">
                Engagement
              </label>
              <select id="engagementId" name="engagementId" required className="input h-9 w-64">
                <option value="">Choose engagement…</option>
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
              <label htmlFor="testType" className="sr-only">
                Test type
              </label>
              <select id="testType" name="testType" className="input h-9 w-44">
                <option value="operating">Operating effectiveness</option>
                <option value="design">Design (walkthrough)</option>
              </select>
              <button className="btn-primary h-9">Test this control</button>
            </form>
          )}
        </div>
        {c.tests.length === 0 ? (
          <Empty title="Not tested yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Test</th>
                  <th className="th">Engagement</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Items</th>
                  <th className="th">Status</th>
                  <th className="th">Result</th>
                  <th className="th">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {c.tests.map((t) => (
                  <tr key={t.id} className="border-t border-line-soft">
                    <td className="td">
                      <Link href={`/tests/${t.id}`} className="font-mono font-medium">
                        {t.ref}
                      </Link>
                    </td>
                    <td className="td">
                      <Link href={`/engagements/${t.engagement.id}?tab=tests`}>
                        <span className="font-mono text-[11px]">{t.engagement.code}</span> {t.engagement.name}
                      </Link>
                    </td>
                    <td className="td">{t.testType === "design" ? "Design" : "Operating"}</td>
                    <td className="td tabular text-right">{t._count.samples}</td>
                    <td className="td">
                      <Pill p={TEST_STATUS[t.status]} />
                    </td>
                    <td className="td">{t.result ? <Pill p={OPERATING_PILL[t.result]} /> : "—"}</td>
                    <td className="td">{t.reviewedBy ? `${t.reviewedBy.name}, ${fmtDate(t.reviewedAt)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Crumbs({ process, code }: { process: string; code: string }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
      <Link href="/controls" className="hover:text-ink">
        Risks & controls
      </Link>
      <span aria-hidden>/</span>
      <Link href={`/controls?process=${encodeURIComponent(process)}`} className="hover:text-ink">
        {process}
      </Link>
      <span aria-hidden>/</span>
      <span className="font-mono">{code}</span>
    </div>
  );
}
