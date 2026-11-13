import clsx from "clsx";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { BAND_PILL, CONTROL_NATURE, DESIGN_PILL, FREQUENCIES, OPERATING_PILL, labelOf, type Band } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const metadata: Metadata = { title: "Risks & controls" };

export default async function ControlsPage({ searchParams }: { searchParams: Promise<{ process?: string; q?: string }> }) {
  const s = await requireUser();
  const sp = await searchParams;
  const manage = can(s, "manage");
  const [risks, controls] = await Promise.all([
    db.risk.findMany({ where: { orgId: s.org }, orderBy: { code: "asc" }, include: { controls: { select: { id: true } } } }),
    db.control.findMany({ where: { orgId: s.org }, orderBy: { code: "asc" }, include: { risks: { select: { id: true } }, _count: { select: { tests: true } } } }),
  ]);
  const processes = [...new Set([...risks.map((r) => r.process), ...controls.map((c) => c.process)])].sort();
  const proc = sp.process && processes.includes(sp.process) ? sp.process : undefined;
  const term = (sp.q ?? "").trim().toLowerCase();
  const match = (t: string) => !term || t.toLowerCase().includes(term);

  const yearAgo = new Date(Date.now() - 365 * 864e5);
  const key = controls.filter((c) => c.key);
  const keyTested = key.filter((c) => c.lastTestedAt && c.lastTestedAt > yearAgo).length;
  const ineffective = key.filter((c) => c.operating === "ineffective" || c.design === "ineffective").length;
  const unmitigated = risks.filter((r) => r.controls.length === 0).length;
  const byId = new Map(controls.map((c) => [c.id, c]));

  const shownProcesses = proc ? [proc] : processes;

  return (
    <>
      <PageHeader
        title="Risks & controls"
        sub="The library of what could go wrong in each process and the controls that prevent or detect it. Audits test controls from here, and results flow back."
        actions={
          manage && (
            <>
              <Link href={`/controls/risks/new${proc ? `?process=${encodeURIComponent(proc)}` : ""}`} className="btn">
                <Plus size={16} aria-hidden />
                Add risk
              </Link>
              <Link href={`/controls/new${proc ? `?process=${encodeURIComponent(proc)}` : ""}`} className="btn-primary">
                <Plus size={16} aria-hidden />
                Add control
              </Link>
            </>
          )
        }
      />

      {processes.length === 0 ? (
        <section className="card">
          <Empty title="The library is empty">Start with one process you know well: list what could go wrong (risks), then the controls that address each risk.</Empty>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Processes" value={processes.length} />
            <Stat label="Risks" value={risks.length} sub={unmitigated ? `${unmitigated} with no control` : "All have a control"} tone={unmitigated ? "amber" : undefined} />
            <Stat label="Controls" value={controls.length} sub={`${key.length} key controls`} />
            <Stat label="Key controls tested (12 months)" value={key.length ? `${Math.round((keyTested / key.length) * 100)}%` : "—"} sub={`${keyTested} of ${key.length}`} />
            <Stat label="Ineffective key controls" value={ineffective} tone={ineffective ? "red" : undefined} sub={ineffective ? "Raise or follow up findings" : "None"} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/controls" className={chip(!proc)}>
              All processes
            </Link>
            {processes.map((p) => (
              <Link key={p} href={`/controls?process=${encodeURIComponent(p)}`} className={chip(proc === p)}>
                {p}
              </Link>
            ))}
            <form className="ml-auto">
              {proc && <input type="hidden" name="process" value={proc} />}
              <label htmlFor="cq" className="sr-only">
                Find
              </label>
              <input id="cq" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Find a risk or control…" className="input h-9 w-60" />
            </form>
          </div>

          {shownProcesses.map((p) => {
            const pr = risks.filter((r) => r.process === p);
            const loose = controls.filter((c) => c.process === p && c.risks.length === 0);
            const rows = pr
              .map((r) => ({ r, cs: r.controls.map((x) => byId.get(x.id)!).filter(Boolean) }))
              .filter(({ r, cs }) => match(`${r.code} ${r.title}`) || cs.some((c) => match(`${c.code} ${c.title}`)));
            const looseShown = loose.filter((c) => match(`${c.code} ${c.title}`));
            if (term && rows.length === 0 && looseShown.length === 0) return null;
            return (
              <section key={p} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
                  <h2 className="text-[15px] font-semibold">{p}</h2>
                  <span className="text-xs text-ink-500">
                    {pr.length} risks · {controls.filter((c) => c.process === p).length} controls
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-[13px]">
                    <thead className="bg-[#F8FAFB]">
                      <tr>
                        <th className="th w-[26%]">Risk</th>
                        <th className="th w-[30%]">Control</th>
                        <th className="th">How it runs</th>
                        <th className="th">Owner</th>
                        <th className="th">Design</th>
                        <th className="th">Operating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ r, cs }) =>
                        (cs.length ? cs : [null]).map((c, i) => (
                          <tr key={`${r.id}-${c?.id ?? "none"}`} className={clsx(i === 0 && "border-t border-line-soft")}>
                            {i === 0 && (
                              <td className="td" rowSpan={Math.max(cs.length, 1)}>
                                <div className="flex items-start gap-2">
                                  <Pill p={BAND_PILL[r.rating as Band]} />
                                  <div>
                                    {manage ? (
                                      <Link href={`/controls/risks/${r.id}`} className="font-medium hover:text-brand-700">
                                        {r.title}
                                      </Link>
                                    ) : (
                                      <span className="font-medium">{r.title}</span>
                                    )}
                                    <div className="font-mono text-[11px] text-ink-500">{r.code}</div>
                                  </div>
                                </div>
                              </td>
                            )}
                            {c ? <ControlCells c={c} /> : <td className="td text-high-fg" colSpan={5}>No control addresses this risk</td>}
                          </tr>
                        )),
                      )}
                      {looseShown.map((c) => (
                        <tr key={c.id} className="border-t border-line-soft">
                          <td className="td text-ink-400">Not linked to a risk</td>
                          <ControlCells c={c} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}

type C = { id: string; code: string; title: string; key: boolean; nature: string; frequency: string; type: string; ownerName: string | null; design: string; operating: string; _count: { tests: number } };

function ControlCells({ c }: { c: C }) {
  return (
    <>
      <td className="td border-l border-line-soft">
        <Link href={`/controls/${c.id}`} className="font-medium hover:text-brand-700">
          {c.title}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
          <span className="font-mono">{c.code}</span>
          {c.key && <span className="pill bg-brand-100 py-0 text-[10px] text-brand-800">Key</span>}
          {c._count.tests > 0 && <span>{c._count.tests} tests</span>}
        </div>
      </td>
      <td className="td">
        {labelOf(CONTROL_NATURE, c.nature)}
        <div className="text-[11px] text-ink-500">
          {c.type === "preventive" ? "Preventive" : "Detective"} · {labelOf(FREQUENCIES, c.frequency)}
        </div>
      </td>
      <td className="td">{c.ownerName ?? "—"}</td>
      <td className="td">
        <Pill p={DESIGN_PILL[c.design]} />
      </td>
      <td className="td">
        <Pill p={OPERATING_PILL[c.operating]} />
      </td>
    </>
  );
}

const chip = (on: boolean) => clsx("flex h-9 items-center rounded-full border px-3.5 text-[13px]", on ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas");
