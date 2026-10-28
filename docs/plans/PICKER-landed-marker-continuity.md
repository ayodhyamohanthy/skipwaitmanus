# PICKER-landed-marker-continuity (S1/S2)

## Source contract and scope

At main `5323f62eca74e182f7b65149f9da4cecaec406e6`, CLI `state()` reads only the newest 100 updated closed PRs. `loadBranches` supplies tip SHA, ancestor-of-main, and markers, but no authoritative full merge history or content-delta classification. Core `buildView` uses tip/merged-head equality. A recreated branch containing only empty markers can therefore lose its recognized landed state. An absence from that 100-PR window is not proof of unfinished work.

Owns: `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, new `scripts/nextTaskLandedMarkerContinuity.test.ts`. Wait for BOTH `PICKER-heartbeat-slot-safety` (CLI) and `PICKER-avoid-land` (last existing core owner, transitively waiting on PROCESS-review-gate, architect-landing and avoid-unblock). This is deliberately a combined adapter/core row, not an unowned adapter expansion during build.

## Acceptance

- Red-first S1: a deleted task branch with an authoritative normal merge on main stays landed even outside the recent closed-PR window.
- Red-first S2: recreating that branch with ONLY provably empty recognized picker marker commits does not un-land it. No arbitrary empty commit may be treated as a valid marker merely because it is empty.
- Controls: a substantive post-merge commit remains unfinished; an unmerged marker-only branch is never declared landed; exact merged-head and current ancestor controls remain valid.
- Adapter tests establish real normal-merge ancestry/branch provenance from disposable git history, not an unverified commit subject alone. Squash history needs verified merged-PR evidence with bounded pagination/cache and explicit unknown on incomplete/rate-limited/failed reads. Do not convert unknown into done, and do not remove existing reliable landed evidence because another optional read failed.
- Cover unrelated merge subjects, ambiguous/reused branch names, missing history, post-merge content later reverted, and history-window truncation. Explain and test what the adapter can prove; report a remaining ambiguity rather than marking a row complete.
- Landed-state recognition does not authorize changing registry statuses or deleting branches. No cleanup command or external mutation is part of this row.

## Guardrails and handover

This is a bounded registration packet, not evidence that the fix works. Implementation starts only after this registration is reviewed and landed and the normal picker assigns this row after its dependencies. Do not claim or modify any existing owner or held row to get here. No claim override, silent release, branch deletion, cleanup, deployment, API activation, provider request, settings change, paid service, product change or new runner is authorized. Preserve review independence, CI and protected normal merge procedure. No squash/rebase landing or history rewrite. This packet does not mark historical rows done or change policy, model identity or who lands.

Run red-first focused regressions in the new owned test file, existing picker/CLI tests, assignment validation, scope checks, typecheck and required CI. Fixtures use disposable local repositories or injected read-only data, never real remote writes. Return actual red/green output and exact head, an independent bounded review, and required CI evidence before landing. A green test is not live deployment proof or automatic session-to-next-session proof.

## User and product effect

Builders waiting on routing errors delay reliable referral journeys for seekers and referrers. Honest ownership and progress preserve contributor trust without weakening safety. Expected metric: fewer false continuation/landing waits in the named regression fixtures. No production metric improvement is claimed. Cost: no paid tools or provider calls. Risk: false completion or concurrent landings, controlled by fail-closed negative fixtures.

## Status

Proposed registration only. No implementation, review verdict, completion or live acceptance is asserted.
