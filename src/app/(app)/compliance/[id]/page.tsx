import clsx from "clsx";
import { X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill, Stat } from "@/components/ui";
import { REQ_STATUS, STARTERS, reqStatus, type ReqStatus } from "@/lib/frameworks";
import { OPERATING_PILL } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { deleteFramework, importRequirements, mapControl, setApplicable, unmapControl } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const f = await db.framework.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: f?.name ?? "Framework" };
}

export default async function FrameworkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const s = await requireUser();
  const { show = "all" } = await searchParams;
  const f = await db.framework.findFirst({
    where: { id: (await params).id, orgId: s.org },
    include: { requirements: { orderBy: { sort: "asc" }, include: { controls: { select: { id: true, code: true, title: true, design: true, operating: true } } } } },
  });
  if (!f) notFound();
  const manage = can(s, "manage");
  const controls = manage ? await db.control.findMany({ where: { orgId: s.org }, orderBy: [{ process: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, process: true } }) : [];
  const rows = f.requirements.map((r) => ({ ...r, status: reqStatus(r.applicable, r.controls) }));
  const count = (k: ReqStatus) => rows.filter((r) => r.status === k).length;
  const applicable = rows.filter((r) => r.status !== "na").length;
  const shown = rows.filter((r) => show === "all" || (show === "gaps" ? r.status === "gap" || r.status === "not_working" : r.status === show));
  const starter = STARTERS.find((x) => x.key === f.source);
  const tab = (k: string, l: string, n: number) => (
    <Link href={`/compliance/${f.id}?show=${k}`} className={clsx("flex h-9 items-center rounded-full border px-3.5 text-[13px]", show === k ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas")}>
      {l} <span className="ml-1.5 opacity-70">{n}</span>
    </Link>
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/compliance" className="hover:text-ink">
          Compliance
        </Link>
        <span aria-hidden>/</span>
        <span>{f.name}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[24px] font-semibold tracking-tight">{f.name}</h1>
          {starter && <p className="mt-1 text-sm text-ink-500">{starter.note}</p>}
        </div>
        {manage && (
          <form action={deleteFramework.bind(null, f.id)}>
            <button className="btn text-high-fg">Remove framework</button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Covered and tested" value={applicable ? `${Math.round((count("covered") / applicable) * 100)}%` : "—"} sub={`${count("covered")} of ${applicable} requirements`} />
        <Stat label="Mapped, not tested" value={count("untested")} tone={count("untested") ? "amber" : undefined} />
        <Stat label="Control not working" value={count("not_working")} tone={count("not_working") ? "red" : undefined} />
        <Stat label="No control" value={count("gap")} tone={count("gap") ? "red" : undefined} sub={`${count("na")} not applicable`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {tab("all", "All", rows.length)}
        {tab("gaps", "Gaps", count("gap") + count("not_working"))}
        {tab("untested", "Not tested", count("untested"))}
        {tab("covered", "Covered", count("covered"))}
        {tab("na", "Not applicable", count("na"))}
      </div>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">No requirements yet. Import them below.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th w-[34%]">Requirement</th>
                  <th className="th">Status</th>
                  <th className="th w-[36%]">Controls</th>
                  {manage && <th className="th">Applies?</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-line-soft align-top">
                    <td className="td">
                      <span className="font-mono text-[11px] text-ink-500">{r.ref}</span>
                      <p className={clsx("mt-0.5", !r.applicable && "text-ink-400")}>{r.title}</p>
                      {r.detail && <p className="mt-1 text-xs text-ink-500">{r.detail}</p>}
                      {r.note && <p className="mt-1 text-xs text-ink-500">Note: {r.note}</p>}
                    </td>
                    <td className="td">
                      <span className={clsx("pill", REQ_STATUS[r.status].cls)}>{REQ_STATUS[r.status].label}</span>
                    </td>
                    <td className="td">
                      <div className="flex flex-col gap-1.5">
                        {r.controls.map((c) => (
                          <div key={c.id} className="flex items-start gap-2">
                            <Link href={`/controls/${c.id}`} className="min-w-0 flex-1 hover:text-brand-700">
                              <span className="font-mono text-[11px] text-ink-500">{c.code}</span> {c.title.length > 70 ? `${c.title.slice(0, 70)}…` : c.title}
                            </Link>
                            <Pill p={OPERATING_PILL[c.operating]} />
                            {manage && (
                              <form action={unmapControl.bind(null, r.id, c.id)}>
                                <button aria-label={`Unmap ${c.code}`} className="text-ink-400 hover:text-high-fg">
                                  <X size={14} />
                                </button>
                              </form>
                            )}
                          </div>
                        ))}
                        {manage && r.applicable && controls.length > 0 && (
                          <form action={mapControl.bind(null, r.id)} className="flex gap-1.5">
                            <label htmlFor={`m-${r.id}`} className="sr-only">
                              Map a control to {r.ref}
                            </label>
                            <select id={`m-${r.id}`} name="controlId" className="input h-8 text-[12px]" defaultValue="">
                              <option value="">Map a control…</option>
                              {controls
                                .filter((c) => !r.controls.some((x) => x.id === c.id))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.code} · {c.process} · {c.title.slice(0, 60)}
                                  </option>
                                ))}
                            </select>
                            <button className="btn btn-sm">Map</button>
                          </form>
                        )}
                      </div>
                    </td>
                    {manage && (
                      <td className="td">
                        <form action={setApplicable.bind(null, r.id)} className="flex flex-col gap-1.5">
                          {r.applicable ? (
                            <>
                              <input type="hidden" name="applicable" value="no" />
                              <label htmlFor={`na-${r.id}`} className="sr-only">
                                Why it doesn&apos;t apply
                              </label>
                              <input id={`na-${r.id}`} name="note" className="input h-8 w-40 text-[12px]" placeholder="Why it doesn't apply" />
                              <button className="text-left text-[12px] text-ink-500 hover:text-ink">Mark not applicable</button>
                            </>
                          ) : (
                            <>
                              <input type="hidden" name="applicable" value="yes" />
                              <button className="text-left text-[12px] text-brand-700">Mark applicable</button>
                            </>
                          )}
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {manage && (
        <form action={importRequirements.bind(null, f.id)} className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-0 flex-[1_1_320px]">
            <label htmlFor="file" className="label">
              Import requirements: CSV with Ref and Title columns, and optionally Detail
            </label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required className="block text-sm" />
          </div>
          <button className="btn">Import</button>
        </form>
      )}
    </>
  );
}
