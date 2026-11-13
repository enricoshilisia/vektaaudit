import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { ITGC_DOMAINS, ITGC_RATING } from "@/lib/itaudit";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addSodRule, rateSystem, removeSodRule, updateSystem } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const x = await db.itSystem.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: x?.name ?? "IT system" };
}

const RISK_CLS: Record<string, string> = { critical: "bg-[#7A1F17] text-white", high: "bg-high-bg text-high-fg", medium: "bg-med-bg text-med-fg" };

export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireUser();
  const x = await db.itSystem.findFirst({ where: { id: (await params).id, orgId: s.org }, include: { sodRules: { orderBy: { roleA: "asc" } } } });
  if (!x) notFound();
  const manage = can(s, "manage");

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/it-audit" className="hover:text-ink">
          IT audit
        </Link>
        <span aria-hidden>/</span>
        <span>{x.name}</span>
      </div>
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">{x.name}</h1>
        <p className="mt-1 text-sm text-ink-500">
          {[x.description, x.critical ? "Critical" : null, x.ownerName ? `Owner: ${x.ownerName}` : null, x.lastTestedAt ? `Last tested ${fmtDate(x.lastTestedAt)}` : "Not tested yet"].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 text-[15px] font-semibold">IT general controls</h2>
        <form action={rateSystem.bind(null, x.id)} className="flex flex-col gap-3">
          {ITGC_DOMAINS.map((d) => (
            <div key={d.key} className="grid gap-2 border-b border-line-soft pb-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
              <div>
                <p className="text-[13.5px] font-medium">{d.label}</p>
                <p className="text-xs text-ink-500">{d.hint}</p>
              </div>
              {can(s, "review") ? (
                <>
                  <label htmlFor={d.key} className="sr-only">
                    {d.label}
                  </label>
                  <select id={d.key} name={d.key} defaultValue={x[d.key]} className="input">
                    {Object.entries(ITGC_RATING).map(([k, p]) => (
                      <option key={k} value={k}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className={clsx("pill justify-self-start", ITGC_RATING[x[d.key]].cls)}>{ITGC_RATING[x[d.key]].label}</span>
              )}
            </div>
          ))}
          {can(s, "review") && <button className="btn-primary self-start">Save ratings</button>}
        </form>
        <p className="mt-3 text-xs text-ink-500">Test each area with a control test on the IT audit engagement, then record the overall rating here.</p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Roles no one should hold together</h2>
          <p className="text-xs text-ink-500">Access reviews flag every account holding both roles of a pair, and the owner must justify keeping it.</p>
        </div>
        {x.sodRules.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-500">No rules yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft text-[13px]">
            {x.sodRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className={clsx("pill", RISK_CLS[r.risk])}>{r.risk[0].toUpperCase() + r.risk.slice(1)}</span>
                <span className="font-medium">
                  {r.roleA} <span className="text-ink-400">+</span> {r.roleB}
                </span>
                {r.description && <span className="text-ink-500">{r.description}</span>}
                {manage && (
                  <form action={removeSodRule.bind(null, r.id)} className="ml-auto">
                    <button className="text-[12px] text-ink-500 hover:text-high-fg">Remove</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <form action={addSodRule.bind(null, x.id)} className="grid grid-cols-1 gap-3 border-t border-line-soft p-5 sm:grid-cols-[1fr_1fr_130px_1.4fr_auto] sm:items-end">
            <div>
              <label htmlFor="roleA" className="label">
                Role
              </label>
              <input id="roleA" name="roleA" required className="input" placeholder="e.g. Vendor Maintenance" />
            </div>
            <div>
              <label htmlFor="roleB" className="label">
                Conflicts with
              </label>
              <input id="roleB" name="roleB" required className="input" placeholder="e.g. Payment Approver" />
            </div>
            <div>
              <label htmlFor="risk" className="label">
                Risk
              </label>
              <select id="risk" name="risk" defaultValue="high" className="input">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </div>
            <div>
              <label htmlFor="description" className="label">
                Why
              </label>
              <input id="description" name="description" className="input" placeholder="e.g. Could create a supplier and pay it" />
            </div>
            <button className="btn">Add</button>
          </form>
        )}
      </section>

      {manage && (
        <form action={updateSystem.bind(null, x.id)} className="card grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-semibold sm:col-span-2">Details</h2>
          <div>
            <label htmlFor="sname" className="label">
              Name
            </label>
            <input id="sname" name="name" defaultValue={x.name} className="input" />
          </div>
          <div>
            <label htmlFor="sdesc" className="label">
              What it supports
            </label>
            <input id="sdesc" name="description" defaultValue={x.description ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="sowner" className="label">
              Business owner
            </label>
            <input id="sowner" name="ownerName" defaultValue={x.ownerName ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="semail" className="label">
              Owner email
            </label>
            <input id="semail" name="ownerEmail" type="email" defaultValue={x.ownerEmail ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="snotes" className="label">
              Notes
            </label>
            <textarea id="snotes" name="notes" rows={2} defaultValue={x.notes ?? ""} className="textarea" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="critical" defaultChecked={x.critical} className="h-4 w-4" /> Critical system
          </label>
          <div className="sm:col-span-2">
            <button className="btn">Save details</button>
          </div>
        </form>
      )}
    </>
  );
}
