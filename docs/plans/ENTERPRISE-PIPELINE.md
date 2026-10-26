# Enterprise pipeline at startup speed: every role is a gate, every gate is a machine check (D-192)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-192) on Oct 24 2026 against `main` `02a8a028`. This file is the operating model. The tasks that build it live in two packets: [`REL-production-watch.md`](REL-production-watch.md) (the systems know before a user does) and [`GATE-delivery.md`](GATE-delivery.md) (nothing broken reaches `main`). D-166 already turned the queue and review rules into CI checks ([`PROCESS-gates.md`](PROCESS-gates.md)); D-192 adds the roles D-166 does not cover: tester, QA, release manager, reliability engineer. The picker hands out the tasks one at a time. The register wins any conflict.

## 1. What the owner asked for
"our platfrom should have enterprise like organisation with startup speed ... have testers, have qa, have integrators, have reliability enginners, have devops, someone to see all lights are green or not fullstack then only something will be pushed ... so nothing breaks in production and user have a bad user experience. if something is not working our systems should know and has to be worked fixed not untill user faces an error and drops off" (owner, Oct 23).

## 2. Why (evidence, Oct 21-24)
- **Changes reached users unchecked.** Tier 1 pages and pricing landed with the merge button and no independent review (D-149, D-135, D-166 (1)). Two shipped live regressions: a personal-link ask reached every employee after sign-in, and `/queue` recorded a referrer attestation the referrer never saw (`LIVE-OCT22-regressions.md`). A CEO code read found both; no check did.
- **Tests were loosened and nobody noticed.** #431 removed 107 `expect(` lines from `client/src/pages/ask.test.tsx` and added 49 (`git diff d3da2497^1 d3da2497`); #426 deleted the test that pinned the attestation. No check counts assertions.
- **A money alarm could never fire.** `ask_spent_while_waiting` looked up the wrong ledger key while its test used a shape production never writes (D-065-C, fixed Oct 23).
- **Production broke and the systems did not know.** On Oct 22 the API answered Cloudflare error 1101 for about 10 minutes; a hand check found it (`docs/INCIDENT-2026-10-22-api-1101.md`). Its follow-up watch (`.github/workflows/api-health-watch.yml`, cron `*/5`) ran 10 times in its first 32 hours, where about 390 runs were due, because GitHub delays scheduled workflows (`gh run list --workflow api-health-watch.yml`). It also probes `/api/health`, which answers 200 even when the schema failed and never touches the database. A GitHub cron is not a monitor.
- **Deploy trouble lands where nobody looks.** Both deploy workflows post their result as a comment on the newest issue, whatever it is. `drift-watch.yml` raised false drift for weeks (issues #94 and #475, over 80 comments before both were closed; the side-branch bug is fixed by `d36238fc`), and like every GitHub cron it runs only every few hours. `rollback.yml` has never run and rolls back the API only.
- **Errors are caught and dropped.** 237 handled `status(500|502|503)` responses in 35 server files; 32 of those files never report to Sentry (`git grep` on `02a8a028`). The owner's 5xx email (`materialErrorAlertMiddleware`) is registered after the payment and WorkOS webhooks and after the sign-in routes, so a broken sign-in code send emails nobody. A failed review email to a referrer is stored for retry and never retried.
- **Branches pile up.** 429 branches on origin on Oct 24. GitHub's auto-delete is on, but it fires only for the merge button, and until the `main-protection` ruleset made a pull request mandatory most landings were fast-forward pushes (`git push origin <sha>:main`, D-134 (6)) that left their branches behind; marker branches (review locks, heartbeats, architect claims) are never deleted by anything.

## 3. The roles, and what does each job here
All work is done by AI agents and machine checks. A role is either a picker stage (a session that is never the builder) or a check (a machine). Nobody's word is a gate (AGENTS.md rule 8).

| Role | Enterprise duty | Here, before D-192 | Here, from D-192 (the task that builds it) |
|---|---|---|---|
| Product owner | Decides what and why | The owner, through the register; the CEO turns each instruction into a decision and a queue row | Unchanged. `PROCESS-queue-gate` (D-166, live): nothing merges without a queue row |
| Architect | Design, contracts, splitting work | The CEO's packets (D-109, D-158) | Packets also list the contracts the change must keep, each with a pin test, and the user journeys it touches |
| Developer | Builds with tests | Picker `build` stage | Unchanged |
| Tester | Keeps the tests honest | Nobody | `GATE-test-integrity`: CI fails on a deleted or loosened test, `.only` or a new `.skip`; pinned login and money tests cannot lose an assertion without a D-number |
| QA | Uses it like a user before release | Nobody but the builder | `GATE-e2e-journeys`: the core journeys in a real browser on every PR. `PICKER-qa-stage`: a session that did not build it walks UI changes at 1280 and 390 |
| Code reviewer | Independent second look | `PROCESS-review-gate` (D-166, queued): a Tier 1 head needs an independent pass | `GATE-tier-floor`: CI computes the tier from the paths, so a money or sign-in change filed as Tier 2 still needs that review |
| Integrator | One landing at a time, clean history | Landing slot and file ownership (live) | Landing through the merge button, which deletes the head branch; the lander deletes the task's marker branches (D-205, D-192 (5)); squash and rebase merges off; merge queue (D-166 (5)(b), the owner's word) |
| Release manager | "All lights green" before and after shipping | The lander watches by hand | `REL-release-verify`: after both deploys, a workflow checks the live SHAs and runs the production smoke battery, sets `release/verified`, opens one incident on failure; the web deploy waits for the API it needs |
| Reliability engineer | Knows first, fixes first | Nothing that runs on time | `REL-watchdog` (every 5 minutes from Cloudflare, not GitHub), `REL-5xx-capture`, `REL-heartbeats`, `REL-review-email-retry`, `REL-client-capture`, `REL-webhook-auth-alarm`, `REL-ops-invariants` |
| DevOps | CI/CD, settings, rollback | Partial | `REL-release-verify` (rollback that works, failures on their own issue), `PICKER-fullstack-lights` |
| Security | Threats, secrets, dependencies | D-100 audit waits for a packet; D-191 patches four advisories | Owner settings: secret scanning, push protection, CodeQL (free on a public repo); `GATE-tier-floor` sends every sign-in and identity path to review |

