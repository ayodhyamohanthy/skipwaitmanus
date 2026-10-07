# PROGRESS.md — Playbook roadmap tracker

Source: PLAYBOOK.md (supserseding “Master Build & Growth Playbook”, V0–V8).
`[ ]` pending · `[x]` tested completion · `BLOCKED` reason + owner · `DEFERRED` reason + founder approval.
Rule: one task per session, in version order. This file, DECISIONS.md and
CHANGELOG.md update in the same change as the work.

## V0 — Audit and foundation (IN PROGRESS)

- [x] V0-01 — Repository inventory. Evidence: CURRENT_STATE.md created 2026-09-24 from isolated worktree @42002c3 (48 routes, 55 tables, 7 route groups, ~186 test files verified by direct reads). Tracking files created in the same change.
- [ ] V0-02 — Roadmap mapping (which V1+ items already exist and work).
- [x] V0-03 — Security and privacy audit. Evidence: dual read-only audit 2026-09-24 in worktree @42002c3 (stacked base d1e5bb2). Authz sweep (all referral/doc/DM/employer/billing/admin/tRPC routes): zero exploitable IDOR — ownership, same-company, grant, intent-match and admin-role checks verified at route + DB layers. PII sweep: no hardcoded secrets; Sentry/Clarity scrubbers verified; no work-email/hash in ordinary responses; zero guarantee copy (guarded by tests). NO CODE CHANGES — nothing immediately exploitable found.
  Findings (non-blocking, owned follow-ups): (1) no rate limiter on WorkOS callback or tRPC router — limits exist per-feature (OTP atomic windows, DM 30/hr + transactional, 256kb body caps); (2) CI runs no `pnpm audit`/Dependabot step (V0-06); (3) prior known gaps stand: plaintext work-email storage, no 6-month re-verification (V1-05).
- [ ] V0-04 — Stack decision record (see DECISIONS.md seed; confirm or amend).
- [ ] V0-05 — Environments and recovery (document local/preview/prod, backups, rollback; verify, don't assume).
- [ ] V0-06 — Automated checks (CI currently RED repo-wide — runner offline; local gates green).
- [ ] V0-07 — Operational visibility (Sentry present; analytics pipeline missing — confirm approved vendor).
- [ ] V0-08 — Launch preparation (Terms/Privacy/Code of Conduct/support/reporting drafts; founder + counsel review required before publication).
- [ ] V0-09 — Staging smoke test + smallest safe path to V1.
- **V0 gate**: accurate system map exists (CURRENT_STATE.md); critical exposures fixed or prod access held. NOT YET MET — pending V0-02…V0-09.

## V1 — Verified referral MVP (MAPPED 2026-09-24, not started)

Legend: HAVE (working code + tests) · PARTIAL (works with gaps) · MISSING.
Evidence: file:line verified in worktree @42002c3. Nothing here changes code.

- V1-01 identity/permissions/migrations — HAVE. Canonical person + aliases + suspension propagation (`server/db.ts` resolveLoginIdentity); freeze paths + fast-path tests.
- V1-02 auth — PARTIAL. WorkOS AuthKit verify + logout + suspended-enforcement HAVE; rate limiting MISSING except OTP/DM endpoints.
- V1-03 companies/domains — PARTIAL. Exact-domain match + pending employer-approval HAVE; public directory/search + duplicate-merge MISSING; no `/company/:slug` route.
- V1-04 seeker onboarding — PARTIAL. `/start` flow + resume upload HAVE, but limit is 10MB not 5MB (`server/documentValidation.ts:1`); LinkedIn field MISSING.
- V1-05 work-email verification — PARTIAL. 10-min OTP + atomic throttling HAVE; plaintext work-email storage remains (no HMAC); 6-month re-verification MISSING.
- V1-06 referrer onboarding — PARTIAL. Capacity + availability HAVE; level/function/team fields, discoverability opt-in, and pause flag MISSING (only talent anonymity opt-in).
- V1-07 company pages — MISSING. No company routes; only fast-track/vanity links with honest expired states.
- V1-08 request service — HAVE core. Transactional transitions (FOR_UPDATE + CAS + immutable events), wallet-locked limits, fingerprint dedup. 5/7-day deadlines MISSING (only 7-day review-link + 30-day grant lifetimes).
- V1-09 direct flow — PARTIAL. Job-link + resume + send HAVE; pitch cap is 2000 chars, not 600 (`privateReferralRoutes.ts:488`); seeker never picks a person (pool-routed); same-job active block MISSING (idempotency only).
- V1-10 pool flow — PARTIAL. Atomic claim + prior-claimant exclusion HAVE; release-with-reason and direct-to-pool conversion MISSING (pass-with-reason closest).
- V1-11 referrer inbox — HAVE (tabs, claim/review/one-click/save, capacity message, reasoned decline). Named mark-as-referred action MISSING (approve→progress closest).
- V1-12 tracking/files — PARTIAL. Timeline, withdraw, progress milestones, resume-authz tests HAVE; post-referral outcomes NOT labeled self-reported in code.
- V1-13 workers — PARTIAL. Outbox/delivery fns HAVE; no scheduler (no cron config or dep); no 5-day direct constant; monthly reset test-only.
- V1-14 notifications — PARTIAL. In-app + transactional email HAVE; preferences table MISSING.
- V1-15 admin — PARTIAL. Users/requests review, suspend, audit log HAVE; duplicate-merge + bounded settings MISSING.
- V1-16 landing/copy/policies — HAVE. Routes live; anti-guarantee copy + test present.
- V1-17 end-to-end gate — NOT RUN. Needs real accounts + work-email verification + mobile/desktop pass.
- **V1 gate**: NOT MET. Biggest structural gaps: V1-07 company pages, V1-09 referrer choice + 600-char pitch, V1-10 release/conversion, V1-13 scheduler, V1-05 HMAC + re-verification.

## V1.5 → V8 (not started)

V1.5 trust/safety · V2 growth/SEO · V3 jobs/AI · V4 employer monetization · V5 international · V6 enterprise/integrations · V7–V8 ultimate platform. Checklists copied from PLAYBOOK.md when each version starts.

## Blockers (founder-owned)

- BLOCKED — PLAYBOOK.md file itself: only screenshots supplied; needs the .md upload to be the agent-readable source of truth. Owner: founder.
- BLOCKED — CI runner offline (all checks fail at setup). Owner: founder.
- BLOCKED — Chargebee test-site keys (live payment verification). Owner: founder.
- BLOCKED — main-tree foreign stash ownership (abandon vs. active session). Owner: founder.
