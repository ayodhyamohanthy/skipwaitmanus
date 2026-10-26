# Enterprise pipeline at startup speed: every role is a gate, every gate is a machine check (D-210)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-210) on Oct 26 2026 against `main` `927dfaca` (register through D-206). This file is the operating model. The tasks that build it live in two packets: [`REL-production-watch.md`](REL-production-watch.md) (the systems know before a user does, and fix what they can) and [`GATE-delivery.md`](GATE-delivery.md) (nothing broken reaches `main`). D-166 already turned the queue and review rules into CI checks ([`PROCESS-gates.md`](PROCESS-gates.md)); D-210 adds the roles D-166 does not cover: tester, QA, release manager, reliability engineer. D-200 sets the pace: nothing waits for one session, and no gate adds a second approval. The picker hands out the tasks one at a time. The register wins any conflict.

## 1. What the owner asked for
"our platfrom should have enterprise like organisation with startup speed ... have testers, have qa, have integrators, have reliability enginners, have devops, someone to see all lights are green or not fullstack then only something will be pushed ... so nothing breaks in production and user have a bad user experience. if something is not working our systems should know and has to be worked fixed not untill user faces an error and drops off" (owner, Oct 23).

## 2. Why (evidence, Oct 21-26)
- **Changes reached users unchecked.**
  - Tier 1 pages and pricing landed with the merge button and no independent review (D-149, D-135, D-166 (1)).
  - Two shipped live regressions (`LIVE-OCT22-regressions.md`): a personal-link ask reached every employee after sign-in, and `/queue` recorded a referrer attestation the referrer never saw.
  - A CEO code read found both; no check did.
- **Tests were loosened and nobody noticed.** #431 removed 107 `expect(` lines from `client/src/pages/ask.test.tsx` and added 49 (`git diff d3da2497^1 d3da2497`). #426 deleted the assertions that pinned the attestation. No check counts assertions.
- **A money alarm could never fire.** `ask_spent_while_waiting` looked up the wrong ledger key, while its test used a shape production never writes (D-065-C, fixed Oct 23).
- **Production broke and the systems did not know.**
  - On Oct 22 the API answered Cloudflare error 1101 for about 10 minutes. A hand check found it, and a hand re-run of the last good deploy fixed it (`docs/INCIDENT-2026-10-22-api-1101.md`).
  - Its follow-up watch (`.github/workflows/api-health-watch.yml`, cron `*/5`) ran 24 times in its first 79 hours, where about 950 runs were due, because GitHub delays scheduled workflows. It also probes `/api/health`, which answers 200 even when the schema failed and never touches the database. A GitHub cron is not a monitor.