## 4. The seven lights
"All lights green" means all seven, for the commit that is live. `node scripts/next-task.mjs --status` prints them (`PICKER-fullstack-lights`); `PROCESS-scorecard` adds the weekly numbers.

1. **Built right.** Required checks on the exact head, branch up to date: typecheck (with design tokens, deploy triggers, scope, the D-166 gates, test integrity), unit + component + route tests, production build, e2e journeys.
2. **Checked by someone else.** Tier 1: an independent pass on the exact head (`PROCESS-review-gate`), with the tier computed from the paths (`GATE-tier-floor`). A Tier 1 UI change: a QA pass before landing too. Tier 2 and 3: CI is enough to land (D-200 (4)); a UI change among them gets its QA pass within 24 hours after landing, and findings become fix rows.
3. **Landed cleanly.** Through the landing slot and the merge-commit button (`main-protection` requires a pull request; no admin bypass, D-200); `main`'s CI green on the landed SHA; the task branch and its markers deleted.
4. **Deployed.** Deploy API (with `migrate-db`) and Deploy Web green for that SHA.
5. **Verified live.** `release/verified` green: the API and the web serve the expected SHAs and the smoke battery passes on `https://skipwait.me`.
6. **Watched.** The watchdog's last run is green, no scheduled job is overdue, and the daily money and ops checks are clean.
7. **No open incident.**

Lights 4 to 7 run by themselves after landing; nobody waits for them. A red light 4, 5, 6 or 7 on the live release is **red `main`** for the picker: only fixes move, and the fix-main agent reverts the landed commit first when that release is code-only and the commit caused it, then fixes forward (D-082: "if anything goes red, revert or fix your commit first").

## 5. One change, start to finish
1. **Intake.** An owner instruction becomes a register entry (when it sets a rule) and a queue row with tier, lane and owned paths.
2. **Packet.** Goal, the binding decisions quoted, the contracts to keep (each with a pin test), owned paths, journeys, red-first tests, flag, tier.
3. **Build.** Picker `build`; red-first tests; local gate on the branch merged with `origin/main`.
4. **Pull request.** Light 1 on the exact head.
5. **QA and review, side by side.** Light 2.
6. **Land.** Light 3; the lander deletes the branch.
7. **Deploy, verify, watch.** Lights 4 to 7, automatic. The lander reports with the `release/verified` link as its proof.

## 6. When something breaks
Detect (watchdog, release verify, Sentry, the money and ops checks, job heartbeats) → one issue labelled `incident`, opened by the machine → the board turns red → the picker hands out the fix before anything else → revert or fix, with a regression test that fails first → a short note in `docs/` like `INCIDENT-2026-10-22-api-1101.md` and one never-do line in `docs/DELEGATION.md` §7 → the incident closes when light 5 is green again.

**Targets** (changeable; the CEO reviews them weekly from the scorecard): the owner hears of an outage within 10 minutes of two failed probes; API ready 99.5% over 30 days; zero money-check findings; every scheduled job within three windows of its cadence; a new Sentry issue on a release is triaged the same day.

## 7. What we do not do (startup speed)
- No change board, no second approver, no sign-off meetings: one independent reviewer for Tier 1, one QA pass for UI (before landing only for Tier 1, D-200 (4)).
- No hosted staging copy of production: it costs money (D-031). Flags that ship dark, a CI-built local stack for the e2e journeys and a rollback that works do the job.
- No review before landing for Tier 2 or 3.
- No hand-written run logs where a machine record exists: commit statuses and run summaries are the evidence.
- No guard that cannot fail: `drift-watch.yml` goes (`REL-release-verify`); `sync-guard.yml` and `design-gate.yml` go with `SYNC-LOG-off-main`.
- No coverage-percentage targets and no mutation-testing dependencies.

## 8. Branches
D-205 sets the rule: a branch is deleted once it is done and merged (its tip is in `main`, or a merged pull request's head equals its tip), never before; open pull requests, unmerged work and the branches of unfinished tasks stay, and marker branches go when their stage is over. D-192 adds: the landing step deletes the task's marker branches (the merge button already deletes the head branch), and the backlog is cleared once: what D-205 calls done and merged is deleted at once, and the rest goes to the owner as a triage list.

## Status
The tasks are listed in the two packets; each writes its status line there (D-134).
