// Adds analytics data (with planted exceptions), IT systems and an access review, compliance frameworks and a
// quality review to the demo firm. Additive: does nothing if the demo firm already has analytics data.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_PARAMS, guessColumns, runChecks, type Kind } from "../src/lib/analytics";
import { STARTERS } from "../src/lib/frameworks";

const db = new PrismaClient();
const ORG = "Demo Audit Partners";

// a small deterministic random generator, so the demo data is the same every time
let seed = 20261113;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const weekday = (d: Date) => {
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};
/** Amounts spread over several orders of magnitude, so first digits follow Benford's law. */
const natural = (min: number, max: number) => Math.round(Math.exp(Math.log(min) + rnd() * (Math.log(max) - Math.log(min))));

async function addSet(orgId: string, engagementId: string | null, kind: Kind, name: string, headers: string[], rows: string[][], by: string) {
  const columns = guessColumns(kind, headers);
  const ds = await db.dataSet.create({ data: { orgId, engagementId, kind, name, headers, columns, rowCount: rows.length, uploadedBy: by } });
  for (let i = 0; i < rows.length; i += 2000) await db.dataRow.createMany({ data: rows.slice(i, i + 2000).map((cells, j) => ({ dataSetId: ds.id, idx: i + j, cells })) });
  return { ds, columns };
}
async function run(dsId: string, kind: Kind, rows: string[][], columns: Record<string, number>, by: string, banks?: Map<string, string>) {
  for (const r of runChecks(kind, rows.map((cells, idx) => ({ idx, cells })), columns, DEFAULT_PARAMS, banks)) {
    await db.analyticRun.create({
      data: { dataSetId: dsId, rule: r.rule, params: DEFAULT_PARAMS, tested: r.tested, hits: r.hits.length, summary: (r.summary ?? (r.skipped ? { skipped: r.skipped } : undefined)) as object | undefined, ranBy: by, exceptions: { create: r.hits.slice(0, 1000).map((h) => ({ rowIdx: h.row, detail: h.detail })) } },
    });
  }
}

