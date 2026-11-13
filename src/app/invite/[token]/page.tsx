import bcrypt from "bcryptjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ROLES } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { MIN_PASSWORD, emailTaken, startSession } from "@/lib/server/signin";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

async function openInvite(token: string) {
  const i = await db.invite.findUnique({ where: { token }, include: { org: { select: { name: true } } } });
  return i && !i.acceptedAt && !i.revokedAt && i.expiresAt > new Date() ? i : null;
}

async function accept(token: string, form: FormData) {
  "use server";
  const i = await openInvite(token);
  if (!i) redirect(`/invite/${token}`);
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (name.length < 2) redirect(`/invite/${token}?error=name`);
  if (password.length < MIN_PASSWORD) redirect(`/invite/${token}?error=password`);
  if (await emailTaken(i.email)) redirect(`/invite/${token}?error=taken`);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.$transaction(async (tx) => {
    // claim the invitation first, so the same link can't make two accounts
    const claimed = await tx.invite.updateMany({ where: { id: i.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count !== 1) return null;
    const u = await tx.user.create({ data: { orgId: i.orgId, email: i.email, name: name.slice(0, 80), title: String(form.get("title") ?? "").trim().slice(0, 80) || i.title, role: i.role, passwordHash, guestUntil: i.role === "GUEST" ? i.guestUntil : null } });
    // a guest sees only the engagements they were invited to
    if (i.role === "GUEST") {
      const ids = ((i.engagementIds as string[] | null) ?? []).filter((x) => typeof x === "string");
      const own = await tx.engagement.findMany({ where: { orgId: i.orgId, id: { in: ids } }, select: { id: true } });
      await tx.guestAccess.createMany({ data: own.map((e) => ({ userId: u.id, engagementId: e.id })) });
    }
    await tx.auditLog.create({ data: { orgId: i.orgId, actorName: u.name, action: "accepted invitation", entity: "user", entityId: u.id, detail: `invited by ${i.invitedBy} as ${i.role}` } });
    return u;
  });
  if (!user) redirect(`/invite/${token}`);
  await startSession(user, "joined");
  redirect(user.role === "GUEST" ? "/guest" : "/dashboard");
}

const ERRORS: Record<string, string> = {
  name: "Enter your name.",
  password: `Use a password of at least ${MIN_PASSWORD} characters.`,
  taken: "An account with this email already exists. Sign in instead.",
};

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const i = await openInvite(token);
  return (
    <AuthShell>
      {!i ? (
        <div className="flex max-w-sm flex-col gap-3">
          <h2 className="text-2xl font-semibold">This invitation can&apos;t be used</h2>
          <p className="text-sm text-ink-500">It has been used already, was withdrawn, or has expired. Ask your admin for a new one.</p>
          <Link href="/login" className="btn self-start">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form action={accept.bind(null, token)} className="flex w-full max-w-sm flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Join {i.org.name}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {i.invitedBy} invited you as {ROLES.find((r) => r.key === i.role)?.label.toLowerCase() ?? i.role}. You&apos;ll sign in with <strong className="text-ink">{i.email}</strong>.
            </p>
          </div>
          {error && ERRORS[error] && <p className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high-fg">{ERRORS[error]}</p>}
          <div>
            <label htmlFor="name" className="label">
              Your name
            </label>
            <input id="name" name="name" required minLength={2} defaultValue={i.name ?? ""} autoComplete="name" className="input" />
          </div>
          <div>
            <label htmlFor="title" className="label">
              Title
            </label>
            <input id="title" name="title" defaultValue={i.title ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Choose a password (at least {MIN_PASSWORD} characters)
            </label>
            <input id="password" name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
          </div>
          <button className="btn-primary h-11">Join</button>
        </form>
      )}
    </AuthShell>
  );
}
