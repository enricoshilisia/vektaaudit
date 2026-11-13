// Data analytics: the fields each kind of extract has, column guessing, and the checks. Pure functions, no database.

export type Kind = "journals" | "payments" | "payroll";
type Field = { key: string; label: string; required?: boolean; hints: string[] };

export const KINDS: { key: Kind; label: string; what: string; fields: Field[] }[] = [
  {
    key: "journals",
    label: "Journal entries",
    what: "General ledger journal lines from the accounting system",
    fields: [
      { key: "journal", label: "Journal number", required: true, hints: ["journal", "je", "entry", "voucher", "document", "doc no", "batch"] },
      { key: "date", label: "Posting date", required: true, hints: ["posting date", "post date", "date", "gl date"] },
      { key: "time", label: "Posting time", hints: ["time", "entered at", "created at", "timestamp"] },
      { key: "account", label: "Account", hints: ["account", "gl account", "acct", "ledger"] },
      { key: "description", label: "Description", hints: ["description", "narration", "memo", "text"] },
      { key: "amount", label: "Amount (debits positive)", hints: ["amount", "value", "net"] },
      { key: "debit", label: "Debit", hints: ["debit", "dr"] },
      { key: "credit", label: "Credit", hints: ["credit", "cr"] },
      { key: "preparer", label: "Prepared by", hints: ["prepared", "preparer", "created by", "entered by", "user", "posted by"] },
      { key: "approver", label: "Approved by", hints: ["approved", "approver", "authorised", "authorized"] },
    ],
  },
  {
    key: "payments",
    label: "Supplier payments",
    what: "Payments made to suppliers, from accounts payable or the bank",
    fields: [
      { key: "payment", label: "Payment reference", required: true, hints: ["payment", "reference", "ref", "cheque", "transaction"] },
      { key: "date", label: "Payment date", required: true, hints: ["payment date", "date", "value date"] },
      { key: "vendor", label: "Supplier", required: true, hints: ["supplier", "vendor", "payee", "beneficiary"] },
      { key: "invoice", label: "Invoice number", hints: ["invoice", "inv"] },
      { key: "amount", label: "Amount", required: true, hints: ["amount", "value", "paid", "total"] },
      { key: "bank", label: "Bank account paid into", hints: ["bank account", "account number", "account no", "iban", "bank"] },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    what: "One payroll run: a line per employee paid",
    fields: [
      { key: "employee", label: "Employee number", required: true, hints: ["employee no", "employee number", "staff no", "emp", "personnel", "payroll no"] },
      { key: "name", label: "Name", required: true, hints: ["name", "employee name", "full name"] },
      { key: "idNumber", label: "National ID", hints: ["id number", "national id", "id no", "nid", "passport"] },
      { key: "bank", label: "Bank account", hints: ["bank account", "account number", "account no", "bank"] },
      { key: "net", label: "Net pay", required: true, hints: ["net pay", "net", "take home", "amount"] },
      { key: "department", label: "Department", hints: ["department", "dept", "cost centre", "cost center", "section"] },
      { key: "lastAttendance", label: "Last attendance", hints: ["last attendance", "last clock", "last seen", "last login", "last present"] },
    ],
  },
];
export const kindOf = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[0];

/** Matches each field to a column by its heading; the auditor confirms or changes it. */
export function guessColumns(kind: Kind, headers: string[]) {
  const h = headers.map((x) => x.toLowerCase().replace(/[_\-.]+/g, " ").trim());
  const used = new Set<number>();
  const out: Record<string, number> = {};
  for (const f of kindOf(kind).fields) {
    let best = -1;
    for (const hint of f.hints) {
      best = h.findIndex((x, i) => !used.has(i) && x === hint);
      if (best < 0) best = h.findIndex((x, i) => !used.has(i) && x.includes(hint));
      if (best >= 0) break;
    }
    if (best >= 0) {
      out[f.key] = best;
      used.add(best);
    }
  }
  return out;
}

export function missingFields(kind: Kind, columns: Record<string, number>) {
  const miss = kindOf(kind).fields.filter((f) => f.required && columns[f.key] === undefined).map((f) => f.label);
  if (kind === "journals" && columns.amount === undefined && columns.debit === undefined) miss.push("Amount, or Debit and Credit");
  return miss;
}

// ---- reading cells ----

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** 2026-10-31, 31/10/2026, 31-10-2026, 31 Oct 2026, with or without a time. Day-first, as used in Kenya. */
export function parseDate(v: string | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}
/** "1,234.50", "(1,234)", "-1234" → number; credits in brackets are negative. */
export function num(v: string | undefined): number | null {
  const t = (v ?? "").trim();
  if (!t || t === "-") return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const norm = (v: string | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const day = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${Object.keys(MONTHS)[d.getMonth()].replace(/^./, (c) => c.toUpperCase())} ${d.getFullYear()}`;

/** Kenyan public holidays on fixed dates. Moveable ones (Easter, Eid) are not included. */
const HOLIDAYS: Record<string, string> = { "1-1": "New Year's Day", "5-1": "Labour Day", "6-1": "Madaraka Day", "10-10": "Mazingira Day", "10-20": "Mashujaa Day", "12-12": "Jamhuri Day", "12-25": "Christmas Day", "12-26": "Boxing Day" };
const holiday = (d: Date) => HOLIDAYS[`${d.getMonth() + 1}-${d.getDate()}`];

// ---- the checks ----

export type Params = { largeAmount: number; roundFrom: number; approvalLimit: number; periodEndFrom: number; inactiveDays: number; outlierTimes: number };
export const DEFAULT_PARAMS: Params = { largeAmount: 10_000_000, roundFrom: 100_000, approvalLimit: 5_000_000, periodEndFrom: 1_000_000, inactiveDays: 60, outlierTimes: 3 };
export const PARAM_LABELS: Record<keyof Params, { label: string; kinds: Kind[] }> = {
  largeAmount: { label: "Large journal from", kinds: ["journals"] },
  roundFrom: { label: "Round amounts from", kinds: ["journals", "payments"] },
  periodEndFrom: { label: "Period-end journals from", kinds: ["journals"] },
  approvalLimit: { label: "Payment approval limit", kinds: ["payments"] },
  inactiveDays: { label: "No attendance for (days)", kinds: ["payroll"] },
  outlierTimes: { label: "Pay above department median ×", kinds: ["payroll"] },
};

export type Hit = { row: number; detail: string };
export type Result = { rule: string; tested: number; hits: Hit[]; summary?: unknown; skipped?: string };
type Row = { idx: number; cells: string[] };
type Ctx = { rows: Row[]; col: Record<string, number>; p: Params; employeeBanks?: Map<string, string> };

export const RULES: Record<string, { kind: Kind; title: string; why: string }> = {
  weekend: { kind: "journals", title: "Posted at weekends or on public holidays", why: "Entries made when few people are working are less likely to be reviewed." },
  sameperson: { kind: "journals", title: "Prepared and approved by the same person", why: "No independent check took place." },
  round: { kind: "journals", title: "Round amounts", why: "Estimates and made-up entries are often round numbers." },
  large: { kind: "journals", title: "Large journals", why: "Material entries deserve a look at their support." },
  periodend: { kind: "journals", title: "Journals in the last three days of a month", why: "Period-end entries can be used to manage results." },
  afterhours: { kind: "journals", title: "Posted late at night or very early", why: "Entries outside working hours are unusual for most staff." },
  benford: { kind: "journals", title: "First-digit test (Benford's law)", why: "In natural financial data, small first digits are far more common. A poor fit can point to invented numbers." },
  duplicate: { kind: "payments", title: "Possible duplicate payments", why: "The same invoice, or the same amount to the same supplier within a week." },
  split: { kind: "payments", title: "Payments split to stay under the approval limit", why: "Several payments to one supplier on one day, each under the limit but together over it." },
  payround: { kind: "payments", title: "Round-sum payments", why: "Supplier invoices are rarely exact round numbers." },
  payweekend: { kind: "payments", title: "Payments made at weekends or on public holidays", why: "Payments released outside normal working days." },
  sharedbank: { kind: "payments", title: "Different suppliers paid into the same bank account", why: "Can point to a fictitious supplier or diverted payments." },
  employeebank: { kind: "payments", title: "Supplier paid into an employee's bank account", why: "A classic sign of a fictitious supplier set up by staff." },
  dupbank: { kind: "payroll", title: "Employees sharing a bank account", why: "Two salaries into one account can mean a ghost employee." },
  dupperson: { kind: "payroll", title: "The same person paid twice", why: "Same national ID or same name under different employee numbers." },
  outlier: { kind: "payroll", title: "Pay far above the department's norm", why: "Unusually high pay compared with colleagues in the same department." },
  inactive: { kind: "payroll", title: "Paid with no recent attendance", why: "People still paid after they stopped coming to work." },
};
export const rulesFor = (k: Kind) => Object.entries(RULES).filter(([, r]) => r.kind === k).map(([key, r]) => ({ key, ...r }));

const cell = (c: Ctx, r: Row, k: string) => (c.col[k] === undefined ? undefined : r.cells[c.col[k]]);
const amountOf = (c: Ctx, r: Row) => {
  const a = num(cell(c, r, "amount"));
  if (a !== null) return a;
  const d = num(cell(c, r, "debit")) ?? 0;
  const cr = num(cell(c, r, "credit")) ?? 0;
  return d || -cr;
};
/** First line of each journal, so date and people checks count journals rather than lines. */
const firstLines = (c: Ctx) => {
  const seen = new Set<string>();
  return c.rows.filter((r) => {
    const j = norm(cell(c, r, "journal"));
    if (!j || seen.has(j)) return false;
    seen.add(j);
    return true;
  });
};
/** The journal's size: the sum of its debit lines. */
const journalTotals = (c: Ctx) => {
  const t = new Map<string, number>();
  for (const r of c.rows) {
    const a = amountOf(c, r);
    if (a > 0) t.set(norm(cell(c, r, "journal")), (t.get(norm(cell(c, r, "journal"))) ?? 0) + a);
  }
  return t;
};
const isRound = (a: number, from: number) => Math.abs(a) >= from && Math.abs(a) % 10_000 === 0;

const CHECKS: Record<string, (c: Ctx) => Omit<Result, "rule">> = {
  weekend: (c) => {
    const js = firstLines(c);
    const hits: Hit[] = [];
    for (const r of js) {
      const d = parseDate(cell(c, r, "date"));
      if (!d) continue;
      const h = holiday(d);
      if (d.getDay() === 0 || d.getDay() === 6 || h) hits.push({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} posted on ${h ? `${h}, ` : ""}${day(d)}` });
    }
    return { tested: js.length, hits };
  },
  sameperson: (c) => {
    if (c.col.preparer === undefined || c.col.approver === undefined) return { tested: 0, hits: [], skipped: "Needs both Prepared by and Approved by columns" };
    const js = firstLines(c);
    const hits = js.filter((r) => norm(cell(c, r, "preparer")) && norm(cell(c, r, "preparer")) === norm(cell(c, r, "approver"))).map((r) => ({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} prepared and approved by ${cell(c, r, "preparer")}` }));
    return { tested: js.length, hits };
  },
  round: (c) => {
    const t = journalTotals(c);
    const hits = firstLines(c)
      .filter((r) => isRound(t.get(norm(cell(c, r, "journal"))) ?? 0, c.p.roundFrom))
      .map((r) => ({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} totals exactly ${fmt(t.get(norm(cell(c, r, "journal")))!)}` }));
    return { tested: t.size, hits };
  },
  large: (c) => {
    const t = journalTotals(c);
    const hits = firstLines(c)
      .filter((r) => (t.get(norm(cell(c, r, "journal"))) ?? 0) >= c.p.largeAmount)
      .map((r) => ({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} totals ${fmt(t.get(norm(cell(c, r, "journal")))!)}${cell(c, r, "description") ? `: ${cell(c, r, "description")}` : ""}` }));
    return { tested: t.size, hits };
  },
  periodend: (c) => {
    const t = journalTotals(c);
    const hits: Hit[] = [];
    for (const r of firstLines(c)) {
      const d = parseDate(cell(c, r, "date"));
      if (!d) continue;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const total = t.get(norm(cell(c, r, "journal"))) ?? 0;
      if (d.getDate() > last - 3 && total >= c.p.periodEndFrom) hits.push({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} of ${fmt(total)} posted on ${day(d)}` });
    }
    return { tested: t.size, hits };
  },
  afterhours: (c) => {
    const js = firstLines(c);
    const hits: Hit[] = [];
    let timed = 0;
    for (const r of js) {
      const raw = cell(c, r, "time") ?? cell(c, r, "date");
      const m = (raw ?? "").match(/(\d{1,2}):(\d{2})/);
      if (!m) continue;
      timed++;
      const h = +m[1];
      if (h < 6 || h >= 20) hits.push({ row: r.idx, detail: `Journal ${cell(c, r, "journal")} posted at ${m[1].padStart(2, "0")}:${m[2]}` });
    }
    return timed ? { tested: timed, hits } : { tested: 0, hits: [], skipped: "The file has no posting times" };
  },
  benford: (c) => {
    const counts = Array(9).fill(0);
    let n = 0;
    for (const r of c.rows) {
      const a = Math.abs(amountOf(c, r));
      if (a < 10) continue;
      counts[Number(String(Math.floor(a))[0]) - 1]++;
      n++;
    }
    if (n < 300) return { tested: n, hits: [], skipped: "Needs at least 300 amounts of 10 or more to be meaningful" };
    const expected = counts.map((_, i) => Math.log10(1 + 1 / (i + 1)));
    const observed = counts.map((x) => x / n);
    const mad = observed.reduce((s, o, i) => s + Math.abs(o - expected[i]), 0) / 9;
    // conformity bands for the first-digit test (mean absolute deviation)
    const fit = mad < 0.006 ? "Close conformity" : mad < 0.012 ? "Acceptable conformity" : mad < 0.015 ? "Marginal conformity" : "Nonconformity";
    return { tested: n, hits: [], summary: { observed, expected, counts, mad, fit } };
  },
  duplicate: (c) => {
    const hits: Hit[] = [];
    const byInvoice = new Map<string, Row>();
    const byAmount = new Map<string, { r: Row; d: Date }[]>();
    for (const r of c.rows) {
      const v = norm(cell(c, r, "vendor"));
      const inv = norm(cell(c, r, "invoice"));
      const a = num(cell(c, r, "amount"));
      if (inv) {
        const k = `${v}|${inv}`;
        const first = byInvoice.get(k);
        if (first) {
          hits.push({ row: r.idx, detail: `${cell(c, r, "vendor")} invoice ${cell(c, r, "invoice")} paid again (first as ${cell(c, first, "payment")})` });
          continue;
        }
        byInvoice.set(k, r);
      }
      const d = parseDate(cell(c, r, "date"));
      if (a === null || !d) continue;
      const k = `${v}|${a}`;
      const prior = (byAmount.get(k) ?? []).find((x) => Math.abs(x.d.getTime() - d.getTime()) <= 7 * 864e5);
      if (prior) hits.push({ row: r.idx, detail: `${cell(c, r, "vendor")} paid ${fmt(a)} again within a week (also ${cell(c, prior.r, "payment")})` });
      byAmount.set(k, [...(byAmount.get(k) ?? []), { r, d }]);
    }
    return { tested: c.rows.length, hits };
  },
  split: (c) => {
    const groups = new Map<string, Row[]>();
    for (const r of c.rows) {
      const d = parseDate(cell(c, r, "date"));
      const a = num(cell(c, r, "amount"));
      if (!d || a === null || a >= c.p.approvalLimit) continue;
      const k = `${norm(cell(c, r, "vendor"))}|${d.toDateString()}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const hits: Hit[] = [];
    for (const rs of groups.values()) {
      const total = rs.reduce((s, r) => s + (num(cell(c, r, "amount")) ?? 0), 0);
      if (rs.length >= 2 && total >= c.p.approvalLimit)
        for (const r of rs) hits.push({ row: r.idx, detail: `${rs.length} payments to ${cell(c, r, "vendor")} on ${cell(c, r, "date")} total ${fmt(total)}, each under the ${fmt(c.p.approvalLimit)} limit` });
    }
    return { tested: c.rows.length, hits };
  },
  payround: (c) => ({
    tested: c.rows.length,
    hits: c.rows.filter((r) => isRound(num(cell(c, r, "amount")) ?? 0, c.p.roundFrom)).map((r) => ({ row: r.idx, detail: `${cell(c, r, "vendor")} paid exactly ${fmt(num(cell(c, r, "amount"))!)}` })),
  }),
  payweekend: (c) => {
    const hits: Hit[] = [];
    for (const r of c.rows) {
      const d = parseDate(cell(c, r, "date"));
      if (d && (d.getDay() === 0 || d.getDay() === 6 || holiday(d))) hits.push({ row: r.idx, detail: `${cell(c, r, "vendor")} paid ${fmt(num(cell(c, r, "amount")) ?? 0)} on ${holiday(d) ? `${holiday(d)}, ` : ""}${day(d)}` });
    }
    return { tested: c.rows.length, hits };
  },
  sharedbank: (c) => {
    if (c.col.bank === undefined) return { tested: 0, hits: [], skipped: "Needs the bank account column" };
    const vendorsByBank = new Map<string, Set<string>>();
    for (const r of c.rows) {
      const b = norm(cell(c, r, "bank")).replace(/[\s-]/g, "");
      if (b) vendorsByBank.set(b, (vendorsByBank.get(b) ?? new Set()).add(norm(cell(c, r, "vendor"))));
    }
    const hits: Hit[] = [];
    const flagged = new Set<string>();
    for (const r of c.rows) {
      const b = norm(cell(c, r, "bank")).replace(/[\s-]/g, "");
      const vs = vendorsByBank.get(b);
      const k = `${b}|${norm(cell(c, r, "vendor"))}`;
      if (vs && vs.size > 1 && !flagged.has(k)) {
        flagged.add(k);
        hits.push({ row: r.idx, detail: `Account ${cell(c, r, "bank")} receives payments for ${vs.size} different suppliers, including ${cell(c, r, "vendor")}` });
      }
    }
    return { tested: c.rows.length, hits };
  },
  employeebank: (c) => {
    if (c.col.bank === undefined) return { tested: 0, hits: [], skipped: "Needs the bank account column" };
    if (!c.employeeBanks?.size) return { tested: 0, hits: [], skipped: "Upload a payroll file with bank accounts to compare against" };
    const hits: Hit[] = [];
    const flagged = new Set<string>();
    for (const r of c.rows) {
      const b = norm(cell(c, r, "bank")).replace(/[\s-]/g, "");
      const who = c.employeeBanks.get(b);
      if (who && !flagged.has(`${b}|${norm(cell(c, r, "vendor"))}`)) {
        flagged.add(`${b}|${norm(cell(c, r, "vendor"))}`);
        hits.push({ row: r.idx, detail: `${cell(c, r, "vendor")} is paid into account ${cell(c, r, "bank")}, which is also ${who}'s salary account` });
      }
    }
    return { tested: c.rows.length, hits };
  },
  dupbank: (c) => {
    if (c.col.bank === undefined) return { tested: 0, hits: [], skipped: "Needs the bank account column" };
    const byBank = new Map<string, Row[]>();
    for (const r of c.rows) {
      const b = norm(cell(c, r, "bank")).replace(/[\s-]/g, "");
      if (b) byBank.set(b, [...(byBank.get(b) ?? []), r]);
    }
    const hits: Hit[] = [];
    for (const rs of byBank.values()) if (rs.length > 1) for (const r of rs) hits.push({ row: r.idx, detail: `${cell(c, r, "name")} (${cell(c, r, "employee")}) is paid into account ${cell(c, r, "bank")}, shared with ${rs.length - 1} other employee${rs.length > 2 ? "s" : ""}` });
    return { tested: c.rows.length, hits };
  },
  dupperson: (c) => {
    const hits: Hit[] = [];
    const seen = new Map<string, Row>();
    for (const r of c.rows) {
      const id = norm(cell(c, r, "idNumber"));
      const key = id ? `id:${id}` : `name:${norm(cell(c, r, "name"))}`;
      const first = seen.get(key);
      if (first && norm(cell(c, first, "employee")) !== norm(cell(c, r, "employee")))
        hits.push({ row: r.idx, detail: `${cell(c, r, "name")} (${cell(c, r, "employee")}) has the same ${id ? "national ID" : "name"} as ${cell(c, first, "employee")}` });
      else seen.set(key, r);
    }
    return { tested: c.rows.length, hits };
  },
  outlier: (c) => {
    const byDept = new Map<string, number[]>();
    for (const r of c.rows) {
      const n = num(cell(c, r, "net"));
      if (n !== null) byDept.set(norm(cell(c, r, "department")) || "(none)", [...(byDept.get(norm(cell(c, r, "department")) || "(none)") ?? []), n]);
    }
    const median = new Map([...byDept].map(([k, v]) => [k, v.length >= 3 ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null]));
    const hits: Hit[] = [];
    for (const r of c.rows) {
      const n = num(cell(c, r, "net"));
      const m = median.get(norm(cell(c, r, "department")) || "(none)");
      if (n !== null && m && n > m * c.p.outlierTimes) hits.push({ row: r.idx, detail: `${cell(c, r, "name")} is paid ${fmt(n)}, ${(n / m).toFixed(1)} times the ${cell(c, r, "department") || "company"} median of ${fmt(m)}` });
    }
    return { tested: c.rows.length, hits };
  },
  inactive: (c) => {
    if (c.col.lastAttendance === undefined) return { tested: 0, hits: [], skipped: "Needs a last attendance column" };
    const hits: Hit[] = [];
    const limit = Date.now() - c.p.inactiveDays * 864e5;
    for (const r of c.rows) {
      const d = parseDate(cell(c, r, "lastAttendance"));
      if (d && d.getTime() < limit) hits.push({ row: r.idx, detail: `${cell(c, r, "name")} (${cell(c, r, "employee")}) was paid but last attended on ${day(d)}` });
    }
    return { tested: c.rows.length, hits };
  },
};

/** Runs every check for the data set's kind. */
export function runChecks(kind: Kind, rows: Row[], col: Record<string, number>, p: Params, employeeBanks?: Map<string, string>): Result[] {
  const ctx: Ctx = { rows, col, p, employeeBanks };
  return rulesFor(kind).map((r) => ({ rule: r.key, ...CHECKS[r.key](ctx) }));
}
