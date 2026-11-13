"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAction } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fail, notice } from "@/lib/server/flash";
import { emailHtml, notifyTeams, sendMail } from "@/lib/server/m365";
import { appUrl } from "@/lib/server/microsoft";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};

/** Creates a campaign: one link per control owner, covering their controls in the chosen processes. */
export async function createCampaign(form: FormData) {
  const s = await requireUser("manage");
  const title = z.string().min(3, "Give the campaign a title").max(160).parse(str(form, "title") ?? "");
  const processes = form.getAll("processes").map(String).filter(Boolean);
  if (processes.length === 0) return fail("Choose at least one process");
  const keyOnly = form.get("keyOnly") === "on";
  const controls = await db.control.findMany({ where: { orgId: s.org, process: { in: processes }, ...(keyOnly ? { key: true } : {}) } });
  if (controls.length === 0) return fail("No controls match. Add controls to these processes first.");
  const byOwner = new Map<string, typeof controls>();
  for (const c of controls) {
    const k = c.ownerName?.trim() || "Owner not set";
    byOwner.set(k, [...(byOwner.get(k) ?? []), c]);
  }
  const c = await db.$transaction(async (tx) => {
    const created = await tx.csaCampaign.create({
      data: { orgId: s.org, title, period: str(form, "period"), dueDate: str(form, "dueDate") ? new Date(str(form, "dueDate")!) : null, createdBy: s.name },
    });
    for (const [ownerName, cs] of byOwner) {
      await tx.csaRequest.create({
        data: { campaignId: created.id, ownerName, token: randomBytes(24).toString("base64url"), items: { create: cs.map((x) => ({ controlId: x.id })) } },
      });
    }
    await logAction(tx, s, "started self-assessment", "csa", created.id, `${title}: ${controls.length} controls, ${byOwner.size} owners`);
    return created;
  });
  await notifyTeams(s.org, { title: `Self-assessment started: ${title}`, text: `${controls.length} controls, ${byOwner.size} control owners.`, path: `/self-assessment/${c.id}` });
  redirect(`/self-assessment/${c.id}`);
}

async function ownRequest(orgId: string, id: string) {
  const r = await db.csaRequest.findFirst({ where: { id, campaign: { orgId } }, include: { campaign: true } });
  if (!r) return fail("Owner not found in this campaign");
  return r;
}

export async function setOwnerEmail(requestId: string, form: FormData) {
  const s = await requireUser("manage");
  const r = await ownRequest(s.org, requestId);
  const email = str(form, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address isn't valid");
  await db.csaRequest.update({ where: { id: r.id }, data: { ownerEmail: email } });
  revalidatePath(`/self-assessment/${r.campaignId}`);
}

/** A new link for an owner (the old one stops working). */
export async function newLink(requestId: string) {
  const s = await requireUser("manage");
  const r = await ownRequest(s.org, requestId);
  await db.$transaction(async (tx) => {
    await tx.csaRequest.update({ where: { id: r.id }, data: { token: randomBytes(24).toString("base64url") } });
    await logAction(tx, s, "replaced self-assessment link", "csa", r.campaignId, r.ownerName);
  });
  revalidatePath(`/self-assessment/${r.campaignId}`);
}

/** Audit's check of the owner's answer. */
export async function validateItem(itemId: string, form: FormData) {
  const s = await requireUser("work");
  const item = await db.csaItem.findFirst({ where: { id: itemId, request: { campaign: { orgId: s.org } } }, include: { request: true, control: { select: { code: true } } } });
  if (!item) return fail("Item not found");
  if (!item.answer) return fail("The owner hasn't answered yet");
  const validation = z.enum(["agree", "disagree"]).parse(form.get("validation"));
  const note = str(form, "note");
  if (validation === "disagree" && !note) return fail("Say why audit disagrees");
  await db.$transaction(async (tx) => {
    await tx.csaItem.update({ where: { id: itemId }, data: { validation, validationNote: note, validatedBy: s.name, validatedAt: new Date() } });
    await logAction(tx, s, validation === "agree" ? "agreed with self-assessment" : "disagreed with self-assessment", "csa", item.request.campaignId, `${item.control.code}, ${item.request.ownerName}${note ? `: ${note}` : ""}`);
  });
  revalidatePath(`/self-assessment/${item.request.campaignId}`);
}

/** Emails each owner who has an address their own link, from the audit mailbox. Owners already emailed are skipped unless `again`. */
export async function emailOwners(campaignId: string, again: boolean) {
  const s = await requireUser("manage");
  const c = await db.csaCampaign.findFirst({ where: { id: campaignId, orgId: s.org }, include: { org: true, requests: { include: { items: { select: { answer: true } } } } } });
  if (!c) return fail("Campaign not found");
  if (c.status !== "open") return fail("This self-assessment is closed");
  const targets = c.requests.filter((r) => r.ownerEmail && !r.submittedAt && (again || !r.emailedAt));
  if (!targets.length) return fail(c.requests.some((r) => r.ownerEmail) ? "Everyone with an email has already been sent their link" : "Add the owners' email addresses first");
  let sent = 0;
  for (const r of targets) {
    const left = r.items.filter((i) => !i.answer).length;
    try {
      await sendMail(c.org, {
        to: [r.ownerEmail!],
        subject: r.emailedAt ? `Reminder: ${c.title}` : `${c.title}: please confirm your controls`,
        html: emailHtml({
          orgName: c.org.name,
          heading: `Hello ${r.ownerName}`,
          paragraphs: [
            `Internal audit is asking control owners to confirm that their controls worked${c.period ? ` during ${c.period}` : ""}. You have ${r.items.length} control${r.items.length === 1 ? "" : "s"} to answer${left < r.items.length ? `, ${left} still open` : ""}.`,
            c.dueDate ? `Please answer by ${c.dueDate.toISOString().slice(0, 10)}. It takes a few minutes per control; attach evidence where you can.` : "It takes a few minutes per control; attach evidence where you can.",
          ],
          button: { label: "Answer the self-assessment", url: `${appUrl()}/sa/${r.token}` },
          footer: `Sent by ${s.name} for ${c.org.name} internal audit. This link is personal to you; please don't forward it.`,
        }),
      });
    } catch (e) {
      if (sent === 0) return fail((e as Error).message);
      return fail(`Sent ${sent}, then stopped: ${(e as Error).message}`);
    }
    await db.csaRequest.update({ where: { id: r.id }, data: { emailedAt: new Date() } });
    sent++;
  }
  await db.$transaction(async (tx) => {
    await logAction(tx, s, again ? "emailed self-assessment reminders" : "emailed self-assessment links", "csa", c.id, `${sent} owners`);
  });
  revalidatePath(`/self-assessment/${c.id}`);
  return notice(`Emailed ${sent} owner${sent === 1 ? "" : "s"}`);
}

export async function setCampaignStatus(id: string, status: "open" | "closed") {
  const s = await requireUser("manage");
  const c = await db.csaCampaign.findFirst({ where: { id, orgId: s.org } });
  if (!c) return fail("Campaign not found");
  await db.$transaction(async (tx) => {
    await tx.csaCampaign.update({ where: { id }, data: { status } });
    await logAction(tx, s, status === "closed" ? "closed self-assessment" : "reopened self-assessment", "csa", id, c.title);
  });
  revalidatePath(`/self-assessment/${id}`);
}
