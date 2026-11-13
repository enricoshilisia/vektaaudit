// Demo data: one audit firm with internal-audit and financial-audit engagements. Dates are relative to today.
// Run: npm run db:seed   (refuses to run if the demo organisation already exists)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const db = new PrismaClient();
const DAY = 86400000;
const d = (days: number) => new Date(Date.now() + days * DAY);
const M = (millions: number) => BigInt(Math.round(millions * 1_000_000));
const PASSWORD = process.env.SEED_PASSWORD || "VektaDemo!2026";
const ORG_NAME = "Demo Audit Partners";

async function store(orgId: string, text: string, ext: string) {
  const root = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));
  const key = `${orgId}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
  await mkdir(path.dirname(path.join(root, key)), { recursive: true });
  await writeFile(path.join(root, key), text);
  return { key, size: Buffer.byteLength(text) };
}

async function main() {
  if (await db.organization.findFirst({ where: { name: ORG_NAME } })) {
    console.log(`"${ORG_NAME}" already exists; nothing to do.`);
    return;
  }
  const org = await db.organization.create({ data: { name: ORG_NAME, kind: "firm", currency: "KES" } });
  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = (email: string, name: string, title: string, role: string) => db.user.create({ data: { orgId: org.id, email, name, title, role, passwordHash: hash } });
  const amina = await user("amina@demo.vektaaudit.com", "Amina Otieno", "Audit Partner", "ADMIN");
  const daniel = await user("daniel@demo.vektaaudit.com", "Daniel Kiprop", "Audit Manager", "MANAGER");
  const priscilla = await user("priscilla@demo.vektaaudit.com", "Priscilla Achieng", "IT Audit Manager", "MANAGER");
  const joseph = await user("joseph@demo.vektaaudit.com", "Joseph Mwangi", "Senior Auditor", "AUDITOR");
  const sarah = await user("sarah@demo.vektaaudit.com", "Sarah Kamau", "Auditor", "AUDITOR");
  await user("board@demo.vektaaudit.com", "Audit Committee Viewer", "Audit Committee", "VIEWER");

  const pwani = await db.client.create({ data: { orgId: org.id, name: "Pwani Group Ltd", industry: "Retail & distribution", yearEnd: "30 June", framework: "IFRS Accounting Standards", law: "the Companies Act, 2015" } });
  const mara = await db.client.create({ data: { orgId: org.id, name: "Mara Logistics Limited", industry: "Logistics", yearEnd: "30 June", framework: "IFRS Accounting Standards", law: "the Companies Act, 2015" } });

  const year = new Date().getFullYear() + 1;
  let engN = 0;
  const eng = (data: Omit<Parameters<typeof db.engagement.create>[0]["data"], "orgId" | "code">) =>
    db.engagement.create({ data: { ...data, orgId: org.id, code: `ENG-${year}-${String(++engN).padStart(3, "0")}` } as never });
  let fndN = 0;
  const finding = async (engagementId: string, f: Record<string, unknown>, events: [string, string, string, number][]) => {
    const created = await db.finding.create({ data: { orgId: org.id, engagementId, code: `FND-${String(++fndN).padStart(4, "0")}`, raisedById: joseph.id, ...f } as never });
    for (const [kind, body, actorName, days] of events) await db.findingEvent.create({ data: { findingId: created.id, kind, body, actorName, createdAt: d(days) } });
    return created;
  };
  const procs = async (engagementId: string, list: [string, string, string, string, string?][]) => {
    for (const [i, [ref, title, control, status, conclusion]] of list.entries()) {
      const prepared = status === "in_review" || status === "signed_off";
      await db.procedure.create({
        data: {
          engagementId,
          ref,
          title,
          control,
          status,
          conclusion: conclusion ?? (prepared ? "Work performed as planned. No exceptions noted." : null),
          sort: i,
          preparedById: prepared ? joseph.id : null,
          preparedAt: prepared ? d(-10 + i) : null,
          reviewedById: status === "signed_off" ? daniel.id : null,
          reviewedAt: status === "signed_off" ? d(-6 + i) : null,
        },
      });
    }
  };

  // ---- internal audit: procurement (fieldwork) ----
  const proc = await eng({ name: "Procurement & supplier onboarding", kind: "internal", area: "Finance", phase: "fieldwork", clientId: pwani.id, leadId: joseph.id, periodStart: d(-490), periodEnd: d(-128), dueDate: d(14), budgetHours: 240, actualHours: 164, objective: "Assess whether suppliers are vetted and approved before they can be paid, and whether purchases follow the procurement policy." });
  await procs(proc.id, [
    ["P-01", "Walkthrough of procure-to-pay process", "Process understanding", "signed_off"],
    ["P-02", "Review procurement policy vs. practice", "C-PR-01 Policy governance", "signed_off"],
    ["P-03", "Segregation of duties in ERP roles", "C-PR-04 Access & SoD", "signed_off"],
    ["P-04", "New supplier approval testing", "C-PR-06 Dual approval", "in_review", "Population: 1,284 new suppliers. Random sample of 25 (seed 4471). 4 of 25 were activated by a single user with no second approver. Exceptions #4, #10, #17, #23 all created by the same user via bulk import."],
    ["P-05", "Supplier bank detail changes", "C-PR-07 Change verification", "in_review"],
    ["P-06", "Three-way match on invoices", "C-PR-09 PO · GRN · invoice", "in_progress", "Testing 40 invoices; 22 done so far."],
    ["P-07", "Duplicate payment analytics", "Data analytics · 100% of AP", "in_progress"],
    ["P-08", "Tender evaluation files", "C-PR-11 Competitive bidding", "not_started"],
  ]);
  const p04 = await db.procedure.findFirstOrThrow({ where: { engagementId: proc.id, ref: "P-04" } });
  await db.reviewNote.create({ data: { engagementId: proc.id, procedureId: p04.id, authorId: daniel.id, body: "Please document how the sample seed was generated so it can be re-performed.", createdAt: d(-1) } });
  await db.reviewNote.create({ data: { engagementId: proc.id, procedureId: p04.id, authorId: joseph.id, body: "Seed and population extract attached as P-04.1. Re-running gives the same 25 items.", createdAt: d(-0.2) } });
  await db.reviewNote.create({ data: { engagementId: proc.id, procedureId: p04.id, authorId: daniel.id, body: "Thanks. Confirm exception #17 with the vendor master change log before sign-off.", createdAt: d(-0.1) } });
  await finding(
    proc.id,
    { title: "New suppliers activated without second approval", severity: "high", status: "in_remediation", repeat: true, condition: "4 of 25 sampled suppliers were activated by a single user with no second approver recorded.", criteria: "Procurement Policy §4.2 requires dual approval before any supplier can be paid.", cause: "The ERP allows activation without the approval step when records are imported in bulk.", effect: "Fictitious or unvetted suppliers could receive payment.", recommendation: "Enforce dual approval in the workflow and review all bulk-imported suppliers since July 2025.", mgmtResponse: "ERP workflow will enforce dual approval before activation. The 4 suppliers have been re-verified.", ownerName: "R. Njoroge, Head of Procurement", dueDate: d(86) },
    [["raised", "Finding raised from P-04", "Joseph Mwangi", -15], ["response", "Management response agreed", "Joseph Mwangi", -8]],
  );
  const reqs: [string, string, number, string, string?][] = [
    ["Procurement policy (current version)", "", -16, "accepted"],
    ["ERP user role listing", "", -14, "accepted"],
    ["Organisation chart, procurement unit", "", -14, "accepted"],
    ["Supplier master file extract", "All active suppliers with creation date and creator", -12, "accepted"],
    ["Signed tender evaluation minutes, Q3", "", -6, "needs_info", "Page 2 is missing signatures"],
    ["Purchase orders sample (40)", "", -5, "accepted"],
    ["Vendor master change log, Jul 2025 – Jun 2026", "Export the full change history for supplier records, including who changed each field and when. CSV or Excel preferred.", -2, "open"],
    ["Approval evidence for 4 sampled suppliers", "Exceptions #4, #10, #17, #23", 6, "open"],
  ];
  for (const [i, [title, detail, due, status, note]] of reqs.entries())
    await db.evidenceRequest.create({ data: { engagementId: proc.id, code: `PBC-${String(i + 1).padStart(2, "0")}`, title, detail: detail || null, dueDate: d(due), status, auditorNote: note ?? null, assigneeName: "R. Njoroge", acceptedAt: status === "accepted" ? d(due + 1) : null } });
  const portal = await db.portalLink.create({ data: { engagementId: proc.id, token: randomBytes(24).toString("base64url"), name: "R. Njoroge", title: "Head of Procurement" } });

  // ---- internal audit: ITGC (review) ----
  const itgc = await eng({ name: "IT general controls (ITGC)", kind: "internal", area: "Technology", phase: "review", clientId: pwani.id, leadId: priscilla.id, dueDate: d(6), budgetHours: 160, actualHours: 151, objective: "Access management, change management, backups and IT operations for the ERP and core systems." });
  await procs(itgc.id, [
    ["T-01", "User access reviews", "ITGC-AC-01", "signed_off"],
    ["T-02", "Privileged account management", "ITGC-AC-03", "signed_off"],
    ["T-03", "Joiners, movers, leavers", "ITGC-AC-05", "signed_off"],
    ["T-04", "Change management", "ITGC-CM-01", "signed_off"],
    ["T-05", "Backup and restore testing", "ITGC-OP-02", "in_review"],
  ]);
  await finding(itgc.id, { title: "Privileged ERP accounts not reviewed quarterly", severity: "high", status: "in_remediation", condition: "No review of the 14 privileged ERP accounts took place in Q1 or Q2.", criteria: "IT Security Policy §6 requires quarterly privileged access reviews.", recommendation: "Perform and evidence the review now; schedule it quarterly.", mgmtResponse: "Review scheduled with the ERP vendor.", ownerName: "K. Odhiambo, IT Manager", dueDate: d(-22) }, [["raised", "Finding raised", "Priscilla Achieng", -60], ["response", "Management response agreed", "Priscilla Achieng", -50]]);
  await finding(itgc.id, { title: "Leavers retain system access beyond 5 days", severity: "medium", status: "in_remediation", condition: "6 of 20 leavers kept ERP access for 9–31 days after their last day.", criteria: "Access must be removed within 5 working days.", recommendation: "Link HR exits to automatic account disabling.", mgmtResponse: "HR will send exits to IT daily.", ownerName: "K. Odhiambo, IT Manager", dueDate: d(-4) }, [["raised", "Finding raised", "Priscilla Achieng", -45], ["response", "Management response agreed", "Priscilla Achieng", -40]]);
  await finding(itgc.id, { title: "Backup restore not tested in 12 months", severity: "medium", status: "pending_validation", condition: "No restore test since last year.", criteria: "Backups must be restore-tested every 6 months.", recommendation: "Run and document a restore test.", mgmtResponse: "Restore test completed 2 weeks ago; evidence submitted.", ownerName: "K. Odhiambo, IT Manager", dueDate: d(-36) }, [["raised", "Finding raised", "Priscilla Achieng", -70], ["response", "Management response agreed", "Priscilla Achieng", -66], ["status", "Pending validation — restore test report uploaded", "Sarah Kamau", -3]]);

  // ---- internal audit: branch cash (reporting) ----
  const cash = await eng({ name: "Branch cash handling — Western region", kind: "internal", area: "Operations", phase: "reporting", clientId: pwani.id, leadId: sarah.id, dueDate: d(-1), budgetHours: 90, actualHours: 88 });
  await procs(cash.id, [
    ["B-01", "Surprise cash counts at 6 branches", "OPS-CASH-02", "signed_off"],
    ["B-02", "Banking of daily takings", "OPS-CASH-04", "signed_off"],
    ["B-03", "Petty cash vouchers", "OPS-CASH-07", "signed_off"],
  ]);
  await finding(cash.id, { title: "Cash counts not performed at 3 branches", severity: "high", status: "awaiting_response", repeat: true, condition: "Daily cash counts were not signed at 3 of 6 branches for most of the period.", criteria: "Branch Operations Manual §3.1.", recommendation: "Branch managers to sign daily counts; regional office to check weekly.", ownerName: "L. Chebet, Regional Ops Manager", dueDate: d(25) }, [["raised", "Finding raised", "Sarah Kamau", -9]]);
  await finding(cash.id, { title: "Petty cash vouchers missing receipts", severity: "low", status: "in_remediation", condition: "11 of 60 vouchers had no supporting receipt.", recommendation: "Reject vouchers without receipts.", mgmtResponse: "Reminder issued to all branches.", ownerName: "L. Chebet, Regional Ops Manager", dueDate: d(40) }, [["raised", "Finding raised", "Sarah Kamau", -9], ["response", "Management response agreed", "Sarah Kamau", -5]]);

  // ---- internal audit: payroll (fieldwork), donor (planning), fleet (closed) ----
  const payroll = await eng({ name: "Payroll & HR master data", kind: "internal", area: "People", phase: "fieldwork", clientId: pwani.id, leadId: sarah.id, dueDate: d(22), budgetHours: 120, actualHours: 49 });
  await procs(payroll.id, [
    ["H-01", "Payroll change approvals", "HR-PAY-02", "in_progress"],
    ["H-02", "Ghost employee analytics", "Data analytics", "not_started"],
  ]);
  await finding(payroll.id, { title: "Payroll changes lack documented approval", severity: "medium", status: "in_remediation", repeat: true, condition: "7 of 30 salary changes had no approval form on file.", ownerName: "G. Mutua, HR Manager", mgmtResponse: "Approval forms now required in the HR system.", dueDate: d(44) }, [["raised", "Finding raised", "Sarah Kamau", -12], ["response", "Management response agreed", "Sarah Kamau", -6]]);
  await eng({ name: "Donor grant compliance (EU programme)", kind: "internal", area: "Compliance", phase: "planning", clientId: pwani.id, leadId: daniel.id, dueDate: d(39), budgetHours: 80 });
  await eng({ name: "Fleet fuel management", kind: "internal", area: "Operations", phase: "closed", clientId: pwani.id, leadId: sarah.id, dueDate: d(-80), budgetHours: 60, actualHours: 58 });

  // ---- financial audit: Mara Logistics ----
  const fs = await eng({
    name: "Statutory audit, year ended 30 June 2026",
    kind: "financial",
    area: "External audit",
    phase: "fieldwork",
    clientId: mara.id,
    leadId: daniel.id,
    periodStart: new Date("2025-07-01"),
    periodEnd: new Date("2026-06-30"),
    dueDate: d(35),
    budgetHours: 420,
    actualHours: 236,
    objective: "Express an opinion on whether the financial statements give a true and fair view in accordance with IFRS Accounting Standards and the Companies Act, 2015.",
    materialityBasis: "1% of revenue",
    materiality: M(12.5),
    performanceMat: M(9.375),
    trivialMat: M(0.625),
    tbImportedAt: d(-2),
    tbSource: "Sage 300",
  });
  const leads: [string, string, string, string, string][] = [
    ["A", "Property, plant & equipment", "bs", "normal", "signed_off"],
    ["B", "Right-of-use assets", "bs", "normal", "signed_off"],
    ["C", "Inventories", "bs", "elevated", "testing"],
    ["D", "Trade & other receivables", "bs", "significant", "testing"],
    ["E", "Cash & bank balances", "bs", "normal", "in_review"],
    ["F", "Trade & other payables", "bs", "elevated", "testing"],
    ["G", "Borrowings", "bs", "normal", "not_started"],
    ["H", "Equity", "bs", "normal", "not_started"],
    ["R", "Revenue", "is", "significant", "testing"],
    ["S", "Cost of sales", "is", "normal", "not_started"],
    ["T", "Operating expenses", "is", "normal", "not_started"],
  ];
  await db.leadSchedule.createMany({ data: leads.map(([code, name, section, risk, status], i) => ({ engagementId: fs.id, code, name, section, risk, status, sort: i })) });
  // debits positive, credits negative; current and prior years each balance to zero
  const tb: [string, string, string | null, number, number][] = [
    ["1000", "Land & buildings", "A", 301.2, 318.4],
    ["1010", "Motor vehicles & trucks", "A", 211.1, 230.36],
    ["1020", "Accumulated depreciation adj.", "A", 0, 0],
    ["1100", "Right-of-use assets — warehouses", "B", 88.41, 79.02],
    ["1300", "Fuel & spares inventory", "C", 96.88, 102.145],
    ["1200", "Trade receivables", "D", 205.1, 286.94],
    ["1210", "Allowance for expected credit losses", "D", -6.9, -8.35],
    ["1220", "Prepayments & deposits", "D", 16.4, 24.0],
    ["1400", "Pwani Commercial Bank — current", "E", 118.25, 131.3],
    ["1410", "Call deposits", "E", 28.0, 30.0],
    ["1999", "Suspense account", null, 0, 0],
    ["2000", "Trade payables", "F", -152.73, -181.88],
    ["2010", "Accruals", "F", -46.0, -50.0],
    ["2200", "Bank loans", "G", -320.0, -295.0],
    ["3000", "Share capital", "H", -100.0, -100.0],
    ["3100", "Retained earnings b/f", "H", -348.81, -453.635],
    ["4000", "Freight revenue", "R", -1141.5, -1248.3],
    ["5000", "Fuel & driver costs", "S", 771.2, 836.4],
    ["6000", "Staff costs", "T", 165.4, 177.6],
    ["6100", "Other operating expenses", "T", 114.0, 121.0],
  ];
  await db.tbLine.createMany({ data: tb.map(([account, name, leadCode, prior, current]) => ({ engagementId: fs.id, account, name, leadCode, prior: M(prior), current: M(current) })) });
  await procs(fs.id, [
    ["C1", "Bank confirmations and reconciliations", "Cash — existence", "in_review"],
    ["C2", "Debtors circularisation, top 20 balances", "Receivables — existence", "in_progress", "Letters sent to 20 customers; 12 replies received, all agreed."],
    ["C3", "Expected credit loss model review", "Receivables — valuation", "in_progress"],
    ["C4", "Inventory count attendance", "Inventory — existence", "signed_off"],
    ["C5", "Revenue cut-off testing", "Revenue — cut-off", "not_started"],
    ["C6", "Journal entry testing", "Management override", "in_progress"],
  ]);
  await db.evidenceRequest.create({ data: { engagementId: fs.id, code: "PBC-01", title: "Debtors ageing as at 30 June 2026", dueDate: d(-8), status: "accepted", acceptedAt: d(-7), assigneeName: "A. Mutiso, Finance Manager" } });
  await db.evidenceRequest.create({ data: { engagementId: fs.id, code: "PBC-02", title: "Bank reconciliations June 2026, all accounts", dueDate: d(-6), status: "accepted", acceptedAt: d(-5), assigneeName: "A. Mutiso, Finance Manager" } });
  await db.evidenceRequest.create({ data: { engagementId: fs.id, code: "PBC-03", title: "Board minutes for the year", dueDate: d(3), status: "open", assigneeName: "Company Secretary" } });
  await db.evidenceRequest.create({ data: { engagementId: fs.id, code: "PBC-04", title: "Fixed asset register with additions schedule", dueDate: d(-1), status: "open", assigneeName: "A. Mutiso, Finance Manager" } });
  await finding(fs.id, { title: "Credit limits overridden without approval", severity: "medium", status: "awaiting_response", condition: "Sales to 5 customers exceeded their credit limits by 20–60% with no recorded approval.", criteria: "Credit Policy requires CFO approval above the limit.", effect: "Increases the risk of bad debts.", recommendation: "Block over-limit sales in the system pending approval.", ownerName: "A. Mutiso, Finance Manager", dueDate: d(30) }, [["raised", "Finding raised from C3", "Joseph Mwangi", -3]]);

  // a few files on the audit files
  const files: [string, string, string, string, string, string][] = [
    [fs.id, "C · Fieldwork / C1 · Cash & bank", "Bank reconciliation June 2026.csv", "C1", "A. Mutiso (auditee)", "account,book balance,bank balance,reconciling items\n1400,131300000,131950000,-650000\n1410,30000000,30000000,0\n"],
    [fs.id, "C · Fieldwork / C2 · Receivables", "Debtors ageing 30.06.2026.csv", "C2", "A. Mutiso (auditee)", "customer,0-30,31-60,61-90,90+\nKilima Foods,18200000,4100000,0,0\nSavanna Cement,22600000,9800000,6200000,3100000\n"],
    [fs.id, "A · Planning & acceptance", "Planning memorandum.txt", "A1", "Daniel Kiprop", "Planning memorandum — Mara Logistics Limited, year ended 30 June 2026.\nSignificant risks: revenue recognition, recoverability of receivables.\n"],
    [proc.id, "C · Fieldwork", "Supplier master extract.csv", "P-04", "R. Njoroge (auditee)", "supplier,created,created_by,approved_by\nS-1041,2025-08-02,jdoe,\nS-1077,2025-09-14,jdoe,\n"],
  ];
  for (const [engagementId, folder, name, linkRef, uploadedBy, text] of files) {
    const ext = name.split(".").pop()!;
    const { key, size } = await store(org.id, text, ext);
    await db.document.create({ data: { orgId: org.id, engagementId, folder, name, ext, mime: ext === "csv" ? "text/csv" : "text/plain", size, storageKey: key, linkRef, uploadedBy, source: uploadedBy.includes("auditee") ? "client" : "auditor", status: uploadedBy.includes("auditee") ? "reviewed" : "uploaded", createdAt: d(-4) } });
  }

  await db.counter.createMany({ data: [{ orgId: org.id, key: `eng-${year}`, value: engN }, { orgId: org.id, key: "finding", value: fndN }] });
  await db.auditLog.create({ data: { orgId: org.id, actorName: "System", action: "loaded demo data", entity: "organization", entityId: org.id } });

  console.log(`Demo organisation "${ORG_NAME}" created.`);
  console.log(`Sign in with any of these, password ${PASSWORD}:`);
  for (const u of [amina, daniel, priscilla, joseph, sarah]) console.log(`  ${u.email}  (${u.role})`);
  console.log(`Auditee portal (procurement audit): ${process.env.APP_URL ?? "http://localhost:3400"}/p/${portal.token}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
