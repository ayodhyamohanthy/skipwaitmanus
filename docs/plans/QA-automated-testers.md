# Automated testers (D-409)

Owner, Nov 26 2026: "let an automated manual tester, automation tester, continuous integration run through our
platform and raise bugs ... instead of users signing and never coming back".

## QA-auto-issues (Tier 2)
- `.github/workflows/live-qa.yml`: add `schedule` every 6 hours (`17 */6 * * *`), keep `workflow_run` and
  `workflow_dispatch`; scheduled runs use `mode=navigate` for both demo accounts.
- New `scripts/qa-file-bugs.mjs` (pure, tested): reads `live-qa/summary.json` and the run facts, groups failures by
  route/step into a stable key, and returns create/update/close actions; the workflow applies them with `gh issue`
  (`issues: write`). Title `Live QA: <route or step> (<status>)`, labels `bug`, `automated`; body: run link, web/API
  SHAs, failing check, 4xx/5xx path, console error text (redacted), artifact link. One open issue per key; a later
  passing run closes it with a comment. `release-verify.yml` incidents keep their own flow.
- Server 5xx alerts (`server/errorAlerting.ts`) are out of scope here; a follow-up may file them the same way.
- Tests: `scripts/qaFileBugs.test.ts` (dedupe, update, close, redaction, no PII), workflow contract test.

## PICKER-bug-issues (Tier 2)
- `scripts/next-task.mjs` reads open issues labelled `bug` + (`automated` or `ai-tester`) via the REST API it already
  uses; `scripts/nextTaskCore.mjs` hands the oldest as `FIX BUG #n` after red main and own work, before new builds,
  on branch `agent/bug/<n>-<slug>`; the queue gate accepts `agent/bug/*` branches whose PR body says `Fixes #n`.
- Tests: picker order, no double hand-out (claim marker), closed issue no longer handed out.

## QA-ai-explorer (Tier 3, no repo code required)
- A daily scheduled Claude Code session in the `skipwaitmanus` environment (skipwait.me allowed). Prompt kept in this
  packet. It browses signed-out journeys with Playwright at 1280 and 390 (home, search, a company page, jobs, pricing,
  sign-in pages, referrer landing), reads the newest live-QA artifact captures, and files at most 5 new issues a day
  labelled `bug` + `ai-tester` after searching for duplicates. Never signs up, pays, emails, posts publicly or
  touches production settings.

## Status
- QA-auto-issues: in progress — Claude Code · 530c — 2026-11-26 — branch agent/queue/qa-auto-issues. `scripts/qa-file-bugs.mjs` + `scripts/qaFileBugs.test.ts` (10 cases, red first); `live-qa.yml` gains the 6-hour schedule, job-only `issues: write` and the filing step; 20 workflow-scanning suites (481 tests) pass. Live proof is the first scheduled run after landing.
- PICKER-bug-issues: todo — registered by Claude Code · 530c, Nov 26 2026 (D-409).
- QA-ai-explorer: todo — registered by Claude Code · 530c, Nov 26 2026 (D-409); scheduled task created in session.
