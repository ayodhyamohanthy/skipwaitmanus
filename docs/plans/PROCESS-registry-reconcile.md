# Packet PROCESS-registry-reconcile: the queue list tells the truth about what is finished

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` row `PROCESS-registry-reconcile` (status lives there, nowhere else) |
| Decisions | D-373 (6), D-321 (8), D-223, D-068, D-383 (1) (binding text quoted in §2) |
| Risk tier | 3 (docs and registry only; no runtime, no copy users see) |
| Size | M (one session; 65 rows, one file) |
| Implementer | any model |
| Branch | `agent/queue/process-registry-reconcile` from the latest `origin/main` |
| Depends on | none |
| Do not run at the same time as | any row that edits `docs/plans/assignments.json` (the picker's own rows and every unblock ruling) |
| Verified against | `main` `c1e31c93a` on 2026-11-25 |

## 1. Goal

A session that reads `docs/plans/assignments.json` today sees 95 rows marked `todo`. The picker's own board, on the same commit, calls 65 of them `done` because a pull request from each row's branch already merged. So the registry says the queue is full while the queue is effectively empty: FIFO is computed over finished work, and a human reading the list cannot tell what is actually left. After this packet the list and the board agree, and the next session's `build` sees the real queue.

## 2. Binding rules (quoted, not paraphrased)

- **D-373 (6):** "A row the board calls done may still owe work (D-373 (6)). The picker counts a `todo` row as done once any pull request from its branch merged. When a row's packet or note says work remains, move the row to a fresh branch with the remaining steps in its note, so the picker hands it out again, and drop any dependency edge whose only reason is gone."
- **D-321 (8):** "Register the next rows before the queue runs dry. If a simulation or the board shows sessions getting AHEAD work only, decompose the next decided priority into rows the same day (D-223)."
- **D-223:** "Split every priority into rows that one agent finishes alone. Each row has its own branch, lane, `owns` (the files it may touch), its parent as `epic`, and `dependsOn` only on rows whose output it needs."
- **D-068:** "every decision, status or behaviour change updates every affected markdown file ... in the same push; a stale statement is a defect."
- **D-383 (1), the failure this packet must not repeat:** PR #1483 "merged only `docs/PRICING.md`, `docs/plans/PRICING-banded-checkout.md` and `docs/qa/banded-release-qa.md` ... The picker therefore inferred the `todo` row complete, although no runtime/config change landed."

## 3. Current behaviour (verified)

1. On `main` `c1e31c93a`, `docs/plans/assignments.json` holds 429 rows: 313 `done`, 95 `todo`, 19 `owner`, 2 `in-review`, 1 `architect`.
2. Of the 95 `todo` rows, 66 have every `dependsOn` row already `done`. The other 29 wait on a dependency that is not done.
3. `node scripts/next-task.mjs --claim "DeepSeek V4.1 Flash"` on 2026-11-25 printed the board with 65 of those 66 rows as `done · done`, and reported "Nothing is left for you ... no packet, review, landing or build". The single remaining row, `QA-sandbox-requests`, is `GREEN · pr-green` and held by an active session.
4. Four of the 65 were checked against GitHub and their merged pull request is the real implementation, not a docs-only carrier: `seeker-passwords` → #1474 "feat(auth): seeker email + password sign-in" (merged 2026-11-23), `D-174-expiry-clock-removal` → #1552 "D-174: suspend the ask death clocks behind ASK_NO_EXPIRY_ENABLED" (merged 2026-11-24), `D-174-ask-from-job` → #1488 "feat(referral): D-174-ask-from-job" (merged 2026-11-23), `REL-ops-invariants` → #1504 "REL-ops-invariants: record the first-run deploy and public j…" (merged 2026-11-24).
5. `node scripts/scorecard.mjs` on the same day: 80 merged pull requests in the sample, 0 reverts, median open-to-merge 0.3 h. The board is not drifting because work is stuck; it is drifting because the registry is not written back.

## 4. Target behaviour

1. Every row in §5 is either `done` with `syncedTo` set to the newest register entry on `main` at the time of the change, or moved to a fresh branch with its remaining steps in `note` and its stale dependency edges dropped (D-373 (6)).
2. A row is marked `done` only when the merged pull request from its branch is the accepted implementation of the row's own packet, not a docs-only or partial carrier. If the merged pull request is docs-only, or the packet's Status section or the row's `note` says work remains, the row is **not** marked done.
3. No row's `owns`, `tier`, `lane`, `epic`, `dependsOn` (except a dropped stale edge), FIFO position or `id` changes for any row outside §5.
4. `node scripts/next-task.mjs --status` after the change shows no row as `todo` in the list while the board calls it `done`.
5. The change is docs-only: no file outside §5.1 is edited.

## 5. Files

- **In scope (edit only these):** `docs/plans/assignments.json`; `docs/plans/PROCESS-registry-reconcile.md` (its own Status section); `docs/plans/DECISION-REVIEW.md` only if you record a finding there.
- **Read only:** `docs/DECISIONS.md`, `docs/BRIEF.md`, `AGENTS.md`, `docs/DELEGATION.md`, every packet named in §5.2. A row's remaining steps go in its `note` in `assignments.json`, not in another row's packet, so no packet outside this one is edited.
- **Out of scope (never edit here):** any file under `client/`, `server/`, `shared/`, `drizzle/`, `scripts/`, `.github/`; any row outside §5.2; any `owner` row.

### 5.1 The 65 rows to reconcile

Each row below is `todo` in the list and `done` on the board on `main` `c1e31c93a`. The branch column is the branch whose merged pull request the board counted.

| Row | Branch | Tier |
|---|---|---|
| `PICKER-auto-land` | `agent/queue/picker-auto-land` | 2 |
| `OPS-deploy-secrets-file` | `agent/queue/ops-deploy-secrets-file` | 1 |
| `OPS-reviewer-plaintext-reset` | `agent/queue/ops-reviewer-plaintext-reset` | 1 |
| `OPS-live-qa-runner` | `agent/queue/ops-live-qa-runner` | 1 |
| `PICKER-unblock-report-clears` | `agent/queue/picker-unblock-report-clears` | 2 |
| `PICKER-single-flight` | `agent/queue/picker-single-flight` | 2 |
| `AUTH-workos-refresh-scope` | `agent/queue/auth-workos-refresh-scope` | 1 |
| `ADMIN-support-view` | `agent/queue/admin-support-view` | 1 |
| `LAUNCH-qa-fixes` | `agent/queue/launch-qa-fixes` | 2 |
| `BANDED-schema` | `agent/queue/banded-schema` | 1 |
| `BANDED-catalog-sync` | `agent/queue/banded-catalog-sync` | 1 |
| `BANDED-ui` | `agent/queue/banded-ui` | 1 |
| `BANDED-release-qa-runner` | `agent/queue/banded-release-qa-runner` | 1 |
| `OPS-live-qa-hardening` | `agent/queue/ops-live-qa-hardening` | 2 |
| `BANDED-catalog-family` | `agent/queue/banded-catalog-family` | 1 |
| `SEEKER-requests-no-samples` | `agent/queue/seeker-requests-no-samples` | 2 |
| `HYGIENE-picker-bootstrap` | `agent/queue/hygiene-picker-bootstrap` | 2 |
| `DEPLOY-web-catch-up` | `agent/queue/deploy-web-catch-up` | 2 |
| `PICKER-session-worktree` | `agent/queue/picker-session-worktree` | 2 |
| `D-048-R-admin-money` | `agent/queue/d048-r-admin-money-acceptance` | 1 |
| `D-048-R-admin-people` | `agent/queue/d048-r-admin-people` | 1 |
| `D-048-R-home-signed-in` | `agent/queue/d048-r-home-signed-in` | 2 |
| `P0-referral-access-availability` | `agent/queue/p0-referral-access-availability` | 1 |
| `seeker-passwords` | `agent/queue/seeker-passwords-integration` | 1 |
| `D-222-referral-count-shell` | `agent/queue/d222-referral-count` | 1 |
| `D-048-GoalEmails-nouns` | `agent/instinct/goal-emails-noun-recovery-nov9` | 2 |
| `SKIPPY-fix` | `agent/queue/skippy-fix` | 1 |
| `D-048-R-employer-talent` | `agent/queue/d048-r-employer-talent` | 1 |
| `D-048-R-employer-billing` | `agent/queue/d048-r-employer-billing` | 1 |
| `REL-watchdog` | `agent/queue/rel-watchdog` | 2 |
| `REL-review-email-retry` | `agent/queue/rel-review-email-retry` | 1 |
| `REL-ops-invariants` | `agent/queue/rel-ops-invariants-first-run` | 1 |
| `D-086.count` | `agent/queue/d086-count` | 1 |
| `D-100.csp-release` | `agent/queue/d100-csp-enforce-release` | 2 |
| `D-100.hsts-preload` | `agent/queue/d100-hsts-preload` | 2 |
| `D-093.picker` | `agent/queue/d093-picker` | 2 |
| `D-094-ai-in-ui.status-help` | `agent/queue/d094-status-help` | 1 |
| `D-094-ai-in-ui.coach` | `agent/queue/d094-coach` | 1 |
| `SYNC-LOG-off-main` | `agent/queue/sync-log-off-main` | 2 |
| `D-174-expiry-clock-removal` | `agent/coordinator/expiry-clock-removal` | 1 |
| `D-174-fix-post-binding` | `agent/queue/d174-fix-post-binding` | 1 |
| `D-176-home-metadata-hydration` | `agent/instinct/home-metadata-hydration-nov9` | 2 |
| `DECISION-SYNC-oct26` | `agent/queue/decision-sync-oct26` | 3 |
| `D-174-ask-from-job` | `agent/queue/d174-ask-from-job` | 1 |
| `D-174-seeker-journey-build.public-payload` | `agent/queue/d174-journey-payload` | 1 |
| `D-174-seeker-journey-build.jobs-list` | `agent/queue/d174-journey-jobs` | 2 |
| `D-178.read` | `agent/queue/d178-read` | 1 |
| `DEVICE-SIGNIN-passkeys` | `agent/queue/device-signin-passkeys` | 1 |
| `PICKER-landing-wait-fallthrough` | `agent/queue/picker-landing-wait-fallthrough` | 2 |
| `PICKER-gate-red-review-route` | `agent/queue/picker-gate-red-review-route` | 2 |
| `REVIEW-GATE-fetch-parity` | `agent/queue/review-gate-fetch-parity` | 2 |
| `PICKER-ordinary-gate-red-recovery` | `agent/instinct/ordinary-tier1-gate-red-recovery-nov9` | 2 |
| `PICKER-parallel-eligibility` | `agent/queue/picker-parallel-eligibility` | 2 |
| `D-180-referral-copy-prep` | `agent/queue/d180-referral-copy-prep` | 1 |
| `DEV-prettier-396` | `agent/queue/dev-prettier-396` | 2 |
| `PICKER-open-pr-pagination` | `agent/queue/picker-open-pr-pagination` | 2 |
| `PROCESS-model-provenance` | `agent/queue/process-model-provenance` | 2 |
| `UI-referrer-privacy-copy-tests` | `agent/queue/ui-referrer-privacy-copy-tests` | 3 |
| `PROCESS-provenance-loader-bounds` | `agent/queue/process-provenance-loader-bounds-glm-nov10-isolated` | 2 |
| `STORY-employer-rules-answer` | `agent/queue/story-employer-rules-answer` | 2 |
| `PROCESS-sol-full-edit` | `agent/queue/process-sol-full-edit` | 2 |
| `D-174-worldwide-discovery.company-context` | `agent/queue/d174-company-context` | 1 |
| `PICKER-compact-claim-output` | `agent/queue/picker-compact-output` | 2 |
| `PICKER-report-append-snapshot` | `agent/queue/picker-report-append-snapshot-8817` | 2 |
| `PICKER-vanished-lock-tip` | `agent/queue/picker-vanished-lock-tip` | 2 |

### 5.2 Packets to read before changing a row

Read the row's own `packet` path from `assignments.json` (every row above has one) and its `Status` section. Do not read every packet in full; read the Status section and the Definition of done.

## 6. Steps (one commit each)

1. **Verify the 65.** For each row, run `gh pr list --head "<branch>" --state merged --json number,title,files` and read the row's packet Status section. Classify it:
   - **complete** — the merged pull request carries the row's own implementation (runtime, tests or docs as the packet defines them) and nothing in the packet or `note` says work remains;
   - **owes work** — the merged pull request is docs-only, partial, or the packet/`note` names remaining steps.
   Commit: `docs(registry): classify the 65 board-done rows against their merged pull requests`.
2. **Reconcile the complete rows.** Set `status: "done"` and `syncedTo` to the newest `docs/DECISIONS.md` entry on `main`. Commit: `docs(registry): mark <n> board-done rows done`.
3. **Reconcile the rows that owe work.** For each, keep the row open on a fresh branch, put the remaining steps in `note`, and drop any `dependsOn` edge whose only reason is gone (D-373 (6)). Commit: `docs(registry): keep <n> rows open with their remaining steps`.
4. **Prove the result.** Run `node scripts/next-task.mjs --status` and paste the board line count and the `todo` count into the pull request body. Commit: `docs(registry): record the reconciled board`.

## 7. Tests to write first (red before the fix)

This is a registry change, so the "test" is the picker's own validator plus a readback:

1. **Validator, red first.** `node -e "import('./scripts/nextTaskCore.mjs').then(m=>console.log(m.validateAssignments(JSON.parse(require('fs').readFileSync('docs/plans/assignments.json','utf8')))))"` must report no errors before and after. Record the before output in the pull request.
2. **Readback.** `node scripts/next-task.mjs --status` must show the reconciled rows as `done` and must not show any row as `todo` in the list while the board calls it `done`.
3. **Controls.** `git diff --stat` must touch only `docs/plans/assignments.json` and the packets you changed. No row outside §5.1 may change status.

## 8. Edge cases and races

- **Another session edits `assignments.json` while you work.** Rebase on the latest `origin/main` before every push and re-run §7. Never force-push and never overwrite another session's row.
- **A row's merged pull request is a docs carrier (D-383).** Leave it open. Do not mark it done.
- **A row is `owner` or `in-review`.** Out of scope; leave it exactly as it is.
- **A row's branch has several merged pull requests.** Use the one whose title matches the row's packet outcome, and say which in the commit body.

## 9. Definition of done

- [ ] Every §5.1 row is either `done` with a `syncedTo` stamp, or open on a fresh branch with its remaining steps in `note`.
- [ ] `validateAssignments` reports no errors; the before and after output is in the pull request.
- [ ] `node scripts/next-task.mjs --status` readback is in the pull request.
- [ ] `git diff --stat` touches only `docs/plans/assignments.json` and the packets you changed.
- [ ] Docs updated in the same push (D-068).
- [ ] Landed through a protected pull request on green required CI (D-370).

## 10. Review checklist (for the independent reviewer)

1. Does any row marked `done` rest on a docs-only or partial pull request? Name it.
2. Does any row that owes work stay open with its remaining steps written down?
3. Did any row outside §5.1 change status, `owns`, `tier`, `lane` or `dependsOn`?
4. Is `syncedTo` the newest register entry on `main` at the time of the change?

## 11. Stop and ask if

- A row's packet is missing or its Status section contradicts the merged pull request.
- A row's branch has no merged pull request at all (the board's `done` would then be wrong, which is a picker defect, not a registry fix).
- You need to edit a file outside §5.

## 12. Owner questions

None. This is registry hygiene under D-373 (6) and D-321 (8); it changes no product, price, plan, legal text, login rule, money path or spending.

## Status

`todo` — registered 2026-11-25 by the CEO review (`DeepSeek V4.1 Flash · 6f0f`) after the picker reported "Nothing is left for you" while 95 rows read `todo` and 65 of them were already done on the board. Evidence: `docs/plans/DECISION-REVIEW.md`, section "2026-11-25".
