import clsx from "clsx";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHeader, Pill, Stat } from "@/components/ui";
import { PHASE_PILL, fmtDate } from "@/lib/format";
import { BAND_PILL, ITEM_STATUS, MONTHS, PLAN_KINDS, PLAN_STATUS, band, kindLabel, nextDue } from "@/lib/risk";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { addDue, addItem, approvePlan, createPlan, removeItem, reopenPlan, setCapacity, setItemStatus, startItem, submitPlan, updateItem } from "./actions";

export const metadata: Metadata = { title: "Audit plan" };

type Search = { year?: string; add?: string; edit?: string; defer?: string };

export default async function PlanPage({ searchParams }: { searchParams: Promise<Search> }) {
  const s = await requireUser();
  const sp = await searchParams;
  const manage = can(s, "manage");
  const plans = await db.auditPlan.findMany({ where: { orgId: s.org }, orderBy: { year: "desc" }, select: { id: true, year: true, status: true } });
  const thisYear = new Date().getFullYear();
  const year = sp.year ? Number(sp.year) : (plans.find((p) => p.year === thisYear) ?? plans[0])?.year ?? thisYear + 1;
  const plan = await db.auditPlan.findUnique({
    where: { orgId_year: { orgId: s.org, year } },
    include: {
      items: {
        orderBy: [{ startMonth: "asc" }, { createdAt: "asc" }],
        include: { entity: true, lead: { select: { name: true } }, engagement: { select: { id: true, code: true, phase: true, actualHours: true } } },
      },
    },
  });

  const years = [...new Set([...plans.map((p) => p.year), year])].sort((a, b) => b - a);
  const yearTabs = (
    <div role="tablist" className="flex flex-wrap items-center gap-2">
      {years.map((y) => (
        <Link key={y} href={`/plan?year=${y}`} role="tab" aria-selected={y === year} className={chip(y === year)}>
          {y}
        </Link>
      ))}
      {manage && !years.includes(Math.max(...years) + 1) && (
        <Link href={`/plan?year=${Math.max(...years) + 1}`} className="flex h-9 items-center rounded-full border border-dashed border-line-strong px-3.5 text-[13px] text-ink-500 hover:text-ink">
          + Plan {Math.max(...years) + 1}
        </Link>
      )}
    </div>
  );

  if (!plan) {
    return (
      <>
        <PageHeader title="Audit plan" sub="The audits you will do in a year, chosen from the audit universe by risk and matched to the hours your team has." />
        {yearTabs}
        <section className="card">
          <Empty title={`No plan for ${year} yet`}>
            {manage ? (
              <form action={createPlan} className="mt-4 flex flex-wrap items-end justify-center gap-3 text-left">
                <input type="hidden" name="year" value={year} />
                <div>
                  <label htmlFor="capacityHours" className="label">
                    Hours your team has available in {year}
                  </label>
                  <input id="capacityHours" name="capacityHours" type="number" min={0} placeholder="e.g. 10400" className="input w-56" />
                </div>
                <button className="btn-primary">Start the {year} plan</button>
              </form>
            ) : (
              "A manager or admin can start it."
            )}
          </Empty>
        </section>
      </>
    );
  }

  const [entities, users] = await Promise.all([
    db.auditableEntity.findMany({ where: { orgId: s.org, archivedAt: null }, orderBy: { name: "asc" }, include: { client: { select: { name: true } } } }),
    db.user.findMany({ where: { orgId: s.org, active: true, role: { in: ["ADMIN", "MANAGER", "AUDITOR"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const live = plan.items.filter((i) => i.status !== "deferred" && i.status !== "cancelled");
  const hours = live.reduce((a, i) => a + i.hours, 0);
  const util = plan.capacityHours ? Math.round((hours / plan.capacityHours) * 100) : null;
  const yearEnd = new Date(year, 11, 31);
  const inPlan = new Set(live.map((i) => i.entityId).filter(Boolean));
  const due = entities.filter((e) => nextDue(e.lastAuditedAt, e.cycleMonths) <= yearEnd);
  const missing = due.filter((e) => !inPlan.has(e.id) && !plan.items.some((i) => i.entityId === e.id));
  const coverage = (b: string) => {
    const d = due.filter((e) => band(e.impact * e.likelihood) === b);
    return { total: d.length, covered: d.filter((e) => inPlan.has(e.id)).length };
  };
  const crit = coverage("critical");
  const high = coverage("high");
  const started = plan.items.filter((i) => i.engagement).length;
  const completed = plan.items.filter((i) => i.status === "completed").length;
  const editing = sp.edit ? plan.items.find((i) => i.id === sp.edit) : undefined;
  const deferring = sp.defer ? plan.items.find((i) => i.id === sp.defer) : undefined;
  const addEntity = sp.add ? entities.find((e) => e.id === sp.add) : undefined;
  const steps = [
    { label: "Drafted", on: true, sub: fmtDate(plan.createdAt) },
    { label: "Submitted for approval", on: !!plan.submittedAt, sub: plan.submittedAt ? fmtDate(plan.submittedAt) : "Not yet" },
    { label: "Approved", on: plan.status === "approved", sub: plan.approvedAt ? `${plan.approvedBy} · ${fmtDate(plan.approvedAt)}` : "Not yet" },
  ];

  return (
    <>
      <PageHeader
        title={`Audit plan ${year}`}
        sub="The audits you will do this year, chosen from the audit universe by risk and matched to the hours your team has."
        actions={
          <>
            <Pill p={PLAN_STATUS[plan.status]} className="self-center" />
            {manage && plan.status === "draft" && (
              <form action={submitPlan.bind(null, plan.id)}>
                <button className="btn-primary">Submit for approval</button>
              </form>
            )}
            {can(s, "admin") && plan.status !== "draft" && (
              <form action={reopenPlan.bind(null, plan.id)}>
                <button className="btn">Reopen as draft</button>
              </form>
            )}
          </>
        }
      />
      {yearTabs}

      <section className="card grid sm:grid-cols-3">
        {steps.map((st, i) => (
          <div key={st.label} className={clsx("flex gap-3 border-t-[3px] px-5 py-4", st.on ? "border-ok-dot" : i === steps.findIndex((x) => !x.on) ? "border-brand-600" : "border-line")}>
            <span className={clsx("mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold", st.on ? "bg-ok-dot text-white" : "bg-line-soft text-ink-500")}>{st.on ? <Check size={12} strokeWidth={3} aria-label="done" /> : i + 1}</span>
            <div>
              <p className="text-[13px] font-semibold">{st.label}</p>
              <p className="text-xs text-ink-500">{st.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {plan.status === "submitted" && can(s, "admin") && (
        <form action={approvePlan.bind(null, plan.id)} className="card flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-0 flex-[1_1_280px]">
            <label htmlFor="approvedBy" className="label">
              Approved by
            </label>
            <input id="approvedBy" name="approvedBy" required minLength={3} className="input" placeholder="e.g. Audit Committee, meeting of 12 February" />
          </div>
          <div>
            <label htmlFor="approvedAt" className="label">
              Date
            </label>
            <input id="approvedAt" name="approvedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
          </div>
          <button className="btn-primary">Record approval</button>
        </form>
      )}
      {plan.status === "approved" && <p className="text-[13px] text-ink-500">Changes to an approved plan are recorded in the activity log, so they can be reported to the audit committee.</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Audits" value={live.length} sub={`${started} started · ${completed} completed`} />
        <Stat label="Hours planned" value={hours.toLocaleString("en-US")} sub={plan.capacityHours ? `of ${plan.capacityHours.toLocaleString("en-US")} available` : "Set the team's capacity below"} />
        <Stat label="Team utilisation" value={util === null ? "—" : `${util}%`} sub="Aim for 85–95%" tone={util !== null && (util > 100 ? "red" : util < 70 ? "amber" : undefined) || undefined} />
        <Stat label="Critical areas due, covered" value={`${crit.covered} of ${crit.total}`} tone={crit.covered < crit.total ? "red" : undefined} sub={crit.covered < crit.total ? "Some are not in the plan" : "All covered"} />
        <Stat label="High areas due, covered" value={`${high.covered} of ${high.total}`} tone={high.covered < high.total ? "amber" : undefined} sub={high.covered < high.total ? "Some are not in the plan" : "All covered"} />
      </div>

      {missing.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">Due in {year} but not in the plan</h2>
              <p className="text-xs text-ink-500">From the audit universe, by each area&apos;s cycle and last audit.</p>
            </div>
            {manage && (
              <form action={addDue.bind(null, plan.id)} className="ml-auto">
                <button className="btn-primary">Add all {missing.length} to the plan</button>
              </form>
            )}
          </div>
          <ul className="flex flex-wrap gap-2 px-5 py-4">
            {missing.slice(0, 16).map((e) => (
              <li key={e.id}>
                <Link href={`/plan?year=${year}&add=${e.id}#add`} className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] hover:border-brand-600">
                  <Pill p={BAND_PILL[band(e.impact * e.likelihood)]} />
                  {e.name}
                </Link>
              </li>
            ))}
            {missing.length > 16 && <li className="self-center text-[13px] text-ink-500">and {missing.length - 16} more</li>}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">Timeline</h2>
          <span className="text-xs text-ink-500">{plan.items.length} audits</span>
          {manage && (
            <form action={setCapacity.bind(null, plan.id)} className="ml-auto flex items-center gap-2">
              <label htmlFor="cap" className="text-xs text-ink-500">
                Team capacity (hours)
              </label>
              <input id="cap" name="capacityHours" type="number" min={0} defaultValue={plan.capacityHours} className="input h-8 w-28" />
              <button className="btn btn-sm">Save</button>
            </form>
          )}
        </div>
        {plan.items.length === 0 ? (
          <Empty title="No audits in this plan yet">Add the areas due from the universe, or add audits below.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[300px_repeat(12,minmax(0,1fr))] bg-[#F8FAFB] text-[11px] font-semibold text-ink-500">
                <div className="px-5 py-2">Audit</div>
                {MONTHS.map((m) => (
                  <div key={m} className="border-l border-line-soft py-2 text-center">
                    {m}
                  </div>
                ))}
              </div>
              {plan.items.map((i) => {
                const off = i.status === "deferred" || i.status === "cancelled";
                return (
                  <div key={i.id} className="grid grid-cols-[300px_repeat(12,minmax(0,1fr))] items-center border-t border-line-soft">
                    <div className="min-w-0 px-5 py-2">
                      <p className={clsx("truncate text-[13px] font-medium", off && "text-ink-400 line-through")}>{i.title}</p>
                      <p className="truncate text-[11px] text-ink-500">
                        {kindLabel(i.kind)} · {i.lead?.name ?? "No lead"} · {i.hours} h
                      </p>
                    </div>
                    <div style={{ gridColumn: `${i.startMonth + 1} / ${i.endMonth + 2}` }} className="px-0.5">
                      <div
                        title={`${i.title}: ${MONTHS[i.startMonth - 1]}–${MONTHS[i.endMonth - 1]}, ${i.hours} h`}
                        className={clsx(
                          "truncate rounded-md px-2 py-1 text-[11px] font-semibold",
                          off ? "border border-dashed border-line-strong text-ink-400" : i.status === "completed" ? "bg-ok-dot text-white" : i.kind === "advisory" ? "border border-dashed border-brand-600 bg-brand-100 text-brand-800" : "bg-brand-600 text-white",
                        )}
                      >
                        {i.engagement?.code ?? (i.entity ? BAND_PILL[band(i.entity.impact * i.entity.likelihood)].label : kindLabel(i.kind))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {plan.items.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Audits in the plan</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Audit</th>
                  <th className="th">Risk</th>
                  <th className="th">Lead</th>
                  <th className="th">Timing</th>
                  <th className="th text-right">Hours</th>
                  <th className="th">Status</th>
                  {manage && <th className="th">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i) => (
                  <tr key={i.id} className="border-t border-line-soft">
                    <td className="td">
                      <span className="font-medium">{i.title}</span>
                      <div className="text-[11px] text-ink-500">
                        {kindLabel(i.kind)}
                        {i.entity && (
                          <>
                            {" · "}
                            <Link href={`/universe/${i.entity.id}`} className="font-mono">
                              {i.entity.code}
                            </Link>
                          </>
                        )}
                        {i.note && ` · ${i.note}`}
                      </div>
                    </td>
                    <td className="td">{i.entity ? <Pill p={BAND_PILL[band(i.entity.impact * i.entity.likelihood)]} /> : <span className="text-ink-400">—</span>}</td>
                    <td className="td">{i.lead?.name ?? "—"}</td>
                    <td className="td whitespace-nowrap">
                      {MONTHS[i.startMonth - 1]}
                      {i.endMonth !== i.startMonth && `–${MONTHS[i.endMonth - 1]}`}
                    </td>
                    <td className="td tabular text-right">
                      {i.engagement ? (
                        <span className={clsx(i.engagement.actualHours > i.hours && "text-high-fg")}>
                          {i.engagement.actualHours} / {i.hours}
                        </span>
                      ) : (
                        i.hours
                      )}
                    </td>
                    <td className="td">
                      {i.engagement ? (
                        <Link href={`/engagements/${i.engagement.id}`} className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-[11px]">{i.engagement.code}</span>
                          <Pill p={PHASE_PILL[i.engagement.phase]} />
                        </Link>
                      ) : (
                        <Pill p={ITEM_STATUS[i.status]} />
                      )}
                    </td>
                    {manage && (
                      <td className="td">
                        <div className="flex flex-wrap gap-1.5">
                          {i.status === "planned" && !i.engagement && (
                            <form action={startItem.bind(null, i.id)}>
                              <button className="btn btn-sm border-brand-600 text-brand-800">Start audit</button>
                            </form>
                          )}
                          {!i.engagement && (
                            <Link href={`/plan?year=${year}&edit=${i.id}#add`} className="btn btn-sm">
                              Edit
                            </Link>
                          )}
                          {i.status === "planned" && !i.engagement && (
                            <Link href={`/plan?year=${year}&defer=${i.id}#defer`} className="btn btn-sm">
                              Defer or cancel
                            </Link>
                          )}
                          {(i.status === "deferred" || i.status === "cancelled") && (
                            <form action={setItemStatus.bind(null, i.id, "planned", undefined)}>
                              <button className="btn btn-sm">Restore</button>
                            </form>
                          )}
                          {plan.status === "draft" && !i.engagement && (
                            <form action={removeItem.bind(null, i.id)}>
                              <button className="btn btn-sm text-high-fg">Remove</button>
                            </form>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {manage && deferring && (
        <section id="defer" className="card flex flex-col gap-3 p-5">
          <h2 className="text-[15px] font-semibold">Defer or cancel: {deferring.title}</h2>
          <form className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-[1_1_360px]">
              <label htmlFor="note" className="label">
                Reason (shown to the audit committee)
              </label>
              <input id="note" name="note" required className="input" placeholder="e.g. System replaced in Q3; audit after go-live" />
            </div>
            <button formAction={setItemStatus.bind(null, deferring.id, "deferred")} className="btn">
              Defer to next year
            </button>
            <button formAction={setItemStatus.bind(null, deferring.id, "cancelled")} className="btn text-high-fg">
              Cancel
            </button>
            <Link href={`/plan?year=${year}`} className="btn">
              Back
            </Link>
          </form>
        </section>
      )}

      {manage && (
        <section id="add" className="card flex flex-col gap-4 p-5">
          <h2 className="text-[15px] font-semibold">{editing ? `Edit: ${editing.title}` : "Add an audit to the plan"}</h2>
          <form action={editing ? updateItem.bind(null, editing.id) : addItem.bind(null, plan.id)} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!editing && (
              <div className="sm:col-span-2">
                <label htmlFor="entityId" className="label">
                  Area from the audit universe
                </label>
                <select id="entityId" name="entityId" defaultValue={addEntity?.id ?? ""} className="input">
                  <option value="">None (an audit not in the universe)</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} · {e.name}
                      {e.client ? ` (${e.client.name})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={editing ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2"}>
              <label htmlFor="title" className="label">
                Title {editing ? "" : "(leave empty to use the area's name)"}
              </label>
              <input id="title" name="title" defaultValue={editing?.title ?? ""} className="input" placeholder="e.g. Procure-to-pay" />
            </div>
            <div>
              <label htmlFor="kind" className="label">
                Type
              </label>
              <select id="kind" name="kind" defaultValue={editing?.kind ?? "assurance"} className="input">
                {PLAN_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="leadId" className="label">
                Lead
              </label>
              <select id="leadId" name="leadId" defaultValue={editing?.leadId ?? ""} className="input">
                <option value="">Not assigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hours" className="label">
                Hours
              </label>
              <input id="hours" name="hours" type="number" min={0} defaultValue={editing?.hours ?? 200} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="startMonth" className="label">
                  From
                </label>
                <select id="startMonth" name="startMonth" defaultValue={editing?.startMonth ?? 1} className="input">
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="endMonth" className="label">
                  To
                </label>
                <select id="endMonth" name="endMonth" defaultValue={editing?.endMonth ?? 2} className="input">
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="btn-primary">{editing ? "Save" : "Add to plan"}</button>
              {editing && (
                <Link href={`/plan?year=${year}`} className="btn">
                  Cancel
                </Link>
              )}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

const chip = (on: boolean) => clsx("flex h-9 items-center rounded-full border px-3.5 text-[13px]", on ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas");
