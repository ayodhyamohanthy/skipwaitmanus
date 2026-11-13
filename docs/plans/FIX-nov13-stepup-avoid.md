# Two measured defects from the Nov 13 reviews: the email-review step-up hang, and repeated `--avoid`

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Registered by a Claude reasoning session (D-225) from defects it reproduced while reviewing PRs #1179 and #1171. Two rows, built by other tools. Neither changes a price, a plan, legal text, the login rule or a money path.

| Field | Value |
|---|---|
| Rows | `D-057-stepup-access-error` (section 1), `PICKER-avoid-repeat` (section 2) |
| Synced to | D-331 |
| Order | appended last (FIFO, owner Oct 31) |
| Depends on | nothing; each lands alone on its own branch |

## 1. `D-057-stepup-access-error`: the email-review step-up panel never leaves "Checking your work email…" when the access read fails (Tier 1)

**Where.** `client/src/pages/goal/email-review/GoalEmailReviewAction.tsx`, `StepUpPanel` (the island both the kit and the goal `/email-review/:linkToken` pages render in the `code_required` state, since `f6706344`).

**The defect, reproduced.** `StepUpPanel` reads the referrer access verdict with `useQuery(... retry: 1 ...)`, then:

```ts
if (!access || accessQuery.isFetching) return <p …>Checking your work email…</p>;
```

There is no branch for `accessQuery.isError`. When the read fails (a 5xx, a dropped connection, or a payload `referrerAccessResponseSchema` rejects), `access` stays undefined after the one retry and the panel says "Checking your work email…" forever, with no error and no way forward but a reload. Reproduced in a real browser on PR #1179's head `6892f33f` with an access response the schema rejects (review comment 6839438450). It is live today: the kit page, which production serves, renders the same island.

**Why it matters.** This is the page a referrer opens from the "a referral request is waiting for you" email, at the moment we most want a decision. AGENTS.md: a failed verdict check is "a retryable error, never the gate"; silent failure is a defect (D-019 basics).

**The change.**
1. Red first, in `goalEmailReview.stepUp.test.tsx`: the review link answers `work_email_code_required`, the access read rejects (and, separately, returns a payload the schema refuses). Assert a plain error line (role `alert`) and a "Try again" control; assert that pressing it reads the verdict again; assert the step-up form appears when the second read succeeds. Both fail on `main`.
2. In `StepUpPanel`, render that error state when `accessQuery.isError`, with "Try again" calling `accessQuery.refetch()`. Keep "Checking your work email…" only while a read is actually in flight.
3. Nothing else: no change to the step-up proof, its endpoints, which account it binds to, the review link or the decision (D-057, D-245). The kit page needs no edit; it renders this island.

**Owned paths.** `client/src/pages/goal/email-review/GoalEmailReviewAction.tsx` (the `StepUpPanel` error state only), `client/src/pages/goal/email-review/goalEmailReview.stepUp.test.tsx`.

**Gates.** Tier 1 (sign-in and identity surface): independent review by a model that neither built nor fixed it (D-151), focused tests red first, `pnpm check`, required CI on the exact head. Captures at 1280 and 390 of the new error state, fictional data.

**Shares files with** `D-048-R-email-review` (PR #1179) only through the page it releases; no file overlap.

## 2. `PICKER-avoid-repeat`: a second `--avoid` silently replaces the first (Tier 2)

**Where.** `scripts/next-task.mjs` `argsOf`, and the hand-out sentence in `scripts/nextTaskText.mjs`.

**The defect, measured.** `argsOf` stores every valued flag as `out[a.slice(2)] = v`, so `--avoid A --avoid B` keeps only `B`. The supported form is one comma list (`--avoid A,B`, usage line 9), but every hand-out tells a session that cannot take a task to "Run this picker again with `--avoid <id>` added instead". A session that follows that literally twice loses its first avoid, and the picker alternates between the two tasks forever. This session hit it on Nov 13 (P0-referral-access-availability and door-neutral alternated), and the Qoder · 9c29 report on D-089-request-inbox ("with `--avoid D-089-request-inbox --avoid D-100.provider-recon` it still returns D-089") is the same trap; it was attributed to `nextTaskCore.mjs:955`, which is not the cause. This is a D-321 rule 11 dead end.

**The change.**
1. Red first, in a new `scripts/nextTaskAvoidRepeat.test.ts`: repeated `--avoid` flags accumulate (`--avoid A --avoid B` avoids both); a comma list still works; a comma list plus a repeat merges; empty entries are dropped. Make `argsOf` (or the avoid parse) testable without spawning git, the smallest way.
2. `argsOf` collects every `--avoid` value into one list. Every other valued flag keeps its last-wins behaviour.
3. The hand-out sentence names the accepted forms: "Run this picker again with `--avoid <id>` added (repeat the flag, or use one comma list, `--avoid a,b`)".

**Owned paths.** `scripts/next-task.mjs` (`argsOf` and the avoid parse only), `scripts/nextTaskText.mjs` (that one sentence), `scripts/nextTaskAvoidRepeat.test.ts` (new).

**Gates.** Tier 2: focused tests red first, `vitest run scripts/`, required CI green (D-200 (4)). Shares `scripts/next-task.mjs` and `scripts/nextTaskText.mjs` with open picker rows (`PICKER-fullstack-lights`, `PICKER-qa-stage`, `PICKER-parallel-eligibility`); under D-314 that is no dependency, and the later lander merges `main` and keeps both changes.

## Status
- `D-057-stepup-access-error`: todo
- `PICKER-avoid-repeat`: todo
