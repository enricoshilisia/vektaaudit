import "server-only";
// Microsoft 365 for VektaAudit: one multi-tenant app registration (owned by VektaAudit) serves every customer.
// The customer's admin approves it once; VektaAudit then uses app-only Microsoft Graph calls for that tenant.
// MS_AUTHORITY and GRAPH_BASE can point at a test server.
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";

const AUTHORITY = () => process.env.MS_AUTHORITY ?? "https://login.microsoftonline.com";
export const GRAPH = () => process.env.GRAPH_BASE ?? "https://graph.microsoft.com/v1.0";
export const appUrl = () => process.env.APP_URL ?? "http://localhost:3400";

export const msConfigured = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
const clientId = () => process.env.MS_CLIENT_ID!;
const clientSecret = () => process.env.MS_CLIENT_SECRET!;
export const redirectUris = () => ({ consent: `${appUrl()}/api/microsoft/consent`, signin: `${appUrl()}/api/microsoft/signin` });

/** What VektaAudit asks the customer's admin to approve (application permissions), and why. */
export const PERMISSIONS = [
  { name: "User.Read.All", why: "Find people in your directory when choosing control owners and finding owners" },
  { name: "Mail.Send", why: "Send self-assessment links, evidence requests and reminders from your audit mailbox" },
  { name: "Calendars.ReadWrite", why: "Put audit bookings, leave and training in people's Outlook calendars" },
  { name: "Sites.ReadWrite.All", why: "Save committee packs and reports to your SharePoint site" },
] as const;

export class MsError extends Error {}

const stateKey = () => new TextEncoder().encode(`${process.env.AUTH_SECRET}:ms-state`);
/** Short-lived signed state, so a Microsoft callback can't be forged or replayed into another organisation. */
export const signState = (p: Record<string, string>) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(stateKey());
export async function verifyState(token: string | null) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, stateKey(), { algorithms: ["HS256"] })).payload as Record<string, string>;
  } catch {
    return null;
  }
}

/** Microsoft's screen where the customer's admin approves VektaAudit for their organisation. */
export function adminConsentUrl(state: string) {
  const p = new URLSearchParams({ client_id: clientId(), scope: "https://graph.microsoft.com/.default", redirect_uri: redirectUris().consent, state });
  return `${AUTHORITY()}/organizations/v2.0/adminconsent?${p}`;
}

/** "Sign in with Microsoft". */
export function signInUrl(state: string, nonce: string, loginHint?: string) {
  const p = new URLSearchParams({ client_id: clientId(), response_type: "code", redirect_uri: redirectUris().signin, response_mode: "query", scope: "openid profile email", state, nonce, prompt: "select_account" });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTHORITY()}/organizations/oauth2/v2.0/authorize?${p}`;
}

/** Exchanges the sign-in code and returns the verified ID-token claims. */
export async function redeemSignInCode(code: string, nonce: string) {
  const r = await fetch(`${AUTHORITY()}/organizations/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), grant_type: "authorization_code", code, redirect_uri: redirectUris().signin, scope: "openid profile email" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) throw new MsError(j.error_description?.split("\r\n")[0] ?? "Microsoft sign-in failed");
  const unverified = JSON.parse(Buffer.from(String(j.id_token).split(".")[1], "base64url").toString());
  const tid = String(unverified.tid ?? "");
  if (!/^[0-9a-f-]{36}$/.test(tid)) throw new MsError("Unexpected sign-in token");
  // verify the signature against the issuing tenant's published keys
  const jwks = createRemoteJWKSet(new URL(`${AUTHORITY()}/${tid}/discovery/v2.0/keys`));
  const { payload } = await jwtVerify(j.id_token, jwks, { issuer: `${AUTHORITY()}/${tid}/v2.0`, audience: clientId() });
  if (payload.nonce !== nonce) throw new MsError("The sign-in took too long. Please try again.");
  return { tid, oid: String(payload.oid ?? ""), email: String(payload.email ?? payload.preferred_username ?? "").toLowerCase(), name: String(payload.name ?? "") };
}

const tokens = new Map<string, { token: string; exp: number }>();

/** App-only Graph token for a customer's tenant. */
export async function graphToken(msTenantId: string, fresh = false) {
  const hit = tokens.get(msTenantId);
  if (!fresh && hit && hit.exp > Date.now() + 60_000) return hit.token;
  const r = await fetch(`${AUTHORITY()}/${encodeURIComponent(msTenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new MsError(j.error_description?.split("\r\n")[0] ?? `Microsoft refused the connection (${r.status})`);
  tokens.set(msTenantId, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token as string;
}

/** The permissions the customer's admin actually granted (from the token's roles). */
export async function grantedPermissions(msTenantId: string): Promise<string[]> {
  const token = await graphToken(msTenantId, true);
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return Array.isArray(claims.roles) ? claims.roles : [];
}

/** A Graph call with app-only auth; retries once with a fresh token after a permission change. */
export async function graph(msTenantId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const call = async (fresh: boolean) =>
    fetch(path.startsWith("http") ? path : `${GRAPH()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await graphToken(msTenantId, fresh)}`, ...(init.body instanceof Uint8Array ? {} : { "content-type": "application/json" }), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
  const r = await call(false);
  return r.status === 403 || r.status === 401 ? call(true) : r;
}

/** Microsoft's error message from a failed Graph call, in a sentence a person can act on. */
export async function graphError(r: Response, what: string) {
  const j = await r.json().catch(() => ({}));
  const msg = (j as { error?: { message?: string } }).error?.message;
  if (r.status === 403) return `${what}: Microsoft says VektaAudit doesn't have permission. Ask your Microsoft admin to approve VektaAudit again (Settings → Microsoft 365).`;
  if (r.status === 404) return `${what}: Microsoft couldn't find it${msg ? ` (${msg})` : ""}.`;
  return `${what}: ${msg ?? `Microsoft returned an error (${r.status})`}`;
}

/** People in the customer's directory matching a name, email or job title. */
export async function searchPeople(msTenantId: string, q: string) {
  const term = q.replace(/["\\]/g, "").trim();
  if (term.length < 2) return [];
  const search = `"displayName:${term}" OR "mail:${term}" OR "jobTitle:${term}"`;
  const r = await graph(msTenantId, `/users?$search=${encodeURIComponent(search)}&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=10`, { headers: { ConsistencyLevel: "eventual" } });
  if (!r.ok) throw new MsError(await graphError(r, "Directory search"));
  const j = (await r.json()) as { value: { id: string; displayName: string | null; mail: string | null; userPrincipalName: string; jobTitle: string | null; department: string | null }[] };
  return j.value
    .filter((u) => !u.userPrincipalName.includes("#EXT#"))
    .map((u) => ({ id: u.id, name: u.displayName ?? u.userPrincipalName, email: (u.mail ?? u.userPrincipalName).toLowerCase(), jobTitle: u.jobTitle, department: u.department }));
}
