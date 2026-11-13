import clsx from "clsx";
import { AlertCircle, Check, Clock, Lock, MessageSquare, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { REQUEST_PILL, fmtDate, fmtSize, isOverdue } from "@/lib/format";
import { db } from "@/lib/server/db";
import { addDocument } from "@/lib/server/documents";
import { fail } from "@/lib/server/flash";
import { notifyTeams } from "@/lib/server/m365";

export const metadata: Metadata = { title: "Auditee portal", robots: { index: false } };

async function link(token: string) {
  const l = await db.portalLink.findUnique({ where: { token }, include: { engagement: { include: { client: true, lead: { select: { name: true, title: true } } } } } });
  return l && !l.revokedAt ? l : null;
}

async function submit(token: string, requestId: string, form: FormData) {
  "use server";
  const l = await link(token);
  if (!l) return fail("This link is no longer active");
  const r = await db.evidenceRequest.findFirst({ where: { id: requestId, engagementId: l.engagementId } });
  if (!r || r.status === "accepted") return fail("This request is closed");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Choose at least one file");
  const note = String(form.get("note") ?? "").trim().slice(0, 2000) || null;
  await db.$transaction(
    async (tx) => {
      for (const file of files) {
        await addDocument(tx, {
          orgId: l.engagement.orgId,
          engagementId: l.engagementId,
          folder: "Correspondence / Client uploads",
          name: file.name,
          bytes: Buffer.from(await file.arrayBuffer()),
          linkRef: r.code,
          source: "client",
          uploadedBy: `${l.name} (auditee)`,
          requestId: r.id,
        });
      }
      await tx.evidenceRequest.update({ where: { id: r.id }, data: { status: "submitted", submittedAt: new Date(), clientNote: note } });
      await tx.auditLog.create({ data: { orgId: l.engagement.orgId, actorName: `${l.name} (auditee)`, action: "submitted evidence", entity: "request", entityId: r.id, detail: `${r.code}: ${files.length} file(s)` } });
    },
    { timeout: 60000 },
  );
  await notifyTeams(l.engagement.orgId, { title: `Evidence received: ${r.code} ${r.title}`, facts: [["Engagement", `${l.engagement.code} ${l.engagement.name}`], ["From", l.name], ["Files", String(files.length)]], path: `/engagements/${l.engagementId}?tab=requests` });
  revalidatePath(`/p/${token}`);
}

const ICON = { open: Clock, submitted: Check, needs_info: MessageSquare, accepted: Check, overdue: AlertCircle } as const;

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }) {
  const { token } = await params;
  const { r: selId } = await searchParams;
  const l = await link(token);
  if (!l) notFound();
  await db.portalLink.update({ where: { id: l.id }, data: { lastSeenAt: new Date() } });
  const requests = await db.evidenceRequest.findMany({ where: { engagementId: l.engagementId }, orderBy: { code: "asc" }, include: { documents: { orderBy: { createdAt: "desc" } } } });
  const state = (r: (typeof requests)[number]) => (isOverdue(r.dueDate, r.status === "accepted" || r.status === "submitted") ? "overdue" : (r.status as keyof typeof ICON));
  // overdue and sent-back requests first
  const order = { overdue: 0, needs_info: 1, open: 2, submitted: 3, accepted: 4 } as Record<string, number>;
  requests.sort((a, b) => order[state(a)] - order[state(b)]);
  const done = requests.filter((r) => r.status === "accepted").length;
  const overdue = requests.filter((r) => state(r) === "overdue").length;
  const sel = requests.find((r) => r.id === selId) ?? requests.find((r) => r.status !== "accepted" && r.status !== "submitted") ?? null;
  const e = l.engagement;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-3 bg-navy-950 px-7 text-white">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
            <rect width="30" height="30" rx="7" fill="#1F5FAE" />
            <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-bold">VektaAudit</span>
          <span className="border-l border-navy-600 pl-2.5 text-xs text-navy-300">Auditee portal</span>
        </div>
        <span className="ml-auto text-[13px] text-navy-200">
          {l.name}
          {l.title ? ` · ${l.title}` : ""}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 p-7">
        <section className="card flex flex-wrap items-center justify-between gap-5 px-6 py-5">
          <div className="flex flex-[1_1_360px] flex-col gap-1.5">
            <span className="text-[13px] text-ink-500">{e.kind === "financial" ? "Your auditors request information for" : "Internal Audit requests information for"}</span>
            <h1 className="text-[22px] font-semibold">
              {e.client ? `${e.client.name} — ` : ""}
              {e.name}
            </h1>
            <span className="text-[13px] text-ink-500">
              Your contact: {e.lead?.name ?? "the audit team"}
              {e.lead?.title ? `, ${e.lead.title}` : ""}
              {e.dueDate ? ` · Fieldwork closes ${fmtDate(e.dueDate)}` : ""}
            </span>
          </div>
          <div className="flex flex-[0_1_280px] flex-col gap-2">
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">
                {done} of {requests.length} requests complete
              </span>
              <span className="text-ink-500">{requests.length ? Math.round((done / requests.length) * 100) : 0}%</span>
            </div>
            <div className="h-2 rounded bg-[#E8EDF2]">
              <div className="h-2 rounded bg-ok-dot" style={{ width: `${requests.length ? (done / requests.length) * 100 : 0}%` }} />
            </div>
            {overdue > 0 && <span className="text-xs font-medium text-high-dot">{overdue === 1 ? "1 request is overdue" : `${overdue} requests are overdue`}</span>}
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-5">
          <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-2.5">
            <h2 className="mb-1 text-base font-semibold">Your requests</h2>
            {requests.length === 0 && <p className="text-sm text-ink-500">Nothing has been requested yet.</p>}
            {requests.map((r) => {
              const st = state(r);
              const I = ICON[st];
              const p = REQUEST_PILL[st];
              return (
                <Link
                  key={r.id}
                  href={`/p/${token}?r=${r.id}`}
                  scroll={false}
                  className={clsx("flex items-center gap-3 rounded-xl border bg-white px-4 py-3.5", sel?.id === r.id ? "border-brand-600 ring-[3px] ring-brand-200" : "border-line hover:border-line-strong")}
                >
                  <span className={clsx("flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full", p.cls)}>
                    <I size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[11px] text-ink-500">{r.code}</span>
                      <span className="text-sm font-medium">{r.title}</span>
                    </span>
                    <span className="text-xs text-ink-500">
                      {r.status === "accepted" ? `Accepted ${fmtDate(r.acceptedAt)}` : r.status === "needs_info" && r.auditorNote ? `Auditor asked: “${r.auditorNote}”` : r.status === "submitted" ? `Sent ${fmtDate(r.submittedAt)} · being reviewed` : `Due ${fmtDate(r.dueDate)}`}
                    </span>
                  </span>
                  <span className={clsx("pill", p.cls)}>{p.label}</span>
                </Link>
              );
            })}
          </section>

          {sel && (
            <aside className="card flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 p-5">
              <div>
                <span className="font-mono text-xs text-ink-500">{sel.code}</span>
                <h2 className="mt-0.5 text-[17px] font-semibold">{sel.title}</h2>
                {sel.dueDate && <p className={clsx("mt-1.5 text-[13px] font-medium", state(sel) === "overdue" ? "text-high-dot" : "text-ink-500")}>Due {fmtDate(sel.dueDate)}</p>}
              </div>
              {sel.detail && <p className="text-[13px] leading-relaxed text-ink-700">{sel.detail}</p>}
              {sel.status === "needs_info" && sel.auditorNote && <p className="rounded-lg bg-med-bg px-3 py-2 text-[13px] text-med-fg">The auditor asked for more: {sel.auditorNote}</p>}
              {sel.documents.length > 0 && (
                <ul className="flex flex-col gap-1.5 text-[13px]">
                  {sel.documents.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2 rounded-lg border border-line px-3 py-2">
                      <span className="truncate">{d.name}</span>
                      <span className="flex-none text-ink-500">{fmtSize(d.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {sel.status !== "accepted" && (
                <form action={submit.bind(null, token, sel.id)} className="flex flex-col gap-3">
                  <label htmlFor="files" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-6 text-center">
                    <Upload size={28} className="text-brand-600" aria-hidden />
                    <span className="text-sm font-medium">Choose files to send</span>
                    <span className="text-xs text-ink-500">PDF, Excel, CSV, images · up to 50 MB each</span>
                    <input id="files" name="files" type="file" multiple required className="mt-1 text-xs" />
                  </label>
                  <label htmlFor="note" className="label -mb-2">
                    Note to the auditor (optional)
                  </label>
                  <textarea id="note" name="note" rows={2} className="textarea" placeholder="e.g. Export covers all 3 company codes" />
                  <button className="btn-primary h-11">Send to auditor</button>
                </form>
              )}
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <Lock size={14} aria-hidden />
                Every upload is recorded in the audit trail.
              </p>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
