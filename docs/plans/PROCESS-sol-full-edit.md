# `PROCESS-sol-full-edit`: GPT-6.1 Sol sessions may edit any file (D-356)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Owner instruction, Nov 17 2026: "keep no blocker . let the gpt 6.1 sol have full rights to edit anything". Tier 2. Changes no price, plan, legal text, login rule or money path.

| Field | Value |
|---|---|
| Row | `PROCESS-sol-full-edit` |
| Synced to | D-356 |
| Order | appended last (FIFO, owner Oct 31) |
| Depends on | nothing |

## The change

**Where.** `scripts/scope-check.mjs` (`checkBranch` and `main`) and `scripts/scopeCheck.test.ts`.

**Today.** `scope-check` fails any task branch that changed a file outside its row's `owns`. Under D-356 that is a blocker the owner removed for GPT-6.1 Sol sessions.

**After.**
1. Red first, in `scripts/scopeCheck.test.ts`: a pure helper decides whether a branch's commit subjects show a GPT-6.1 Sol session on that task. It returns true for `Claim <id>: GPT-6.1 Sol · <tag>`, `Takeover <id>: GPT-6.1 Sol · <tag>` and `Fix claim <id>: GPT-6.1 Sol · <tag>`. It returns false for another task's marker, for another session's marker, for a subject that only mentions the name, and for an empty history.
2. `checkBranch` reads the subjects of `origin/main..HEAD`. If the helper says a GPT-6.1 Sol session holds the task, it returns no violations. It does return the out-of-owns paths as `exempt`, and `main` prints them as a notice that names D-356.
3. Nothing else changes: the queue gate, review gate, decision-id check, test-integrity gate and the switch-only line limit for every other session.

**Owned paths.** `scripts/scope-check.mjs`, `scripts/scopeCheck.test.ts`.

**Gates.** Tier 2: focused tests red first, `vitest run scripts/`, required CI green (D-200 (4), D-352).

## Status
