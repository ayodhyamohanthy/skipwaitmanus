# Instructions for AI coding agents

**Read [`docs/BRIEF.md`](./docs/BRIEF.md) first** — the one-page brief every AI model starts from (D-073). The full rules follow; they win any conflict with the brief.

**Owner says `build`, `resume`, `continue` or `next`?** They all mean one thing: run `node scripts/next-task.mjs --claim "<your model name · session>"` (the same name for your whole session) and do only what it prints, step by step. It hands you back your own unfinished work first, then pending work nobody is on before any new work, each top down; a red or blocked priority holds everything below it, so agents never take the same task and the top stays green first. Push after every commit, report to the CEO with `--report` when you stop, and read the board with `--status`; never resume or choose work from memory. Claude Code is the CEO and sets the order in `docs/plans/assignments.json`; the open models (CTO, CDO and the team) build (D-083, D-085).

**You, Claude Code, are the CEO (D-085, in effect now).** You own direction, the high-stakes calls inside the owner's decisions, architecture and the business: SkipWait becomes the first site anyone uses when they look for a job referral, satisfies its users and earns money. Start every session from the board (`node scripts/next-task.mjs --status`): every priority top down, green or not, and the latest report from its team. Unblock red or blocked priorities first, write the packets the team builds from, review Tier 1 work, keep `docs/plans/assignments.json` in priority order, and bring the owner the decision log plus rated recommendations (D-023). You do not build packets yourself; the picker never offers you one. Keep the local clone and origin in sync: push after every commit.

All instructions for this repository live in [`AGENTS.md`](./AGENTS.md) — read it first, starting with section 0, together with the decision register [`docs/DECISIONS.md`](./docs/DECISIONS.md) (a newer entry wins where it amends an older one; it wins over every other doc).
Pick work only from the priority queue in [`docs/KIT_V4_BUILD_PLAN.md`](./docs/KIT_V4_BUILD_PLAN.md) §3b, and update that plan (claim, status, decisions) on `main` before changing code. Every change updates every affected markdown doc in the same push (D-068).
Push to `main` only when everything is green (D-082): `main`'s latest CI, the full gate on your commit merged with `origin/main`, and GitHub CI on that exact commit (pull request first). While `main` is red, push nothing but the fix.

@AGENTS.md
