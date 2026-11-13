import clsx from "clsx";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { DECISIONS, DORMANT_DAYS, conflictsFor, daysSince } from "@/lib/itaudit";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/flash";

export const metadata: Metadata = { title: "Access review", robots: { index: false } };

const load = (token: string) =>
  db.accessList.findUnique({ where: { token }, include: { review: { include: { org: { select: { name: true } } } }, system: { include: { sodRules: true } }, entries: { orderBy: { account: "asc" } } } });

/** Saves every decision on the page at once; conflicts kept need a reason. */
async function decide(token: string, form: FormData) {
  "use server";
  const l = await load(token);
  if (!l || l.review.status !== "open") return fail("This access review has closed");
  if (l.submittedAt) return fail("You've already finished this review");
  const updates: { id: string; decision: string; comment: string | null }[] = [];
  for (const e of l.entries) {
    const d = String(form.get(`d_${e.id}`) ?? "");
    if (!DECISIONS.some((x) => x.key === d)) continue;
    const comment = String(form.get(`c_${e.id}`) ?? "").trim().slice(0, 500) || null;
    if (d === "keep" && conflictsFor(e.roles, l.system.sodRules).length && !comment) return fail(`${e.account} holds roles that conflict. Say why they need both, or choose change or remove.`);
    if (d === "change" && !comment) return fail(`Say which roles ${e.account} should have`);
    updates.push({ id: e.id, decision: d, comment });
  }
  const finish = form.get("finish") === "1";
  if (finish && updates.length < l.entries.length) return fail("Decide every account before finishing");
  await db.$transaction(async (tx) => {
    for (const u of updates) {
      const before = l.entries.find((e) => e.id === u.id)!;
      if (before.decision !== u.decision || before.comment !== u.comment) await tx.accessEntry.update({ where: { id: u.id }, data: { decision: u.decision, comment: u.comment, decidedAt: new Date() } });
    }
    if (finish) await tx.accessList.update({ where: { id: l.id }, data: { submittedAt: new Date() } });
    await tx.auditLog.create({
      data: { orgId: l.review.orgId, actorName: `${l.ownerName} (system owner)`, action: finish ? "finished access review" : "saved access review decisions", entity: "accessreview", entityId: l.reviewId, detail: `${l.system.name}: ${updates.length} decisions, ${updates.filter((u) => u.decision === "remove").length} removals` },
    });
  });
  revalidatePath(`/ar/${token}`);
}

export default async function OwnerReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const l = await load(token);
  if (!l) notFound();
  await db.accessList.update({ where: { id: l.id }, data: { lastSeenAt: new Date() } });
  const open = l.review.status === "open" && !l.submittedAt;
  const decided = l.entries.filter((e) => e.decision).length;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy-950 px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true">
            <rect width="30" height="30" rx="7" fill="#1F5FAE" />
            <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{l.review.org.name} · Internal audit</p>
            <p className="text-xs text-navy-300">User access review</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-navy-300">
            <Lock size={13} aria-hidden /> Private link
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8 sm:px-8">
        <div>
          <h1 className="text-2xl font-semibold">Who should have access to {l.system.name}?</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-700">
            Hello {l.ownerName}. As the system&apos;s owner, please confirm for each account below whether the person still needs this access. Choose <strong>Remove</strong> for leavers and people who no longer need it, and <strong>Change roles</strong> if they need less.
            {l.review.dueDate && (
              <>
                {" "}
                Please finish by <strong>{fmtDate(l.review.dueDate)}</strong>.
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-ink-500">
            {decided} of {l.entries.length} decided. Accounts highlighted in red hold roles that shouldn&apos;t be combined; keeping them needs a reason.
          </p>
        </div>
        {!open && <p className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok-fg">{l.submittedAt ? `Thank you. You finished this review on ${fmtDate(l.submittedAt)}.` : "This review has closed."}</p>}
        {l.entries.length === 0 ? (
          <p className="card p-5 text-sm text-ink-500">Internal audit hasn&apos;t loaded the user list yet. Please check back later.</p>
        ) : (
          <form action={decide.bind(null, token)} className="flex flex-col gap-3">
            {l.entries.map((e) => {
              const conflicts = conflictsFor(e.roles, l.system.sodRules);
              const days = daysSince(e.lastLogin);
              return (
                <fieldset key={e.id} disabled={!open} className={clsx("card grid gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]", conflicts.length > 0 && "border-[#F3B8B0] bg-high-bg/30")}>
                  <legend className="sr-only">{e.account}</legend>
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[14px] font-semibold">
                      {e.person ?? e.account}
                      {e.person && <span className="ml-1.5 font-mono text-[12px] font-normal text-ink-500">{e.account}</span>}
                    </p>
                    <p className="text-ink-500">{[e.department, e.lastLogin ? `last signed in ${e.lastLogin}${days !== null && days >= DORMANT_DAYS ? ` (${days} days ago)` : ""}` : null].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1">Roles: {e.roles}</p>
                    {conflicts.map((c) => (
                      <p key={c.roleA + c.roleB} className="mt-1 font-medium text-high-fg">
                        {c.roleA} and {c.roleB} shouldn&apos;t be held together{c.description ? `: ${c.description}` : ""}.
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {DECISIONS.map((d) => (
                        <label key={d.key} className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-2.5 py-1.5 text-[13px] has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                          <input type="radio" name={`d_${e.id}`} value={d.key} defaultChecked={e.decision === d.key} />
                          {d.label}
                        </label>
                      ))}
                    </div>
                    <label htmlFor={`c_${e.id}`} className="sr-only">
                      Comment for {e.account}
                    </label>
                    <input id={`c_${e.id}`} name={`c_${e.id}`} defaultValue={e.comment ?? ""} className="input h-9 text-[13px]" placeholder={conflicts.length ? "Why they need both roles (needed to keep)" : "Comment (needed for Change roles)"} />
                  </div>
                </fieldset>
              );
            })}
            {open && (
              <div className="card sticky bottom-3 flex flex-wrap items-center gap-3 p-4 shadow-lg">
                <p className="min-w-0 flex-1 text-sm">Save as you go. When every account is decided, finish to tell internal audit and IT.</p>
                <button className="btn">Save</button>
                <button name="finish" value="1" className="btn-primary">
                  Save and finish
                </button>
              </div>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
