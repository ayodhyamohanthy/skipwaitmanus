# D-177 - Recruiter/HR job posts and employee referral drives

Source: founder message, Oct 24, 2026 12:57 AM IST. Provenance: phonemsg-01M5N3Q94QHYJK0VEHA3WBERS0 in conversation phoneconv-01M293K2H1ENERN9WSP2W33SPT (iMessage); the observation record shows author=user for that message ID (verified Oct 24 00:58 IST). This packet records the direction; the channel record is the authority, not this file. Verbatim:

> Now as we are showing jobs like career portals and linkedin inside our portal ,we should have recruiters or hr's posting job descriptions too , internal and public , job referrers can publish a internal job referral drive too which is very often happens in corporate

Build packet written under D-200 (no model holds the pen alone) on 2026-11-25. Tier 2 · lane `employer` · branch `agent/queue/d177-recruiter-drives` · depends on `D-048-p3-post`, `D-174-seeker-journey-build`.

## 1. What this decides

Company job feeds are not the only job source. Three new supply paths, all inside the existing company -> job -> ask journey (D-174-seeker-journey-build), not a competing surface:

1. **Recruiter/HR job posts, public.** A verified recruiter or HR person at a company can publish a job description that any seeker can see and ask against.
2. **Recruiter/HR job posts, internal = employee-shared opportunities (RESOLVED, owner Oct 24 1:18 IST).** The owner settled the fork: "internal jobs" means referral opportunities that OUTSIDE CANDIDATES can see and request, which are sometimes shared in company emails instead of appearing on career portals - NOT employee-only vacancies or transfers. So an internal post is candidate-visible; its "internal" character is its provenance (shared by an employee/recruiter, possibly never on the career portal), not a visibility restriction. Because there may be no public career-page URL, a public career link is NOT mandatory for this type; the post must be labeled honestly as employee-shared, never "career-portal confirmed", and the private email thread and its recipients are never published - only the shareable job details the poster chooses to publish.
3. **Employee-published referral drives.** A verified employee (referrer) can publish an internal referral drive - the common corporate practice of "we are hiring for these roles, refer people." A referral drive is meant to be SHARED by employees, including externally; it is not an employee-only secret. Treating it as confidential would defeat its purpose, and treating an employee-only opening as shareable would leak it. These are different audiences and must not be conflated.

## 2. Audience model (must hold before any build)

- **public**: anyone, logged out included. Safe for sitemap/search/prerender.
- **internal / employee-shared** (resolved Oct 24 1:18 IST): candidate-visible referral opportunity whose source is an employee/recruiter share (often a company email) rather than the career portal. Provenance is displayed honestly; the current universal "hiring-now requires a verified public role link" enforcement must become type-aware - career-portal-confirmed posts keep the verified link, employee-shared posts carry the provenance label and the poster's verified identity instead. This reconciles the types; it does NOT waive all link/identity checks, and email-only jobs are not silently rejected. The employee-only-restricted interpretation is REJECTED; if a true employee-only vacancy product is ever wanted, it needs its own owner decision.
- **referral-drive**: published by an employee, intended for external sharing by employees. Public-by-design content with the author's consent, but the drive's existence/terms may still carry internal context (headcount, team) that needs an explicit publish-time confirmation from the author.

**Two post types, both outside-visible, and no third type:**

1. **`career_portal_confirmed`** - a public careers-page or ATS link that resolves to the company. Keeps the verified public link; the label is "Career page".
2. **`employee_shared`** - a referral drive a verified employee publishes, sometimes from a company email thread instead of a careers page. Visible to outside candidates; may have no public link; the label is "Shared by an employee" and the poster's verified-employee identity is the provenance. Never labelled "career-portal confirmed".

There is **no employee-only vacancy type**. A post whose only source is an internal email is still visible to outside candidates, labelled `employee_shared`, and its email thread and recipients are never stored or published.

## 3. Open questions - answered for the build

