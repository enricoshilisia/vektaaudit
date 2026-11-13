import { Eye, KeyRound, Link2, Lock, ScrollText, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { CtaBand, SectionHead } from "@/components/Site";
import { getSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Security",
  description: "How VektaAudit protects audit data: roles, segregation of duties, separate workspaces, the audit trail and secure client links.",
};

const POINTS = [
  { icon: Users, title: "Separate workspaces", text: "Each organisation has its own workspace. People only ever see their own organisation's clients, engagements and documents." },
  { icon: UserCheck, title: "Role-based access", text: "Admins manage the team and settings, managers run and review engagements, auditors do the work and viewers only read. Every action is checked on the server, not just hidden on screen." },
  { icon: ShieldCheck, title: "Segregation of duties", text: "Whoever prepared a procedure cannot be its reviewer. Accepting evidence and closing findings need a manager." },
  { icon: ScrollText, title: "Audit trail", text: "Sign-offs, uploads, edits, status changes, invitations and role changes are recorded with the person and the time." },
  { icon: Lock, title: "Encrypted in transit", text: "The service is only available over HTTPS. Sign-in sessions use secure, HTTP-only cookies." },
  { icon: KeyRound, title: "Passwords", text: "Passwords are at least 10 characters and are stored only as salted hashes, never in readable form." },
  { icon: Eye, title: "Immediate access changes", text: "Deactivating someone or changing their role takes effect on their very next click — no waiting for a session to expire." },
  { icon: Link2, title: "Secure client links", text: "Clients answer evidence requests through long, unguessable links that show only what was asked of them, and can be withdrawn at any time." },
];

export default async function Security() {
  const signedIn = !!(await getSession());
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHead eyebrow="Security" title="Built to pass its own audit" intro="Audit files hold some of an organisation's most sensitive information. Here is how VektaAudit keeps it in the right hands." />
        </div>
      </section>
      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-10 sm:grid-cols-2">
          {POINTS.map((p) => (
            <div key={p.title} className="flex gap-4">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                <p.icon size={20} aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-navy-950">{p.title}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBand signedIn={signedIn} />
    </>
  );
}
