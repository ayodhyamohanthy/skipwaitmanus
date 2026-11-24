# PICKER-cli-output-drain

Read current BRIEF, instructions and decisions. This is separate from
allocation correctness and starts after PICKER-authoritative-ref-refresh
lands, because both edit scripts/next-task.mjs.

## Measured defect and scope

A real coordinator read-only CLI run through a stdout pipe returned exit0
and exactly65536bytes with no NEXT; a regular-file run returned72633bytes
with the final offer. Different origin snapshots were used, so equal
content across those two live runs is NOT asserted. External Claude's
standalone72000-byte Node fixture reproduced pipe truncation with
process.exit and full drain with exitCode, but that is not an actual CLI
regression test. Write one before production edits. No unbound diagnostic
implementation draft is adopted.

Exact manual scope: scripts/next-task.mjs exit/termination/flush handling
ONLY; NEW scripts/nextTaskCliOutputDrain.test.ts; this packet Status.
No owns because existing rows retain shared-script ownership. Manual exact
hunk qualification mandatory; automated scope omission is not PASS.
No eligibility, refs, provenance, claim, exit-code meanings, timeout,
workflow, source output text or other behavior change. No source claim or
binding exception inherited from the loader repair.

## Acceptance

- Actual CLI with mocked local origin/GitHub produces >64KiB output.
- Pipe and regular-file captures both contain the final NEXT and match the
  complete expected fixture bytes, not just a length or exit status.
- Retain exit0, WAIT4, SYNC3 and error/STOP paths and actual stderr. Test a
  late error after a large board, not only standalone console.log.
- A rejecting/broken output sink fails truthfully; do not swallow errors.
- No remote write in read-only mode. Existing CLI tests unchanged.
- Bound natural-exit/connection cleanup so output drains without indefinite
  hangs; use measured fixture evidence, not a new arbitrary process timer.
- Red first/current-main/full applicable checks, actual task-bound free
  source model, separate qualified review and exact-head CI/protected merge.

## Authority and status

Existing direct owner instructions fix the picker/expose eligible work
(phonemsg-01M73FHPNVWN7DC66AQG08X2XX,
phonemsg-01M73FJZK5STP5W2BG9J9XG75V), personally inspected. This file
records, not authenticates, that authority; no safety gate waived.

PICKER-cli-output-drain: in progress — DeepSeek V4.1 Flash · 5a21 — 2026-11-24 — branch agent/queue/picker-cli-output-drain. Takeover of a half-built branch (last push 2026-11-23T23:52:37Z by Gemini 3.8 Flash · f3e2): the drain fix and the regression test were committed, but the suite failed 6/7 on the branch head because the fixture's 15s/30s bounds were tighter than a healthy run on a loaded machine. This session changed only the test's bounds to measured values (60s per child, 180s per test; measured: bare `node -e ""` 1.9s, importing the picker modules 3.2s, slowest healthy single run 20s, slowest whole test 65.6s) and recorded the measurement beside the constants. Red first on current main's `scripts/next-task.mjs`: 5 of 7 fail for the packet's reason, including `expected 65536 to be greater than 65536` (the pipe-buffer truncation) and `delayed-pipe bytes differ`; the two that pass are the behaviour-preservation cases. Green with the branch's fix: 7/7, every case asserting exact bytes, the real stderr, exit 0/2/3/4/5/6, no remote write in read-only mode, and a truthful failure on a closed stdout pipe. Scope: `scripts/next-task.mjs` exit/termination/flush handling only, the new `scripts/nextTaskCliOutputDrain.test.ts`, and this Status line.
