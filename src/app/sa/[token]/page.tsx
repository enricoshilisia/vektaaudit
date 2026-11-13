import clsx from "clsx";
import { Check, Lock } from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { ANSWERS, answerOf } from "@/lib/csa";
import { fmtDate } from "@/lib/format";
import { db } from "@/lib/server/db";
import { addDocument } from "@/lib/server/documents";
import { fail } from "@/lib/server/flash";

export const metadata: Metadata = { title: "Control self-assessment", robots: { index: false } };

async function load(token: string) {
  return db.csaRequest.findUnique({
    where: { token },
    include: {
      campaign: { include: { org: { select: { name: true } } } },
      items: { orderBy: { control: { code: "asc" } }, include: { control: true, documents: { select: { id: true, name: true } } } },
    },
  });
}

async function answer(token: string, itemId: string, form: FormData) {
  "use server";
  const r = await load(token);
  if (!r) return fail("This link is no longer active");
  if (r.campaign.status !== "open") return fail("This self-assessment has closed");
  const item = r.items.find((i) => i.id === itemId);
  if (!item) return fail("Control not found");
  if (item.validation) return fail("Audit has already checked this answer");
  const a = String(form.get("answer") ?? "");
  if (!ANSWERS.some((x) => x.key === a)) return fail("Choose an answer");
  const comment = String(form.get("comment") ?? "").trim().slice(0, 4000) || null;
  if (a !== "effective" && !comment) return fail("Explain what happened, and what you are doing about it");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  await db.$transaction(
    async (tx) => {
      for (const file of files) {
        const d = await addDocument(tx, {
          orgId: r.campaign.orgId,
          engagementId: null,
          folder: `Self-assessment / ${r.campaign.title}`,
          name: file.name,
          bytes: Buffer.from(await file.arrayBuffer()),
          linkRef: item.control.code,
          source: "client",
          uploadedBy: `${r.ownerName} (control owner)`,
        });
        await tx.document.update({ where: { id: d.id }, data: { csaItemId: item.id } });
      }
      await tx.csaItem.update({ where: { id: item.id }, data: { answer: a, comment, respondedAt: new Date() } });
      await tx.auditLog.create({ data: { orgId: r.campaign.orgId, actorName: `${r.ownerName} (control owner)`, action: "answered self-assessment", entity: "csa", entityId: r.campaignId, detail: `${item.control.code}: ${answerOf(a)?.label}` } });
    },
    { timeout: 60000 },
  );
  revalidatePath(`/sa/${token}`);
}

async function finish(token: string) {
  "use server";
  const r = await load(token);
  if (!r || r.campaign.status !== "open") return fail("This self-assessment has closed");
  if (r.items.some((i) => !i.answer)) return fail("Answer every control first");
  await db.csaRequest.update({ where: { id: r.id }, data: { submittedAt: new Date() } });
  revalidatePath(`/sa/${token}`);
}

export default async function OwnerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await load(token);
  if (!r) notFound();
  await db.csaRequest.update({ where: { id: r.id }, data: { lastSeenAt: new Date() } });
  const open = r.campaign.status === "open";
  const done = r.items.filter((i) => i.answer).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy-950 px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
            <rect width="30" height="30" rx="7" fill="#1F5FAE" />
            <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{r.campaign.org.name} · Internal audit</p>
            <p className="text-xs text-navy-300">Control self-assessment</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-navy-300">
            <Lock size={13} aria-hidden /> Private link
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Hello {r.ownerName}</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-700">
            Internal audit is asking control owners to confirm that their controls worked during {r.campaign.period ?? "the period"}. For each control below, say whether it was done as described, explain any gaps, and attach evidence such as a signed report or a screenshot.
            {r.campaign.dueDate && (
              <>
                {" "}
                Please answer by <strong>{fmtDate(r.campaign.dueDate)}</strong>.
              </>
            )}
          </p>
          <p className="mt-3 text-sm text-ink-500">
            {done} of {r.items.length} answered
          </p>
        </div>
        {!open && <p className="rounded-lg bg-line-soft px-4 py-3 text-sm">This self-assessment has closed. Your answers are shown below.</p>}

        {r.items.map((i, n) => {
          const ans = answerOf(i.answer);
          const editable = open && !i.validation;
          return (
            <section key={i.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800">{n + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-500">
                    {i.control.process} · <span className="font-mono">{i.control.code}</span>
                  </p>
                  <h2 className="mt-0.5 text-[16px] font-semibold leading-snug">{i.control.title}</h2>
                  {i.control.detail && <p className="mt-1 text-sm text-ink-500">{i.control.detail}</p>}
                </div>
                {ans && (
                  <span className={clsx("pill", ans.cls)}>
                    <Check size={12} aria-hidden /> {ans.label}
                  </span>
                )}
              </div>
              {editable ? (
                <form action={answer.bind(null, token, i.id)} className="mt-4 flex flex-col gap-3">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Was this control done as described, every time it should have been?</legend>
                    <div className="flex flex-wrap gap-2">
                      {ANSWERS.map((a) => (
                        <label key={a.key} className="flex items-center gap-2 rounded-lg border border-line-strong bg-white px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                          <input type="radio" name="answer" value={a.key} defaultChecked={i.answer === a.key} required />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <label htmlFor={`c-${i.id}`} className="label">
                      Comment (needed if the answer is Partly or No)
                    </label>
                    <textarea id={`c-${i.id}`} name="comment" rows={3} defaultValue={i.comment ?? ""} className="textarea" placeholder="What was done, any exceptions, and what you are doing about them" />
                  </div>
                  <div>
                    <label htmlFor={`f-${i.id}`} className="label">
                      Evidence (optional)
                    </label>
                    <input id={`f-${i.id}`} name="files" type="file" multiple className="block text-sm" />
                    {i.documents.length > 0 && <p className="mt-1 text-xs text-ink-500">Already attached: {i.documents.map((d) => d.name).join(", ")}</p>}
                  </div>
                  <button className="btn-primary self-start">{i.answer ? "Update answer" : "Save answer"}</button>
                </form>
              ) : (
                <div className="mt-3 text-sm">
                  {i.comment && <p className="whitespace-pre-wrap text-ink-700">{i.comment}</p>}
                  {i.validation && <p className="mt-2 text-xs text-ink-500">Checked by internal audit.</p>}
                </div>
              )}
            </section>
          );
        })}

        {open &&
          (r.submittedAt ? (
            <p className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok-fg">Thank you. You told internal audit you finished on {fmtDate(r.submittedAt)}. You can still change answers until audit checks them.</p>
          ) : (
            <form action={finish.bind(null, token)} className="card flex flex-wrap items-center gap-3 p-5">
              <p className="min-w-0 flex-1 text-sm">When every control is answered, let internal audit know you are done.</p>
              <button className="btn-primary" disabled={done < r.items.length}>
                I&apos;ve finished
              </button>
            </form>
          ))}
      </main>
    </div>
  );
}
