import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pill, SeverityPill } from "@/components/ui";
import { FINDING_PILL, PHASE_PILL, PROCEDURE_PILL, RATING_PILL, SEVERITY, fmtDate, fmtSize } from "@/lib/format";
import { OPERATING_PILL, TEST_STATUS } from "@/lib/risk";
import { getSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Audit file" };

export default async function GuestEngagement({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || s.role !== "GUEST") redirect("/login");
  const { id } = await params;
  if (!(await db.guestAccess.findFirst({ where: { userId: s.sub, engagementId: id } }))) notFound();
  const e = await db.engagement.findFirst({
    where: { id, orgId: s.org },
    include: {
      client: { select: { name: true } },
      lead: { select: { name: true } },
      procedures: { orderBy: { sort: "asc" }, include: { preparedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } } },
      tests: { orderBy: { ref: "asc" }, include: { control: { select: { code: true, title: true } } } },
      findings: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: [{ folder: "asc" }, { name: "asc" }, { version: "desc" }] },
    },
  });
  if (!e) notFound();
  await db.auditLog.create({ data: { orgId: s.org, actorName: `${s.name} (guest)`, action: "guest opened audit file", entity: "engagement", entityId: e.id, detail: e.code } });
  const latest = e.documents.filter((d, i, all) => all.findIndex((x) => x.folder === d.folder && x.name === d.name) === i);

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/guest" className="hover:text-ink">
          Shared with you
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono">{e.code}</span>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill p={PHASE_PILL[e.phase]} />
          {e.rating && <Pill p={RATING_PILL[e.rating]} />}
        </div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight">{e.name}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {[e.client?.name, `Lead: ${e.lead?.name ?? "—"}`, e.periodStart || e.periodEnd ? `Period ${fmtDate(e.periodStart)} – ${fmtDate(e.periodEnd)}` : null].filter(Boolean).join(" · ")}
        </p>
        {e.objective && <p className="mt-3 max-w-3xl whitespace-pre-wrap text-[14px]">{e.objective}</p>}
      </div>

      <Section title="Work program" n={e.procedures.length}>
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-[#F8FAFB]">
            <tr>
              <th className="th">Procedure</th>
              <th className="th w-[40%]">Conclusion</th>
              <th className="th">Status</th>
              <th className="th">Sign-off</th>
            </tr>
          </thead>
          <tbody>
            {e.procedures.map((p) => (
              <tr key={p.id} className="border-t border-line-soft align-top">
                <td className="td">
                  <span className="font-mono text-[11px] text-ink-500">{p.ref}</span> {p.title}
                </td>
                <td className="td whitespace-pre-wrap text-ink-700">{p.conclusion ?? "—"}</td>
                <td className="td">
                  <Pill p={PROCEDURE_PILL[p.status]} />
                </td>
                <td className="td text-[12px] text-ink-500">
                  {p.preparedBy && <div>Prepared: {p.preparedBy.name}, {fmtDate(p.preparedAt)}</div>}
                  {p.reviewedBy && <div>Reviewed: {p.reviewedBy.name}, {fmtDate(p.reviewedAt)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {e.tests.length > 0 && (
        <Section title="Control tests" n={e.tests.length}>
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-[#F8FAFB]">
              <tr>
                <th className="th">Test</th>
                <th className="th">Control</th>
                <th className="th">Status</th>
                <th className="th">Result</th>
              </tr>
            </thead>
            <tbody>
              {e.tests.map((t) => (
                <tr key={t.id} className="border-t border-line-soft">
                  <td className="td font-mono">{t.ref}</td>
                  <td className="td">
                    <span className="font-mono text-[11px] text-ink-500">{t.control.code}</span> {t.control.title}
                  </td>
                  <td className="td">
                    <Pill p={TEST_STATUS[t.status]} />
                  </td>
                  <td className="td">{t.result ? <Pill p={OPERATING_PILL[t.result]} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Findings" n={e.findings.length}>
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="bg-[#F8FAFB]">
            <tr>
              <th className="th">Finding</th>
              <th className="th">Severity</th>
              <th className="th">Owner</th>
              <th className="th">Due</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {e.findings.map((f) => (
              <tr key={f.id} className="border-t border-line-soft align-top">
                <td className="td">
                  <span className="font-medium">{f.title}</span>
                  {f.condition && <p className="mt-1 text-[12px] text-ink-500">{f.condition}</p>}
                  {f.mgmtResponse && <p className="mt-1 text-[12px] text-ink-700">Management: {f.mgmtResponse}</p>}
                </td>
                <td className="td">
                  <SeverityPill s={SEVERITY[f.severity]} />
                </td>
                <td className="td">{f.ownerName ?? "—"}</td>
                <td className="td tabular">{fmtDate(f.dueDate)}</td>
                <td className="td">
                  <Pill p={FINDING_PILL[f.status]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Documents" n={latest.length}>
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-[#F8FAFB]">
            <tr>
              <th className="th">Document</th>
              <th className="th">Folder</th>
              <th className="th text-right">Size</th>
              <th className="th">Added</th>
            </tr>
          </thead>
          <tbody>
            {latest.map((d) => (
              <tr key={d.id} className="border-t border-line-soft">
                <td className="td">
                  <a href={`/api/files/${d.id}`} className="font-medium">
                    {d.name}
                  </a>
                  {d.version > 1 && <span className="text-[11px] text-ink-500"> · v{d.version}</span>}
                </td>
                <td className="td text-ink-500">{d.folder}</td>
                <td className="td tabular text-right">{fmtSize(d.size)}</td>
                <td className="td tabular">{fmtDate(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function Section({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">
        {title} <span className="ml-1 text-xs font-normal text-ink-500">{n}</span>
      </h2>
      {n === 0 ? <p className="px-5 py-4 text-sm text-ink-500">None.</p> : <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}
