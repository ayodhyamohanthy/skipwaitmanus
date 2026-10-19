# Instructions for AI coding agents

**Read [`docs/BRIEF.md`](./docs/BRIEF.md) first** — the one-page brief every AI model starts from (D-073). The full rules follow; they win any conflict with the brief.

All instructions for this repository live in [`AGENTS.md`](./AGENTS.md) — read it first, starting with section 0, together with the decision register [`docs/DECISIONS.md`](./docs/DECISIONS.md) (a newer entry wins where it amends an older one; it wins over every other doc).
Pick work only from the priority queue in [`docs/KIT_V4_BUILD_PLAN.md`](./docs/KIT_V4_BUILD_PLAN.md) §3b, and update that plan (claim, status, decisions) on `main` before changing code. Every change updates every affected markdown doc in the same push (D-068).
Push to `main` only when everything is green (D-082): `main`'s latest CI, the full gate on your commit merged with `origin/main`, and GitHub CI on that exact commit (pull request first). While `main` is red, push nothing but the fix.

@AGENTS.md
