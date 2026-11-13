import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/ui";
import { VALIDATION, answerOf } from "@/lib/csa";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { can, requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { DirectoryInput } from "@/components/DirectoryInput";
import { emailOwners, newLink, setCampaignStatus, setOwnerEmail, validateItem } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await db.csaCampaign.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: c?.title ?? "Self-assessment" };
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const s = await requireUser();
  const { show = "all" } = await searchParams;
  const c = await db.csaCampaign.findFirst({
    where: { id: (await params).id, orgId: s.org },
    include: {
      requests: {
        orderBy: { ownerName: "asc" },
        include: { items: { include: { control: { select: { id: true, code: true, title: true, process: true, key: true } }, documents: { select: { id: true, name: true } } }, orderBy: { control: { code: "asc" } } } },
      },
    },
  });
  if (!c) notFound();
  const manage = can(s, "manage");
  const work = can(s, "work");
  const org = await db.organization.findUniqueOrThrow({ where: { id: s.org }, select: { msTenantId: true, msMailbox: true } });
  const canMail = !!(org.msTenantId && org.msMailbox);
  const unsent = c.requests.filter((r) => r.ownerEmail && !r.emailedAt && !r.submittedAt).length;
  const pending = c.requests.filter((r) => r.ownerEmail && r.emailedAt && !r.submittedAt).length;
  const appUrl = process.env.APP_URL ?? "http://localhost:3400";
  const items = c.requests.flatMap((r) => r.items.map((i) => ({ ...i, owner: r.ownerName })));
  const answered = items.filter((i) => i.answer);
  const notWorking = answered.filter((i) => i.answer !== "effective");
  const validated = items.filter((i) => i.validation);
  const shown = items.filter((i) => (show === "issues" ? i.answer && i.answer !== "effective" : show === "pending" ? !i.answer : show === "unvalidated" ? i.answer && !i.validation : true));
  const tab = (k: string, label: string, n: number) => (
    <Link href={`/self-assessment/${c.id}?show=${k}`} className={clsx("flex h-9 items-center rounded-full border px-3.5 text-[13px]", show === k ? "border-navy-950 bg-navy-950 font-medium text-white" : "border-line-strong bg-white hover:bg-canvas")}>
      {label} <span className="ml-1.5 opacity-70">{n}</span>
    </Link>
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5 text-[13px] text-ink-500">
        <Link href="/self-assessment" className="hover:text-ink">
          Self-assessment
        </Link>
        <span aria-hidden>/</span>
        <span>{c.title}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{c.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {[c.period, c.dueDate ? `Answers due ${fmtDate(c.dueDate)}` : null, `Started by ${c.createdBy}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {canMail && c.status === "open" && unsent > 0 && (
              <form action={emailOwners.bind(null, c.id, false)}>
                <button className="btn-primary">Email links to {unsent} owner{unsent === 1 ? "" : "s"}</button>
              </form>
            )}
            {canMail && c.status === "open" && pending > 0 && (
              <form action={emailOwners.bind(null, c.id, true)}>
                <button className="btn">Remind {pending} who haven&apos;t finished</button>
              </form>
            )}
            <form action={setCampaignStatus.bind(null, c.id, c.status === "open" ? "closed" : "open")}>
              <button className="btn">{c.status === "open" ? "Close campaign" : "Reopen"}</button>
            </form>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Controls" value={items.length} sub={`${c.requests.length} owners`} />
        <Stat label="Answered" value={items.length ? `${Math.round((answered.length / items.length) * 100)}%` : "—"} sub={`${answered.length} of ${items.length}`} />
        <Stat label="Owners say not fully working" value={notWorking.length} tone={notWorking.length ? "red" : undefined} sub="Partly or no" />
        <Stat label="Checked by audit" value={validated.length} sub={`${answered.length - validated.length} answers to check`} />
        <Stat label="Audit disagrees" value={validated.filter((i) => i.validation === "disagree").length} tone={validated.some((i) => i.validation === "disagree") ? "red" : undefined} />
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-line-soft px-5 py-4 text-[15px] font-semibold">Owners and their links</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="bg-[#F8FAFB]">
              <tr>
                <th className="th">Owner</th>
                <th className="th">Answered</th>
                <th className="th">Link to send</th>
                <th className="th">Email</th>
                <th className="th">Last opened</th>
              </tr>
            </thead>
            <tbody>
              {c.requests.map((r) => {
                const a = r.items.filter((i) => i.answer).length;
                return (
                  <tr key={r.id} className="border-t border-line-soft align-top">
                    <td className="td font-medium">
                      {r.ownerName}
                      {r.submittedAt && <div className="text-[11px] font-normal text-ok-fg">Finished {fmtDate(r.submittedAt)}</div>}
                    </td>
                    <td className="td tabular">
                      {a} of {r.items.length}
                    </td>
                    <td className="td">
                      {c.status === "open" ? (
                        <div className="flex items-center gap-1.5">
                          <input readOnly value={`${appUrl}/sa/${r.token}`} aria-label={`Link for ${r.ownerName}`} className="input h-8 w-72 font-mono text-[11px]" />
                          {manage && (
                            <form action={newLink.bind(null, r.id)}>
                              <button className="btn btn-sm" title="Make a new link; the old one stops working">
                                New link
                              </button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-500">Closed</span>
                      )}
                    </td>
                    <td className="td">
                      {manage ? (
                        <form action={setOwnerEmail.bind(null, r.id)} className="flex gap-1.5">
                          <label htmlFor={`em-${r.id}`} className="sr-only">
                            Email for {r.ownerName}
                          </label>
                          <div className="w-60">
                            <DirectoryInput id={`em-${r.id}`} name="email" defaultValue={r.ownerEmail} enabled={!!org.msTenantId} className="input h-8 text-[12px]" placeholder={org.msTenantId ? "Search directory or type email" : "name@company.com"} />
                          </div>
                          <button className="btn btn-sm">Save</button>
                        </form>
                      ) : (
                        (r.ownerEmail ?? "—")
                      )}
                    </td>
                    <td className="td text-ink-500">
                      {r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : "Not yet"}
                      {r.emailedAt && <div className="text-[11px]">Emailed {fmtDate(r.emailedAt)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {tab("all", "All answers", items.length)}
        {tab("issues", "Not fully working", notWorking.length)}
        {tab("unvalidated", "To check", answered.length - validated.length)}
        {tab("pending", "Not answered", items.length - answered.length)}
      </div>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[13px]">
            <thead className="bg-[#F8FAFB]">
              <tr>
                <th className="th w-[30%]">Control</th>
                <th className="th">Owner&apos;s answer</th>
                <th className="th">Evidence</th>
                <th className="th w-[30%]">Audit check</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const ans = answerOf(i.answer);
                return (
                  <tr key={i.id} className="border-t border-line-soft align-top">
                    <td className="td">
                      <Link href={`/controls/${i.control.id}`} className="font-medium hover:text-brand-700">
                        {i.control.title}
                      </Link>
                      <div className="text-[11px] text-ink-500">
                        <span className="font-mono">{i.control.code}</span> · {i.control.process} · {i.owner}
                      </div>
                    </td>
                    <td className="td">
                      {ans ? <span className={clsx("pill", ans.cls)}>{ans.label}</span> : <span className="text-ink-400">Not answered</span>}
                      {i.comment && <p className="mt-1.5 whitespace-pre-wrap text-ink-700">{i.comment}</p>}
                    </td>
                    <td className="td">
                      {i.documents.length === 0 ? (
                        <span className="text-ink-400">—</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {i.documents.map((d) => (
                            <li key={d.id}>
                              <a href={`/api/files/${d.id}`} className="text-[12px]">
                                {d.name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="td">
                      {i.validation ? (
                        <div>
                          <span className={clsx("pill", VALIDATION[i.validation].cls)}>{VALIDATION[i.validation].label}</span>
                          <p className="mt-1 text-[11px] text-ink-500">
                            {i.validatedBy}, {fmtDate(i.validatedAt)}
                          </p>
                          {i.validationNote && <p className="mt-1 text-ink-700">{i.validationNote}</p>}
                        </div>
                      ) : i.answer && work ? (
                        <form action={validateItem.bind(null, i.id)} className="flex flex-col gap-1.5">
                          <label htmlFor={`vn-${i.id}`} className="sr-only">
                            Note
                          </label>
                          <input id={`vn-${i.id}`} name="note" className="input h-8 text-[12px]" placeholder="Note (needed if you disagree)" />
                          <div className="flex gap-1.5">
                            <button name="validation" value="agree" className="btn btn-sm">
                              Agree
                            </button>
                            <button name="validation" value="disagree" className="btn btn-sm text-high-fg">
                              Disagree
                            </button>
                          </div>
                        </form>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
