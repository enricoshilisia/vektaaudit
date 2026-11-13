import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Empty } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { appUrl } from "@/lib/server/microsoft";
import { createApiKey, revokeApiKey } from "./actions";

export const metadata: Metadata = { title: "API" };

const ENDPOINTS = [
  ["/api/v1/engagements", "Engagements, with phase, lead, dates, budget and rating. Filter: ?phase="],
  ["/api/v1/findings", "Findings, with owner, due date, escalation level. Filters: ?status=open, ?severity="],
  ["/api/v1/controls", "The risk & control library with design and operating ratings. Filter: ?process="],
  ["/api/v1/universe", "The audit universe: inherent and residual risk, last audited, next due"],
  ["/api/v1/plan?year=2027", "The audit plan for a year: each audit's timing, hours, status and engagement"],
];

export default async function ApiPage() {
  const s = await requireUser("admin");
  const keys = await db.apiKey.findMany({ where: { orgId: s.org }, orderBy: { createdAt: "desc" } });
  const fresh = (await cookies()).get("va_newkey")?.value;
  const base = appUrl();

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <p className="text-[13px] text-ink-500">Read-only access for reporting tools such as Power BI or Excel, or your own systems. Each key belongs to your organisation and sees all of its audit data; keep keys secret and revoke any you no longer use.</p>

      {fresh && (
        <section className="card flex flex-col gap-2 border-ok-dot p-5">
          <h2 className="text-[15px] font-semibold">Your new key</h2>
          <p className="text-[13px] text-ink-500">Copy it now. For your security it won&apos;t be shown again.</p>
          <input readOnly value={fresh} aria-label="New API key" className="input font-mono text-[13px]" />
          <pre className="overflow-x-auto rounded-lg bg-navy-950 p-3 text-[12px] text-[#E6ECF2]">{`curl -H "Authorization: Bearer ${fresh}" ${base}/api/v1/findings?status=open`}</pre>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-[15px] font-semibold">API keys</h2>
          <form action={createApiKey} className="ml-auto flex flex-wrap items-center gap-2">
            <label htmlFor="name" className="sr-only">
              Key name
            </label>
            <input id="name" name="name" required minLength={2} className="input h-9 w-56" placeholder="What it's for, e.g. Power BI" />
            <button className="btn-primary h-9">Create key</button>
          </form>
        </div>
        {keys.length === 0 ? (
          <Empty title="No API keys yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-[#F8FAFB]">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Key</th>
                  <th className="th">Created</th>
                  <th className="th">Last used</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={`border-t border-line-soft ${k.revokedAt ? "opacity-60" : ""}`}>
                    <td className="td font-medium">{k.name}</td>
                    <td className="td font-mono text-[12px]">{k.prefix}…</td>
                    <td className="td">
                      {fmtDate(k.createdAt)} <span className="text-ink-500">by {k.createdBy}</span>
                    </td>
                    <td className="td">{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</td>
                    <td className="td text-right">
                      {k.revokedAt ? (
                        <span className="text-[12px] text-ink-500">Revoked {fmtDate(k.revokedAt)}</span>
                      ) : (
                        <form action={revokeApiKey.bind(null, k.id)}>
                          <button className="text-[12px] font-medium text-high-fg">Revoke</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-[15px] font-semibold">What you can read</h2>
        <ul className="flex flex-col gap-2 text-[13px]">
          {ENDPOINTS.map(([path, what]) => (
            <li key={path}>
              <code className="font-mono text-[12px] text-brand-800">GET {path}</code>
              <span className="block text-ink-500">{what}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-500">Send the key as Authorization: Bearer va_…. Results come in pages: ?limit= (up to 500) and ?offset=. Up to 120 requests a minute per key.</p>
      </section>
    </div>
  );
}
