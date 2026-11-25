# PICKER-never-wait: no session is told to wait while a row has work (D-399)

Tier 2 · lane `picker-never-wait` · branch `agent/queue/picker-never-wait` · epic D-212

## Why

Owner, Nov 25 (D-399): "agents are not getting work", "dont stop agents ... let agents build anytime the tasks",
"any number of parallel agents can build dont keep any restrictions", "i may start n number of agents and all should
get work no wait no holds". A fresh session on main `276f0aed1` got `NEXT: WAIT` while 19 rows sat parked at `owner`.

## The build (`scripts/nextTaskCore.mjs`, `scripts/nextTaskText.mjs`, picker tests)

1. **Parked and blocked rows are built ahead.** After D-315's pass finds nothing, `aheadPick` hands out a BUILD, or a
   TAKEOVER of a branch quiet for 2 hours, on an in-sync row parked at `owner` that has a packet, then on a row whose
   block waits for evidence. Its holder resumes it. A row with a pull request is passed over. An `owner` row is never
   `open`, so it gets no review, fix or landing. A stale row stays with the owner (D-202).
2. **Hand-out text "BUILD AHEAD OF A HOLD (D-399)".** Build only what the packet decides, open a draft PR, never land it.
   Leave every owner call as a written question in the row's Status line.
3. **A busy lane no longer holds a build.** Lanes are labels: like shared files (D-309, D-314), the build names the open
   tasks whose files overlap and the second lander merges main. A red or blocked task still holds its own lane (D-109).
   That hold costs nothing on the current board, and 22 tests pin it as a safety rule, so it stays until a measured
   case needs it.

## Tests

The property oracle restates rule 1, and two new boards pin it (16 boards in all). Fixtures that used an owner row to
mean "nothing eligible" now use a packet-less owner row. A CLI case claims a parked row with the D-399 text. The
PICKER-lane-busy cases now assert the build and the named overlap.

## Status

- PICKER-never-wait: in progress — Claude Code · 43c8 — 2026-11-25 — code ready, lands from `agent/queue/picker-never-wait` once this row is on main.
