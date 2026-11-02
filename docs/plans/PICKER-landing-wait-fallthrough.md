# PICKER-landing-wait-fallthrough (W1)

## Evidence and scope

At main `5323f62eca74e182f7b65149f9da4cecaec406e6`, pass 1 of `pickNextTask` immediately returns an action of kind wait. A busy landing can prevent checking later eligible work. Distinct from bypassing the slot or changing a held stage.

Owns: `scripts/nextTaskCore.mjs`, new `scripts/nextTaskLandingWaitFallthrough.test.ts`. Wait for `PICKER-landed-marker-continuity`; preserve every existing dependency edge and owner.

## Acceptance

- Red-first: another session holds a fresh landing slot; claimant encounters a pending landing first but can do disjoint eligible work. Select that work without changing the slot or handing out a concurrent landing.
- Control: when no other work is eligible return an honest WAIT, including current holder/reason.
- Preserve red-main precedence, blocked lanes, explicit dependencies, file ownership, review independence, own unfinished-work ordering and push-first checks.
- Cover an own LAND waiting on the slot separately. Do not silently broaden this row into avoiding/releasing owned stages; any behavior beyond the pending-work wait case needs an explicit packet amendment and independent review.

## Guardrails and handover

This is a bounded registration packet, not evidence that the fix works. Implementation starts only after this registration is reviewed and landed and the normal picker assigns this row after its dependencies. Do not claim or modify any existing owner or held row to get here. No claim override, silent release, branch deletion, cleanup, deployment, API activation, provider request, settings change, paid service, product change or new runner is authorized. Preserve review independence, CI and protected normal merge procedure. No squash/rebase landing or history rewrite. This packet does not mark historical rows done or change policy, model identity or who lands.

Run red-first focused regressions in the new owned test file, existing picker/CLI tests, assignment validation, scope checks, typecheck and required CI. Fixtures use disposable local repositories or injected read-only data, never real remote writes. Return actual red/green output and exact head, an independent bounded review, and required CI evidence before landing. A green test is not live deployment proof or automatic session-to-next-session proof.

## User and product effect

Builders waiting on routing errors delay reliable referral journeys for seekers and referrers. Honest ownership and progress preserve contributor trust without weakening safety. Expected metric: fewer false continuation/landing waits in the named regression fixtures. No production metric improvement is claimed. Cost: no paid tools or provider calls. Risk: false completion or concurrent landings, controlled by fail-closed negative fixtures.

## Status

Proposed registration only. No implementation, review verdict, completion or live acceptance is asserted.
