# Packet LEGACY-BRANCHES-oct24: register #595 and #596, split #566 (D-199)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-199) on Oct 24 2026 against `main` `4a8b32ee`.

Three pull requests from before the queue gate (D-166) fail CI only because their branch matches no queue row on `main`: [#595](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/595), [#596](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/596) and [#566](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/566). The coordinator's diagnosis on each is correct: the typecheck job fails at "Scope check" ("This branch matches no queue row"), and the one Vitest failure is the scope-check fail-open test. All product tests pass.

## 1. Rules applied (D-199)
- **No renaming and no gate bypass.** A branch keeps its name. A legacy PR becomes landable when the CEO registers a row on `main` whose `branch` is that PR's branch, through a reviewed `claude/` registry PR (the REGISTER-592 and REGISTER-oct24 pattern).
- **Only Claude Code adds rows.** A branch that carries its own copy of a row drops it at its next merge-up and takes `main`'s `docs/plans/assignments.json` unchanged.
- **One owner per surface** (D-167, D-189). A PR that spans surfaces other rows own is not registered. Its changes become source material for those rows.
- **Gates (D-200).** Tier 1 (#595) needs one independent PASS by a model other than the builder's (Instinct), plus fresh green required CI on its exact final head. Tier 2 (#596) lands on green required CI.

## 2. `D-048-fix-signin-click-loading` — #595 (Tier 1, sign-in)
- **Branch:** `agent/ayo7/signin-loading-click`, head `70705891` when registered. Built by Instinct Agent; user report phonemsg-01M5MXF1C8DQ86C6Y7TXJQY01X.
- **Scope:** `client/src/_core/auth.tsx` and `client/src/_core/authCompat.test.ts` only. `openSignIn` stops swallowing an explicit click while client auth is still loading; the click starts the server sign-in flow.
- **Unchanged:** the signed-in no-op, the same-origin `returnTo` guard, and server-owned authentication. No session is ever granted on the client. The login rule (D-030, D-049, D-057) is untouched.
- **Merge-up first.** Any session merges `main` into the branch, taking `main`'s `assignments.json` verbatim, which drops the branch's own copy of the row.
- **Accept when:**
  - The code diff against `main` is exactly the two files.
  - `authCompat.test.ts` shows a click during loading starting the server flow. It fails if the fix is reverted.
  - `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx` stay green.
  - Fresh required CI is green on the final head after this row is on `main`.
- **Review:** Tier 1, by a model that neither built nor fixed it: not Instinct, not the fixer's model (D-151, D-200). Record it with `node scripts/next-task.mjs --verdict pass|findings --task D-048-fix-signin-click-loading --as "<name>"`.
- **Evidence:** the verdict marker, the green run on the exact head, and the focused test output in the PR.
- **Open item, not a blocker:** the user's exact failing URL is unknown. This row fixes the documented mechanism (fixture evidence), and the original report stays open until it is reproduced.

## 3. `D-048-fix-send-ask-blocker` — #596 (Tier 2)
- **Branch:** `agent/ayo9/send-ask-blocker-ux`, head `94c417de` when registered. Built by Instinct Agent; user report phonemsg-01M5MXNSDQ0VJMG8M3MVQWT8JF.
- **Scope:** `client/src/pages/Ask.tsx`, `client/src/pages/Explore.tsx`, `client/src/pages/ExploreCompany.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/explore/useAskComposer.tsx` and the new `client/src/pages/askCta.test.tsx`. A blocked Send shows its actual reason next to the button, with a recovery link. Offline is stated separately.
- **Unchanged:** validation, eligibility, price, quote and the send contract. An incomplete form or a zero balance still sends no request.
- **Waits for `D-132-audit`.** The audit owns the same composer files and goes first as the money-core priority (D-146, D-197). After the audit lands, merge `main` and re-run the focused tests. `D-048-p3-live-review-find` waits for this row.
- **Copy:** new strings use D-180's vocabulary ("referral request"; for example "Your balance is too low to send this referral request."). No cost line, amount or quote wording changes; money units stay with the terminology lane (#598).
- **Merge-up first,** as in §2.
- **Accept when:**
  - The code diff is exactly the six files.
  - `askCta.test.tsx` covers each blocker reason, plus the offline state, and the recovery link's target.
  - The existing explore, ask and quote tests stay green.
  - Captures of a blocked Send at 1280 and 390.
  - Fresh required CI is green on the final head.
- **Review:** none separate. Tier 2 lands on green required CI (D-200).
- **Evidence:** the verdict, the green run, and the captures in the PR.
- **Open item, not a blocker:** the user's exact failing case is unverified.

## 4. #566 — not registered; split into the owning rows
- **Why not registered.** #566 (`agent/instinct/ayo7-conversation-goal`, Instinct Agent) changes four surfaces, each with its own owner row:
  - `/explore`, `/explore/:slug` and `/ask`: `D-174-seeker-journey-build`, then `D-048-p3-live-review-find` (D-193 (5));
  - `/queue`: `D-048-p3-live-review-queue`, already in flight as #565;
  - the seeker conversation: `D-048-p3-live-review-conversation`;
  - the referrer conversation: `D-048-p3-conversation`.

  A fifth owner would break D-167 and D-189.
- **Reuse.** When each of those rows is built, its builder may take the matching changes from #566 (a cherry-pick or a rewrite) that still fit D-174 and D-176, under that row's own review and owns.
  - The coordinator's merge-up kept `main`'s D-176 expectations in `explore.test.tsx`. Keep them: availability framing does not come back.
  - #566 itself never lands. It stays a draft for reference, and the last of those rows closes it with a pointer.

## Status
- `D-048-fix-signin-click-loading`: review — agent/ayo7/signin-loading-click — 3f7ef2a3 (red-first: reverting the `openSignIn` guard change fails the two click-during-loading tests, 2/13; focused auth 182/182; full gate 521 files green; required CI green on `3f7ef2a3`; diff against `main` is exactly `auth.tsx` + `authCompat.test.ts`; fixed by Qoder · bbc5, D-151 needs a reviewer of another model).
- `D-048-fix-send-ask-blocker`: done — a24347ef
