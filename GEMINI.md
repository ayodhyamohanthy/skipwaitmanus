# Instructions for AI coding agents

**Read [`docs/BRIEF.md`](./docs/BRIEF.md) first** — the one-page brief every AI model starts from (D-073). The full rules follow; they win any conflict with the brief.

**Owner says `build`?** Run `node scripts/next-task.mjs --claim "<your model name · session>"` and do only the task it prints, step by step. Never choose work yourself: Claude Code sets the order in `docs/plans/assignments.json` (D-083).

All instructions for this repository live in [`AGENTS.md`](./AGENTS.md) — read it first, starting with section 0, together with the decision register [`docs/DECISIONS.md`](./docs/DECISIONS.md) (newest first; it wins over every other doc).
Pick work only from the priority queue in [`docs/KIT_V4_BUILD_PLAN.md`](./docs/KIT_V4_BUILD_PLAN.md) §3b, and update that plan (claim, status, decisions) on `main` before changing code. Every change updates every affected markdown doc in the same push (D-068).
