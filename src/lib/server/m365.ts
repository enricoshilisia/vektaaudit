import "server-only";
// Outlook mail and calendar, SharePoint and Teams for an organisation that has connected Microsoft 365.
import { db } from "./db";
import { MsError, appUrl, graph, graphError } from "./microsoft";

type Org = { id: string; name: string; msTenantId: string | null; msMailbox: string | null; spSiteUrl: string | null; spFolder: string; teamsWebhook: string | null };
const orgOf = (id: string) => db.organization.findUniqueOrThrow({ where: { id } });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A plain, branded email: a heading, paragraphs, an optional button and a footer naming the sender. */
export function emailHtml(o: { orgName: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F4F6F8;font-family:Segoe UI,Arial,sans-serif;color:#14212E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #E2E7ED;border-radius:10px">
<tr><td style="background:#0B1F33;color:#fff;padding:16px 24px;border-radius:10px 10px 0 0;font-size:14px;font-weight:600">${esc(o.orgName)} · Internal audit</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:19px">${esc(o.heading)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55">${esc(p)}</p>`).join("")}
${o.button ? `<p style="margin:20px 0 8px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#1F5FAE;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">${esc(o.button.label)}</a></p><p style="margin:0;font-size:12px;color:#5A6B7D;word-break:break-all">${esc(o.button.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #EEF1F4;font-size:12px;color:#5A6B7D">${esc(o.footer ?? `Sent by ${o.orgName} internal audit using VektaAudit.`)}</td></tr>
</table></td></tr></table></body></html>`;
}

export const mailReady = (o: Pick<Org, "msTenantId" | "msMailbox">) => !!(o.msTenantId && o.msMailbox);

/** Sends an email from the organisation's audit mailbox in Microsoft 365. */
export async function sendMail(orgOrId: string | Org, m: { to: string[]; cc?: string[]; subject: string; html: string }) {
  const o = typeof orgOrId === "string" ? await orgOf(orgOrId) : orgOrId;
  if (!o.msTenantId) throw new MsError("Connect Microsoft 365 first (Settings → Microsoft 365)");
  if (!o.msMailbox) throw new MsError("Choose the mailbox audit emails are sent from (Settings → Microsoft 365)");
  const to = m.to.filter(Boolean);
  if (!to.length) throw new MsError("There is no email address to send to");
  const r = await graph(o.msTenantId, `/users/${encodeURIComponent(o.msMailbox)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (m.cc ?? []).filter(Boolean).map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  if (!r.ok) throw new MsError(await graphError(r, "Sending the email"));
}

/** Adds an all-day event to someone's Outlook calendar. Returns the event id, or null if it couldn't be added. */
export async function addCalendarEvent(o: Org, email: string, e: { subject: string; start: Date; end: Date; body?: string; busy: "busy" | "oof" | "tentative" }) {
  if (!o.msTenantId) return null;
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00`;
  const after = new Date(e.end);
  after.setDate(after.getDate() + 1);
  const r = await graph(o.msTenantId, `/users/${encodeURIComponent(email)}/events`, {
    method: "POST",
    body: JSON.stringify({
      subject: e.subject,
      body: { contentType: "Text", content: e.body ?? "Booked in VektaAudit." },
      start: { dateTime: day(e.start), timeZone: "UTC" },
      end: { dateTime: day(after), timeZone: "UTC" },
      isAllDay: true,
      showAs: e.busy,
      isReminderOn: false,
      categories: ["VektaAudit"],
    }),
  });
  if (!r.ok) throw new MsError(await graphError(r, `Adding to ${email}'s calendar`));
  return ((await r.json()) as { id: string }).id;
}

export async function removeCalendarEvent(o: Org, email: string, eventId: string) {
  if (!o.msTenantId) return;
  const r = await graph(o.msTenantId, `/users/${encodeURIComponent(email)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new MsError(await graphError(r, `Removing the event from ${email}'s calendar`));
}

/** https://contoso.sharepoint.com/sites/Audit → the Graph site id. */
export async function resolveSite(o: Org) {
  if (!o.msTenantId) throw new MsError("Connect Microsoft 365 first");
  if (!o.spSiteUrl) throw new MsError("Enter your SharePoint site address (Settings → Microsoft 365)");
  const u = new URL(o.spSiteUrl);
  const r = await graph(o.msTenantId, `/sites/${u.hostname}:${u.pathname.replace(/\/$/, "") || "/"}`);
  if (!r.ok) throw new MsError(await graphError(r, "Finding the SharePoint site"));
  const j = (await r.json()) as { id: string; displayName?: string; webUrl?: string };
  return j;
}

/** Saves a file to the site's document library, in the organisation's VektaAudit folder. Returns its web address. */
export async function saveToSharePoint(o: Org, subfolder: string, name: string, bytes: Uint8Array, mime: string) {
  if (bytes.length > 4 * 1024 * 1024) throw new MsError("Files over 4 MB can't be saved to SharePoint from VektaAudit yet");
  const site = await resolveSite(o);
  const path = [o.spFolder, subfolder, name.replace(/[\\/:*?"<>|#%]/g, "_")].filter(Boolean).map(encodeURIComponent).join("/");
  const r = await graph(o.msTenantId!, `/sites/${encodeURIComponent(site.id)}/drive/root:/${path}:/content?@microsoft.graph.conflictBehavior=replace`, { method: "PUT", body: bytes as unknown as BodyInit, headers: { "content-type": mime } });
  if (!r.ok) throw new MsError(await graphError(r, "Saving to SharePoint"));
  return ((await r.json()) as { webUrl: string }).webUrl;
}

// ---- Teams ----

const TEAMS_HOSTS = /\.(logic\.azure\.com|powerplatform\.com|powerautomate\.com|webhook\.office\.com)$/i;
/** Only Microsoft's workflow and webhook addresses are accepted, so the setting can't be used to reach other servers. */
export function validTeamsWebhook(url: string) {
  try {
    const u = new URL(url);
    const extra = (process.env.TEAMS_WEBHOOK_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    if (extra.includes(u.hostname)) return true;
    return u.protocol === "https:" && TEAMS_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Posts a card to the organisation's Teams channel (through a Teams workflow). Never throws unless asked to. */
export async function notifyTeams(orgOrId: string | Org, n: { title: string; text?: string; facts?: [string, string][]; path?: string; tone?: "attention" | "good" | "accent" }, raise = false) {
  try {
    const o = typeof orgOrId === "string" ? await orgOf(orgOrId) : orgOrId;
    if (!o.teamsWebhook || !validTeamsWebhook(o.teamsWebhook)) {
      if (raise) throw new MsError("Add your Teams channel workflow address first");
      return false;
    }
    const card = {
      type: "AdaptiveCard",
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      version: "1.4",
      body: [
        { type: "TextBlock", text: "VektaAudit", size: "Small", isSubtle: true, spacing: "None" },
        { type: "TextBlock", text: n.title, weight: "Bolder", size: "Medium", wrap: true, color: n.tone === "attention" ? "Attention" : n.tone === "good" ? "Good" : "Default" },
        ...(n.text ? [{ type: "TextBlock", text: n.text, wrap: true }] : []),
        ...(n.facts?.length ? [{ type: "FactSet", facts: n.facts.map(([title, value]) => ({ title, value })) }] : []),
      ],
      actions: n.path ? [{ type: "Action.OpenUrl", title: "Open in VektaAudit", url: `${appUrl()}${n.path}` }] : [],
    };
    const r = await fetch(o.teamsWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new MsError(`Teams didn't accept the message (${r.status})`);
    return true;
  } catch (e) {
    if (raise) throw e;
    console.error("Teams notification failed:", (e as Error).message);
    return false;
  }
}
