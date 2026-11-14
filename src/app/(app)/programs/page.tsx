import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { PROGRAMS, type Step } from "@/lib/programs";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { deleteProgram } from "./actions";

export const metadata: Metadata = { title: "Work programs" };

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-1.5 border-t border-line-soft pt-3 text-[13px]">
      {steps.map((st, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="w-6 flex-none font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, "0")}</span>
          <span>
            {st.title}
            {st.control && <span className="text-ink-500"> · {st.control}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function ProgramsPage() {
  const s = await requireUser();
  const own = await db.programTemplate.findMany({ where: { orgId: s.org }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Work programs" sub="Ready-made audit programs, and the ones your team has saved. Load one into an engagement from its Work program tab, then adapt the procedures to the client." />

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Your organisation&apos;s programs</h2>
        {own.length === 0 ? (
          <p className="card p-5 text-sm text-ink-500">None saved yet. On any engagement&apos;s Work program tab, managers can save its procedures as a program for next time.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {own.map((t) => (
              <details key={t.id} className="card p-4">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{t.name}</span>
                  <span className="text-xs text-ink-500">
                    {(t.steps as Step[]).length} procedures · saved by {t.createdBy}, {fmtDate(t.createdAt)}
                  </span>
                </summary>
                <Steps steps={t.steps as Step[]} />
                {can(s, "manage") && (
                  <form action={deleteProgram.bind(null, t.id)} className="mt-3">
                    <button className="text-[12px] text-ink-500 hover:text-high-fg">Delete</button>
                  </form>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Standard programs</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {PROGRAMS.map((p) => (
            <details key={p.key} className="card p-4">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-2">
                <span className="text-[14px] font-semibold">{p.name}</span>
                <span className="pill bg-line-soft text-ink-700">{p.area}</span>
                <span className="text-xs text-ink-500">
                  {p.steps.length} procedures · {p.about}
                </span>
              </summary>
              <Steps steps={p.steps} />
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
