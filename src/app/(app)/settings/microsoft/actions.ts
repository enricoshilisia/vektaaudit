"use server";

import { revalidatePath } from "next/cache";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import { emailHtml, notifyTeams, resolveSite, sendMail, validTeamsWebhook } from "@/lib/server/m365";
import { appUrl } from "@/lib/server/microsoft";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const org = (id: string) => db.organization.findUniqueOrThrow({ where: { id } });
const done = () => revalidatePath("/settings/microsoft");

export async function saveMailbox(form: FormData) {
  const s = await requireUser("admin");
  const mailbox = str(form, "msMailbox")?.toLowerCase() ?? null;
  if (mailbox && !EMAIL.test(mailbox)) return fail("That mailbox address isn't valid");
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: { msMailbox: mailbox } });
    await logAction(tx, s, "set audit mailbox", "organization", s.org, mailbox ?? "none");
  });
  done();
}

export async function testMail() {
  const s = await requireUser("admin");
  const o = await org(s.org);
  try {
    await sendMail(o, {
      to: [s.email],
      subject: "VektaAudit test email",
      html: emailHtml({ orgName: o.name, heading: "Email from VektaAudit works", paragraphs: [`This message was sent from ${o.msMailbox} through Microsoft 365.`, "Self-assessment links, evidence requests and reminders will be sent the same way."], button: { label: "Open VektaAudit", url: `${appUrl()}/dashboard` } }),
    });
  } catch (e) {
    return fail((e as Error).message);
  }
  return notice(`Test email sent to ${s.email}`);
}

export async function saveSharePoint(form: FormData) {
  const s = await requireUser("admin");
  const url = str(form, "spSiteUrl");
  if (url) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return fail("Enter the full site address, e.g. https://contoso.sharepoint.com/sites/InternalAudit");
    }
    if (u.protocol !== "https:" || !/\.sharepoint(-mil)?\.(com|us|de|cn)$/.test(u.hostname)) return fail("That isn't a SharePoint address. It should look like https://contoso.sharepoint.com/sites/InternalAudit");
  }
  const folder = (str(form, "spFolder") ?? "VektaAudit").replace(/[\\:*?"<>|#%]/g, "").replace(/^\/+|\/+$/g, "") || "VektaAudit";
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: { spSiteUrl: url, spFolder: folder } });
    await logAction(tx, s, "set SharePoint site", "organization", s.org, url ?? "none");
  });
  done();
}

export async function testSharePoint() {
  const s = await requireUser("admin");
  let site;
  try {
    site = await resolveSite(await org(s.org));
  } catch (e) {
    return fail((e as Error).message);
  }
  return notice(`Found the SharePoint site${site.displayName ? ` "${site.displayName}"` : ""}. Reports will be saved there.`);
}

export async function saveTeams(form: FormData) {
  const s = await requireUser("admin");
  const url = str(form, "teamsWebhook");
  if (url && !validTeamsWebhook(url)) return fail("That isn't a Teams workflow address. Copy the HTTP POST URL from the workflow in Teams (it ends in logic.azure.com or powerplatform.com).");
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: { teamsWebhook: url } });
    await logAction(tx, s, url ? "connected a Teams channel" : "disconnected the Teams channel", "organization", s.org);
  });
  done();
}

export async function testTeams() {
  const s = await requireUser("admin");
  try {
    await notifyTeams(s.org, { title: "VektaAudit is connected to this channel", text: `${s.name} set this up. Plan approvals, tests waiting for review, serious findings, committee packs and client evidence will be posted here.`, path: "/dashboard", tone: "good" }, true);
  } catch (e) {
    return fail((e as Error).message);
  }
  return notice("Test message posted to Teams");
}

export async function disconnect() {
  const s = await requireUser("admin");
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: { msTenantId: null, msTenantName: null, msConnectedAt: null, msConnectedBy: null } });
    await logAction(tx, s, "disconnected Microsoft 365", "organization", s.org);
  });
  done();
}

export async function saveAutoReminders(form: FormData) {
  const s = await requireUser("admin");
  const on = form.get("autoReminders") === "on";
  const o = await org(s.org);
  if (on && !(o.msTenantId && o.msMailbox)) return fail("Connect Microsoft 365 and set the audit mailbox first");
  await db.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: s.org }, data: { autoReminders: on } });
    await logAction(tx, s, on ? "turned on automatic reminders" : "turned off automatic reminders", "organization", s.org);
  });
  done();
}
