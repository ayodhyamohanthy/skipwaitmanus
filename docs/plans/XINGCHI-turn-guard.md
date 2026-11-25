# XINGCHI-turn-guard: a local proxy compacts conversations before Xingchi's turn limits, so no client stops on them (D-403)

Tier 2 · lane `xingchi-guard` · branch `agent/queue/xingchi-turn-guard` · epic D-212 · no dependencies

## Why

Xingchi (the relay for the owner's free gpt-6.1-sol credits) rejects a request once its message history holds 20 user
turns or 100 model replies (`400 ... param=session_turn_limit_exceeded`) and tells clients to `/compact`. Client
auto-compaction is token-based, so it does not fire in time. A guard in front of Xingchi fixes this for every client
(omp, OpenCode, Codex, Cline, Z Code) with one base-URL change.

## The build: `scripts/xingchi-guard.mjs` (Node built-ins only, no new dependency)

1. `node scripts/xingchi-guard.mjs [--port 8787] [--upstream <Xingchi base URL>] [--max-user 18] [--max-model 95]`.
   The upstream also comes from `XINGCHI_BASE_URL`. Bind 127.0.0.1 only.
2. Forward every request to `upstream + path` with method, headers (Authorization untouched) and body. Stream the
   response back unchanged, including SSE. Never log or store the Authorization header, request bodies or responses.
   Log one line per request: time, path, status, turns before and after, and whether it compacted.
3. For `POST .../chat/completions` (a `messages` array) and `POST .../responses` (an `input` array of message and
   function-call items), count user turns and model replies the way Xingchi's error text describes.
4. **Compact** when either count reaches its limit:
   - keep every system/developer message, the first user message, and the most recent exchanges, so the counts land well
     under the limits (target about half);
   - drop the middle only at boundaries that keep each assistant tool call with its tool result (chat `tool_calls` and
     `role: tool`; responses `function_call` and `function_call_output`);
   - insert one user message in place of the dropped part: `[Earlier conversation compacted by xingchi-guard: <n>
     turns removed to stay under the provider's turn limit. Re-read your task packet, the picker output and git log
     for anything you need.]`.
5. **Retry.** If the upstream answers 400 with `session_turn_limit_exceeded`, compact to a quarter of the limits and
   retry once. If that also fails, pass the error through.
6. Unparseable or other bodies pass through unchanged.
7. Docs: a "Turn guard" paragraph in `docs/BUILD_CONTINUITY.md` "Short sessions", saying how to start it and how to
   point a client's base URL at `http://127.0.0.1:8787/v1`. No client config in the repository changes.

## Tests (red first, `scripts/xingchiGuard.test.ts`)

- Pure functions, with no network:
  - counting in both formats;
  - no compaction under the limits;
  - compaction under the targets, keeping system messages, the first user message and the latest turns;
  - tool-call/result pairs never split, in either format;
  - the note is inserted;
  - an unknown body passes through.
- With a fake upstream on 127.0.0.1:
  - forwarding keeps the Authorization header and the guard writes it nowhere;
  - an SSE stream passes through byte for byte;
  - a 400 `session_turn_limit_exceeded` produces exactly one compacted retry;
  - a second 400 passes through.

## Status

- XINGCHI-turn-guard: todo — registered Nov 25 2026 by Claude Code · 43c8 (D-403).
