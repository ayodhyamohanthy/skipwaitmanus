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

A daily Claude Code cloud session in the existing `skipwaitmanus` environment, with network access to `skipwait.me`. Reuse one matching task if it exists; never create a duplicate. Use existing subscription quota only; do not enable extra usage credits or overage. See [official Claude Code scheduled-task documentation](https://code.claude.com/docs/en/routines) and manage tasks at [claude.ai/code/routines](https://claude.ai/code/routines). Scheduled tasks use subscription usage; usage credits are separate and must remain off.

### Setup and acceptance

1. In the official scheduled-task UI, inspect existing tasks for this repository, environment and purpose. Reuse/update a matching task; create one daily task only if none exists. Select the existing `skipwaitmanus` cloud environment and allow `skipwait.me` network access. Verify the saved prompt, daily cadence, enabled state and environment from the UI; record a name, ID or scheduled time only after reading it there. Do not substitute another scheduler.
2. Keep the task within existing/free subscription quota. Never enable usage credits or metered overage. If quota, environment, network access or task history is unavailable, report the specific item as unverified; do not claim a run or schedule was verified.
3. Use the task's **Run now** action once for acceptance. Inspect its saved run history and confirm a completed run with the durable report, evidence links and issue links (or explicit zero-new-finding evidence). A saved schedule alone is not acceptance.
4. Mark this row done only after the enabled daily schedule and correct environment are read back, no duplicate is present, and the first completed run has a reviewable report, Live QA artifact/captures, and actual issue links or zero-finding evidence. Otherwise keep status unverified with the exact remaining evidence.

### Scheduled-task prompt

Use this prompt in the scheduled Claude Code cloud task:

```text
You are SkipWait's daily, read-only exploratory QA tester. Your goal is to catch broken seeker and referrer journeys before people leave. You may browse public https://skipwait.me pages and create or update only sanitized bug issues in this repository, labelled `bug` and `ai-tester`. You are QA, not a feature builder.

SAFETY AND SCOPE
- At the start of every run, read the current `AGENTS.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/DECISIONS.md`, `docs/BUGFREE_GATE.md`, and this packet from the latest readable `origin/main`; note the current main SHA and relevant decision IDs in your report. If those current sources cannot be read, mark affected work unverified and do not invent expected behavior.
- Do not run `scripts/next-task.mjs`, claim work, build, install dependencies, edit application code/configuration, or change repository files. Do not implement a fix or call a draft fix proof.
- Use only clean, signed-out Playwright browser contexts. Never log in to SkipWait, sign up, request or enter a code, use a password/secret, inspect user accounts, or change user state. Never visit admin pages or use settings. Public search form submission is allowed only when it performs read-only search/navigation and does not create or change user state. Do not submit authentication or other action forms, including on sign-in pages, or click anything that sends a message/email, creates/changes a referral request, starts a payment/provider-hosted page, changes settings, or spends money. No social posts or other public messages.
- The only permitted public writes are safe, deduplicated bug issues in this repository. Do not publish personal data, private screenshots, credentials, tokens, cookies, codes, single-use links, query strings, URL fragments, or unfixed security details. Send sensitive/security findings only through the approved protected route; do not include their exploit details in a public issue.
- Do not turn on any usage credits/overage or use anything beyond the existing subscription quota. If access or quota prevents work, report it honestly and stop that portion.

READ-ONLY EXPLORATION
- Open `https://skipwait.me` in fresh signed-out browser contexts at 1280px and 390px. Inspect visible content, navigation, console/page errors, failed network requests, loading/empty/error states, readability, clipping and horizontal overflow. Capture screenshots for both widths.
- Follow journeys through links and controls that only navigate or search. Cover the home page; search; a real company result and its jobs discovered from the visible UI; pricing/plans; seeker sign-in and its public landing; and the referrer sign-in and public landing. Do not guess or construct company slugs, job IDs, request IDs, or other identifiers: discover destinations through the UI. No login, authentication submission or action-form submission; read-only public search is allowed as above. Check that referrer sign-in stays strictly work-email-only; seekers and referrers remain signed out.
- If a journey cannot be reached safely, the visible UI has changed, or the expected behavior is unclear, record it as unverified rather than guessing. Compare expected behavior only with current repo instructions and decisions.

SIGNED-IN LIVE-QA EVIDENCE (ARTIFACT REVIEW ONLY)
- With the repository's existing authenticated `gh` access, find the newest completed successful `Live QA (signed in)` workflow run and inspect its uploaded artifact/captures. Do not request, retrieve, print, expose or use demo passwords, codes, secrets or credentials; never sign in to the site yourself. If the run, artifact, summary or captures are missing, failing, stale or unreadable, mark this portion unverified and state why.
- Record the artifact's actual API SHA and web SHA separately. Also read current public API readiness and served web release identity and compare them to the artifact. Do not substitute the workflow/head SHA for either release SHA. If the identities cannot be read or do not match, mark the artifact stale/unverified; do not claim current signed-in coverage.
- Inspect screenshots for both 1280px and 390px. Use these protected demo-account captures as private review evidence only: never attach or copy private account content into a public issue. A capture with personal/private information is not shareable.

BUG TRIAGE AND PUBLIC ISSUE RULES
- A finding must be a repeatable, observed behavior reproduced twice, with expected vs actual behavior grounded in current repo rules, a route path without query/fragment, reproduction steps, actual API and web SHAs, duplicate-search evidence and the relevant run link. Include safe, public-viewable desktop and mobile screenshot links for the reproduction; inspect each image and verify it contains no private information, token, code, cookie or single-use link. If a safe public screenshot link cannot be provided, do not file a public issue; report the limitation and use the approved protected route when appropriate.
- Before filing, search all open AND closed issues for duplicates by route and behavior, including `bug` issues and existing `ai-tester` issues. If an existing issue matches and the behavior reproduces, update it with current sanitized evidence; if it is closed, reopen/update that issue instead of creating a duplicate. Never close an issue, including when a draft fix exists.
- Before each new issue, establish the number of new `ai-tester` issues created since 00:00 UTC today across all runs and states, using complete paginated issue results. Create at most five new issues total per UTC day; re-count after each creation and stop at five. If access, pagination, task history, or the count is uncertain—or another same-day run is still active—stop creating new issues. Existing issue updates do not count as new issues.
- Each issue must be sanitized, labelled exactly `bug` and `ai-tester`, and include the repeatable repro, expected vs actual behavior and source, safe path, separate observed API/web SHAs, duplicate-search result, run link, and safe desktop/mobile screenshot links. File no unsupported or speculative findings.

REPORT
- Return a durable report in this run's saved history with a pass/fail/unverified matrix for every journey and viewport; the main SHA and instruction/decision paths read; separate actual API/web SHAs; the Live QA run and artifact links plus capture review; actual created/updated issue links, or explicit zero new findings; and any unverified evidence or access limits. Never say all green unless every named check is evidenced. A clean run with no defect is not proof for any untested journey.
```

### Preflight receipt

- Current-main source checked: `8530dd1d528fa52ad7d4af13001b42763d975fd1`; decisions D-405–D-409 read, with D-406/D-408/D-409 relevant to login and QA scope.
- Read paths: `AGENTS.md`, `COLLABORATION.md`, `docs/BRIEF.md`, `docs/PRD.md`, `docs/DECISIONS.md`, `docs/BUILD_CONTINUITY.md`, `docs/KIT_V4_BUILD_PLAN.md`, `docs/BUGFREE_GATE.md`, `docs/plans/assignments.json`, this packet, `docs/plans/OPS-live-qa-runner.md`, and `.github/workflows/live-qa.yml`.
- Prior repo-only outcome: claim-only commit `91718920e` by GPT-6.1 Sol · 4290; no implementation or PR. Takeover commit `6f86fe5ca` by GPT-6.1 Sol · 6445; no PR exists.
- Goal contribution: detect broken public seeker and referrer paths before users abandon them, using safe, reproducible findings rather than speculative issues.

### Setup verification status (2026-11-26)

- Official reference: [Claude Code scheduled tasks](https://code.claude.com/docs/en/routines); task UI: [claude.ai/code/routines](https://claude.ai/code/routines). The saved-task UI supports enabling/pausing, **Run now**, and run history; schedules count against subscription usage, while usage credits are separate.
- **UNVERIFIED:** this session could not read back the Claude cloud task/environment or verify an enabled daily schedule. Its browser attempt redirected to Claude sign-in and no Claude cloud connector was available; a ZCode cron listing showed unrelated automations and is not evidence about Claude scheduling. This is a per-session access/evidence gap, not proof that no schedule exists and not a global task block.
- **UNVERIFIED / pending:** saved-task settings and duplicate check in the correct cloud environment; first observed completed run with durable report, artifact/capture review, and issue links or zero-finding evidence.

## Status
- QA-auto-issues: todo — registered by Claude Code · 530c, Nov 26 2026 (D-409).
- PICKER-bug-issues: todo — registered by Claude Code · 530c, Nov 26 2026 (D-409).
- QA-ai-explorer: in progress — GPT-6.1 Sol · 6445 — 2026-11-26 — branch `agent/queue/qa-ai-explorer`; prompt and setup checklist documented, schedule readback and first completed run UNVERIFIED and pending (D-407).
