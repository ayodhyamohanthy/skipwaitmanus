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
