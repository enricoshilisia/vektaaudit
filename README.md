# VektaAudit

Audit management for internal audit teams and audit firms: engagements and work programs with preparer/reviewer
sign-off, review notes, evidence requests answered through an auditee portal, findings tracked to closure,
documents with versions, trial-balance import with materiality and lead schedules, and generated letters and reports.

Next.js 15 · React 19 · Tailwind · Prisma (PostgreSQL) · pdfkit.

## Run it

```sh
cp .env.example .env            # set DATABASE_URL and AUTH_SECRET (32+ characters)
npm install
npx prisma migrate deploy
npm run db:seed                 # demo firm, prints sign-ins and an auditee portal link
npm run dev                     # http://localhost:3400
```

Demo password: `VektaDemo!2026` (override with `SEED_PASSWORD`). Users: amina@ (admin), daniel@ and priscilla@
(managers), joseph@ and sarah@ (auditors), board@ (viewer), all `@demo.vektaaudit.com`.

## Onboarding a customer

1. The firm (or internal audit team) signs up at `/signup` and becomes the admin of its own organisation.
2. **Clients** (called *Auditable units* for internal audit teams): add, edit, archive; each client lists its engagements.
3. **Settings → Team**: invite people by email with a role. Until email sending is set up, the admin copies the
   invitation link and sends it; it works once and expires after 7 days. Admins change roles and deactivate people
   (takes effect on their next click). The last admin can't be removed.
4. **Settings → Organisation**: name (printed on letters), type, currency.

Organisations never see each other's data. One account per email address.

## Roles

| Role | Can |
|---|---|
| ADMIN | everything |
| MANAGER | everything below, plus reviewer sign-off, accept evidence, close findings, create engagements, move phases, materiality, TB import |
| AUDITOR | prepare procedures, preparer sign-off, review notes, raise findings, request evidence, upload |
| VIEWER | read only |

A reviewer can't sign off work they prepared themselves.

## Where things are

- `src/app/(app)/` — signed-in pages; each area has its server actions in `actions.ts`
- `src/app/p/[token]` — auditee portal (no account; the link is the key, revocable)
- `src/lib/server/templates.ts` — letter and report templates; `render.ts` turns them into PDF and Word (.doc)
- `src/lib/server/insights.ts` — dashboard observations and trial-balance movement flags
- Uploaded files are stored under `STORAGE_DIR` (default `./storage`) with random names; every change is written to
  the activity log.

## Trial-balance CSV

Header row, any order: `account, name, lead, prior, current`. Debits positive, credits negative or in brackets.
`lead` is the lead-schedule code (A, B, …); accounts without a known lead show under *Unmapped accounts*.
