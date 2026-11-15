# PICKER-ceo-any-model: no picker stage waits on a Claude session (D-338)

Tier 2 · lane `picker` · branch `agent/queue/picker-ceo-any-model` · decision D-338 (7).

## Why

Owner, November 16 (IST), in session: "claude session timeouts are impacting decisions which are claude dependent so unblock dependense on you. let powerful models like gpt 6.1 sol also unblock if any blockers are there be it in opencode or cline."

The picker has exactly two Claude-only gates, both behind `isArchitect` in `scripts/nextTaskCore.mjs:123` (`/^claude/i` on the session name):

1. `scripts/nextTaskCore.mjs:777` and `:1063`: only a session whose name starts with "Claude" is handed the CEO review (`kind: "ceo"`) when nothing else is eligible. Every other session gets `kind: "none"`. When no Claude session is running, nobody does the CEO review.
2. `scripts/nextTaskCore.mjs:1252` (`mayReport`): only a "Claude" session may `--report` on a task it holds no stage of. Every other session may report only on what it holds.

Unblock (`kind: "unblock"`) already names no model, and needs no change.

## Required behavior

- **One list of CEO-capable models, kept in the registry.** `docs/plans/assignments.json` gains a top-level `ceoModels` array of model-name prefixes, matched case-insensitively against the part of the session name before ` · ` (`modelOf`). Its first value is `["Claude", "GPT-6.1 Sol"]`. The owner or any session under D-200 may add a model in a docs-only pull request; the validator rejects a non-array, an empty string or a duplicate.
- **`isArchitect(who, ceoModels)`** returns true when the session's model matches an entry in the list. Callers pass `doc.ceoModels`. With the field missing, the default list is `["Claude"]`, so behavior on an older `main` is unchanged.
- The CEO-review hand-out and `mayReport` both use that check. Nothing else changes: not FIFO order, AHEAD work (D-315), eligibility, lanes, tiers, leases, the review-independence rules (D-151), provenance (D-311/D-324) or the report text.
- The CLI (`scripts/next-task.mjs`) passes `doc.ceoModels` through at the two call sites that already read `doc`. It makes no other change.

## Tests (red first)

A new `scripts/nextTaskCeoModels.test.ts`:

- With `ceoModels: ["Claude", "GPT-6.1 Sol"]` and nothing else eligible, `GPT-6.1 Sol · ab12` gets `kind: "ceo"`, and `Qwen 3 · cd34` gets AHEAD work if there is any, otherwise `none`.
- `mayReport` is true for `GPT-6.1 Sol · ab12` on a task it holds nothing of, and false for `Qwen 3 · cd34`.
- Matching: case-insensitive, on the model part only, so `GPT-6.1 Sol` does not match `GPT-6.1 Solar`.
- With `ceoModels` missing, the behavior matches today's `/^claude/i`.
- The validator rejects a non-array, an empty entry and a duplicate.

Every existing `scripts/nextTask*.test.ts` passes unchanged.

## Out of scope

Owner-reserved calls (D-321 rule 1), review independence and CI. This row lets more models do the CEO's routine stages. It grants no model a new right over money, login, legal text, settings or spending.

## Status

PICKER-ceo-any-model: registered — D-338 — 2026-11-16 — not started. Owner, same session: "moveup", so the row is first among open rows in `docs/plans/assignments.json` (owner exception to FIFO, this row only).
