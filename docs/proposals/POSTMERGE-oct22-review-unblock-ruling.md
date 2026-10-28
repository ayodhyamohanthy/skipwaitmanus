# Proposed unblock ruling: POSTMERGE-oct22-review (D-166 / D-200)

Status: **proposal only.** It doesn't claim the unblock lock, doesn't push a `--report` marker, doesn't edit `docs/DECISIONS.md` or `docs/plans/assignments.json`, and opens no PR. A session allowed to record rulings, or the owner, adopts it through the normal path.

## Read receipt (D-225)
- Current main: `a4b022a5` (Merge reviewed docs packet #788: D086 registration only).
- Picker run (no claim): `node scripts/next-task.mjs --as "Claude Code" --avoid CI-architect-real-checks`. The owner approved excluding `CI-architect-real-checks` because its review is done and routed elsewhere. It printed **NEXT: UNBLOCK POSTMERGE-oct22-review**: OpenAI · c54e had reported it blocked, and the lock `agent/architect/postmerge-oct22-review` (taken over by ornith 1.5 · 53e9) had been quiet for 2 hours. `D-174-seeker-journey-build` (#193, `architect`) wasn't selected, so no D-174 packet was written.
- Sources read: the row and its sibling in `docs/plans/assignments.json` (`POSTMERGE-oct22-review`, `POSTMERGE-oct22-fixes`); `docs/plans/POSTMERGE-oct22-findings.md` on main; `agent/reports/log` reports for the row (Oct 24 to Oct 28); the lock branch history; the diff of `agent/queue/postmerge-oct22-review` (PR #775) against main; `scripts/scope-check.mjs`; and each fix commit and regression test cited below.

## The block, as raised
- `0c4dd467` / `6f65ea21` (OpenAI · c54e, Oct 24): the picker asked for code fixes, but the packet owns only `docs/plans/POSTMERGE-oct22-findings.md` and says "No code change in this row". The block needed CEO scope reconciliation or follow-up rows.

## Evidence that the block no longer holds
1. **Follow-up rows were created and finished.** Row `POSTMERGE-oct22-fixes` (Tier 1, owns the code paths: `server/db.ts`, `server/dailyMoneyCheck.ts`, `shared/planCatalog.ts`, the three `plans.*.test.tsx`, `Pricing.tsx`, `landingContent.ts`, `policyPages.test.tsx`, ...) has `status: "done"`.
2. **All four findings are fixed on main.** Each commit is an ancestor of `origin/main`:
   - P1 #482: `821399d4`, "a waiting ask keeps the flat price it was quoted across an activation". Test: `server/db.askCostStored.test.ts:366` ("a waiting ask created with the flag off is delivered at 1 credit after the flag turns on").
   - P2 #478: `09891b3b`. Test: `client/src/pages/plans.kit.test.tsx:90` (USD and INR live-catalog range, "never the fallback").
   - P2 #534: `91e0b6c8`. `firstPackClaim()` at `shared/planCatalog.ts:172` is used by `client/src/pages/Pricing.tsx:9-10`, `shared/landingContent.ts:17-18` and asserted in `client/src/pages/policyPages.test.tsx:130-131`.
   - P2 #506: `01928e67` + `5ff7ef2c`. `server/dailyMoneyCheck.ts:469` passes `agedOutCutoff` as the sample's lower bound. Test: `server/dailyMoneyCheck.test.ts:569`.
3. **The row's own deliverable landed.** The findings document came in through #619 (`ad57edb4`, "POSTMERGE-oct22-review: findings from money-path audit (#619)").
4. **What's left is docs only and in scope.** PR #775 (head `0f443023`, WorkBuddy AI · 8c8a) changes two files: `docs/plans/POSTMERGE-oct22-findings.md` (owned) and `docs/plans/PROCESS-gates.md` (the row's packet, which `scopeViolations` always allows, `scripts/scope-check.mjs:35`). It records each finding's fix, and every citation in it matches main (checked above). The builder reports all four required checks green on that exact head (reports `5bf105e6`, `79ef26a4`). That CI claim is the builder's and isn't reproduced here.

## Proposed ruling
**Clear the block.** The scope conflict it named was resolved when the code work moved to `POSTMERGE-oct22-fixes`, which is done. No owner-reserved question is involved: no price, plan, legal text, live money, login or fairness change. This is a D-200 ruling any session that neither raised the block nor holds the task can make.

What remains, in order:
1. **Independent Tier 1 delta review of PR #775** at head `0f443023`, by a model that neither built nor fixed it (D-151). Under the Oct 23 merge-policy amendment, a docs-only PR uses focused checks plus required CI, not a fresh full gate. Reviewer checklist: the four commit/test citations above, no runtime files, and `scope-check` passing.
2. **Land #775** on green required CI, then set `POSTMERGE-oct22-review` to `done` in `assignments.json`, with the PROCESS-gates Status line updated to `done — <sha>`. That's the normal landing step, not a separate registry decision.
3. **Picker defect, tracked rather than fixed here.** The row kept coming back after #619 because a claim marker recreated the branch and hid the landing. That belongs to `PICKER-landed-marker-continuity` (already registered), not to this row.

## Risks and counter-arguments
- *A critic would say:* "Clearing the block on reports alone repeats the D-166 failure: unreviewed money merges." Answer: this ruling does **not** waive review of the fixes. The `POSTMERGE-oct22-fixes` row is Tier 1 and went through its own gate, and this proposal checked each fix and test on main directly. Whether that row's Tier 1 review was independent can be audited with `git log origin/agent/review/postmerge-oct22-fixes`. If it wasn't independent, that is a finding on the fixes row, not a reason to keep this audit row blocked.
- I didn't run the four test files here. The cited lines and wiring were read from main. The green CI is the builder's report and is unverified by this session.
- Rating of this ruling against the goal: **8/10.** It frees a Tier 1 audit priority that the D-085 report holds, so every lower lane (including D-174) stops waiting behind an already-resolved block. It isn't a 10 because of the unverified CI claim and the still-open picker continuity defect.

## How to adopt
A session allowed to rule (or the owner) records the ruling in `docs/DECISIONS.md` through a docs PR. Then it runs `node scripts/next-task.mjs --report review --task POSTMERGE-oct22-review --as "<its session name>" --note "Block cleared: fixes landed via POSTMERGE-oct22-fixes (821399d4, 09891b3b, 91e0b6c8, 01928e67, 5ff7ef2c); #775 needs independent docs-only Tier 1 review then land"`. That report releases the lower priorities.
