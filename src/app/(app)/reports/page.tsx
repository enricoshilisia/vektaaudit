import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { OPINIONS, TEMPLATES, type Opinion, type Run, type TemplateKey, build, loadContext } from "@/lib/server/templates";
import { saveToFile } from "./actions";

export const metadata: Metadata = { title: "Reports & letters" };

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) =>
        typeof r === "string" ? (
          r
        ) : (
          <span key={i} className={clsx("rounded-sm px-0.5", r.f.startsWith("[") ? "bg-med-bg text-med-fg" : "bg-brand-100 text-brand-800")}>
            {r.f}
          </span>
        ),
      )}
    </>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ engagement?: string; template?: string; opinion?: string }> }) {
  const s = await requireUser();
  const q = await searchParams;
  const engagements = await db.engagement.findMany({ where: { orgId: s.org }, orderBy: [{ phase: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, kind: true } });
  const eng = engagements.find((e) => e.id === q.engagement) ?? engagements[0];
  if (!eng)
    return (
      <>
        <PageHeader title="Reports & letters" />
        <div className="card">
          <Empty title="No engagements yet">Letters and reports are generated from an engagement&apos;s audit file.</Empty>
        </div>
      </>
    );

  const available = TEMPLATES.filter((t) => (t.kinds as readonly string[]).includes(eng.kind));
  const t = available.find((x) => x.key === q.template) ?? available.find((x) => x.key === (eng.kind === "financial" ? "auditors-report" : "internal-audit-report"))!;
  const opinion: Opinion = OPINIONS.includes(q.opinion as Opinion) ? (q.opinion as Opinion) : "unmodified";
  const ctx = await loadContext(s.org, eng.id);
  const doc = build(t.key as TemplateKey, ctx, { opinion });
  const placeholders = doc.blocks.flatMap((b) => ("runs" in b ? b.runs : "lines" in b ? b.lines.flat() : "items" in b ? b.items.flat() : [])).filter((r) => typeof r !== "string" && r.f.startsWith("[")).length;
  const generated = await db.document.findMany({ where: { orgId: s.org, engagementId: eng.id, source: "generated" }, orderBy: { createdAt: "desc" }, take: 6 });
  const base = (patch: Record<string, string>) => `/reports?${new URLSearchParams({ engagement: eng.id, template: t.key, ...(t.key === "auditors-report" ? { opinion } : {}), ...patch })}`;
  const dl = (format: string) => `/api/generate?${new URLSearchParams({ engagement: eng.id, template: t.key, format, ...(t.key === "auditors-report" ? { opinion } : {}) })}`;
  const groups = [...new Set(available.map((x) => x.group))];

  return (
    <>
      <PageHeader
        eyebrow={`${eng.code} · ${eng.name}`}
        title={doc.title}
        actions={
          <>
            <form className="flex items-center gap-2">
              <label htmlFor="engagement" className="sr-only">
                Engagement
              </label>
              <select id="engagement" name="engagement" defaultValue={eng.id} className="input w-auto min-w-[240px]">
                {engagements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} · {e.name}
                  </option>
                ))}
              </select>
              <button className="btn">Open</button>
            </form>
            <a href={dl("docx")} className="btn">
              Word
            </a>
            <a href={dl("pdf")} className="btn">
              PDF
            </a>
            {can(s, "work") && (
              <form action={saveToFile.bind(null, eng.id, t.key, t.key === "auditors-report" ? opinion : null)}>
                <button className="btn-primary">Save to audit file</button>
              </form>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <nav aria-label="Templates" className="card flex min-w-0 flex-[1_1_220px] flex-col gap-0.5 px-2.5 py-3.5">
          <span className="eyebrow px-2.5 pb-2">Templates</span>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-0.5">
              <span className="px-2.5 pb-1 pt-3 text-xs font-semibold text-ink-700">{g}</span>
              {available
                .filter((x) => x.group === g)
                .map((x) => (
                  <Link key={x.key} href={`/reports?engagement=${eng.id}&template=${x.key}`} className={clsx("rounded-lg px-2.5 py-2 text-[13px]", x.key === t.key ? "bg-brand-100 font-semibold text-brand-800" : "hover:bg-canvas")}>
                    {x.label}
                  </Link>
                ))}
            </div>
          ))}
        </nav>

        <section aria-label="Document preview" className="flex min-w-0 flex-[999_1_480px] flex-col items-center gap-3">
          <article className="flex w-full max-w-[680px] flex-col gap-3.5 rounded border border-line bg-white px-14 py-12 font-serif text-[13.5px] leading-relaxed text-[#1C2733] shadow-[0_2px_8px_rgba(11,31,51,0.06)]">
            <div className="flex items-start justify-between gap-3 font-sans">
              <span className="text-[11px] font-semibold text-ink-700">{ctx.org.name}</span>
              <span className="text-[11px] text-ink-500">Ref: {doc.ref}</span>
            </div>
            {doc.blocks.map((b, i) => {
              switch (b.t) {
                case "title":
                  return (
                    <h2 key={i} className="mt-2 text-center text-[17px] font-semibold">
                      <Runs runs={b.runs} />
                    </h2>
                  );
                case "h":
                  return (
                    <h3 key={i} className="mt-1.5 text-sm font-semibold">
                      <Runs runs={b.runs} />
                    </h3>
                  );
                case "p":
                  return (
                    <p key={i}>
                      <Runs runs={b.runs} />
                    </p>
                  );
                case "note":
                  return (
                    <p key={i} className="font-sans text-xs italic text-ink-500">
                      <Runs runs={b.runs} />
                    </p>
                  );
                case "list":
                  return (
                    <ul key={i} className="list-disc pl-5">
                      {b.items.map((it, j) => (
                        <li key={j}>
                          <Runs runs={it} />
                        </li>
                      ))}
                    </ul>
                  );
                case "table":
                  return (
                    <div key={i} className="overflow-x-auto">
                      <table className="w-full font-sans text-xs">
                        <thead>
                          <tr className="border-b-[1.5px] border-ink">
                            {b.head.map((h, j) => (
                              <th key={j} className={clsx("px-1.5 py-1.5 font-semibold", b.align?.[j] === "r" ? "text-right" : "text-left")}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.map((r, j) => (
                            <tr key={j} className="border-b border-line">
                              {r.map((c, k) => (
                                <td key={k} className={clsx("tabular px-1.5 py-1.5", b.align?.[k] === "r" && "text-right")}>
                                  {c}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {b.total && (
                            <tr className="border-t-[1.5px] border-ink font-semibold">
                              {b.total.map((c, k) => (
                                <td key={k} className={clsx("tabular px-1.5 py-1.5", b.align?.[k] === "r" && "text-right")}>
                                  {c}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                case "sign":
                  return (
                    <div key={i} className="mt-3 flex flex-col gap-0.5 font-sans text-[12.5px]">
                      <span className="mb-1 h-8 w-40 border-b border-ink-300" />
                      {b.lines.map((l, j) => (
                        <span key={j} className={j === 0 ? "font-semibold" : "text-ink-500"}>
                          <Runs runs={l} />
                        </span>
                      ))}
                    </div>
                  );
              }
            })}
          </article>
          <p className="text-xs text-ink-500">
            <span className="rounded-sm bg-brand-100 px-1 text-brand-800">Blue</span> = filled from the audit file ·{" "}
            <span className="rounded-sm bg-med-bg px-1 text-med-fg">Amber</span> = still to complete ({placeholders})
          </p>
        </section>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          {t.key === "auditors-report" && (
            <section className="card flex flex-col gap-2.5 px-[18px] py-4">
              <h2 className="text-sm font-semibold">Opinion type</h2>
              <div role="radiogroup" aria-label="Opinion type" className="grid grid-cols-2 gap-1.5">
                {OPINIONS.map((o) => (
                  <Link
                    key={o}
                    href={base({ opinion: o })}
                    role="radio"
                    aria-checked={o === opinion}
                    className={clsx("flex h-[38px] items-center justify-center rounded-lg border text-[13px] capitalize", o === opinion ? "border-brand-600 bg-brand-100 font-semibold text-brand-800" : "border-line-strong hover:bg-canvas")}
                  >
                    {o}
                  </Link>
                ))}
              </div>
              <span className="text-xs text-ink-500">Changing the type rewrites the opinion and basis paragraphs.</span>
            </section>
          )}
          <section className="card flex flex-col gap-2.5 px-[18px] py-4 text-[13px]">
            <h2 className="text-sm font-semibold">Data pulled in</h2>
            {[
              ["Client", ctx.client?.name],
              ["Period end", ctx.periodEnd ? fmtDate(ctx.periodEnd) : null],
              ["Framework", ctx.client?.framework],
              ["Signed by", ctx.lead?.name],
              ["Open findings", String(ctx.findings.length)],
              ...(ctx.kind === "financial" ? [["Significant-risk areas", String(ctx.leadsTb.filter((l) => l.risk === "significant").length)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2.5">
                <span className="text-ink-500">{k}</span>
                <span className={clsx("text-right font-medium", !v && "text-med-fg")}>{v || "Missing"}</span>
              </div>
            ))}
          </section>
          <section className="card flex flex-col gap-2 px-[18px] py-4 text-[13px]">
            <h2 className="text-sm font-semibold">Saved to the audit file</h2>
            {generated.length === 0 && <span className="text-ink-500">Nothing generated yet.</span>}
            {generated.map((g) => (
              <a key={g.id} href={`/api/files/${g.id}`} className="flex justify-between gap-2 hover:text-brand-700">
                <span className="truncate">
                  {g.name} <span className="text-ink-500">v{g.version}</span>
                </span>
                <span className="flex-none text-ink-500">{fmtDate(g.createdAt, false)}</span>
              </a>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
