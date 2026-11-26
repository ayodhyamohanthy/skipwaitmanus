# AGENT-LOOP-supervisor: turn-capped agents restart themselves, with nobody typing /new (D-402)

Tier 2 · lane `agent-loop` · branch `agent/queue/agent-loop-supervisor` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026 (D-402): agents use the Xingchi relay's free gpt-6.1-sol credits, and Xingchi ends each conversation
at 20 turns. D-401 and `PICKER-short-session` make the next conversation continue the same task. This row starts that
next conversation automatically.

## The build: `scripts/agent-loop.mjs` (Node, no dependency, works on macOS, Linux and Windows)

Usage: `node scripts/agent-loop.mjs [--prompt "build"] [--max-runs N] -- <agent command and args>`. The prompt is
appended as the last argument unless a `{prompt}` placeholder appears in the command. Examples printed by `--help`:
`node scripts/agent-loop.mjs -- opencode run` and `node scripts/agent-loop.mjs -- codex exec`.

1. Run the command with inherited stdio, so the person sees it working. When it exits, for any reason (the 20-turn cap,
   a finished task, a crash), log the exit code and duration and start the next run.
2. **Stop** on Ctrl+C (forwarded to the child, then exit), when `<git dir>/skipwait-agent-loop.stop` exists (checked
   before each run; `--stop` creates it), or after `--max-runs`.
3. **Backoff.** A run shorter than 60 s counts as fast. After 3 fast runs in a row, wait 5 minutes before the next
   run. After 10 in a row, stop and log why. A run of 60 s or more resets the count.
4. **Log** one line per run to `<git dir>/skipwait-agent-loop.log`: time, run number, exit code, seconds. Nothing goes
   to the working tree.
5. Docs: a short "Automatic restarts" paragraph in `docs/BUILD_CONTINUITY.md` "Short sessions", with one example per
   headless client, and a note that clients without a headless mode need their own new-chat action.

Keep the loop logic in pure, exported functions (next action from the run history and the stop state) so it can be
tested without spawning a real agent. The CLI wrapper does only I/O.

## Tests (red first, `scripts/agentLoop.test.ts`)

- Pure: a normal exit runs again; 3 fast exits wait 5 minutes; 10 fast exits stop; a long run resets the count; the
  stop file stops; `--max-runs` stops.
- CLI: with a fake agent command (`node -e` printing and exiting), two runs happen, both are logged under the git dir,
  and the working tree stays clean.
- The prompt goes in as an argument and through the `{prompt}` placeholder.

## Status

- AGENT-LOOP-supervisor: done — Claude Code · 43c8 — 2026-11-25 — 4868df59e
