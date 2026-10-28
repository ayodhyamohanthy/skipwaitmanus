# Packet OCT25-STRANDED: Oct 25 owner decisions that never reached the queue

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-200 (2)) on Oct 27 2026 against `main` `9746ec9a`, after the Oct 27 decision audit (`docs/plans/DECISION-AUDIT-oct26.md` section 11). The picker hands out one row at a time; do only the row it prints. The register wins any conflict.

## Why
The owner decided several things on Oct 25 (`docs/IMPLEMENTATION-BACKLOG-oct25.md`, on `main`). Their queue rows were in registry PR #669, which has conflicted with `main` and sat quiet since Oct 26 05:48. So none of them is on the board:
- **The 24 h poster first look.** This is D-220, already on `main`. PR #672 implements it, but nobody is handed its merge-up, review or landing. Its typecheck job is red only because the branch has no row: that job's scope step fails a branch without one.
- **Company discovery, universal search and the marketing line.** They are recorded only in open PRs #660, #645 and #661, and the register on `main` has no entry for any of them. AGENTS.md team rule 0 says a frozen decision is recorded in the register first.

D-219 (the banded pricing) and D-220 (the first look) already came from the same backlog through PR #720. This packet does the same for what is left.

## Row `first-look-24h-oct25` (Tier 1, lane `matching`)
**Branch.** `agent/queue/first-look-24h-oct25`, PR #672 (built by an Instinct session). The row keeps #669's id, so a later merge of #669 adds nothing twice.

**What it does.** It changes `OPPORTUNITY_FIRST_LOOK_HOURS` in `shared/companyOpportunities.ts` from 48 to 24, together with:
- its comments;
- the poster's notification body;
- the `/ask` composer line;
- the tests that pin them.

It leaves two things alone:
- **The D-038 claim lapse.** This is a separate 48 h rule (`shared/referral.ts`, `server/referralTimers.ts`), and D-220 says it stays.
- **The post-save copy** in `client/src/pages/explore/useAskComposer.tsx`. It reads the constant, so it changes without an edit.

**Build stage (merge-up).**
1. `git merge origin/main` into the branch; never rebase or force-push. It was 498 commits behind on Oct 27.
2. Resolve conflicts by keeping `main`'s code everywhere, then re-apply the 24 h change. On `main` the composer line is `client/src/pages/Ask.tsx` ("sees your ask first, for 48 hours").
3. Grep the owned files for any other `48` that means the first look, and change it. A `48` that means the claim lapse stays.
4. Run the affected suites:
   - `server/companyOpportunities.contract.test.ts`
   - `server/db.opportunityFirstLook.test.ts`
   - `server/firstLookRelease.test.ts`
   - `server/db.blockDelivery.test.ts`
   - `server/documentAccessLifecycle.test.ts`
   - `client/src/pages/ask.test.tsx`
   - `client/src/pages/exploreDrawer.test.tsx`

   Then run `pnpm check`.
5. Push and confirm that the required checks are green on the new head.

**Review.** One independent pass on the exact head, by a model that is neither Instinct (the builder) nor the merge-up builder (D-151). The reviewer checks four things:
- D-220's text against the diff;
- that the claim lapse is untouched;
- that `OPPORTUNITY_FIRST_LOOK_MS` is derived from the hours;
- that no user-facing line still says 48 hours for the first look.

**Landing.** Land with the merge-commit button (`gh pr merge 672 --merge`), and set this row to `done` in the landing pull request. Then add one line to D-220's status: "runtime 24 h since <sha>".

**Order.** Production has no posted roles at any of its 39 companies, so the rule is not visible to users yet. The row's place in the order is:
- It waits for `D-090-BYOR`, which is already built on PR #632. Both edit `server/db.ts`.
- `D-048-p3-live-review-find` waits for it, because both edit `client/src/pages/Ask.tsx`.
- `D-174-held-ask-reconfirm` waits for it, because both edit `server/db.ts`. The rest of the D-174 chain follows that row.

The 24 h rule is therefore in place before the job catalog makes posted roles real.

## Row `REGISTER-oct25` (Tier 1, lane `register`)
**Branch.** `agent/queue/register-oct25`, cut from `main`.

**Build stage.** Add one register entry, with the next free ID across `main` and every open branch, for each decision below. Each entry:
- quotes the owner's words and anchors exactly as the source gives them;
- states only what the source decides;
- lists `Affects tasks:` (D-202 (2)).

The three decisions:
1. **Automatic company discovery, and jobs from company career sites, with the seeker sent to our referral action rather than away to apply.** Source: PR #660, `docs/plans/DECISION-SYNC-discovery-oct25.md` at `8f46b80d`. Existing rows it affects: `D-174-job-catalog` (PR #650, flag off; the backlog record says it does not fulfil this), `D-174-job-sources-more` and `D-174-seeker-journey-build`. Add one `architect` row only if no existing row covers discovery.
2. **One universal search box (job keywords, companies, location), and the updated seeker journey.** Source: PR #645, `docs/SEEKER_JOB_JOURNEY.md` Part D at `4550655c`. Record only Part D's entries whose anchors are owner words. Existing rows: `D-174-company-search` and `D-174-seeker-journey-build`. Part D notes that the universal box supersedes paste-only entry; the entry says so as a "changed by" note on the older entry.
3. **The marketing line "Rule #1: Never cold-apply. Check if you can get referred first."** Source: `docs/IMPLEMENTATION-BACKLOG-oct25.md` section 3 and PR #661. It is copy, so D-153 (promise only what works today) applies; the entry names the pages where the line may appear. Affects `BRAND-OG-1` (PR #680), which uses the line and has no row on `main` yet.

Before writing each entry, read every register entry from D-174 to the newest one (D-174, D-176, D-189, D-193 and D-219 to D-223 at least). If a source says something a newer entry changed, record the newer rule's limits in the new entry, for example: no availability status (D-176), and requests never expire (D-174). If the two contradict and the register names no winner, stop and report the row blocked, naming both. Do not choose.

**Review.** One independent pass on the exact head, by a model that is neither Instinct (which wrote all three sources) nor the builder (D-151). The reviewer checks three things:
- each entry quotes its source exactly;
- the new entries add no rule the source lacks;
- they sit consistently with every newer entry.

**Landing.** Land with the merge-commit button, and set this row to `done`. Then comment on #660, #645 and #661 that their decisions are recorded under the new IDs, and leave closing those pull requests to the owner.

## Not in this packet
#669 also registers rows for:
- `REVIEWER-ISOLATION-1` (PR #678, security);
- `BRAND-OG-1` (PR #680, which conflicts with `main`);
- `pricing-banded-plans-oct25` (on `main` as `PRICING-banded-oct25`);
- `device-signin-requirements-oct25` (PR #667, merged);
- `implementation-backlog-oct25` (PR #668, merged);
- seven `backlog-oct25-*` architect rows, most of them now covered on `main` by `PRICING-banded-oct25`, `DEVICE-SIGNIN-passkeys`, `D-048-dark-mode` and the D-180 wording rows.

`REVIEWER-ISOLATION-1` and `BRAND-OG-1` own files that about fifteen open rows also own, so their place in the order needs its own pass. The CEO's report to the owner lists them.

## Status
- `first-look-24h-oct25: in-review — PR #672, merge-up then review`
- `REGISTER-oct25: todo`
