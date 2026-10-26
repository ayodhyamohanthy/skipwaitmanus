# Packet DECISION-SYNC-oct24: every doc states the current decisions, and none presents a superseded one as current

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-068) on Oct 24 2026. The owner's words (Oct 24, in Claude Code session · 6029): "make sure all up to date decisions are everywhere and old decisions are no where".

| Field | Value |
|---|---|
| Row | `DECISION-SYNC-oct24` (Tier 2, lane `docs-sync`, branch `agent/queue/decision-sync-oct24`) |
| Waits for | `REGISTER-oct24` (#637), so D-182 to D-200 are on `main` before the sweep starts. Any decision that lands later is synced by the PR that lands it (D-068). |
| Changes | Markdown only. No code, test, workflow, flag, price or copy-string change. |

## 1. Rules
1. **`docs/DECISIONS.md` keeps every entry.** It is the audit trail, and IDs are never reused. Fix only its status column: an entry that a newer entry supersedes, rejects or narrows says so, with the newer ID (for example "superseded by D-176"). The table stays in ID order. Add no new decision.
2. **Every other doc** states the current rule only. Delete superseded guidance; don't annotate it. Old work logs in instruction files (dated status paragraphs about finished lanes) go too: git history and `docs/KIT_V4_BUILD_PLAN.md` keep them.
3. **Runtime truth stays.** Where code still does the old thing (for example, ask expiry runs until `D-174-expiry-clock-removal` lands), describe it as current runtime behaviour with the decision and row that change it. Never describe planned behaviour as live.
4. **Newest wins** (the register's rule). Where two active decisions conflict and neither names the other, stop and report it blocked with both IDs; the CEO rules. Change no frozen money, price, legal or login text by inference (D-132, D-146, D-152, D-030 and the owner-only items in D-085).
5. **Limits:** `docs/BRIEF.md` stays within its 10 KB contract (`scripts/briefContract.test.ts`). Keep `AGENTS.md`'s structure; trim, don't restructure.

## 2. Scope
- **Instruction files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `LLM_HANDOFF.md`, `app/docs/handoff/LLM_HANDOFF.md`, `FOR_AI_BUILDERS.md`, `START_HERE.md`, `SkipWait-START-HERE.md`, `README.md`, `COLLABORATION.md`, `.github/copilot-instructions.md`, `docs/BRIEF.md`, `docs/DELEGATION.md`.
- **Product docs:** `docs/PRD.md`, `docs/PRICING.md`, `DESIGN.md`, `docs/GROWTH_STRATEGY.md`, `docs/BUGFREE_GATE.md`, `docs/SKIPPY.md`, `docs/plans/README.md`, and `docs/KIT_V4_BUILD_PLAN.md` §0 to §3b and §6.
- **Root product docs (D-211):** `PRICING.md` (it becomes a pointer to `docs/PRICING.md`; it stops being a second pricing spec), `PRODUCT.md`, `UPGRADE_NUDGES.md`. Instruction files still send builders to them as current, so they state the current rule or say plainly that they are history.
- **Packets** of every row that is not `done` in `docs/plans/assignments.json`. Leave packets of `done` rows as history.
- **The register's status column**, as in §1.1.

## 3. Known drift to check first (not exhaustive)
| Decision | What to look for |
|---|---|
| D-194 | D-155 was renumbered to D-194 (#527); fix references that name the /share rule D-155. |
| D-195, D-200 | Nothing waits for one model or session; Claude Code builds too; Tier 2/3 land on green required CI; Tier 1 gets one review by a model other than the builder's. D-198 is withdrawn: no second account, approvals are 0, and a PR is still required. Fix every doc that says Claude never builds, that a step is Claude-only, or that landing waits for an identity. |
| D-196 | Paid referrer plans get level-matched first access. Fix lines saying referrers never pay, or that no paid referrer benefit exists. The never-PAID core (D-055) stands. |
| D-173, D-180 | The user-facing unit and object are "referral" and "referral request"; "ask" and "credit" are internal. Describe the copy rule; renaming strings in code is the terminology lane's (#598). |
| D-174, D-176 | No ask expiry as direction (runtime caveat in §1.3). No availability framing; D-102's visible lines are superseded. |
| D-146, D-147 | Passes and Keep warm are not sold. D-035 is rejected, and any employee decline keeps the credit spent. |
| D-146, D-132 | Root `PRICING.md`, `PRODUCT.md` and `UPGRADE_NUDGES.md` still sell 30- and 90-day passes and the retired Start/Momentum/Land family (D-211). `PRICING.md` becomes a pointer to `docs/PRICING.md`. |
| D-120, D-150 | Kit v4 is retired; goal UI is the one design. |
| D-182, D-189, D-190, D-193, D-197, D-199 | The Workers Builds check is not a gate; a row's branch carries only its own work; the packet landing order; the journey rows; the queue edges; the legacy registration route. |

## 4. Acceptance
- **Inventory.** The PR description has a table: file, stale statement (a short quote), the decision that supersedes it, and the change made. Every row in §3 is either fixed or marked "already current" with the file checked.
- **Searches**, each run and listed in the PR with what remains and why:
  - `rg -n "D-155" -g '*.md'`
  - `rg -n -i "keep warm|30-day pass|90-day pass" -g '*.md'`
  - `rg -n "D-035" -g '*.md'`
  - `rg -n -i "open to referral requests|not open yet" -g '*.md'`
  - `rg -n -i "7-day|90-day|day-30" -g '*.md'`

  A hit may stay only in one of four buckets (D-211): (a) an entry in `DECISIONS.md`; (b) a `done` row's packet; (c) a runtime caveat as in §1.3; (d) a dated historical record — `docs/KIT_V4_BUILD_PLAN.md` outside its §§0-3b and §6, `docs/PRICING_RECOMMENDATION.md`, `docs/plans/OCT21-BUILT-PRS.md`, `docs/plans/STRANDED-OCT23.md`, `CHANGELOG.md`, `app/roadmap.md`, and an `app/docs/handoff/**` file carrying its stale-copy banner. The PR lists every remaining hit with its bucket and file; a hit in an in-scope file that presents a superseded rule as current is a failure, not history.
- **Tests:**
  - `node -e` with `validateAssignments` returns `[]`;
  - `pnpm vitest run scripts/` is green, including `briefContract` and `registerShape`;
  - `pnpm check` is green;
  - required CI is green on the exact head.
- **Landing:** Tier 2. It lands on green required CI with no separate review (D-200).

## 5. Stop and ask
- Two active decisions conflict (§1.4).
- A doc's current statement can be fixed only by changing a frozen item.
- A change would need a file outside markdown.

Report it with `--report blocked`, naming the IDs and files.

## Status
- `DECISION-SYNC-oct24`: registered by #637; waits for `REGISTER-oct24`.
- 2026-10-26: unblocked by D-211 (Qoder · dc00, unblock takeover under D-200 (2)). The scope/acceptance conflict reported on #679 is ruled: the three root product docs are in scope, and declared history (including the build plan's dated records) may stay when the inventory names its bucket and file. The partial work on #679 resumes against this packet.
