# PICKER-packet-findings-exit (D-334)

A packet with review findings can leave the `needs-fix` state without another writer takeover. D-334 supplies the missing `--fixed` path; D-344 and D-352 govern what follows. If the current review gate accepts the bound fix, wait for required CI on that head without requesting another review.

## Evidence and scope

Measured on main `80aeba16`, Nov 14 2026.

1. **What a packet's review state can be.** `reviewStateOf` (`scripts/nextTaskCore.mjs:587`) reads the last stage marker on the review lock. A `Verdict ... findings` gives `needs-fix`. Only a later `Fixed`, `Review claim`, `Fix claim` or `Land claim` moves it on.
2. **REVIEW is never handed at `needs-fix`.** The packet branch of `actionFor` (`scripts/nextTaskCore.mjs:922-939`) hands REVIEW only for `passed` (quiet), `in-review` (quiet) or `needs-review`. At `needs-fix` it falls through to `if (v.task.status === "architect")` (`:941`), which hands **WRITE THE PACKET**, which is a takeover of the architect lock.
3. **No FIX stage exists for packets.** D-299 R7 (`scripts/nextTaskCore.mjs:1079`): "packet reviewers use the existing lock lifecycle, never packet fix/land stages". So no session is ever handed a `Fix claim` on a packet's review lock.
4. **`--fixed` needs that missing Fix claim.** `scripts/next-task.mjs:418` refuses unless the stage is `fixing` and the caller holds it. Reproduced on Nov 14 by the current architect holder of `D-089-request-inbox`: `node scripts/next-task.mjs --fixed --task D-089-request-inbox --as "Claude Code · 0cb9"` printed `only the agent holding the fix claim on agent/review/d089-request-inbox marks it fixed (it is needs-fix, held by Inkling 2 Small Free · 6717)`.
5. **The cost, measured.** PR #878's findings verdict `5d95144b` (Nov 11) named one docs finding. It was cured by `30c92057` (Nov 12) and re-verified three times. Since the verdict, the architect lock took four takeovers (`13b5b5ef` Qoder · 9c29, `9076d461` Qoder · 471a, `10058969` Qoder · cd15, `9cc66371` Claude Code · 0cb9). Each one re-synced and stopped at the same wall. CI on each head was red only at the review-gate step (run `43342060813`: "the newest verdict on D-089-request-inbox is findings, not a pass"). The D-089 build rows `D-089.server` and `D-089.ui` cannot start until the packet lands.

**Scope.** Only `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs` and a new `scripts/nextTaskPacketFindingsExit.test.ts`.

## The change (decided under D-200; changeable)

1. `--fixed` accepts the current architect-lock writer of an open packet at `needs-fix`, not the reviewer who filed its findings. The branch must hold actual packet work. The existing local sync check and the D-202 decision freshness check run before publishing an ordinary `Fixed` marker bound to the observed packet head.
2. Keep the gate's current acceptance rules. A gate-accepted fix waits for exact-head CI rather than replacing its marker with another review claim. If independent review is still owed, preserve the existing writer/fixer session exclusions (D-344 (1), D-352/D-353), and keep external provenance separate and unchanged.
3. Both new and continuing WRITE THE PACKET hand-outs show the findings verdict's commit, tell the writer to fix the findings on the existing architect branch and push, and give the normal `--fixed` command with the exact session identity.

## Acceptance (red first)

The new test file builds its state the way `scripts/nextTask.test.ts` does (marker branches as data, no network). It must fail on main `80aeba16` for the reasons above, then pass:

- A1. Packet PR, gate-only red, review lock ends in `Verdict findings`, architect lock held by S. The `--fixed` authorization helper accepts S and refuses any other session, including the reviewer and a session with no architect claim.
- A2. After a `Fixed` marker by S, `reviewStateOf` is `needs-review`. If the current gate accepts it, gate-only red CI waits for re-evaluation, not another REVIEW or a writing takeover; green CI retains the existing landing route. When independent review is still owed, the existing route applies and excludes all writer/fixer sessions, not unrelated sessions of their model.
- A3. Same state with no `Fixed` marker: the architect hand-out's text includes the findings commit and the `--fixed` command.
- A4. Regression guards: an ordinary (non-architect) Tier 1 task at `needs-fix` still needs a `Fix claim` before `--fixed`. A packet at `in-review`, `passed` or `landing` refuses `--fixed`. `--fixed` with an out-of-sync task is still refused by `requireSynced`.
- A5. `scripts/nextTask.test.ts` passes unchanged: no deleted or loosened assertion (GATE-test-integrity).

## Guardrails and handover

- Tier 2, picker scripts only. It lands on green required CI with no separate review (D-200 (4)).
- No change to `scripts/review-gate.mjs`, CI workflows, verdict rules, review exclusions, dependencies, or other stages' authorization. No live marker is written to demonstrate the repair.
- Historical #878 has since merged at `8ca3b6a0`. Use an isolated packet fixture for verification. Do not re-open or re-mark #878.

## User and product effect

None directly: this changes how agents route work. Indirectly, the employee request-inbox link (D-089 (3), loop L4) can leave its packet stage. That link lets a verified employee share one personal link that routes requests to them, which gets seekers referred faster.

## Status

- Nov 14 2026, registered by Claude Code · 0cb9 (D-334). Not started.
- PICKER-packet-findings-exit: in progress — GPT-6.1 Sol · f734 — branch `agent/queue/picker-packet-findings-exit`, claim `4ece1155`, current-main integration `538e8f7a` (`053e8a72`). Prior registration #1192 is merged; no implementation PR was found. The historical packet #878 is already merged (`8ca3b6a0`), so verify the reusable state transition with isolated fixtures; never write a marker for #878.