1. ~~What does "internal" mean~~ **RESOLVED Oct 24 1:18 IST** (phonemsg-01M5N4XQX4YY5R18T59S38BYJ5): outside-candidate-visible, email-shared referral opportunities. See §2.
2. **Who verifies a recruiter/HR identity at a company?** The existing employer account and approval path (`employerAccounts.approvalStatus = "approved"` for the post's company domain). No new role, no new approval mechanism. A recruiter post is `career_portal_confirmed` only with a resolving public link; a recruiter has no employee-shared provenance, so a recruiter post without a link is refused.
3. **Does a referral drive carry reward/terms fields?** No. D-132/D-152 stay frozen: no price, fee, credit, reward or payout field in a post or a drive. If rewards are ever wanted, that is a new owner decision.
4. **Can a company admin unpublish an employee's drive?** Yes. The company's approved employer admin may unpublish any post for its own domain, the poster may unpublish their own, and the SkipWait admin may remove any post. Unpublishing hides the post from every surface; it never deletes the poster's account or the ask history.

## 4. Current behaviour, verified in code

- **Job catalog.** `jobs` (`drizzle/schema.ts:383`) holds title, company, location, compensation, seniority, employmentType, workMode, description, a nullable `targetRoleUrl`, `jobFunction`/`jobFunctionSource`, and `referrerId`. Nothing records who posted it or how its link was validated.
- **Referrer-posted roles.** `companyOpportunities` (`drizzle/schema.ts:406`) is the existing employee-posted surface: `ownerId`, `companyDomain`, `kind` (`hiring_now`|`walk_in`), `roleTitle`, nullable `targetRoleUrl`, 30-day `expiresAt` (D-022), optional first name, sponsorship columns. It has no audience field and no provenance label.
- **Posting surface.** `client/src/pages/PostOpportunity.tsx` is a verified-referrer wizard (`useReferrerAccess`); it posts `hiring_now`/`walk_in` roles and shows the owner's openings. There is no recruiter/HR posting path.
- **Job-link preview.** `server/jobLinkPreviewRoutes.ts` (`/api/job-link/preview`) validates a public job URL and resolves the employer; `server/employerRouting.ts` maps a link to a verified company domain.
- **Ask creation.** A referral request carries `targetRoleUrl` (`server/db.ts:658`, `:727`); the ask is delivered only to verified employees of the resolved company (D-034/D-047).
- **Company directory.** `server/companyDirectory.ts` + `shared/companies.ts` own the server-side company list; the directory has no public open/not-open status (D-176).
- **No audience model exists.** Nothing distinguishes a career-portal-confirmed post from an employee-shared one, and no post records its provenance.

## 5. Rulings for the build

### 5.1 Storage (one additive migration)

- `jobs` gains `audience` (`career_portal_confirmed` | `employee_shared`, NOT NULL default `career_portal_confirmed` for existing rows) and `postedByUserId` (nullable FK `users.id`).
- `companyOpportunities` gains the same `audience` column with the same default, so the existing employee-posted surface carries the label without a second model.
- The provenance label is derived on read from `audience`; it is never a free-text column.
- No money column, no price, no rank. Migration number allocated at build time against `drizzle/deploy/` on current `main`; additive and re-runnable.

### 5.2 Validation by type

- `career_portal_confirmed`: the existing job-link preview must resolve the link to the post's company domain; an unresolvable link is refused with the existing clear error.
- `employee_shared`: no public link is required. The server records `audience = employee_shared` and the poster's verified employee identity; it never stores an email body, sender, recipients or thread id.
- Both types keep every existing identity, privacy, block and rate check. Email-only jobs are not silently rejected.

### 5.3 Who may post

- **Recruiter/HR:** an approved employer account for the post's company domain (§3.2).
- **Verified employee:** any verified work-email employee of the company domain may publish an `employee_shared` drive (D-057 identity rules). The poster is shown only as the existing verified-employee mark, never an email address.
- **Everyone else:** refused with plain words; no post row is written.

### 5.4 Surfaces

- The posting wizard gains the two types with the labels above; the recruiter path appears only for an approved employer account.
- The company page and search results show each job with its honest label and whether a referrer exists there (D-360).
- A seeker can start an ask from a post; the ask keeps the existing cost, delivery and privacy rules unchanged.

## 6. In scope / out of scope

**In scope (build rows split by owned files, D-223):**
- `drizzle/schema.ts`, the additive migration, `server/schemaReconcile.ts`.
- `shared/` contract for the audience type and labels.
- `server/employerRoutes.ts` (recruiter post path), the existing employee post path, `server/jobLinkPreviewRoutes.ts` (validation by type).
- `client/src/pages/PostOpportunity.tsx` and the company/search job list components.
- Tests beside each.

**Out of scope:** prices, plans, credits, payouts, sponsorship changes, the login rule, legal text, the ask cost/delivery rules, and any employer-only vacancy type.

## 7. Steps (one commit each)

1. Contract + additive migration + schema reconcile (`audience`, `postedByUserId`), with contract tests.
2. Server: validation by type and the recruiter post path; red-first tests for both types and every refusal.
3. Employee-shared drive on the existing post path; provenance label on read; a privacy test that no email content is stored.
4. Client: the two post types with their labels; company/search job list labels; loading/empty/error states.
5. Docs: this packet's Status, `docs/PRD.md` and the system map row in `AGENTS.md`.

## 8. Red-first tests

- A recruiter post with a resolving public link is `career_portal_confirmed`; without one it is refused.
- A verified employee post without a link is `employee_shared`, visible to outside candidates, labelled "Shared by an employee", and stores no email body/sender/recipient/thread id.
- A non-employee, a signed-out request and a spoofed company domain are refused; no post row is written.
- A block between the poster and a viewer hides the post (existing block rules).
- Existing `hiring_now`/`walk_in` posts read as `career_portal_confirmed` after the migration and keep their behaviour.
- The company/search job list shows the label and the referrer-exists state honestly.
- An approved employer admin can unpublish a post for its own domain; a different domain cannot.
- Config/contract tests for any new env key (none expected).

## 9. Definition of done

Focused tests, `pnpm check`, required CI green; the migration is additive and re-runnable; no money field, price, rank or employer-only vacancy exists; the labels are honest; the packet Status records the landing. Captures at 1280 and 390 for the posting wizard and the job list.

## 10. Review checklist

- The audience model holds: two types, both outside-visible, no employee-only vacancy.
- Validation is by type; no link check is waived for `career_portal_confirmed`.
- No email thread, sender or recipient is stored or shown.
- No money, price, rank or visibility sale appears.
- Existing posts and the ask journey are unchanged.
- Labels match D-323 and D-173/D-180 wording.

## 11. Stop and ask

- If the employer approval path cannot identify a recruiter/HR account for a company domain, stop and report what is missing; do not invent an approval.
- If a post type would need a price, a rank or an employer-only audience, stop: that is the owner's call.
- If the existing `companyOpportunities` surface cannot carry the audience column without breaking its 30-day/sponsorship behaviour, stop and report the conflict.

## Relation to existing work (context, not presumed satisfied)

- D-048-p3-post (todo): /post-opportunity + My openings + server posting verdict. D-177 extends this lane; it does not replace it. Reconciliation of scopes rides the implementation PR.
- D-048-P-employer (architect): employer lane packet; recruiter/HR roles likely live here.
- D-174-seeker-journey-build (todo): the company -> job -> ask journey these posts feed.
- #596/#597 (in review): send-ask/post-copy fixes; wording only, not posting supply.
- Coverage caution (Main, Oct 24): the founder's premise "we are showing jobs like career portals and LinkedIn" is NOT confirmed; current job coverage is limited. This packet adds supply paths; it does not assert existing coverage.

## Money boundary

No pricing, fee, credit, or reward amounts in this packet or its copy. Money lines stay byte-identical to D-132/D-152 until their audit. If referral drives later carry rewards, that is a new owner decision.

## Status

- D-177-recruiter-posts-referral-drives: packet written — DeepSeek V4.1 Flash · f2a2 — 2026-11-25 — build-ready after its dependencies; the four open questions are answered in §3.
