# Packet PICKER-durable-session: a restarted agent keeps its own session name

Row `PICKER-durable-session` (Tier 2, picker and agent loop only). Ruling: D-415 (4)(a). Builds on D-401 (`PICKER-short-session`) and D-402 (`AGENT-LOOP-supervisor`).

## Problem
D-401 keeps one resume slot per model per clone (`<git common dir>/skipwait-sessions.json`, `parseSessionRecords` / `recordSession` in `scripts/nextTaskCore.mjs`). On the owner's Mac many `GPT-6.1 Sol` loops run in one clone at once, so they share that one slot. When `scripts/agent-loop.mjs` starts a fresh conversation, the bare `--claim "GPT-6.1 Sol"` either finds another live loop's name (refused by `RESUME_QUIET_MS`) or mints a new tag. The old name's claim then goes quiet and, after the 2-hour lease, another session takes it over.

Evidence (D-415 (4)): since Nov 26, 176 claim/takeover markers under 149 session names against 48 merges. PICKER-bug-issues (14 markers) and PRIVACY-own-employer-guard (5 sessions) never got code onto origin.

## Change
1. `scripts/agent-loop.mjs` gives each loop one session name for its whole life. It picks the name once when the loop starts, or reuses the one saved for the same working directory and command, kept in the clone's git directory beside the loop log. It passes the name to every run it starts through the environment variable `SKIPWAIT_SESSION_NAME`. The loop still never edits the working tree.
2. `scripts/next-task.mjs`: a bare `--claim "<model>"` (no ` · <tag>`) with `SKIPWAIT_SESSION_NAME` set uses that name when its model part is the claimed model. It resumes that name's own claim exactly as D-401 resumes a recorded name, and records it. A name for another model, or a malformed one, is ignored with one printed line, and D-401 applies unchanged.
3. Without the variable, D-401 behaviour is unchanged: manual sessions, Claude sessions and cloud sessions.

## Never
No change to claim eligibility, the 2-hour lease, takeover order, holds, reviews, landing, or what `--status` prints for other sessions. Two live sessions never share a name: the loop's name is unique per loop, and the D-401 quiet check still guards a name that moved recently.

## Tests first
In `scripts/agentLoop.test.ts` and `scripts/nextTaskShortSession.test.ts`:
- Two loops on one clone get different names.
- Each loop keeps its own name across three restarts, and its claim is resumed, not taken over.
- An env name for another model is ignored, and D-401 applies.
- A manual claim without the variable behaves exactly as today.
- A malformed saved name file gives a fresh name, never a wrong one.

## Owns
`scripts/agent-loop.mjs`, `scripts/agentLoop.test.ts`, `scripts/next-task.mjs`, `scripts/nextTaskCore.mjs`, `scripts/nextTaskShortSession.test.ts`, this packet, `docs/plans/PICKER-short-session.md`.

## Done
Green required CI, the focused tests above, and the row set to `done`. After landing, the owner's Mac loops pick it up on their next `git pull`; nothing needs restarting by hand.

## Status
- PICKER-durable-session: registered by Claude Code · 77ec, 2026-11-28 (D-415); nothing built.
