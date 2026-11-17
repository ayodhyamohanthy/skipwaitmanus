# PICKER-packet-findings-exit (D-334)

A Tier 1 packet that got a findings verdict can leave that stage again. Today it cannot: the picker sends every session back to write the packet, forever.

## Evidence and scope

Measured on main `80aeba16`, Nov 14 2026.

1. **What a packet's review state can be.** `reviewStateOf` (`scripts/nextTaskCore.mjs:587`) reads the last stage marker on the review lock. A `Verdict ... findings` gives `needs-fix`. Only a later `Fixed`, `Review claim`, `Fix claim` or `Land claim` moves it on.
2. **REVIEW is never handed at `needs-fix`.** The packet branch of `actionFor` (`scripts/nextTaskCore.mjs:922-939`) hands REVIEW only for `passed` (quiet), `in-review` (quiet) or `needs-review`. At `needs-fix` it falls through to `if (v.task.status === "architect")` (`:941`), which hands **WRITE THE PACKET**, which is a takeover of the architect lock.
3. **No FIX stage exists for packets.** D-299 R7 (`scripts/nextTaskCore.mjs:1079`): "packet reviewers use the existing lock lifecycle, never packet fix/land stages". So no session is ever handed a `Fix claim` on a packet's review lock.
4. **`--fixed` needs that missing Fix claim.** `scripts/next-task.mjs:418` refuses unless the stage is `fixing` and the caller holds it. Reproduced on Nov 14 by the current architect holder of `D-089-request-inbox`: `node scripts/next-task.mjs --fixed --task D-089-request-inbox --as "Claude Code · 0cb9"` printed `only the agent holding the fix claim on agent/review/d089-request-inbox marks it fixed (it is needs-fix, held by Inkling 2 Small Free · 6717)`.
5. **The cost, measured.** PR #878's findings verdict `5d95144b` (Nov 11) named one docs finding. It was cured by `30c92057` (Nov 12) and re-verified three times. Since the verdict, the architect lock took four takeovers (`13b5b5ef` Qoder · 9c29, `9076d461` Qoder · 471a, `10058969` Qoder · cd15, `9cc66371` Claude Code · 0cb9). Each one re-synced and stopped at the same wall. CI on each head was red only at the review-gate step (run `43342060813`: "the newest verdict on D-089-request-inbox is findings, not a pass"). The D-089 build rows `D-089.server` and `D-089.ui` cannot start until the packet lands.

**Scope.** Only `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs` and a new `scripts/nextTaskPacketFindingsExit.test.ts`.

## The change (decided under D-200; changeable)

1. `--fixed` on an `architect`-status task whose review lock is at `needs-fix` is accepted from the **current holder of the architect lock**: the latest `Claim` or `Takeover` on `agent/architect/<slug>` for that task (`holderOf`). It pushes the ordinary `Fixed` marker on the review lock, so `reviewStateOf` returns `needs-review`. The existing `requireSynced` check runs first, exactly as for any `--fixed`.
2. The `Fixed` marker puts that session in `fixers` (`scripts/nextTaskCore.mjs:675`), so `did(v, ["builders", "fixers"])` keeps it, and its model, out of the re-review (D-151). The reviewer who wrote the findings may re-review (DELEGATION §6).
   For a packet the work branch is the architect lock (`scripts/nextTaskCore.mjs:653`), so `builders` already holds every writer and their models stay out of the review too (D-151, D-190). No exclusion changes.
3. When the WRITE THE PACKET hand-out (`kind: "architect"`) goes to a task whose review lock is at `needs-fix`, the printed steps (`scripts/nextTaskText.mjs`) say so. They name the findings verdict's commit and tell the writer to address it on the architect lock, push, then run `node scripts/next-task.mjs --fixed --task <id> --as "<name>"`.

## Acceptance (red first)

The new test file builds its state the way `scripts/nextTask.test.ts` does (marker branches as data, no network). It must fail on main `80aeba16` for the reasons above, then pass:

- A1. Packet PR, gate-only red, review lock ends in `Verdict findings`, architect lock held by S. The `--fixed` authorization helper accepts S and refuses any other session, including the reviewer and a session with no architect claim.
- A2. After a `Fixed` marker by S, `reviewStateOf` is `needs-review`. `pickNextTask` hands kind `review` with `packet: true` to an unrelated model, and skips S's model and every writer's model (the writer skip already holds today and must keep holding).
- A3. Same state with no `Fixed` marker: the architect hand-out's text includes the findings commit and the `--fixed` command.
- A4. Regression guards: an ordinary (non-architect) Tier 1 task at `needs-fix` still needs a `Fix claim` before `--fixed`. A packet at `in-review`, `passed` or `landing` refuses `--fixed`. `--fixed` with an out-of-sync task is still refused by `requireSynced`.
- A5. `scripts/nextTask.test.ts` passes unchanged: no deleted or loosened assertion (GATE-test-integrity).

## Guardrails and handover

- Tier 2, picker scripts only. It lands on green required CI with no separate review (D-200 (4)).
- No change to `scripts/review-gate.mjs`, to CI workflows, to the verdict rules, to D-151/D-190 exclusions, to dependencies, or to any other stage's authorization. No marker is written by hand for #878 or any other task: the cure is this code, then the ordinary `--fixed`.
- After it lands: whoever then holds `agent/architect/d089-request-inbox` (or the next session handed WRITE THE PACKET for it) runs `--fixed` on the current head. Then `D-089-request-inbox` goes to REVIEW by a model that neither wrote nor fixed the packet. Claude is excluded (Claude Code · 0cb9 fixed it). Record the actual hand-out in this packet's Status as read-only proof (`node scripts/next-task.mjs --as "<unrelated model>"`).

## User and product effect

None directly: this changes how agents route work. Indirectly, the employee request-inbox link (D-089 (3), loop L4) can leave its packet stage. That link lets a verified employee share one personal link that routes requests to them, which gets seekers referred faster.

## Status

- Nov 14 2026, registered by Claude Code · 0cb9 (D-334). Not started.
