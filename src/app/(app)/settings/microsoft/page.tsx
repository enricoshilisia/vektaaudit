import clsx from "clsx";
import { Check, X } from "lucide-react";
import type { Metadata } from "next";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { PERMISSIONS, appUrl, grantedPermissions, msConfigured, redirectUris } from "@/lib/server/microsoft";
import { disconnect, saveAutoReminders, saveMailbox, saveSharePoint, saveTeams, testMail, testSharePoint, testTeams } from "./actions";

export const metadata: Metadata = { title: "Microsoft 365" };

export default async function MicrosoftPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const s = await requireUser("admin");
  const { error, connected } = await searchParams;
  const o = await db.organization.findUniqueOrThrow({ where: { id: s.org } });
  const configured = msConfigured();
  let granted: string[] | null = null;
  let grantError: string | null = null;
  if (o.msTenantId) {
    try {
      granted = await grantedPermissions(o.msTenantId);
    } catch (e) {
      grantError = (e as Error).message;
    }
  }
  const has = (p: string) => granted?.includes(p) ?? false;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {error && <p className="rounded-lg bg-high-bg px-4 py-3 text-sm text-high-fg">{error}</p>}
      {connected && <p className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok-fg">Microsoft 365 is connected.</p>}

      <section className="card flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
            <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
            <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
            <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
            <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
          </svg>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold">Microsoft 365</h2>
            <p className="mt-1 text-[13px] text-ink-500">Sign in with Microsoft, pick people from your directory, send audit email from your own mailbox, put bookings in Outlook calendars, save reports to SharePoint and post updates to a Teams channel.</p>
          </div>
          {o.msTenantId ? <span className="pill bg-ok-bg text-ok-fg">Connected</span> : <span className="pill bg-line-soft text-ink-700">Not connected</span>}
        </div>

        {!configured ? (
          <SetupGuide />
        ) : o.msTenantId ? (
          <>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[13px]">
              <dt className="text-ink-500">Organisation</dt>
              <dd>{o.msTenantName ?? "—"}</dd>
              <dt className="text-ink-500">Tenant ID</dt>
              <dd className="font-mono text-[12px]">{o.msTenantId}</dd>
              <dt className="text-ink-500">Connected</dt>
              <dd>
                {fmtDate(o.msConnectedAt)} by {o.msConnectedBy}
              </dd>
            </dl>
            <div>
              <p className="label">What your Microsoft admin approved</p>
              {grantError ? (
                <p className="rounded-lg bg-high-bg px-3 py-2 text-[13px] text-high-fg">{grantError}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {PERMISSIONS.map((p) => (
                    <li key={p.name} className="flex items-start gap-2 text-[13px]">
                      {has(p.name) ? <Check size={16} className="mt-0.5 flex-none text-ok-dot" aria-label="Approved" /> : <X size={16} className="mt-0.5 flex-none text-high-dot" aria-label="Not approved" />}
                      <span>
                        <span className="font-mono text-[12px]">{p.name}</span> · {p.why}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/api/microsoft/connect" className="btn">
                Approve again (after adding permissions)
              </a>
              <form action={disconnect}>
                <button className="btn text-high-fg">Disconnect</button>
              </form>
            </div>
            <p className="text-xs text-ink-500">
              Staff can now use <strong>Sign in with Microsoft</strong> on the sign-in page. They still need to be invited to VektaAudit first; their Microsoft email must match their VektaAudit email.
            </p>
          </>
        ) : (
          <>
            <p className="text-[13px]">A Microsoft 365 global administrator in your organisation approves VektaAudit once. Microsoft shows them exactly what VektaAudit can do; they can remove it at any time in the Entra admin center.</p>
            <ul className="flex flex-col gap-1 text-[13px] text-ink-700">
              {PERMISSIONS.map((p) => (
                <li key={p.name}>
                  · {p.why} <span className="font-mono text-[11px] text-ink-500">({p.name})</span>
                </li>
              ))}
            </ul>
            <a href="/api/microsoft/connect" className="btn-primary self-start">
              Connect Microsoft 365
            </a>
          </>
        )}
      </section>

      <section className={clsx("card flex flex-col gap-3 p-6", !o.msTenantId && "opacity-60")}>
        <h2 className="text-[15px] font-semibold">Outlook: the mailbox audit email comes from</h2>
        <p className="text-[13px] text-ink-500">Self-assessment links, evidence requests and reminders are sent from this mailbox, and copies stay in its Sent Items. A shared mailbox such as internal.audit@yourcompany.com works well.</p>
        <form action={saveMailbox} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_280px]">
            <label htmlFor="msMailbox" className="label">
              Mailbox
            </label>
            <input id="msMailbox" name="msMailbox" type="email" defaultValue={o.msMailbox ?? ""} className="input" placeholder="internal.audit@yourcompany.com" disabled={!o.msTenantId} />
          </div>
          <button className="btn" disabled={!o.msTenantId}>
            Save
          </button>
        </form>
        {o.msTenantId && o.msMailbox && (
          <form action={testMail}>
            <button className="btn btn-sm">Send me a test email</button>
          </form>
        )}
        <p className="text-xs text-ink-500">Your Exchange admin can limit VektaAudit to sending from this one mailbox with an application access policy.</p>
        <form action={saveAutoReminders} className="flex flex-col gap-2 rounded-lg border border-line p-4">
          <label className="flex items-start gap-2.5 text-[13px]">
            <input type="checkbox" name="autoReminders" defaultChecked={o.autoReminders} disabled={!o.msTenantId || !o.msMailbox} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="font-medium">Send reminders automatically every morning</span>
              <span className="block text-ink-500">Owners of overdue findings, once a week; self-assessment and access-review owners who haven&apos;t finished, every three days. Each one is recorded.</span>
            </span>
          </label>
          <button className="btn btn-sm self-start" disabled={!o.msTenantId || !o.msMailbox}>
            Save
          </button>
          {o.remindersRanAt && <p className="text-xs text-ink-500">Last checked {fmtDate(o.remindersRanAt)}.</p>}
        </form>
      </section>

      <section className={clsx("card flex flex-col gap-3 p-6", !o.msTenantId && "opacity-60")}>
        <h2 className="text-[15px] font-semibold">SharePoint: where reports are saved</h2>
        <p className="text-[13px] text-ink-500">Committee packs are saved to this site&apos;s Documents library, in the folder below.</p>
        <form action={saveSharePoint} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
          <div>
            <label htmlFor="spSiteUrl" className="label">
              Site address
            </label>
            <input id="spSiteUrl" name="spSiteUrl" defaultValue={o.spSiteUrl ?? ""} className="input" placeholder="https://yourcompany.sharepoint.com/sites/InternalAudit" disabled={!o.msTenantId} />
          </div>
          <div>
            <label htmlFor="spFolder" className="label">
              Folder
            </label>
            <input id="spFolder" name="spFolder" defaultValue={o.spFolder} className="input" disabled={!o.msTenantId} />
          </div>
          <button className="btn" disabled={!o.msTenantId}>
            Save
          </button>
        </form>
        {o.msTenantId && o.spSiteUrl && (
          <form action={testSharePoint}>
            <button className="btn btn-sm">Check the site</button>
          </form>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-6">
        <h2 className="text-[15px] font-semibold">Teams: the channel that gets updates</h2>
        <p className="text-[13px] text-ink-500">VektaAudit posts to one Teams channel when a plan is submitted or approved, a control test is waiting for review, a critical or high finding is raised, a committee pack is issued, or a client sends evidence. This works even without connecting Microsoft 365 above.</p>
        <details className="rounded-lg bg-canvas px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium">How to get the address</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Teams, open the channel, select ••• next to its name, then Workflows.</li>
            <li>Choose the template &quot;Post to a channel when a webhook request is received&quot;.</li>
            <li>Name it VektaAudit, check the team and channel, and finish.</li>
            <li>Copy the address Teams shows and paste it below.</li>
          </ol>
        </details>
        <form action={saveTeams} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-[1_1_320px]">
            <label htmlFor="teamsWebhook" className="label">
              Workflow address
            </label>
            <input id="teamsWebhook" name="teamsWebhook" defaultValue={o.teamsWebhook ?? ""} className="input font-mono text-[12px]" placeholder="https://….logic.azure.com/workflows/…" />
          </div>
          <button className="btn">Save</button>
        </form>
        {o.teamsWebhook && (
          <form action={testTeams}>
            <button className="btn btn-sm">Post a test message</button>
          </form>
        )}
      </section>
    </div>
  );
}

/** Shown until this VektaAudit server has its own Microsoft app registration. */
function SetupGuide() {
  const r = redirectUris();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-med-bg bg-[#FFFAF2] p-4 text-[13px]">
      <p className="font-medium">This VektaAudit server needs its own app registration in Microsoft Entra first. It&apos;s done once, by whoever runs the server, and then every customer uses it.</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          In the <strong>Microsoft Entra admin center</strong>, go to Identity → Applications → App registrations → <strong>New registration</strong>.
        </li>
        <li>
          Name: <strong>VektaAudit</strong>. Supported account types: <strong>Accounts in any organizational directory (multitenant)</strong>.
        </li>
        <li>
          Redirect URI, platform <strong>Web</strong>: <code className="break-all font-mono text-[12px]">{r.signin}</code>. After creating it, add a second Web redirect URI under Authentication: <code className="break-all font-mono text-[12px]">{r.consent}</code>
        </li>
        <li>
          API permissions → Add a permission → Microsoft Graph → <strong>Application permissions</strong>: {PERMISSIONS.map((p) => p.name).join(", ")}. Under Delegated permissions, check openid, profile and email are there.
        </li>
        <li>Certificates &amp; secrets → New client secret (24 months). Copy the secret value straight away.</li>
        <li>
          Branding: set the logo, and the home page to <code className="font-mono text-[12px]">{appUrl()}</code>. Publisher verification helps customers trust the approval screen.
        </li>
        <li>
          Put the Application (client) ID and the secret in the server&apos;s <code className="font-mono text-[12px]">.env</code> as <code className="font-mono text-[12px]">MS_CLIENT_ID</code> and <code className="font-mono text-[12px]">MS_CLIENT_SECRET</code>, then restart VektaAudit.
        </li>
      </ol>
    </div>
  );
}
