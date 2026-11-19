# Packet <ID>: <one-line outcome a user would notice>

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `<row id>` (status lives there, nowhere else) |
| Decisions | D-xxx, D-yyy (binding text quoted in §2) |
| Risk tier | 1 (money, identity, privacy or migration) · 2 (server logic or user flow) · 3 (copy, docs, isolated UI) |
| Size | S (under 1 day) · M (1–3 days) · L (split it) |
| Implementer | any model · senior model only |
| Branch | `agent/<model>/<slug>` from the latest `origin/main` |
| Depends on | rows that must be live first |
| Do not run at the same time as | rows that edit the same functions or files |
| Verified against | `main` `<sha>` on `<date>` |

## 1. Goal
One paragraph: what changes for a seeker, a referrer or the owner, and why.

## 2. Binding rules (quoted, not paraphrased)
Quote the register text this packet implements. If the code, this packet and the register disagree, the register wins: stop and report (§11).

## 3. Current behaviour (verified)
Numbered facts, each with `file:line` and the function name. Line numbers drift: find the function by name (`grep -n "functionName" path`) before you trust a number.

## 4. Target behaviour
Numbered, testable rules. Every rule maps to at least one test in §7.

## 5. Files
- **In scope (edit only these):** exact paths.
- **Read only:** paths you may need to understand but must not edit.
- **Out of scope (never edit here):** paths a model might be tempted to touch.

## 6. Steps (one commit each)
For each step: purpose, files, functions, the change, the focused tests to run, and the commit message. Each commit leaves `pnpm check` and its focused tests green. In a fresh worktree or clone, run `pnpm install` before the first `pnpm check`; missing local dependencies fail as TS2688/TS5101 (REGISTER-520, Oct 24).

## 7. Tests to write first (red before the fix)
For each test: file, name, setup, exact assertions, and why it fails on today's code. Then the **controls**: existing behaviour that must stay green. Never weaken, skip or delete an existing assertion to make a test pass.

## 8. Edge cases and races
Each case with the required handling (lock order, idempotency key, fail-open or fail-closed, retries).

## 9. Definition of done
- [ ] Every §7 test was red first and is green now; every control is green.
- [ ] Gate on your commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] Tier 1: independent review passed (`docs/DELEGATION.md` §6); findings fixed red-first.
- [ ] Docs updated in the same push (D-068): your status line (the §3b row, or your line in this packet's Status section when several tasks share the row, D-134), the `AGENTS.md` living-map row if routes or modules changed, `docs/DECISIONS.md` sync cell if a decision is now implemented.
- [ ] Pushed, live check done (API: `verify-live-release.sh` prints CONVERGED; web: `git-commit` meta), screens checked at 1280 and 390 if UI changed.
- [ ] Your status line set to `done — <sha>` with the evidence block (`docs/DELEGATION.md` §5).

## 10. Review checklist (for the independent reviewer)
Packet-specific questions the reviewer must answer with evidence, on top of the generic list in `docs/DELEGATION.md` §6.

## 11. Stop and ask if
Concrete triggers: a cited function no longer matches; a test you were given fails for a reason other than the bug; you need a file outside §5; a rule in §4 seems to contradict the register; you would need a migration, dependency or env key the packet does not name. Write the question in your status line, push your branch, end the session.

## 12. Owner questions
Only real ambiguities, each with a recommended default and a 1–10 rating. Until answered, implement the default only if this section says so.

## Status
When several tasks share one §3b row, each writes one line here, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live, and never edits the shared row (D-134).