- **Deploy trouble lands where nobody looks.**
  - Both deploy workflows post their result as a comment on whichever issue is newest.
  - `drift-watch.yml` derives the live SHA it expects from path filters. That raised false drift for weeks (issues #94 and #475) and again on Oct 25 (#687, still open; PR #689 repairs it).
  - `rollback.yml` has never run, has no web job, and redeploys the current `main` by default.
- **Errors are caught and dropped.**
  - 238 handled `status(500|502|503)` answers sit in 35 server files, and 32 of those files never report to Sentry (`git grep` on `927dfaca`).
  - The owner's 5xx email (`materialErrorAlertMiddleware`) is registered after the payment and WorkOS webhooks and the sign-in routes.
  - A review email to a referrer that fails, or that a restart interrupts, is never sent again.
- **Branches pile up.**
  - There were 473 branches on origin on Oct 26, before the first D-205 pass (298 after it, `docs/plans/BRANCH-HYGIENE.md`).
  - Landings are still mostly fast-forward pushes (`git push origin <sha>:main`). These work only because `main-protection` lets the admin role bypass `always`, and every session pushes as that account. The picker still prints that push (`scripts/nextTaskText.mjs`). PR #595 landed that way on Oct 25, and its branch stayed behind.
  - A push never triggers GitHub's auto-delete, and marker branches (review locks, heartbeats, architect claims) are deleted by nothing.

## 3. The roles, and what does each job here
All work is done by AI agents and machine checks. A role is either a picker stage (a session that is not the builder) or a check (a machine). Nobody's word is a gate (AGENTS.md rule 8).

| Role | Enterprise duty | Here, before D-210 | Here, from D-210 (the task that builds it) |
|---|---|---|---|
| Product owner | Decides what and why | The owner, through the register; any session turns his instruction into a decision and a queue row (D-200 (2)) | Unchanged. `PROCESS-queue-gate` (D-166, live): nothing merges without a queue row |
| Architect | Design, contracts, splitting work | Packets (D-109) | Packets also list the contracts the change must keep, each with a pin test, and the user journeys it touches |
| Developer | Builds with tests | Picker `build` stage | Unchanged |
| Tester | Keeps the tests honest | Nobody | `GATE-test-integrity`: CI fails on a deleted or loosened test, `.only` or a new `.skip`. Pinned login and money tests cannot lose an assertion without a D-number |
| QA | Uses it like a user | Nobody but the builder | `GATE-e2e-journeys`: six core journeys in a real browser against MySQL on every PR. `PICKER-qa-stage`: the QA checklist runs inside the one Tier 1 review, and within 24 hours after landing for Tier 2 and 3 UI changes |
| Code reviewer | Independent second look | `PROCESS-review-gate` (D-166, queued): a Tier 1 head needs an independent pass | `GATE-tier-floor`: CI computes the tier from the paths, so a money or sign-in change filed as Tier 2 still needs that review |
| Integrator | One landing at a time, clean history | Landing slot and file ownership (live) | Landing through the merge-commit button, which deletes the head branch (the picker's printed step changes in BRANCH-HYGIENE-2). The lander deletes the task's markers (D-205). The owner's settings: admin bypass limited to pull requests, merge queue, squash and rebase off (`OPS-github-settings`) |
| Release manager | "All lights green" before and after shipping | The lander watches by hand | `REL-release-verify`: after both deploys, it checks the live SHAs (web: the newest successful web deploy; API: the `api-runtime` tag) and runs the production smoke, sets `release/verified`, and opens one incident on failure. `REL-rollback-skew`: the web waits for its API, and rollback works |
| Reliability engineer | Knows first, fixes first | Nothing that runs on time | Know: `REL-watchdog` (every 5 minutes from Cloudflare, email plus a GitHub issue), `REL-5xx-capture`, `REL-heartbeats`, `REL-client-capture`, `REL-webhook-auth-alarm`, `REL-ops-invariants`. Fix: `REL-self-heal` (a dead API container is redeployed once, automatically) and `REL-review-email-retry` (unsent review emails go out) |
| DevOps | CI/CD, settings, rollback | Partial | `REL-release-verify`, `REL-rollback-skew`, `PICKER-fullstack-lights` |
| Security | Threats, secrets, dependencies | D-100 audit waits for a packet; D-191 patched four advisories | Owner settings: secret scanning, push protection, CodeQL (free on a public repo). `GATE-tier-floor` sends every sign-in, identity and privacy path to review |

## 4. The seven lights
"All lights green" means all seven, for the release that is live. `node scripts/next-task.mjs --status` prints them (`PICKER-fullstack-lights`); `PROCESS-scorecard` adds the weekly numbers.

1. **Built right.** Required checks on the exact head, with the branch up to date: typecheck (with design tokens, deploy triggers, scope, the D-166 gates and test integrity), unit + component + route tests, production build, and e2e journeys.
2. **Checked by someone else.** Tier 1 (the computed tier): one independent pass on the exact head, which includes the QA checklist for a UI change. Tier 2 and 3: CI is enough to land (D-200 (4)); a UI change among them gets its QA pass within 24 hours after landing, and its findings become fix rows.
3. **Landed cleanly.** Through the landing slot and the merge-commit button, never an admin bypass (D-200), with `main`'s CI green on the landed SHA and the task's branch and markers deleted.
4. **Deployed.** Deploy API (with `migrate-db`) and Deploy Web are green.
5. **Verified live.** `release/verified` is green: the web serves its newest deployed SHA, the API serves the `api-runtime` SHA, and the smoke battery passes on `https://skipwait.me`.
6. **Watched.** There is no open `SkipWait DOWN` issue from the watchdog, and no scheduled job is overdue (`/api/health/jobs`). The money and ops checks reach the owner by email; they do not light the board.
7. **No open incident.** No open issue labelled `incident`.

Lights 4 to 7 run by themselves after landing; nobody waits for them. A red light 4, 5, 6 or 7 on the live release holds every landing except its fix. Builds, reviews and packets go on (D-109, D-200). The fix is handed out first, and it reverts the landed commit first when that release is code-only and the commit caused it (D-082: "if anything goes red, revert or fix your commit first").

## 5. One change, start to finish
1. **Intake.** An owner instruction becomes a register entry (when it sets a rule) and a queue row with tier, lane and owned paths.
2. **Packet.** Goal, the binding decisions quoted, the contracts to keep (each with a pin test), owned paths, journeys, red-first tests, flag and tier.
3. **Build.** Picker `build`; red-first tests; the local gate on the branch merged with `origin/main`.
4. **Pull request.** Light 1 on the exact head.
5. **Review.** Tier 1 only, including QA for a UI change. Light 2.
6. **Land.** Light 3. The landing pull request sets the row's status to done, and the merge button deletes the branch.
7. **Deploy, verify, watch.** Lights 4 to 7, automatic, plus post-landing QA for a Tier 2 or 3 UI change. The lander reports with the `release/verified` link as its proof.

## 6. When something breaks
1. **Detect.** The watchdog, release verify, the deploy workflows, Sentry, the money and ops checks, and the job heartbeats.
2. **Open one issue.** The watchdog (with the owner's issues token), release verify and the deploy workflows open a machine issue labelled `incident`. Sentry, the 5xx alert and the money and ops checks send email.
3. **The board holds landings.**
4. **Self-heal.** A dead API container is redeployed once by the watchdog (REL-self-heal).
5. **Fix.** Otherwise the picker hands out the fix before anything else lands. The fix is a revert or a forward fix, with a regression test that fails first.
6. **Write it down.** A short note in `docs/` like `INCIDENT-2026-10-22-api-1101.md`, and one never-do line in `docs/DELEGATION.md` §7.
7. **Close.** The incident closes when light 5 is green again.

**Targets** (changeable; reviewed weekly from the scorecard):
- the owner hears of an outage within 10 minutes of two failed probes;
- a dead API container is back within 45 minutes without anyone acting;
- API ready 99.5% over 30 days;
- zero money-check findings;
- every scheduled job within its overdue span;
- a new Sentry issue on a release is triaged the same day.

## 7. What we do not do (startup speed)
- No change board, no second approver, no sign-off meetings. One independent review for Tier 1, which includes QA for UI; post-landing QA for the rest.
- No new hosted staging. Signed-in synthetic journeys run on the isolated QA preview from #383 (fictional data, the Chargebee test site, its own database), on the Cloudflare credits D-204 allows behind a hard stop, once the owner confirms that hard stop. The e2e journeys run on a CI-built stack.
- No review before landing for Tier 2 or 3.
- No hand-written run logs where a machine record exists: commit statuses and run summaries are the evidence.
- No guard that cannot fail:
  - `drift-watch.yml` retires once `release/verified` has been green for 3 days.
  - `sync-guard.yml` (only echoes) and `design-gate.yml` (`|| true`) retire with `SYNC-LOG-off-main`.
- No coverage-percentage targets and no mutation-testing dependencies.

## 8. Branches
D-205 sets the rule: a branch is deleted once it is done and merged (its tip is in `main`, or a merged pull request's head equals its tip), never before. Open pull requests, unmerged work and the branches of unfinished tasks stay, and marker branches go when their stage is over.
- **First pass:** it ran on Oct 26 (`docs/plans/BRANCH-HYGIENE.md`): 176 merged branches deleted, 473 → 298.
- **Unmerged branches:** the owner chose to keep them for now.
- **Ongoing:** BRANCH-HYGIENE-1 and -2 make it automatic. BRANCH-HYGIENE-2 also switches the picker's landing step to the merge button, so landings stop leaving branches behind.

## Status
The tasks are listed in the two packets; each writes its status line there (D-134).
