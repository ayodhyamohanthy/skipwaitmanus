# D-344: remove the landing bottlenecks (owner, Nov 16 2026)

Owner, verbatim: "let gpt 6.1 sol review it is poerful model too. rem bottlenecks we should go to production bug free fast" and "remove whats causing slowness or bottlenecks". On the four options Claude put to the owner, the owner chose to allow same-model review now and approved all four bottleneck removals. The ruling is in `docs/DECISIONS.md` D-344. This packet holds the two rows it adds.

## Why (measured Nov 16, main `0de8feb6`, CI green)

- Only two pull requests merged since midnight IST, and both were docs (#1202, #1211). The last product release was D-048-R-conversation (#1199, 03:46 IST). More than 40 CEO reports went to about 8 pull requests going round review, findings and block.
- Every page release row owned only its `RELEASED` switch. Each review finding on the page itself therefore needed its own register ruling first (D-338, D-340, D-342, D-343 on PR #1212), and that ruling then needed its own review. That is two pull requests and two reviews per finding.
- `D-048-R-inbox` (#1196) and `D-048-R-profile` (#1201) both wait on one shell wording finding. Its owner row, `D-222-referral-count-shell`, waits on `PRICING-banded-oct25` (#666), which is itself blocked.
- Re-reviews kept finding new, older issues outside the fix, so a pull request never converged.

## Row 1: `PROCESS-session-review-independence` (Tier 2, lane `picker`)

Make the picker, the CI review gate and scope-check apply D-344 (1), (7) and (8). Independence is per session, not per model; a fix lands without a re-review; and any row may take an unowned file it needs.

1. `scripts/nextTaskCore.mjs`: the review and Tier 1 landing exclusion (`did()` and the builder/fixer lists, D-151) compares the full session name (`modelOf` stays for display and provenance only). A session that wrote a `Claim`, `Takeover`, `Fix claim` or `Fixed` marker on the task never gets its review or landing. Another session of the same model does.
2. `scripts/review-gate.mjs` (lines 111-126 on `0de8feb6`): a pass verdict fails only when its author **session** built or fixed the work. The external-route provenance checks of D-311/D-312 stay exactly as they are: a route that cannot prove who built is still refused.
3. `scripts/nextTaskText.mjs`: the review step says (a) another session of your own model may review, never your own session's work; (b) the one-pass rule of D-344 (3).
4. Tests first, red then green: a same-model different-session review is handed out and passes the gate; a same-session one is refused at hand-out and at the gate; the external-route refusal is unchanged. Update the existing D-151 tests in `scripts/nextTask.test.ts` and `scripts/reviewGate.test.ts` to the new rule. Do not delete them.
5. **No re-review (D-344 (7)):** after a findings verdict and a later `Fixed` marker by a session other than the reviewer, the review gate passes the pull request's exact head and the picker hands out the landing, not a re-review. A `Fixed` marker must name the head it fixed. A head pushed after that marker needs a new `Fixed` marker.
6. **Fix-in-place for every row (D-344 (8)):** `scripts/scope-check.mjs` also accepts a changed file that the pull request's own `docs/plans/assignments.json` adds to this task's `owns`, provided no other open row on `origin/main` owns it. Add red-first cases to `scripts/scopeCheck.test.ts`: the file is accepted, and it is refused when another open row owns it.
7. Docs in the same pull request: the "Agent work queue" row of `AGENTS.md`'s living system map.

Proof: the focused picker and review-gate test output, plus one `node scripts/next-task.mjs --status` run on the branch. No product runtime change.

Until this row lands, CI's review gate still refuses a pass by the builder's or fixer's model. Sessions keep routing such reviews to another model until then.

## Row 2: `D-344-shell-referral-words` (Tier 2, lane `design-shell-words`)

This is the wording slice of `D-222-referral-count-shell`. The shell count is the remaining-referral count (D-173, D-180, D-222), so it never says "credits".

1. `client/src/components/goal/GoalShell.tsx` (the `goal-credits-pill`, lines 53-63 on `0de8feb6`):
   - Visible text: `{n} referrals left` (`1 referral left`).
   - Compact (phone) pill: keeps a unit, `{n} referrals` (`1 referral`). It is never a bare number.
   - `aria-label`: `{n} referrals left. Open plan details`.
   - The loading, error ("Balance didn't load" + Retry) and never-show-0-on-failure behaviour, the link target, the hook and the count source stay unchanged. The `data-testid` stays the same so nothing else moves.
2. Update the tests that pin the old words: `client/src/components/goal/goalComposites.test.tsx`, `client/src/components/appShell.test.tsx`, `client/src/pages/myRequests.goal.test.tsx`. Add one assertion that no shell text says "credit".
3. Captures at 1280 and 390 of the shell on a seeker route, in `design/goal-ui/captures/shell/`.

Out of scope, staying with `D-222-referral-count-shell`: showing the count on referrer routes, `AppShell.tsx`, and the zero-state and ledger semantics.

Once this lands, PR #1196 (`D-048-R-inbox`) and PR #1201 (`D-048-R-profile`) merge main and are re-reviewed on their new heads.
