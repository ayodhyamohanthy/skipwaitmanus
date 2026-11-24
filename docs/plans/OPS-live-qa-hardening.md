# OPS-live-qa-hardening: signed-in live QA never passes silently and runs after every password reset (D-387)

Tier 2 · lane `live-qa-hardening` · branch `agent/queue/ops-live-qa-hardening` · epic D-212

## The defects, observed on Nov 24 2026

1. **A skip looked like a pass.** With `REVIEWER_SEEKER_PASSWORD` and `REVIEWER_REFERRER_PASSWORD`
   unset, run [45307607684](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45307607684)
   printed `live QA skipped: ... not set` as a notice and concluded **success**. Every automatic run
   for days reported green while checking nothing. AGENTS.md: silent failure is a defect.
2. **A password reset never triggered live QA.** `reviewer-qa-passwords.yml` dispatches
   `deploy-api.yml` with the workflow's `GITHUB_TOKEN`. GitHub does not create `workflow_run` events
   for runs started that way, so the Deploy API success (run 45361666119) started no live QA; the
   only automatic run that appeared (45363806212) was set off by a failed Deploy Web run and skipped.
3. **4xx requests are invisible.** The signed-in run 45364628436 logged one console error,
   `Failed to load resource: ... status of 400`, on all 38 captures (both roles, both widths).
   Signed out, `/`, `/plans` and `/sign-in` produce none. `scripts/live-qa-signed-in.mjs` records
   only `>= 500` responses, so the failing URL was lost.

## The fix

1. `live-qa.yml`: when either password secret is missing, the job **fails** with an `::error::`
   naming the secret and the owner action (Settings > Secrets and variables > Actions). This holds
   for `workflow_dispatch` and `workflow_run` alike. No other behaviour changes.
2. `reviewer-qa-passwords.yml`: after dispatching the reset deploy, find that exact run (dispatched
   by this job, newest after the dispatch time), wait for it to complete (bounded, under the job's
   timeout raised as needed), fail if it did not succeed, then dispatch `live-qa.yml` on `main`
   (`workflow_dispatch` from `GITHUB_TOKEN` is allowed to start a run). Credential material never
   appears in inputs, arguments, logs or artifacts (existing rule, unchanged).
3. `live-qa-signed-in.mjs`: record every `4xx` response as `<status> <method> <path>` with the query
   string removed, in the per-route result and `summary.json`, next to the existing 5xx list. A 4xx is
   a finding, not an exit-1 failure (exit rules unchanged). Redaction stays as it is.
4. Report the 400's exact URL from the first run after landing in this packet's Status section. Its
   root-cause fix is a separate row registered then; do not suppress or filter the error here.

## Tests (red first)

`scripts/liveQaSignedIn.test.ts`: a 4xx response is recorded with method and query-free path; a
query string with a token is not recorded; exit code is unchanged by a 4xx. A workflow contract
test (same file or a new `scripts/liveQaWorkflows.test.ts`) reads both YAML files and asserts the
missing-secret step exits non-zero and the reset job dispatches `live-qa.yml` after waiting.

## Acceptance

Focused tests and `pnpm check` green; required CI green. After landing: one manual reset run shows
the deploy, then a live QA run started by the reset job, both linked in the Status section.

## Status

- OPS-live-qa-hardening: in progress — Claude Code · 3016 — 2026-11-24 — branch agent/queue/ops-live-qa-hardening
