# D-048-p3-agents source-level review: PR #778 (head `9dd7236e`)

> Tier 1 row `D-048-p3-agents` ("Redesign /agents (seeker agent grants) to the goal doctrine (D-150)").
> Reviewed against `docs/plans/GOAL_UI_COVERAGE.md` §1 and §6.5 (the row's packet) and `docs/DELEGATION.md` §6,
> on 2026-10-28, from `origin/main` `5fe7f9ee`.

## 0. Standing of this review

- **Source-level only. Not a D-151 pass and not a status clear.** The build commits (`3f345a3f`, `9dd7236e`) are
  authored by a local account and labelled "Qoder · ac3a"; model provenance is unproven, so this review records
  findings and evidence and claims no independent-review credit. A provenance-proven reviewer must still post
  the D-151 verdict.
- **Role (D-225):** reasoning and docs only. No code changed, nothing landed, no registry edit, no PR opened.
- **Head reviewed:** `origin/agent/queue/d048-agents` = `9dd7236ecae755486df0f67038a4c742633e9080`
  (merge base `6cbee199`; PR is `behind` main by 10 docs/registry files, none overlapping).

## 1. Verdict: **findings** (do not land as is)

The wiring itself is correct, small and in scope. But the row's title is "redesign /agents to the goal
doctrine", and on this head `/agents` does not meet §1's definition of moved, and cannot within the row's
current `owns`. One copy defect is also pinned by the new test.

## 2. What I reproduced (on `origin/main` `5fe7f9ee` merged with `9dd7236e`, clean merge)

| Check | Result |
|---|---|
| Scope (`scripts/scope-check.mjs:35`: `assignments.json`, the packet, and `owns`) | 4 files, all allowed |
| `pnpm check` | clean |
| `pnpm vitest run client/src/pages/seekerAgents.test.tsx client/src/pages/goal/assistants/` | 3 files, 27/27 pass |
| Red-first: new test against main's `SeekerAgents.tsx` | 7 fail, 3 pass, as the PR states. The 3 passing are the two flag-gate pins and "shows the new key once", which passes against the kit page too, so it does not pin the goal body |
| GitHub CI on `9dd7236e` | typecheck, unit + component + route tests, production build: success (historical head, not merge-result) |
| Switch | `client/src/lib/goalSurfaces.ts`: `assistants` owns `/agents`; not in `RELEASED`, so production is unchanged |
| Deps | `D-048-F-harness`, `-F-primitives`, `-F-goal-check` all `done` |

Not reproduced: the full suite, `pnpm build` and the captures (they are not on this head).

## 3. Findings

### F1 (blocking): the row ends without meeting §1, and §1.2/§1.7 cannot be met inside its `owns`
- `docs/plans/GOAL_UI_COVERAGE.md:23-30` (§1) says a page counts as moved only when **all** of §1.1-§1.7 hold
  **on its own pull request**. The PR says outright that it does not claim §1.7 (PR body, "Doctrine status" 7;
  packet text at `GOAL_UI_COVERAGE.md:224`).
- §1.7: `SeekerAgents.tsx` exports no `GOAL_PAGE`, and `seekerAgents.test.tsx` never calls `assertGoalPage`.
- §1.2 is not met either. `assertGoalPage` finds the next-step block with
  `section[aria-labelledby="<GOAL_NEXT_STEP_HEADING_ID>"]` (`client/src/test/goalPageContract.ts:14,33`).
  `AssistantLayout`'s `NextStep` renders `section aria-label="Your next step"`
  (`client/src/pages/goal/assistants/AssistantLayout.tsx:21`), which does not match, so the check would fail.
  The new test checks the block by role and name only (`seekerAgents.test.tsx:70-73`).
- §1.1: the shipped h1 ("Let your agent prepare a better referral",
  `GoalSeekerAgents.tsx:119`) is neither the packet's proposed line (`GOAL_UI_COVERAGE.md:220`) nor
  recorded in `docs/plans/GOAL_UI_MIGRATION.md`'s contract table (no `/agents` entry there), and no captures
  go to the owner for it.
- **Why it can't be fixed inside the row.** The fix sits in `client/src/pages/goal/assistants/GoalSeekerAgents.tsx`
  (use `GoalNextStep`, or have it export the contract). That file is outside this row's `owns`
  (`assignments.json` row `D-048-p3-agents`). Its owner, `D-048-p3-assistants`, is `done`.
- **Required:** a registry-only correction (D-226 shape) that adds `GoalSeekerAgents.tsx` to this row's
  `owns`. Then, on this PR: `GOAL_PAGE` exported from `SeekerAgents.tsx`, `assertGoalPage(container, GOAL_PAGE)`
  in the default state, and the goal line either proposed in the migration contract table or switched to the
  packet's line. Do not swap `AssistantLayout.NextStep` globally: `/assistants`, `/approve` and
  `/connect-assistant` render it too. Changing it there belongs to their row.
- **Failing test to add first:** in `seekerAgents.test.tsx`, `assertGoalPage(container, GOAL_PAGE)` after the
  goal heading resolves (currently fails on the next-step selector).
- **Alternative (an owner or CEO call, not this reviewer's):** re-scope the row to "wire only" and add a
  separate assistant-family `GOAL_PAGE` row. The row must then stay not-done under D-167, and the coverage
  table must not read as moved.

### F2 (blocking for a Tier 1 surface, D-153): limit labels say "send", but the agent cannot send
- `GoalSeekerAgents.tsx:108` labels `asksPerDay` "Sends per day" and `creditsPerAsk` "Referrals per send".
  Line 115 renders "N referrals/send … N sends/day". On the same screen, line 119 says the agent "cannot send
  anything", and the scope at line 107 says "never sends".
- On the server, `asksPerDay` caps **drafts created per day** (`server/seekerAgentRoutes.ts:219-226`,
  `countDraftsSince` vs `maxAsksPerDay`). `creditsPerAsk` caps the internal **credit cost of one draft**
  (`:214-217`; the cost is `1` unless `ASK_LEVEL_COST` is on, `server/seekerAgentDeps.ts:140-142`). So
  "10 referrals per send" describes nothing a seeker can do, and it suggests that one send spends up to 10
  referrals. D-153 says wording promises only what works today. Cost wording near money is Tier 1 (§1.3).
- The new test pins the wrong copy (`seekerAgents.test.tsx:83,94-95`).
- **Required:** labels that state the real limits, for example "Drafts per day" and a referral-unit cap
  worded per D-173/D-180. Fix the test first so it expects the corrected labels. This also needs the F1
  `owns` extension.

### F3 (medium, D-068 / team rule 8): the docs on this head claim captures that are not on it
- `GOAL_UI_COVERAGE.md:223` says "Captures live in `design/goal-ui/captures/agents/`", and the §7 status line
  says the same. `git ls-tree 9dd7236e design/goal-ui/captures/agents` is empty. The PNGs are on
  `salvage/d048-agents-captures` (`ee51fe44`, fixtures `94ab59ea`).
- That set has default, empty, error and signed-out states only. §1.6 also requires **loading** and **offline**.
- The fixtures are at `design/goal-ui/tools/fixtures/agents__*.json`. That path is in neither this row's
  `owns` nor #777's correction (`a9f5e7e2` adds only `design/goal-ui/captures/agents/**`), so the planned
  cherry-pick of `94ab59ea` will fail `scope-check`. Add the fixtures glob to the registry correction, as
  D-226 did for conversation.
- **Required:** state the doc lines as pending until the captures commit lands, add loading and offline
  captures, and register the fixtures path.

### F4 (low): the registry delta is duplicated with #777
- `assignments.json` in this PR carries the same `owns` change as `a9f5e7e2` (#777). It merges cleanly today.
  Once #777 lands, merge main into this branch rather than re-editing, so the row note is not doubled. Under
  F1/F3, #777 should be widened, not landed as is.

### F5 (low, pre-existing, outside owns): internal "credit" wording reaches the seeker
- The audit trail renders `ev.detail` verbatim (`GoalSeekerAgents.tsx:116`). The server writes
  "`draft N for x, K credit(s)`" and "over daily/weekly credit limit" into it (`server/seekerAgentRoutes.ts:229,233`).
  Under D-173/D-180, "credit" is internal. Hand this to the Skippy server row; do not fix it here.

## 4. §1 checklist by name (on head `9dd7236e`)

| Item | State |
|---|---|
| 1.1 goal line | h1 present; not in the migration contract table and differs from the packet (F1) |
| 1.2 one next step, one black commit | One `data-g-primary`, inside the block, in the default state; the block is not `GoalNextStep` and fails `assertGoalPage`'s selector (F1) |
| 1.3 status dot+text, cost before ask | `GoalStatus` used; no ask is sent here; limit wording misstates the unit (F2) |
| 1.4 no kit | `GoalSeekerAgents.tsx` and `AssistantLayout.tsx` import only `@/components/goal` |
| 1.5 parity list | In the PR body; matches my read of both pages (create, scopes, 4 limits, expiry, key once + copy, pause/resume-all, revoke, activity). The goal page adds error/offline handling the kit page lacked |
| 1.6 captures | Not on head; loading and offline missing (F3) |
| 1.7 `GOAL_PAGE` / `assertGoalPage` | Absent (F1) |
| 1.8 review | This source-level review; a provenance-proven D-151 verdict is still owed |

DELEGATION §6 items 3 (money), 4 (identity/privacy) and 6 (time) have no delta: the PR changes no server,
query or ledger path. The goal body handles every failure path visibly (item 5).

## 5. Order to clear
1. Registry-only correction: widen #777 to add `client/src/pages/goal/assistants/GoalSeekerAgents.tsx` and
   `design/goal-ui/tools/fixtures/agents__*.json` to the row's `owns`.
2. On #778, red first: `assertGoalPage` plus the corrected-label assertions. Then the `GoalNextStep` and copy
   fix in `GoalSeekerAgents.tsx`, `GOAL_PAGE` in `SeekerAgents.tsx`, and the goal-line record.
3. Captures for all six states, plus fixtures. Docs say "pending" until they are on the branch.
4. Merge main, then a D-151 review by a session whose model provenance is proven.
