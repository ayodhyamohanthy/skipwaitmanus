# PICKER-branch-scan-batch: one bounded read instead of four git calls per branch

Read `docs/BRIEF.md`, `AGENTS.md` and current decisions first.

## Why (measured, 2026-11-24/25)

The picker is the delivery mechanism for every session, and its per-run cost now throttles the
whole team:

- `loadBranches` (`scripts/next-task.mjs`) walks every `refs/remotes/origin/agent/*` ref (527 on
  origin on Nov 25) and runs **three git processes per ref**: `merge-base --is-ancestor`,
  `git log --reverse --no-merges --name-only origin/main..<ref>` and
  `git rev-list --merges --count`. Measured on this host: 20 refs took 3.9 s, so ~500 refs cost
  **~97 s of branch scanning per run**, before the ~140 GitHub reads and the worktree cleanup.
- Every picker run on a clone serializes behind `.git/next-task-run.lock`. With 84
  `next-task.mjs` processes and 417 worktrees sharing one `.git`, sessions queue for 30-45
  minutes per claim; two of this session's claims ran 45 and 36 minutes and ended in
  `STOP: authoritative refs kept changing`, and later runs failed closed on GitHub reads.
- Host load average reached **974** (57 picker processes) and 740 (84 processes) during the day.

The owner's direction is many agents working in parallel ("as many agents work parallely",
D-309/D-314). The queue cannot deliver that while one run costs minutes of serialized git work.

## Change

`scripts/next-task.mjs` only:

1. **One batched history read.** Replace the per-ref `git log` with a single
   `git log --format=<marker format> --name-only origin/main..<all wanted refs>` (or
   `git rev-list --stdin` for the counts), grouped by ref, so the marker and file data the picker
   already parses comes from one process instead of ~500.
2. **One batched ancestry read.** Replace the per-ref `merge-base --is-ancestor` with one
   `git rev-list --stdin --not origin/main` pass over the same refs, or a single
   `git for-each-ref --merged=origin/main` where it answers the same question.
3. **Keep the output bounded.** The existing bounded reader (PROCESS-provenance-loader-bounds)
   already caps output; the batched call must stay inside it or stream in named chunks.
4. **No behaviour change.** The same `branches` map (tip, merged, work, markerOnly, markers) and
   the same decisions. No eligibility, FIFO, lease, ownership, review or CI rule changes.

## Tests

- Every existing picker, authoritative-refs, queue-gate and auto-land test must pass unchanged.
- New: a fixture with N branches asserts the scan spawns a bounded number of git processes
  (counted through the existing `spawnSync`/`execFileSync` mock) rather than one per ref, and that
  the resulting `branches` map equals the per-ref result for the same fixture.
- A timing guard is not a test; the process-count assertion is the contract.

## Rating and counter-argument (D-023)

**8/10.** It removes the measured serialized cost that makes every session wait, and it is
behaviour-preserving with an exact-equality test.

Strongest counter-argument: batching git output is easy to get subtly wrong (rename detection,
merge commits, ref ordering), and a wrong `branches` map would mis-handle claims for every
session at once. Mitigation: the equality test against the current per-ref result on a fixture
that includes merge commits, marker-only commits, file-changing commits and deleted refs; land
behind the existing tests, not a rewrite.

## Status

- PICKER-branch-scan-batch: in progress — DeepSeek V4.1 Flash · c45d — 2026-11-25 — branch
  `agent/queue/picker-branch-scan-batch`. Registered by the CEO review of
  `DeepSeek v4.1 Flash · ce4b`, 2026-11-25. No product, money, flag, workflow, settings or
  spending change.
