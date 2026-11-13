// Adds an audit universe, a risk & control library, an audit plan and control tests to the demo firm.
// Additive and safe to run on a live database: it does nothing if the demo firm already has a universe.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ORG = "Demo Audit Partners";

async function counter(orgId: string, key: string) {
  const c = await db.counter.upsert({ where: { orgId_key: { orgId, key } }, create: { orgId, key, value: 1 }, update: { value: { increment: 1 } } });
  return c.value;
}
const ago = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
};

async function main() {
  const org = await db.organization.findFirst({ where: { name: ORG } });
  if (!org) throw new Error(`${ORG} not found. Run the main seed first.`);
  if (await db.auditableEntity.count({ where: { orgId: org.id } })) {
    console.log("The demo firm already has an audit universe; nothing to do.");
    return;
  }
  const users = Object.fromEntries((await db.user.findMany({ where: { orgId: org.id } })).map((u) => [u.email.split("@")[0], u]));
  const clients = Object.fromEntries((await db.client.findMany({ where: { orgId: org.id } })).map((c) => [c.name, c.id]));
  const pwani = clients["Pwani Group Ltd"] ?? null;
  const mara = clients["Mara Logistics Limited"] ?? null;

  // ---- audit universe ----
  // [name, client, category, owner, impact, likelihood, controls, cycle, last audited (months ago, null = never)]
  const U: [string, string | null, string, string, number, number, string, number, number | null][] = [
    ["Procure-to-pay", pwani, "Finance", "Head of Procurement", 4, 4, "weak", 12, 20],
    ["Treasury & cash management", pwani, "Finance", "Group Treasurer", 5, 4, "adequate", 12, 14],
    ["IT access & privileged accounts", pwani, "Technology", "Head of IT", 5, 4, "needs_improvement", 12, 11],
    ["Payroll & HR master data", pwani, "People", "HR Director", 4, 3, "adequate", 24, 30],
    ["Branch cash handling", pwani, "Operations", "Regional Operations Manager", 4, 4, "needs_improvement", 12, 9],
    ["Donor grant compliance", pwani, "Compliance", "Grants Manager", 4, 3, "adequate", 24, null],
    ["Fleet fuel management", pwani, "Operations", "Fleet Manager", 3, 4, "needs_improvement", 24, 2],
    ["Inventory & warehousing", pwani, "Operations", "Warehouse Manager", 3, 3, "adequate", 36, 28],
    ["Data protection (Data Protection Act 2019)", null, "Compliance", "Data Protection Officer", 4, 3, "adequate", 24, null],
    ["Cyber security & incident response", null, "Technology", "Chief Information Officer", 5, 3, "adequate", 24, 18],
    ["Revenue & billing", mara, "Finance", "Commercial Director", 4, 3, "adequate", 24, 16],
    ["Customs clearing & freight", mara, "Operations", "Operations Director", 4, 4, "weak", 12, null],
    ["Fixed assets", mara, "Finance", "Finance Manager", 3, 2, "strong", 36, 26],
    ["Corporate governance & board", null, "Governance", "Company Secretary", 4, 2, "strong", 36, 22],
    ["Health & safety", mara, "Operations", "HSE Manager", 3, 3, "adequate", 36, 40],
    ["Facilities management", null, "Operations", "Facilities Manager", 2, 2, "strong", 48, 35],
  ];
  const entities: Record<string, string> = {};
  for (const [name, clientId, category, owner, impact, likelihood, controlEnv, cycleMonths, last] of U) {
    const n = await counter(org.id, "entity");
    const e = await db.auditableEntity.create({
      data: { orgId: org.id, code: `AU-${String(n).padStart(3, "0")}`, name, clientId, category, owner, impact, likelihood, controlEnv, cycleMonths, lastAuditedAt: last === null ? null : ago(last) },
    });
    entities[name] = e.id;
  }

  // ---- risk & control library ----
  const risk = async (process: string, title: string, rating: string) => {
    const n = await counter(org.id, "risk");
    return db.risk.create({ data: { orgId: org.id, code: `R-${String(n).padStart(3, "0")}`, process, title, rating } });
  };
  const control = async (process: string, title: string, o: { type?: string; nature?: string; frequency: string; key?: boolean; owner: string; assertion?: string; component?: string; design?: string; operating?: string; tested?: number }, risks: { id: string }[]) => {
    const n = await counter(org.id, "control");
    return db.control.create({
      data: {
        orgId: org.id,
        code: `C-${String(n).padStart(3, "0")}`,
        process,
        title,
        type: o.type ?? "preventive",
        nature: o.nature ?? "manual",
        frequency: o.frequency,
        key: o.key ?? true,
        ownerName: o.owner,
        assertion: o.assertion ?? null,
        component: o.component ?? "Control activities",
        design: o.design ?? "effective",
        operating: o.operating ?? "not_tested",
        lastTestedAt: o.tested === undefined ? null : ago(o.tested),
        risks: { connect: risks.map((r) => ({ id: r.id })) },
      },
    });
  };

  const P = "Procure-to-pay";
  const r1 = await risk(P, "Payments to fictitious or unapproved vendors", "critical");
  const r2 = await risk(P, "Purchases made without proper approval", "high");
  const r3 = await risk(P, "Payment for goods or services not received", "high");
  const r4 = await risk(P, "Supplier liabilities incomplete or misstated at period end", "medium");
  const r5 = await risk(P, "Unauthorised or altered payments released from the bank", "critical");
  await control(P, "Vendor master changes are approved by the Head of Procurement and checked against supporting documents by Finance", { frequency: "per_transaction", owner: "Head of Procurement", assertion: "Existence", operating: "ineffective", tested: 14 }, [r1]);
  await control(P, "The ERP blocks a vendor bank account already held by another vendor or an employee", { nature: "automated", frequency: "continuous", owner: "ERP Application Owner", assertion: "Existence", operating: "effective", tested: 14 }, [r1]);
  await control(P, "No user can both create vendors and approve payments (role design enforced in the ERP)", { nature: "automated", frequency: "continuous", owner: "Head of IT", assertion: "Existence" }, [r1, r5]);
  await control(P, "Purchase orders above KES 5m are approved in the ERP according to the delegation of authority", { nature: "it_dependent", frequency: "per_transaction", owner: "CFO", assertion: "Occurrence", operating: "effective", tested: 14 }, [r2]);
  const c3way = await control(P, "Three-way match of purchase order, goods received note and invoice before an invoice can be paid", { nature: "automated", frequency: "per_transaction", owner: "AP Manager", assertion: "Occurrence" }, [r3]);
  await control(P, "Monthly reconciliation of supplier statements over KES 1m to the AP ledger, reviewed by the Finance Controller", { type: "detective", frequency: "monthly", owner: "AP Accountant", assertion: "Completeness", component: "Monitoring activities", design: "needs_improvement" }, [r4]);
  await control(P, "Quarterly review of AP ageing and the goods-received-not-invoiced accrual", { type: "detective", frequency: "quarterly", key: false, owner: "Finance Controller", assertion: "Cut-off", component: "Monitoring activities" }, [r4]);
  await control(P, "Payment runs are reviewed and released in the bank portal by two authorised signatories", { frequency: "weekly", owner: "Finance Controller", assertion: "Occurrence" }, [r5]);

  const Y = "Payroll";
  const p1 = await risk(Y, "Payments to employees who have left or do not exist", "high");
  const p2 = await risk(Y, "Unauthorised changes to pay rates or bank details", "high");
  const p3 = await risk(Y, "Statutory deductions (PAYE, NSSF, SHIF, housing levy) wrong or paid late", "medium");
  const cPay = await control(Y, "HR checks each month's payroll against the approved headcount and leavers list before it is released", { type: "detective", frequency: "monthly", owner: "HR Director", assertion: "Occurrence" }, [p1]);
  await control(Y, "Changes to pay rates and bank details need a signed form and approval by the HR Director in the HR system", { nature: "it_dependent", frequency: "per_transaction", owner: "Payroll Officer", assertion: "Accuracy" }, [p2]);
  await control(Y, "Payroll changes report reviewed and signed by the Finance Manager before payment", { type: "detective", frequency: "monthly", owner: "Finance Manager", assertion: "Accuracy" }, [p1, p2]);
  await control(Y, "Statutory returns reconciled to payroll and filed by the 9th of each month", { type: "detective", frequency: "monthly", owner: "Payroll Officer", assertion: "Completeness", operating: "effective", tested: 7 }, [p3]);

  const I = "IT access management";
  const i1 = await risk(I, "Leavers keep access to systems after they exit", "high");
  const i2 = await risk(I, "Excessive privileged access to the ERP and servers", "critical");
  const i3 = await risk(I, "Users hold access that conflicts with their duties", "high");
  await control(I, "HR leaver notifications trigger account disablement within 24 hours", { frequency: "per_transaction", owner: "IT Service Desk", assertion: "Existence", operating: "effective_exception", tested: 11 }, [i1]);
  await control(I, "Quarterly user access review signed off by each system owner", { type: "detective", frequency: "quarterly", owner: "System owners", component: "Monitoring activities", operating: "effective", tested: 11 }, [i1, i3]);
  await control(I, "Privileged accounts use multi-factor authentication and are reviewed monthly by the Head of IT", { frequency: "monthly", owner: "Head of IT", design: "needs_improvement", operating: "ineffective", tested: 11 }, [i2]);
  await control(I, "New access requests approved by the line manager and system owner in the service desk", { nature: "it_dependent", frequency: "per_transaction", owner: "IT Service Desk", assertion: "Existence" }, [i3]);

  const T = "Treasury & cash";
  const t1 = await risk(T, "Cash misappropriated at branches", "high");
  const t2 = await risk(T, "Bank balances misstated or unreconciled", "medium");
  await control(T, "Daily cash count at each branch signed by the cashier and branch manager, with surprise counts monthly", { type: "detective", frequency: "daily", owner: "Branch Managers", assertion: "Existence", operating: "effective_exception", tested: 9 }, [t1]);
  await control(T, "Monthly bank reconciliations prepared within 5 working days and reviewed by the Finance Controller", { type: "detective", frequency: "monthly", owner: "Finance Controller", assertion: "Existence", component: "Monitoring activities", operating: "effective", tested: 9 }, [t2]);
  await control(T, "Cash deposited to the bank daily; deposits reconciled to till reports", { frequency: "daily", key: false, owner: "Branch Managers", assertion: "Completeness" }, [t1]);

  // ---- audit plan for next year ----
  const year = new Date().getFullYear() + 1;
  if (!(await db.auditPlan.findUnique({ where: { orgId_year: { orgId: org.id, year } } }))) {
    const plan = await db.auditPlan.create({ data: { orgId: org.id, year, capacityHours: 4200 } });
    const items: [string, string, string | undefined, number, number, number][] = [
      ["Procure-to-pay", "assurance", users.priscilla?.id, 360, 1, 2],
      ["Treasury & cash management", "assurance", users.daniel?.id, 320, 2, 3],
      ["IT access & privileged accounts", "it", users.daniel?.id, 300, 3, 4],
      ["Branch cash handling", "assurance", users.priscilla?.id, 280, 4, 5],
      ["Customs clearing & freight", "assurance", users.daniel?.id, 400, 5, 7],
      ["Data protection (Data Protection Act 2019)", "compliance", users.priscilla?.id, 240, 6, 7],
      ["Donor grant compliance", "compliance", users.priscilla?.id, 260, 8, 9],
      ["Revenue & billing", "assurance", users.daniel?.id, 300, 9, 10],
    ];
    for (const [name, kind, leadId, hours, startMonth, endMonth] of items) {
      await db.planItem.create({ data: { planId: plan.id, entityId: entities[name], title: name, kind, leadId: leadId ?? null, hours, startMonth, endMonth } });
    }
    await db.planItem.create({ data: { planId: plan.id, title: "Follow-up of high-risk findings", kind: "followup", leadId: users.priscilla?.id ?? null, hours: 160, startMonth: 11, endMonth: 12 } });
  }

  // ---- control tests on existing engagements ----
  const procurement = await db.engagement.findFirst({ where: { orgId: org.id, name: { startsWith: "Procurement" } } });
  if (procurement) {
    const t = await db.controlTest.create({
      data: {
        orgId: org.id,
        engagementId: procurement.id,
        controlId: c3way.id,
        ref: "CT-01",
        testType: "operating",
        periodStart: new Date(new Date().getFullYear(), 0, 1),
        periodEnd: new Date(new Date().getFullYear(), 8, 30),
        population: 4312,
        populationValue: 1_840_000_000n,
        populationSource: "ERP paid-invoice report for the period; total agreed to the AP control account in the general ledger",
        method: "random",
        confidence: 90,
        tolerableRate: 5,
        attributes: [
          { key: "A", label: "PO approved before the invoice date", how: "Compare the PO approval time in the ERP with the invoice date" },
          { key: "B", label: "Goods received quantity agrees to the invoice", how: "Agree GRN quantity to invoice lines" },
          { key: "C", label: "Invoice price within 2% of the PO price", how: "Recalculate the price variance per line" },
          { key: "D", label: "Paid only after match status was Matched", how: "Check match status and the payment run log" },
        ],
        status: "concluded",
        result: "effective_exception",
        conclusion:
          "25 invoices were selected at random from 4,312 paid in the period. One deviation (item 17): the invoice price was 6.8% above the PO and the AP Supervisor overrode the variance without a documented reason. 1 deviation in 25 (4%) is within the 5% tolerable rate, so the control operated effectively. The override weakness is raised as a finding.",
        preparedById: users.joseph?.id ?? null,
        preparedAt: ago(0),
        reviewedById: users.daniel?.id ?? null,
        reviewedAt: ago(0),
      },
    });
    const vendors = ["Rift Valley Tyres Ltd", "Pwani Fuel Distributors", "Lakeside Freight Services", "Mlima Office Supplies", "Nyika Spares & Hardware", "Tana Security Services"];
    for (let i = 1; i <= 25; i++) {
      const fail = i === 17;
      await db.testSample.create({
        data: {
          testId: t.id,
          idx: i,
          ref: `INV-26-${String(4400 + i * 193).padStart(5, "0")}`,
          description: vendors[i % vendors.length],
          amount: BigInt(Math.round((((i * 7919) % 6800) + 90) * 1000)),
          results: { A: "pass", B: "pass", C: fail ? "fail" : "pass", D: "pass" },
          comment: fail ? "Price 6.8% above PO; variance overridden by AP Supervisor with no reason recorded" : null,
        },
      });
    }
    await db.control.update({ where: { id: c3way.id }, data: { operating: "effective_exception", lastTestedAt: new Date() } });
  }
  const payroll = await db.engagement.findFirst({ where: { orgId: org.id, name: { startsWith: "Payroll" } } });
  if (payroll) {
    const t = await db.controlTest.create({
      data: {
        orgId: org.id,
        engagementId: payroll.id,
        controlId: cPay.id,
        ref: "CT-01",
        testType: "operating",
        population: 12,
        populationSource: "Monthly payroll approval packs, January to December",
        method: "random",
        attributes: [
          { key: "A", label: "Headcount check performed before release", how: "Inspect the signed headcount reconciliation" },
          { key: "B", label: "Leavers removed before the pay date", how: "Agree leavers list to payroll register" },
          { key: "C", label: "Signed by the HR Director", how: "Inspect signature and date" },
        ],
        status: "in_progress",
      },
    });
    for (const [i, m] of ["March", "August"].entries()) {
      await db.testSample.create({ data: { testId: t.id, idx: i + 1, ref: `Payroll ${m}`, description: "Monthly approval pack", results: i === 0 ? { A: "pass", B: "pass", C: "pass" } : {} } });
    }
  }

  await db.auditLog.create({ data: { orgId: org.id, actorName: "System", action: "loaded sample audit universe, plan and control library", entity: "plan" } });
  console.log("Added: 16 auditable entities, 13 risks, 19 controls, a draft plan for", year, "and 2 control tests.");
}

main().finally(() => db.$disconnect());
