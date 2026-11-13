// Adds escalated findings, a self-assessment, timesheets, bookings and a draft committee pack to the demo firm.
// Additive: it only fills empty fields and adds new records, and does nothing if a self-assessment already exists.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ORG = "Demo Audit Partners";
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

async function main() {
  const org = await db.organization.findFirst({ where: { name: ORG } });
  if (!org) throw new Error(`${ORG} not found`);
  if (await db.csaCampaign.count({ where: { orgId: org.id } })) {
    console.log("Phase 2 demo data is already there; nothing to do.");
    return;
  }
  const users = Object.fromEntries((await db.user.findMany({ where: { orgId: org.id } })).map((u) => [u.email.split("@")[0], u]));
  const eng = Object.fromEntries((await db.engagement.findMany({ where: { orgId: org.id } })).map((e) => [e.name.split(" ")[0].toLowerCase(), e]));

  // skills
  const certs: Record<string, string> = { amina: "CIA, CPA(K)", daniel: "CIA, CISA", priscilla: "CPA(K), CFE", joseph: "ACCA", sarah: "CISA (in progress)" };
  for (const [u, c] of Object.entries(certs)) if (users[u] && !users[u].certifications) await db.user.update({ where: { id: users[u].id }, data: { certifications: c } });

  // overall ratings, only where none is set
  const rate = async (key: string, rating: string, ago: number) => {
    if (eng[key] && !eng[key].rating) await db.engagement.update({ where: { id: eng[key].id }, data: { rating, ratedAt: daysAgo(ago) } });
  };
  await rate("fleet", "needs_improvement", 25);
  await rate("branch", "unsatisfactory", 8);

  // two escalated findings on the procurement audit
  if (eng.procurement) {
    const code = async () => {
      const c = await db.counter.upsert({ where: { orgId_key: { orgId: org.id, key: "finding" } }, create: { orgId: org.id, key: "finding", value: 1 }, update: { value: { increment: 1 } } });
      return `FND-${String(c.value).padStart(4, "0")}`;
    };
    await db.finding.create({
      data: {
        orgId: org.id,
        engagementId: eng.procurement.id,
        code: await code(),
        title: "Three users can both create vendors and approve payments",
        severity: "critical",
        status: "in_remediation",
        condition: "The ERP role review found three users in Finance with both the vendor-maintenance and payment-approval roles.",
        criteria: "The segregation of duties matrix requires vendor set-up and payment approval to be done by different people.",
        cause: "Roles were combined during staff leave in 2025 and never removed.",
        effect: "One person could set up a fictitious vendor and pay it without anyone else being involved.",
        recommendation: "Remove the conflicting roles and add the conflict to the quarterly access review.",
        mgmtResponse: "Agreed. IT will remove the roles once the ERP role redesign goes live.",
        ownerName: "Head of IT",
        dueDate: daysAgo(104),
        originalDue: daysAgo(150),
        dueChanges: 1,
        raisedById: users.joseph?.id ?? null,
        createdAt: daysAgo(190),
        events: { create: [{ kind: "raised", body: "Finding raised", actorName: users.joseph?.name ?? "Auditor", createdAt: daysAgo(190) }, { kind: "status", body: "Due date moved after the ERP project slipped", actorName: users.daniel?.name ?? "Manager", createdAt: daysAgo(150) }] },
      },
    });
    await db.finding.create({
      data: {
        orgId: org.id,
        engagementId: eng.procurement.id,
        code: await code(),
        title: "Supplier statement reconciliations not reviewed",
        severity: "high",
        status: "in_remediation",
        condition: "Statement reconciliations for 4 of 9 large suppliers had no reviewer sign-off for August and September.",
        recommendation: "The Finance Controller should review and sign every reconciliation by the 10th of the following month.",
        mgmtResponse: "Agreed. Reviews will be added to the month-end checklist.",
        ownerName: "Finance Controller",
        dueDate: daysAgo(12),
        originalDue: daysAgo(75),
        dueChanges: 2,
        raisedById: users.joseph?.id ?? null,
        createdAt: daysAgo(120),
        events: { create: [{ kind: "raised", body: "Finding raised", actorName: users.joseph?.name ?? "Auditor", createdAt: daysAgo(120) }] },
      },
    });
  }

  // timesheets for the last six weeks and bookings for the next six
  const staff = ["daniel", "priscilla", "joseph", "sarah"].map((u) => users[u]).filter(Boolean);
  const open = Object.values(eng).filter((e) => e.phase !== "closed");
  if (!(await db.timeEntry.count({ where: { orgId: org.id } }))) {
    const rows = [];
    for (let d = 42; d >= 1; d--) {
      const date = daysAgo(d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      for (const [i, u] of staff.entries()) {
        if ((d + i) % 11 === 0) {
          rows.push({ orgId: org.id, userId: u.id, date, hours: 8, category: "leave" });
          continue;
        }
        const e = open[(i + Math.floor(d / 7)) % open.length];
        rows.push({ orgId: org.id, userId: u.id, engagementId: e.id, date, hours: 6, category: "audit", note: "Fieldwork" });
        rows.push({ orgId: org.id, userId: u.id, date, hours: d % 5 === 0 ? 2 : 1, category: d % 5 === 0 ? "training" : "admin" });
      }
    }
    await db.timeEntry.createMany({ data: rows });
  }
  if (!(await db.assignment.count({ where: { orgId: org.id } }))) {
    const monday = new Date();
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const at = (w: number, days = 0) => new Date(monday.getTime() + (w * 7 + days) * 864e5);
    const book = (u: string, w: number, weeks: number, e?: { id: string }, kind = "audit", label?: string) =>
      users[u] && db.assignment.create({ data: { orgId: org.id, userId: users[u].id, engagementId: e?.id ?? null, kind, label: label ?? null, start: at(w), end: at(w + weeks - 1, 4) } });
    await book("daniel", 0, 3, eng.statutory);
    await book("daniel", 3, 2, eng.it);
    await book("daniel", 5, 1, undefined, "leave");
    await book("priscilla", 0, 2, eng.procurement);
    await book("priscilla", 2, 1, undefined, "training", "CIA exam prep");
    await book("priscilla", 3, 3, eng.donor);
    await book("joseph", 0, 4, eng.procurement);
    await book("joseph", 2, 1, eng.payroll); // a deliberate double booking to show the clash
    await book("joseph", 4, 2, eng.donor);
    await book("sarah", 0, 2, eng.it);
    await book("sarah", 2, 2, undefined, "leave");
    await book("sarah", 4, 2, eng.payroll);
  }

  // a self-assessment over two processes, partly answered
  const controls = await db.control.findMany({ where: { orgId: org.id, key: true, process: { in: ["Procure-to-pay", "Treasury & cash"] } } });
  if (controls.length) {
    const byOwner = new Map<string, typeof controls>();
    for (const c of controls) byOwner.set(c.ownerName ?? "Owner not set", [...(byOwner.get(c.ownerName ?? "Owner not set") ?? []), c]);
    const camp = await db.csaCampaign.create({ data: { orgId: org.id, title: "Q4 control self-assessment", period: "October – December", dueDate: new Date(Date.now() + 14 * 864e5), createdBy: users.priscilla?.name ?? "Demo" } });
    let n = 0;
    for (const [owner, cs] of byOwner) {
      const r = await db.csaRequest.create({ data: { campaignId: camp.id, ownerName: owner, token: randomBytes(24).toString("base64url"), lastSeenAt: n % 2 ? null : daysAgo(2) } });
      for (const c of cs) {
        n++;
        const answer = n % 4 === 0 ? null : n % 5 === 0 ? "partly" : n % 7 === 0 ? "not_effective" : "effective";
        await db.csaItem.create({
          data: {
            requestId: r.id,
            controlId: c.id,
            answer,
            respondedAt: answer ? daysAgo(1) : null,
            comment: answer === "partly" ? "Done for most months; two reviews were signed late because the reviewer was on leave." : answer === "not_effective" ? "Not done this quarter while the role was vacant. A new officer starts next month." : answer ? "Done as described; signed reports kept in the shared drive." : null,
            validation: answer && n % 3 === 0 ? (answer === "effective" ? "agree" : "disagree") : null,
            validationNote: answer && n % 3 === 0 && answer !== "effective" ? "Our sample found more gaps than reported." : null,
            validatedBy: answer && n % 3 === 0 ? users.joseph?.name : null,
            validatedAt: answer && n % 3 === 0 ? daysAgo(0) : null,
          },
        });
      }
    }
  }

  // a draft committee pack for this quarter
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  await db.committeePack.create({
    data: {
      orgId: org.id,
      title: `Internal audit report to the audit committee, Q${q + 1} ${now.getFullYear()}`,
      periodStart: new Date(now.getFullYear(), q * 3, 1),
      periodEnd: new Date(now.getFullYear(), q * 3 + 3, 0),
      meetingDate: new Date(now.getFullYear(), q * 3 + 3, 12),
      summary:
        "Overall, the control environment is adequate, with improvement needed in procurement and branch cash handling. Two matters need the committee's attention: users who can both create vendors and approve payments (now escalated after its due date moved), and weak cash counts at western-region branches, where the audit was rated unsatisfactory. Management has agreed actions for both; we will report progress at the next meeting.",
    },
  });

  await db.auditLog.create({ data: { orgId: org.id, actorName: "System", action: "loaded sample self-assessment, timesheets and committee pack", entity: "committee" } });
  console.log("Added Phase 2 demo data.");
}

main().finally(() => db.$disconnect());