async function main() {
  const org = await db.organization.findFirst({ where: { name: ORG } });
  if (!org) throw new Error(`${ORG} not found`);
  if (await db.dataSet.count({ where: { orgId: org.id } })) {
    console.log("Phase 3 demo data is already there; nothing to do.");
    return;
  }
  const users = Object.fromEntries((await db.user.findMany({ where: { orgId: org.id } })).map((u) => [u.email.split("@")[0], u]));
  const eng = Object.fromEntries((await db.engagement.findMany({ where: { orgId: org.id } })).map((e) => [e.name.split(" ")[0].toLowerCase(), e]));
  const y = new Date().getFullYear();
  const by = users.joseph?.name ?? "Demo auditor";

  // ---- journals: ~600 lines, with weekend, same-person, round, period-end and late-night entries planted ----
  const staff = ["j.otieno", "m.wanjiru", "p.kamau", "a.ndegwa", "s.kiprop"];
  const accounts = [["6100", "Fuel and oil"], ["6200", "Repairs and maintenance"], ["6420", "Consultancy fees"], ["5100", "Cost of sales"], ["7100", "Salaries"], ["6600", "Travel"], ["4100", "Revenue"], ["1530", "Suspense"]];
  const jh = ["Journal No", "Posting Date", "Posting Time", "Account", "Description", "Debit", "Credit", "Prepared By", "Approved By"];
  const jr: string[][] = [];
  for (let n = 1; n <= 300; n++) {
    const d = weekday(new Date(y, Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 27)));
    let amount = natural(2_000, 9_000_000);
    let date = d;
    let time = `${String(8 + Math.floor(rnd() * 9)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`;
    const prep = pick(staff);
    let appr = pick(staff.filter((x) => x !== prep));
    if (n % 37 === 0) date = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - d.getDay())); // a Saturday
    if (n % 53 === 0) appr = prep;
    if (n % 41 === 0) amount = (1 + Math.floor(rnd() * 9)) * 1_000_000;
    if (n % 47 === 0) date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (n % 59 === 0) time = "23:14";
    if (n === 150) amount = 14_750_000;
    const [acc, desc] = pick(accounts);
    const ref = `JE-${y % 100}-${String(10000 + n)}`;
    jr.push([ref, iso(date), time, acc, desc, String(amount), "", prep, appr]);
    jr.push([ref, iso(date), time, "2100", "Accounts payable", "", String(amount), prep, appr]);
  }
  const j = await addSet(org.id, eng.statutory?.id ?? null, "journals", `General ledger journals Jan–Oct ${y}`, jh, jr, by);
  await run(j.ds.id, "journals", jr, j.columns, by);

  // ---- payroll: 80 staff, two sharing an account, one paid twice, one far above the norm, one inactive ----
  const depts = ["Finance", "Operations", "Sales", "Logistics"];
  const yh = ["Employee No", "Name", "National ID", "Bank Account", "Net Pay", "Department", "Last Attendance"];
  const first = ["Mary", "John", "Grace", "Peter", "Faith", "David", "Lucy", "James", "Ann", "Paul", "Ruth", "Samuel"];
  const last = ["Wambui", "Otieno", "Mutua", "Kiprono", "Achieng", "Njoroge", "Chebet", "Odhiambo", "Kamau", "Wekesa"];
  const yr: string[][] = [];
  for (let n = 1; n <= 80; n++) {
    yr.push([`E${String(1000 + n)}`, `${pick(first)} ${pick(last)}`, String(20_000_000 + n * 7919), `0110${String(500000 + n * 37)}`, String(natural(35_000, 180_000)), pick(depts), iso(new Date(Date.now() - Math.floor(rnd() * 5) * 864e5))]);
  }
  yr[14][3] = yr[3][3];
  yr.push(["E1099", yr[21][1], yr[21][2], "01109990001", yr[21][4], "Operations", iso(new Date(Date.now() - 2 * 864e5))]);
  yr[30][4] = "920000";
  yr[30][5] = "Sales";
  yr[44][6] = iso(new Date(Date.now() - 140 * 864e5));
  const p = await addSet(org.id, eng.payroll?.id ?? null, "payroll", `Payroll run October ${y}`, yh, yr, by);
  await run(p.ds.id, "payroll", yr, p.columns, by);

  // ---- payments: 220, with a duplicate invoice, a split, a shared account and a supplier paid into a salary account ----
  const vendors = [["Rift Valley Tyres Ltd", "0220110001"], ["Pwani Fuel Distributors", "0220110002"], ["Nyika Spares & Hardware", "0220110003"], ["Lakeside Freight Services", "0220110004"], ["Mlima Office Supplies", "0220110005"], ["Tana Security Services", "0220110006"]];
  const ph = ["Payment Ref", "Payment Date", "Supplier", "Invoice No", "Amount", "Bank Account"];
  const pr: string[][] = [];
  for (let n = 1; n <= 220; n++) {
    const [v, b] = pick(vendors);
    pr.push([`PAY-${String(5000 + n)}`, iso(weekday(new Date(y, Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 27)))), v, `INV-${String(30000 + n)}`, String(natural(20_000, 4_500_000)), b]);
  }
  pr.push(["PAY-5901", pr[10][1], pr[10][2], pr[10][3], pr[10][4], pr[10][5]]);
  pr.push(["PAY-5902", `${y}-08-14`, "Nyika Spares & Hardware", "INV-39001", "3200000", "0220110003"], ["PAY-5903", `${y}-08-14`, "Nyika Spares & Hardware", "INV-39002", "2900000", "0220110003"]);
  pr.push(["PAY-5904", `${y}-09-03`, "Kilifi Logistics Consultants", "INV-39100", "850000", "0220110004"]);
  pr.push(["PAY-5905", `${y}-09-17`, "Bahari Advisory Services", "INV-39200", "1240000", yr[7][3]]);
  const pay = await addSet(org.id, eng.procurement?.id ?? null, "payments", `Supplier payments Jan–Oct ${y}`, ph, pr, by);
  const banks = new Map(yr.map((r) => [r[3].toLowerCase(), `${r[1]} (${r[0]})`]));
  await run(pay.ds.id, "payments", pr, pay.columns, by, banks);

  // ---- IT systems and an access review ----
  const erp = await db.itSystem.create({ data: { orgId: org.id, name: "ERP (finance and supply chain)", description: "General ledger, purchasing, payables, payments", ownerName: "Finance Director", critical: true, access: "needs_improvement", change: "effective", operations: "effective", development: "not_applicable", lastTestedAt: new Date(Date.now() - 40 * 864e5) } });
  const hris = await db.itSystem.create({ data: { orgId: org.id, name: "Payroll and HR system", description: "Payroll, leave, staff records", ownerName: "HR Director", critical: true, access: "effective", change: "needs_improvement", operations: "effective", development: "not_applicable", lastTestedAt: new Date(Date.now() - 90 * 864e5) } });
  await db.itSystem.create({ data: { orgId: org.id, name: "Bank payments portal", description: "Release of supplier and payroll payments", ownerName: "Group Treasurer", critical: true, access: "ineffective", change: "not_applicable", operations: "not_tested", development: "not_applicable" } });
  await db.sodRule.createMany({
    data: [
      { orgId: org.id, systemId: erp.id, roleA: "Vendor Maintenance", roleB: "Payment Approver", risk: "critical", description: "Could create a supplier and pay it" },
      { orgId: org.id, systemId: erp.id, roleA: "Journal Entry", roleB: "Journal Approver", risk: "high", description: "Could post and approve their own journals" },
      { orgId: org.id, systemId: hris.id, roleA: "Employee Master", roleB: "Payroll Processing", risk: "high", description: "Could add a person and pay them" },
    ],
  });
  const review = await db.accessReview.create({ data: { orgId: org.id, title: `Q4 ${y} user access review`, dueDate: new Date(Date.now() + 10 * 864e5), createdBy: users.daniel?.name ?? "Demo" } });
  const erpList = await db.accessList.create({ data: { reviewId: review.id, systemId: erp.id, ownerName: "Finance Director", token: randomBytes(24).toString("base64url"), lastSeenAt: new Date(Date.now() - 864e5) } });
  const hrList = await db.accessList.create({ data: { reviewId: review.id, systemId: hris.id, ownerName: "HR Director", token: randomBytes(24).toString("base64url") } });
  const erpUsers: [string, string | null, string, string, string, string | null, string | null][] = [
    ["j.otieno", "John Otieno", "AP Clerk", "Finance", iso(new Date(Date.now() - 864e5)), "keep", null],
    ["m.wanjiru", "Mary Wanjiru", "Vendor Maintenance; Payment Approver", "Finance", iso(new Date(Date.now() - 2 * 864e5)), "keep", "Covering for the AP supervisor"],
    ["p.kamau", "Peter Kamau", "Journal Entry; Journal Approver", "Finance", iso(new Date(Date.now() - 864e5)), "change", "Remove Journal Approver"],
    ["a.ndegwa", "Alice Ndegwa", "Journal Entry", "Finance", iso(new Date(Date.now() - 3 * 864e5)), "keep", null],
    ["s.kiprop", "Samuel Kiprop", "Payment Approver", "Treasury", iso(new Date(Date.now() - 864e5)), null, null],
    ["l.chebet", "Lucy Chebet", "Purchasing", "Procurement", iso(new Date(Date.now() - 150 * 864e5)), "remove", "Left in July"],
    ["svc_interface", null, "Journal Entry; Journal Approver", "IT", iso(new Date()), null, null],
    ["r.njoroge", "Ruth Njoroge", "Purchasing; Vendor Maintenance", "Procurement", iso(new Date(Date.now() - 5 * 864e5)), null, null],
  ];
  await db.accessEntry.createMany({ data: erpUsers.map(([account, person, roles, department, lastLogin, decision, comment]) => ({ listId: erpList.id, account, person, roles, department, lastLogin, decision, comment, decidedAt: decision ? new Date() : null })) });
  await db.accessEntry.createMany({
    data: [
      { listId: hrList.id, account: "g.achieng", person: "Grace Achieng", roles: "Employee Master", department: "HR", lastLogin: iso(new Date(Date.now() - 864e5)) },
      { listId: hrList.id, account: "d.wekesa", person: "David Wekesa", roles: "Payroll Processing", department: "Finance", lastLogin: iso(new Date(Date.now() - 2 * 864e5)) },
      { listId: hrList.id, account: "f.mutua", person: "Faith Mutua", roles: "Employee Master; Payroll Processing", department: "HR", lastLogin: iso(new Date(Date.now() - 864e5)) },
    ],
  });

  // ---- compliance: both starters, with controls mapped ----
  const controls = Object.fromEntries((await db.control.findMany({ where: { orgId: org.id } })).map((c) => [c.title.slice(0, 30).toLowerCase(), c.id]));
  const cid = (start: string) => Object.entries(controls).find(([t]) => t.startsWith(start.toLowerCase()))?.[1];
  for (const st of STARTERS) {
    const f = await db.framework.create({ data: { orgId: org.id, name: st.name, source: st.key, requirements: { create: st.requirements.map((r, i) => ({ ref: r.ref, title: r.title, sort: i })) } } });
    const reqs = Object.fromEntries((await db.requirement.findMany({ where: { frameworkId: f.id } })).map((r) => [r.ref, r.id]));
    const map: [string, string | undefined][] =
      st.key === "coso-2013"
        ? [["P8", cid("Vendor master changes")], ["P10", cid("Three-way match")], ["P10", cid("Purchase orders above")], ["P11", cid("Privileged accounts")], ["P11", cid("HR leaver notifications")], ["P12", cid("Payment runs are reviewed")], ["P16", cid("Monthly reconciliation")], ["P16", cid("Quarterly user access")]]
        : [["DPA-09", cid("Privileged accounts")], ["DPA-09", cid("Quarterly user access")], ["DPA-08", cid("HR leaver notifications")]];
    for (const [ref, c] of map) if (c && reqs[ref]) await db.requirement.update({ where: { id: reqs[ref] }, data: { controls: { connect: { id: c } } } });
    if (st.key === "kenya-dpa-2019") await db.requirement.update({ where: { id: reqs["DPA-14"] }, data: { applicable: false, note: "No personal data is transferred outside Kenya" } });
  }

  // ---- quality: a completed review of the closed fleet audit, and this year's self-assessment ----
  if (eng.fleet && users.amina) {
    await db.qaReview.create({
      data: {
        orgId: org.id,
        engagementId: eng.fleet.id,
        reviewerId: users.amina.id,
        status: "completed",
        completedAt: new Date(Date.now() - 6 * 864e5),
        score: 80,
        notes: "Well evidenced overall. Sampling rationale should be written down on every test, and root causes need more depth.",
        results: {
          planning: { met: "yes" }, program: { met: "yes" }, sampling: { met: "partly", note: "Two tests had no written reason for the sample size" }, evidence: { met: "yes" }, conclusions: { met: "yes" },
          review: { met: "yes" }, findings: { met: "partly", note: "Root cause stated as 'oversight' on two findings" }, responses: { met: "yes" }, reporting: { met: "partly", note: "Report issued three weeks after fieldwork ended" }, independence: { met: "yes" },
        },
      },
    });
  }
  await db.conformance.create({
    data: {
      orgId: org.id,
      year: y,
      updatedBy: users.amina?.name ?? "Demo",
      ratings: {
        purpose: { rating: "generally" },
        ethics: { rating: "generally", gaps: "Two annual conflict-of-interest declarations outstanding", actions: "Collect by 15 December" },
        governing: { rating: "generally" },
        managing: { rating: "partially", gaps: "No approved technology and analytics strategy", actions: "Present a strategy to the audit committee in Q1" },
        performing: { rating: "partially", gaps: "Root cause not documented on several findings", actions: "Root-cause training for all staff" },
      },
    },
  });

  await db.auditLog.create({ data: { orgId: org.id, actorName: "System", action: "loaded sample analytics, IT audit, compliance and quality data", entity: "analytics" } });
  console.log("Added Phase 3 demo data.");
}

main().finally(() => db.$disconnect());
