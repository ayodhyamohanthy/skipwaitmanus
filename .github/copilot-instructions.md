# Instructions for AI coding agents

**Read [`docs/BRIEF.md`](../docs/BRIEF.md) first** — the one-page brief every AI model starts from (D-073). The full rules follow; they win any conflict with the brief.

**Owner says `build`, `resume`, `continue` or `next`?** They all mean one thing: run `node scripts/next-task.mjs --claim "<your model name · session>"` (the same name for your whole session) and do only what it prints, step by step. It hands you back your own unfinished work first, then the highest-priority task nobody is on (half-built work before new work), so agents started together never take the same task. Push after every commit; never resume or choose work from memory. Claude Code is the CEO and sets the order in `docs/plans/assignments.json`; the open models build (D-083, D-085).

All instructions for this repository live in [`AGENTS.md`](../AGENTS.md) — read it first, starting with section 0, together with the decision register [`docs/DECISIONS.md`](../docs/DECISIONS.md) (newest first; it wins over every other doc).
Pick work only from the priority queue in [`docs/KIT_V4_BUILD_PLAN.md`](../docs/KIT_V4_BUILD_PLAN.md) §3b, and update that plan (claim, status, decisions) on `main` before changing code. Every change updates every affected markdown doc in the same push (D-068).
