// IT general controls and user access reviews, shared by server and client code.

type Pill = { label: string; cls: string };

export const ITGC_DOMAINS = [
  { key: "access", label: "Access to programs and data", hint: "Joiners, movers and leavers; privileged accounts; passwords and MFA; periodic access reviews" },
  { key: "change", label: "Program changes", hint: "Changes are requested, tested, approved and moved to production by someone other than the developer" },
  { key: "operations", label: "Computer operations", hint: "Backups and restores, job scheduling, incident handling, monitoring" },
  { key: "development", label: "Program development", hint: "New systems and major upgrades: requirements, testing, data migration and go-live approval" },
] as const;
export type Domain = (typeof ITGC_DOMAINS)[number]["key"];

export const ITGC_RATING: Record<string, Pill> = {
  not_tested: { label: "Not tested", cls: "bg-line-soft text-ink-700" },
  effective: { label: "Effective", cls: "bg-ok-bg text-ok-fg" },
  needs_improvement: { label: "Needs improvement", cls: "bg-med-bg text-med-fg" },
  ineffective: { label: "Ineffective", cls: "bg-high-bg text-high-fg" },
  not_applicable: { label: "Not in scope", cls: "bg-white text-ink-400 border border-line" },
};

export const DECISIONS = [
  { key: "keep", label: "Keep", cls: "bg-ok-bg text-ok-fg" },
  { key: "change", label: "Change roles", cls: "bg-med-bg text-med-fg" },
  { key: "remove", label: "Remove access", cls: "bg-high-bg text-high-fg" },
] as const;
export const decisionOf = (k: string | null) => DECISIONS.find((d) => d.key === k);

/** "AP Clerk; Vendor Maintenance | Payment Approver" → normalised role names. */
export const rolesOf = (s: string) =>
  s
    .split(/[;|,]/)
    .map((r) => r.trim())
    .filter(Boolean);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The segregation-of-duties rules an account breaks, given its roles. */
export function conflictsFor(roles: string, rules: { roleA: string; roleB: string; risk: string; description: string | null }[]) {
  const rs = rolesOf(roles);
  return rules.filter((r) => rs.some((x) => same(x, r.roleA)) && rs.some((x) => same(x, r.roleB)));
}

/** Days since a last-login value (any common date format), or null. */
export function daysSince(v: string | null | undefined) {
  if (!v) return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let d: Date | null = null;
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null;
}
export const DORMANT_DAYS = 90;
