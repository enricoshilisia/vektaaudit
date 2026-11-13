import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { REQ_STATUS, STARTERS, reqStatus, type ReqStatus } from "@/lib/frameworks";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addFramework } from "./actions";

export const metadata: Metadata = { title: "Compliance" };

const ORDER: ReqStatus[] = ["covered", "untested", "not_working", "gap"];
const COLOR: Record<ReqStatus, string> = { covered: "#12715B", untested: "#DC6803", not_working: "#7A1F17", gap: "#F4A39B", na: "#D3DAE2" };

export default async function CompliancePage() {
  const s = await requireUser();
  const frameworks = await db.framework.findMany({
    where: { orgId: s.org },
    orderBy: { createdAt: "asc" },
    include: { requirements: { include: { controls: { select: { design: true, operating: true } } } } },
  });
  const added = new Set(frameworks.map((f) => f.source));

  return (
    <>
      <PageHeader title="Compliance" sub="Map each control once to every law, regulation and standard it satisfies. One test result then counts for all of them, and the gaps show up straight away." />

      <section className="card overflow-hidden">
        {frameworks.length === 0 ? (
          <Empty title="No frameworks yet">Start with one below, or import a standard your organisation follows.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Framework</th>
                  <th className="th text-right">Requirements</th>
                  <th className="th w-[38%]">Coverage</th>
                  <th className="th text-right">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {frameworks.map((f) => {
                  const st = f.requirements.map((r) => reqStatus(r.applicable, r.controls));
                  const applicable = st.filter((x) => x !== "na");
                  const covered = applicable.filter((x) => x === "covered").length;
                  return (
                    <tr key={f.id} className="border-t border-line-soft">
                      <td className="td">
                        <Link href={`/compliance/${f.id}`} className="font-medium hover:text-brand-700">
                          {f.name}
                        </Link>
                        <div className="text-[11px] text-ink-500">{f.source === "imported" ? "Imported" : "Starter set"}</div>
                      </td>
                      <td className="td tabular text-right">
                        {applicable.length}
                        {st.length > applicable.length && <span className="text-ink-400"> (+{st.length - applicable.length} n/a)</span>}
                      </td>
                      <td className="td">
                        {applicable.length ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-2.5 flex-1 gap-[2px] overflow-hidden rounded-full">
                              {ORDER.map((k) => {
                                const n = applicable.filter((x) => x === k).length;
                                return n ? <div key={k} title={`${REQ_STATUS[k].label}: ${n}`} style={{ flex: n, background: COLOR[k] }} /> : null;
                              })}
                            </div>
                            <span className="tabular w-10 text-right text-[12px]">{Math.round((covered / applicable.length) * 100)}%</span>
                          </div>
                        ) : (
                          <span className="text-ink-400">No requirements yet</span>
                        )}
                      </td>
                      <td className="td tabular text-right">{applicable.filter((x) => x === "gap" || x === "not_working").length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {frameworks.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft px-5 py-3 text-xs text-ink-500">
            {ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: COLOR[k] }} />
                {REQ_STATUS[k].label}
              </span>
            ))}
          </div>
        )}
      </section>

      {can(s, "manage") && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-6">
            <h2 className="mb-1 text-[15px] font-semibold">Add a starter framework</h2>
            <p className="mb-4 text-[13px] text-ink-500">Summaries in plain language, ready to map your controls to.</p>
            <div className="flex flex-col gap-3">
              {STARTERS.map((st) => (
                <form key={st.key} action={addFramework} className="flex items-start gap-3 rounded-lg border border-line p-3">
                  <input type="hidden" name="starter" value={st.key} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{st.name}</p>
                    <p className="text-xs text-ink-500">
                      {st.requirements.length} requirements. {st.note}
                    </p>
                  </div>
                  <button className="btn btn-sm" disabled={added.has(st.key)}>
                    {added.has(st.key) ? "Added" : "Add"}
                  </button>
                </form>
              ))}
            </div>
          </section>
          <section className="card p-6">
            <h2 className="mb-1 text-[15px] font-semibold">Add a standard you follow</h2>
            <p className="mb-4 text-[13px] text-ink-500">For ISO/IEC 27001, PCI DSS, the CBK Prudential Guidelines or your own policies: create it here, then import its requirements as CSV from your licensed copy.</p>
            <form action={addFramework} className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-[1_1_260px]">
                <label htmlFor="name" className="label">
                  Name
                </label>
                <input id="name" name="name" required minLength={3} className="input" placeholder="e.g. ISO/IEC 27001:2022 Annex A" />
              </div>
              <button className="btn-primary">Create</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
