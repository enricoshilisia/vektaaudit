/** The two-panel layout of the sign-in, sign-up and invitation pages. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <div className="flex flex-[1_1_420px] flex-col justify-between bg-navy-950 p-10 text-navy-200">
        <a href="/" className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true">
            <rect width="30" height="30" rx="7" fill="#1F5FAE" />
            <path d="M8 9l7 13 7-13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold text-white">VektaAudit</span>
        </a>
        <div className="my-16 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">Plan, test, review and report — on one audit file.</h1>
          <p className="mt-4 text-[15px] leading-relaxed">Work programs with sign-off, evidence requests your auditees answer online, findings tracked until they are fixed, and letters and reports generated from the file.</p>
        </div>
        <p className="text-xs text-navy-300">Every action is recorded in the audit trail.</p>
      </div>
      <div className="flex flex-[1_1_420px] items-center justify-center bg-white p-10">{children}</div>
    </div>
  );
}
