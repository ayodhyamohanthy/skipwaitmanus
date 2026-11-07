# Packet D-048-fix-referrer-home-private-copy: the /referrer-home first-time empty state says requests reach you privately (D-176), not that people can find you

> A Tier 2 copy port plus one regression pin. It blocks Release 4 (D-048-R4, PR #1020): the distinct CEO session did not sign off head `effdfdde` because of this one finding (B1). It ports wording that was already decided. It needs no new product decision, flips no flag, adds no shared helper, and changes no admin, money or auth code.

## 1. The finding (B1)

- On main `e661b391`, `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx` line 85 is the empty state a new verified referrer sees when nothing is waiting (`view.isNew`). Its body reads:
  `People can find verified referrers${company ? ` at ${company.name}` : ""}. Share your profile when you are ready.`
- That is an availability claim ("people can find you"). D-176 replaced this substance in the kit on 2026-11-01. Commit `7ee6da33` (DECISION-COPY-oct26, `client/src/components/referrer-home/WaitingAsks.tsx`) changed the same empty state to say that requests reach the referrer privately:
  `Referral requests${company ? ` for ${company.name}` : ""} now reach you privately. Share your profile to help them find you.`
- The owner's original Oct 24 report says "open to requests" does not match his mental model: referrals route privately to existing and future referrers.
- The R4 kit-drift check confirmed WaitingAsks as "not to port" on a literal basis. That missed the semantic regression: the goal page restates the pre-D-176 substance in different words. This is a port of decided wording, not new copy.

## 2. The change (exactly this)

1. In `GoalReferrerHome.tsx`, the `view.isNew` body of the waiting-list `GoalEmptyState` becomes:
   `Referral requests${company ? ` for ${company.name}` : ""} now reach you privately. Share your profile when you are ready.`
   The title, the non-new body ("Your queue is clear for now.") and every other line stay as they are.
2. In `client/src/pages/referrerHomeGoal.test.tsx`, add a red-first regression pin. It renders the verified, new, nothing-waiting state and asserts that the body contains "now reach you privately" and does not contain "People can find verified referrers". Run it red on main first, then green on the fix.
3. Attach captures at 1280 and 390 of the changed empty state to the PR report.

Wording note for the reviewer: the first sentence is the kit's D-176 sentence verbatim. The second sentence keeps the goal page's existing "Share your profile when you are ready." as the coordinator proposed, instead of the kit's "Share your profile to help them find you." Pick nothing else. If the reviewer reads D-176 as requiring the kit's second sentence too, report it on the row; do not choose it silently.

## 3. Out of scope

- Do not edit `client/src/lib/goalSurfaces.ts` or any flag. R4 (PR #1020) keeps its own owns and re-runs its distinct CEO review after this row lands.
- Do not reopen a completed row (D-048-p3-referrer-home, D-048-fix-referrer-home-ux). This row waits for both and then edits the same file.
- Add no shared helper. If the patch needs one, amend owns first.
- Change no other copy or behaviour.

## 4. Open follow-ups carried from the R4 review (NOT resolved here, NOT for this row)

These stay open and non-blocking for this row. Do not implement them under B1 or report them as resolved:

- E1: the claimed review hybrid of kit Buttons.
- E2: missing GOAL_PAGE exports and the transitive guard.
- E3: GoalNextStep is nonstandard or missing on /referrer/impact, /post-opportunity and /invite.
- E4: the doctrine 1-7 review checklist is not run by name.

Evidence to carry into the R4 CEO delta:
- The four R4 ids enable six routes, including `/referrer/impact` and `/referrer-setup`.
- The PNGs committed in `fea15cda` are the Oct 27 surface-landing captures, not current R4 builder proof.
- The coordinator's 16 captures and the reviewer's 16 captures (fixture-only, signed-out and verified, 1280 and 390) exist. The distinct CEO session must receive the current pixels after this row lands and is reviewed.

## 5. Gates

Tier 2, UI copy plus test. Gates: tsc, token audit, scope-check (two owned paths), focused vitest with `VITE_GOAL_SURFACES=referrer-home`, the red-first pin, and 1280 and 390 captures. Then an independent non-writer review and a non-writer lander (D-190(3)).

## 6. Position and the R4 dependency (amendment, coordinator ruling 2026-11-07)

- This row sits directly before D-048-R4 in `docs/plans/assignments.json`, and D-048-R4's `dependsOn` gains this row's id. No other row moves. R4's id, branch, owns and review claim are unchanged. No completed row is rewritten. No avoid entry and no forced hand is added.
- Basis: D-223 (1) says dependsOn names only the output a task needs, and D-223 (3) says a release depends on all of its pieces. This row's output, the D-176 copy on a surface R4 releases, is such a piece. The distinct CEO held R4 head `effdfdde` on exactly this finding. The row is a missing prerequisite of a release already in flight, not unrelated work jumping the queue. D-223 (5) is respected: R4's in-flight scope (owns) is unchanged.
- FIFO: the owner's standing rule is FIFO ("FIFO always", Oct 31). The coordinator lines up already-decided tasks under the Oct 26 and Oct 29 delegation. Appended at the end, this row came after PICKER-land-exact-head, so the release prerequisite would have waited behind unrelated picker work while R4 stayed held. Placing it before R4 keeps FIFO for every other row.
- This is a coordinator ruling on placement, not owner approval of the exact ordering.
