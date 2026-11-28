# PICKER-short-session: a session a client forced to end is continued under the same name, not orphaned for 2 hours (D-401)

Tier 2 · lane `picker-short-session` · branch `agent/queue/picker-short-session` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026 (D-401): agents in Z Code, OpenCode and Cline hit "This conversation has reached 20 turns. Please
start a new session to continue." The provider or relay sends it; nothing in the repository can lift the cap. But
`scripts/next-task.mjs` gives a bare `--claim "<model>"` a new random tag on every run, so the new conversation cannot
continue its predecessor's claim. That claim then waits 2 hours (`IDLE_MS`) for a takeover.

## The build

1. **Record.** On every successful `--claim`, write `{ model, name, at }` to `<git common dir>/skipwait-sessions.json`,
   one entry per model, keeping the newest. Never write it inside the working tree.
2. **Reuse.** For a bare `--claim "<model>"` (no ` · tag`), reuse the recorded name only when all of these hold:
   - the clone has a recorded session for that model;
   - that session holds an unfinished claim on origin: a task branch, an architect, review or unblock lock, or a
     heartbeat whose last marker is its name;
   - that claim has been quiet for at least 20 minutes (no push to its branch or lock and no heartbeat).

   Print `Resuming as "<name>": <task> was quiet for <n> min (your client likely ended the conversation). Pass
   --new-session to start a separate session instead.` Otherwise mint a new tag as today.
3. **`--new-session`** forces a new tag.
4. **Resume line.** Every claim also prints `If your client ends this conversation, start the next one with: node
   scripts/next-task.mjs --claim "<name>"`.
5. **Docs.** `docs/BUILD_CONTINUITY.md` "Short sessions" (landed with D-401) changes "will make step 3 automatic" to
   describe the shipped behaviour.

## Hard limits

Never reuse a name whose claim moved within 20 minutes, because two live sessions would then share a name. Never change
the 2-hour takeover rule for other sessions. Never read or write anything outside the clone's git directory.

## Tests (red first, `scripts/nextTaskShortSession.test.ts`, local Git origins as in `scripts/nextTaskClaimTaskCli.test.ts`)

- A bare claim after a recorded session whose claim was quiet 25 minutes resumes under that name and is handed its own
  work.
- The same claim quiet 5 minutes mints a new tag.
- A recorded session with no unfinished claim mints a new tag.
- `--new-session` always mints.
- A tagged claim ignores the record.
- The record file sits under the git common dir, and the working tree stays clean.

## Agent loops: one name per loop (PICKER-durable-session, D-415 (4)(a))

The one record per model per clone above cannot serve many loops of one model on one clone: they share the slot, so a
fresh conversation found another live loop's name (refused by the 20-minute rule) or minted a new tag, and the old
claim waited out the 2-hour lease. Now `node scripts/agent-loop.mjs --session "<model>" -- <agent command>` picks one
name, `<model> · <tag>`, for the loop's whole life, saves it in `<git common dir>/skipwait-agent-loop-sessions.json`
(per working directory and command, so a restarted loop keeps it; a name another running loop holds is never reused)
and passes it to every run in `SKIPWAIT_SESSION_NAME`. A bare `--claim "<model>"` with that variable takes the name
when its model part is the claimed model, continues that name's own claims at once and records it as above. A name for
another model, a malformed one or `--new-session` is ignored with one line, and the rules above apply unchanged;
without the variable (manual, Claude and cloud sessions) nothing changes. Tests: `scripts/agentLoop.test.ts` and
`scripts/nextTaskShortSession.test.ts`.

## Status

- PICKER-short-session: done — Claude Code · 43c8 — 2026-11-25 — 8e626a975
