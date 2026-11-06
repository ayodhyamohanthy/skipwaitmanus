# Packet PICKER-heartbeat-land-claim: `--heartbeat` must not acquire the landing slot

> A heartbeat keeps alive what a session already holds. Today, for a held LAND pick, it also takes the landing slot whenever the slot is free or quiet. It does this without a fresh picker hand-out and without re-checking the row's review, CI or FIFO turn. A release written by hand cannot free the slot either, because the only verb that frees it is `Landed`. This row repairs both. It changes no gate, no required check, no FIFO rule and no product behaviour.

| Field | Value |
|---|---|
| Row | `PICKER-heartbeat-land-claim` (Tier 2, lane `picker`) |
| Branch | `agent/queue/picker-heartbeat-land-claim` |
| Registered by | docs-only registration under D-200; `syncedTo` D-285 |
| Depends on | `PICKER-landing-wait-fallthrough` (and through it `PICKER-landed-marker-continuity`): all three edit the picker core |
| Waited on by | `PICKER-fullstack-lights` (edge added by this registration) |

## Cause (measured on `main` `34e93fff`, 2026-11-06)

- `scripts/next-task.mjs:183-193` `keepClaim`: for `pick.of === "land"`, when no other holder's slot is fresh and `slot.holder !== who || slot.quiet`, it pushes `markerSubject("Land claim", pick.task.id, who)` onto `agent/queue/landing`. `--heartbeat` (`:380-388`) calls `keepClaim` for every held pick, so a heartbeat on a free or quiet slot creates a new land claim. It never calls `pickNextTask`, so no FIFO, review, CI or coordination check runs first.
- `scripts/nextTaskCore.mjs:98` `LAND_IDLE_MS` = 30 minutes. A slot whose last marker is older than that counts as quiet, including a slot whose last lander merged and never wrote `Landed`.
- `scripts/nextTaskCore.mjs:91` `MARKER` and `:153` `landingSlot`: only `Landed` frees the slot. Any other subject either fails to parse or parses as a claim. `Land claim released: D-048-p3-admin-approvals (4d5d7635)` parses as `{ verb: "Land claim", id: "released", who: "D-048-p3-admin-approvals (4d5d7635)" }`. The release itself therefore holds the slot under a garbage holder until the 30-minute lapse.

Live instance:
- 2026-11-06 07:20 IST: `node scripts/next-task.mjs --heartbeat --as "Hark · 5de4"` printed two `Heartbeat recorded` lines. It also pushed `4d5d7635` "Land claim D-048-p3-admin-approvals: Hark · 5de4" and `1dbe39c4` "Land claim PICKER-landed-marker-continuity: Hark · 5de4" onto `agent/queue/landing` (parent `3edacad5`, a 06:19 claim whose PR #989 had merged with no `Landed` marker, so the slot was quiet). It also pushed `36ff22c3` "Claim D-048-p3-admin-approvals: Hark · 5de4" onto that row's work branch.
- Neither row was landable: #994 had no Tier 1 review and was under a coordination hold, and Hark built both rows (D-151).
- The release was appended as `72f7dd13`, with reports `f667abf3` and `1c803158` on `agent/reports/log`. Nothing was rewritten.

## Change

1. **A heartbeat renews and never acquires.** For a LAND pick, `--heartbeat` writes to `agent/queue/landing` only when this session is already the slot's holder for this task and that claim is fresh. It then renews the lease (a `Heartbeat` marker, as `leaseFor` already does for `landing-slot`). On a free or quiet slot, or one held for another task, the heartbeat writes nothing to the slot and says so: "your land pick for <id> no longer holds the slot; run --claim to be handed it again". Acquiring the slot stays with `--claim`, after `pickNextTask` has run.
2. **A real release verb.** Add `Released` to `MARKER`, written by a new `--release --task <id> --as "<session>"` flag. Only the current slot holder may release, through the existing `releaseLandingSlotError`. `landingSlot` treats a last marker of `Released` like `Landed`: the slot is free, and the release proves nothing landed. The release is append-only, and any subject that does not parse leaves the slot as it was.

Hard constraints:
- No change to `--claim`'s LAND hand-out, `PICKER-heartbeat-slot-safety`'s guard on another holder's fresh slot, `LAND_IDLE_MS`, or the `Landed` path.
- No history rewrite, no branch deletion, no forced release of another session's slot, and no automatic holder transfer.
- No change to `review-gate.mjs`, `scope-check.mjs`, `ci.yml`, `docs/plans/assignments.json` (beyond this registration), or any `server/`, `client/` or `shared/` file.

## Files it changes

`scripts/next-task.mjs`, `scripts/nextTaskCore.mjs` and the new `scripts/nextTaskHeartbeatLandClaim.test.ts`. The pin goes in its own file rather than `scripts/nextTask.test.ts`, because that file is owned by `FIX-device-signin` (todo, PR #952). An edge between the two rows would park one behind the other.

## Accept

- **Red-first.** In `scripts/nextTaskHeartbeatLandClaim.test.ts`, with fixtures built from disposable local repositories or injected branch data, never real remote writes, each case fails on today's code:
  - (a) A session holds a LAND pick and the slot is quiet, last marker older than 30 minutes and by another holder. `--heartbeat` writes no `Land claim` and leaves the slot ref unchanged.
  - (b) The same pick with the slot free (no branch, or last marker `Landed`). No slot write.
  - (c) `Released <id>: <who>` parses as verb `Released`, and `landingSlot` returns `holder: null`.
  - (d) `--release` by a session that does not hold the slot fails closed and writes nothing.
- **Controls stay green:**
  - the holder's own fresh claim is renewed
  - another holder's fresh slot is untouched (the `PICKER-heartbeat-slot-safety` cases)
  - `--claim` on a free slot still takes it
  - `Landed` still frees it
- `scripts/nextTask.test.ts` and `scripts/nextTaskHeartbeatSlot.test.ts` stay green as written. `validateAssignments` returns `[]`. `pnpm check` passes, and so does `LANG=en_US.UTF-8 pnpm vitest run scripts/`.
- **Live proof on the PR:** the printed output of a heartbeat on a quiet slot, showing no slot write, and the exact refs read before and after.

## Interim rule (until this lands)

Never run `--heartbeat` while holding a LAND pick on a row under a coordination hold. Release a mistaken claim by appending a marker and reporting it, and expect the slot to free only after the 30-minute lapse.

## Status

- `PICKER-heartbeat-land-claim`: registered (docs-only) as a `todo` row appended last. No branch, no build and no PR for the implementation yet.
