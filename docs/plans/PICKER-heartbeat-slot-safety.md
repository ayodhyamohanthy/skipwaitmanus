# PICKER-heartbeat-slot-safety (M1)

## Evidence and scope

At main `5323f62eca74e182f7b65149f9da4cecaec406e6`, `keepClaim` in `scripts/next-task.mjs` takes a landing slot when `slot.holder !== who || slot.quiet`. Its heartbeat path can therefore attempt a slot write for another fresh holder. This is separate from the avoid-continuation issue: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/744 . The guard below must preserve the normal landing mutex.

Owns: `scripts/next-task.mjs`, new `scripts/nextTaskHeartbeatSlot.test.ts`. Wait for `PROCESS-review-gate`, the existing whole-CLI owner. No edits to its packet, row or tests.

## Acceptance

- Red-first: A holds a fresh landing slot, B holds its own LAND stage, B heartbeats. Renew B's legitimate lease without writing Land claim/Takeover or any other change to A's slot.
- Controls: same-holder renewal; quiet/free-slot behavior remains under current policy. An expired slot is not proof of a handoff.
- Simulate a competing push after the read: fail closed and do not retry on top of the new holder. Check exact written refs and subjects.
- Preserve all other claim, sync-first and lease semantics. No new release verb or automatic holder transfer.

## Guardrails and handover

This is a bounded registration packet, not evidence that the fix works. Implementation starts only after this registration is reviewed and landed and the normal picker assigns this row after its dependencies. Do not claim or modify any existing owner or held row to get here. No claim override, silent release, branch deletion, cleanup, deployment, API activation, provider request, settings change, paid service, product change or new runner is authorized. Preserve review independence, CI and protected normal merge procedure. No squash/rebase landing or history rewrite. This packet does not mark historical rows done or change policy, model identity or who lands.

Run red-first focused regressions in the new owned test file, existing picker/CLI tests, assignment validation, scope checks, typecheck and required CI. Fixtures use disposable local repositories or injected read-only data, never real remote writes. Return actual red/green output and exact head, an independent bounded review, and required CI evidence before landing. A green test is not live deployment proof or automatic session-to-next-session proof.

## User and product effect

Builders waiting on routing errors delay reliable referral journeys for seekers and referrers. Honest ownership and progress preserve contributor trust without weakening safety. Expected metric: fewer false continuation/landing waits in the named regression fixtures. No production metric improvement is claimed. Cost: no paid tools or provider calls. Risk: false completion or concurrent landings, controlled by fail-closed negative fixtures.

## Status

Proposed registration only. No implementation, review verdict, completion or live acceptance is asserted.

PICKER-heartbeat-slot-safety: done — code head `9d512536` (ordinary two-parent merge of current `main` `e7c70797` and the origin claim marker; this status commit sits on top) — 2026-11-05 — landed by DeepSeek V4.1 Flash Free · bdf8 under D-082. **Independent bounded review, recorded with its limits:** this session is distinct from the builder (Hark · 5de4) and neither built nor fixed the row, but it also served as the normal lander, and no coordinator acceptance of a separate reviewer is on record for #977; Hark's underlying model remains unverified, so no D-151 model-independence claim is made (D-151's different-model restriction is Tier 1-specific, D-284). Measured on the exact head, not inherited: `git diff origin/main...HEAD` is 3 files / 181 insertions / 1 deletion, byte-identical (md5 `3b49e69f47c98768cfa275cfa2889604`) to Hark's reviewed head `fe57cde5`; the only source change is the `othersFresh` guard in `keepClaim`. Red-first reproduction `ceae8fce` 1 failed / 4 passed, green 5/5 at `9d512536`; mutation reverting the guard to `slot.holder !== who || slot.quiet` turns the red-first test red again (1 failed / 4 passed), source restored and tree clean. Controls pin exact written refs and subjects (A's slot untouched, same-holder renewal, free slot, quiet slot, competing push fails closed). Gate on the merged head: `pnpm check` 0; design-token audit / migrations lint / deploy triggers / decision-id-check all 0; scope-check "2 owned path(s)"; `scripts/` 36 files / 1103 passed; `scripts/nextTask.test.ts` 175/175; full vitest 598 files / 5923 passed with 4 unrelated `server/` load failures, each re-run in isolation 48/48 (documentAccessLifecycle, seekerAgents, skippieAdmin, skippieSeekerRoutes); `pnpm build` 0 and `VITE_GOAL_SURFACES=all pnpm build` 0 (the first goal-build red was the host's safe-delete guard on vite's `emptyOutDir`, not a code failure — moving `dist` aside cleared it). No flag, money, migration, settings, product or deployment action; no gate waived, no test weakened, no history rewrite.

PICKER-heartbeat-slot-safety: review — Hark · 5de4 — 2026-11-03 — draft PR #977, branch `agent/queue/picker-heartbeat-slot-safety`. Head is this status commit, on merge `8e445896` of `main` `fa462f69` (ordinary merge, clean, no rebase; earlier heads `7ebb7a4b` fix, `f216e0f6` status). Red first `ceae8fce`: 1 fail / 4 controls pass (re-run 2026-11-03 on that commit, same result). Fix `7ebb7a4b`: 5/5. On the merge: `nextTaskHeartbeatSlot.test.ts` 5/5; picker files (`nextTask`, `nextTaskArchitectLanding`, `nextTaskAvoidUnblock`, `nextTaskReviewWording`, plus the heartbeat file) 198/198; every `scripts/` test file 1075/1075; `tsc --noEmit` exit 0; `node scripts/scope-check.mjs PICKER-heartbeat-slot-safety` OK (2 owned paths). Mutation on the final source (guard reverted to `slot.holder !== who || slot.quiet`): the red-first test fails again (1 fail / 4 pass), restored after. CI: required checks run on this head after push; the result is recorded on PR #977, not here. Open policy question, not decided by this row: whether a heartbeat may take a quiet (expired) landing slot; the fix keeps today's behaviour for quiet and free slots. Not done or landed. Needs a separate final-head review against current `main` and a distinct normal lander; Hark's underlying model unverified, no D-151 independence claim, no self-merge; the D-284 waiver is not relied on.
