# PROGRESS.md — Playbook roadmap tracker

Source: PLAYBOOK.md (supserseding “Master Build & Growth Playbook”, V0–V8).
`[ ]` pending · `[x]` tested completion · `BLOCKED` reason + owner · `DEFERRED` reason + founder approval.
Rule: one task per session, in version order. This file, DECISIONS.md and
CHANGELOG.md update in the same change as the work.

## V0 — Audit and foundation (IN PROGRESS)

- [x] V0-01 — Repository inventory. Evidence: CURRENT_STATE.md created 2026-09-24 from isolated worktree @42002c3 (48 routes, 55 tables, 7 route groups, ~186 test files verified by direct reads). Tracking files created in the same change.
- [ ] V0-02 — Roadmap mapping (which V1+ items already exist and work).
- [ ] V0-03 — Security and privacy audit (authorization, file access, secrets, logs, roles, dependencies, misleading copy).
- [ ] V0-04 — Stack decision record (see DECISIONS.md seed; confirm or amend).
- [ ] V0-05 — Environments and recovery (document local/preview/prod, backups, rollback; verify, don't assume).
- [ ] V0-06 — Automated checks (CI currently RED repo-wide — runner offline; local gates green).
- [ ] V0-07 — Operational visibility (Sentry present; analytics pipeline missing — confirm approved vendor).
- [ ] V0-08 — Launch preparation (Terms/Privacy/Code of Conduct/support/reporting drafts; founder + counsel review required before publication).
- [ ] V0-09 — Staging smoke test + smallest safe path to V1.
- **V0 gate**: accurate system map exists (CURRENT_STATE.md); critical exposures fixed or prod access held. NOT YET MET — pending V0-02…V0-09.

## V1 — Verified referral MVP (not started; checklist expands at version start)

V1-01 identity/permissions/migrations · V1-02 auth · V1-03 companies/domains · V1-04 seeker onboarding · V1-05 work-email verification · V1-06 referrer onboarding · V1-07 company pages · V1-08 request service · V1-09 direct flow · V1-10 pool flow · V1-11 referrer inbox · V1-12 tracking/files · V1-13 deadlines/workers · V1-14 notifications · V1-15 admin · V1-16 landing/settings/copy · V1-17 end-to-end gate.

## V1.5 → V8 (not started)

V1.5 trust/safety · V2 growth/SEO · V3 jobs/AI · V4 employer monetization · V5 international · V6 enterprise/integrations · V7–V8 ultimate platform. Checklists copied from PLAYBOOK.md when each version starts.

## Blockers (founder-owned)

- BLOCKED — PLAYBOOK.md file itself: only screenshots supplied; needs the .md upload to be the agent-readable source of truth. Owner: founder.
- BLOCKED — CI runner offline (all checks fail at setup). Owner: founder.
- BLOCKED — Chargebee test-site keys (live payment verification). Owner: founder.
- BLOCKED — main-tree foreign stash ownership (abandon vs. active session). Owner: founder.
