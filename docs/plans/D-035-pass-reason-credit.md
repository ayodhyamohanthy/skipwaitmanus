# Packet D-035: the referrer's pass reason decides the credit, and every pass surface uses the seven shared reasons

> Read `docs/BRIEF.md` first, then this packet. D-038-B must be live: this packet extends the release set it finished.

| Field | Value |
|---|---|
| Queue row | §3b `D-035` / `D-052-pass-reasons` follow-ups (claim under the money-rules tier) |
| Decisions | D-035, D-052, D-066 (4), D-076 (1) and (7), D-021 |
| Risk tier | 1 |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/d035-pass-credit` |
| Depends on | D-038-B live |
| Do not run at the same time as | D-035 Send again (next packet), or anything editing pass or transition code |
| Verified against | `main` `e6b87f8` plus the D-038 packets' targets |

## 1. Goal
When a verified employee passes on an ask they picked up:
- if the reason is not fixable (wrong team, role closed, at capacity, "prefer not to say", "I only refer people I know"), the seeker should not pay for that pickup: the credit is released;
- if the reason is fixable (needs more experience, not enough context), the credit stays spent as payment for the review;
- either way the seeker sees what the employee said, never who said it, and the ask stays open to colleagues (D-021);
- every surface where a referrer can pass offers the same seven reasons, with nothing preselected and no credit effect shown.

## 2. Binding rules (quoted)
- D-035: "A not-fixable reason releases the credit; a fixable reason keeps it spent, as payment for the review … The seeker sees 'A verified employee at <Company> said: <reason>', never the referrer's name … D-021 is unchanged: the declined ask still reopens to colleagues."
- D-052: fixable = "Role needs more experience" and "Not enough context"; not fixable = "Not my team or function", "At capacity right now", "Prefer not to say", "Role is closed", "I only refer people I know". "The referrer always picks a reason actively; there is no default on any surface."
- D-066 (4): "The pass-reason picker never shows the credit effect to the referrer."
- D-076 (1) (release semantics) and (7): "a pass without one of the seven reason codes counts as not fixable, so the credit is released."

## 3. Current behaviour (verified)
1. `shared/passReasons.ts` holds 7 codes with a `fixable` flag (only `needs_experience` and `not_enough_context`), a legacy mapping, and `passReasonSeekerLabel`.
2. `passReferralRequestTx` (`server/db.ts`, about 2035) writes transition `action: "pass"` for every pass, and a `referralRequestPasses` row with `reason` (legacy enum) and `reasonCode`. The seeker notice says the ask is open again, with the reason label in brackets.
3. One surface still offers only the 3 legacy reasons and sends no `passReason`: the email review page (`client/src/pages/EmailReviewAction.tsx`). The `/queue` opened-request decline (`client/src/pages/MyCompanyInbox.tsx` with `client/src/components/goal/GoalPassReasons.tsx`) and the thread (`client/src/components/thread/ThreadDecisionPanels.tsx`) already use the shared 7 and send `passReason`; that queue surface is unchanged and pinned by `client/src/pages/myCompanyInbox.pendingStates.test.tsx`. (The older `CandidatePreviewCard.tsx` and `PassPrivatelyPanel.tsx` are gone after the goal-UI migration.)
4. Consumers of the action name `pass`:
   - `server/flowBaseline.ts` (`DECISION_ACTIONS`, `ACTIVITY_ACTIONS`);
   - `server/notificationKinds.ts` (`pass` → `ask_passed`);
   - also `server/companyResponseSignal.ts`, `getPrivateReferrerImpactSummary`'s local decision set in `server/db.ts`, and `listRefundsAfterPickup` in `server/dailyMoneyCheck.ts`; the first two count a pass as a decision, the last decides whether a refund is a leak. Round 1 missed the last three.
5. After D-038-B, `referralWasClaimedTx` treats {`claim`, `claim_lapse`, `referred_lapse`, `step_back`} as the pickup-or-release set: the latest must be a `claim`.

## 4. Target behaviour
1. **Action names.** A pass whose code is not fixable, or which carries no code (legacy), is recorded as transition `action: "pass_release"`. A fixable pass stays `action: "pass"`. Everything else in `passReferralRequestTx` is unchanged: the pass row, revoked grant, released slot, deleted save, consumed link, reopen.
2. **Release set.** `referralWasClaimedTx`'s set adds `pass_release`. A fixable pass is not in the set, so an earlier claim stays the latest pickup and the credit stays spent (today's D-021 behaviour).
3. **Seeker notice** for a pass on an ask the referrer had claimed. Title "Update on your referral request — <company>". The body has three parts:
   - opening: "A verified employee at <company> said: <label>.";
   - middle: "Your ask is open again to other verified employees there.";
   - closing, by kind:
     - not fixable: "If nobody picks it up, your credit comes back, " + `CREDIT_ENDED_CAVEAT` + ".";
     - fixable: "Updating your profile or note can help the next employee decide." (no promise of "Send again" yet; the next packet adds it).

   An unclaimed pass keeps today's notice. Never include the referrer's name. `<label>` is `passReasonSeekerLabel(code)`; for a legacy pass with no code, omit the opening.
4. **Legacy surfaces.** `client/src/pages/EmailReviewAction.tsx` offers the shared seven reasons (`PASS_REASON_OPTIONS`) with nothing preselected and no credit wording; each reason button records the pass immediately. It sends `declineReason` (legacy, from the mapping) plus `passReason` (the code), like the thread and the queue decline already do (`client/src/pages/MyCompanyInbox.tsx` + `client/src/components/goal/GoalPassReasons.tsx`, unchanged).
5. **Consumers.**
   - `server/flowBaseline.ts`: add `pass_release` to `DECISION_ACTIONS` and `ACTIVITY_ACTIONS`, so the weekly "Passed" outcome counts both.
   - `server/notificationKinds.ts`: map `pass_release` → `ask_passed`.
   - `server/notificationKinds.test.ts`: add the case.
   - `server/companyResponseSignal.ts`: count `pass_release` as the company's first decision.
   - `server/db.ts` (`getPrivateReferrerImpactSummary`): count `pass_release` in the reply-latency decision set.
   - `server/dailyMoneyCheck.ts`: `listRefundsAfterPickup` treats `pass_release` as a release (otherwise every correct D-035 refund alerts as a leak), and `released_pass_unrefunded` checks the terminal refund.
6. **Copy.** `shared/moneyCopy.ts` `CREDIT_RULE` and `CREDIT_RULE_SHORT`: "once someone picks the ask up, the credit stays spent, even if they pass" becomes "once someone picks the ask up, the credit stays spent, unless they pass for a reason you can't fix". Keep the D-063 sentence.
7. **Unchanged.**
   - The referrer never sees a credit effect (D-066 (4)).
   - D-021 reopen.
   - Unclaimed passes never move money (nothing was picked up).

## 5. Files
- **In scope:**
  - `server/db.ts` (`passReferralRequestTx`, `referralWasClaimedTx`, and `getPrivateReferrerImpactSummary`'s decision set);
  - `server/flowBaseline.ts`, `server/notificationKinds.ts`, `server/companyResponseSignal.ts`, `server/dailyMoneyCheck.ts`;
  - `shared/moneyCopy.ts`;
  - `client/src/pages/EmailReviewAction.tsx`, `client/src/content/guides.ts`;
  - tests in §7 (including `client/src/pages/ask.test.tsx`);
  - docs in §9.
- **Out of scope:**
  - Send again (next packet);
  - `shared/passReasons.ts` labels (already D-052);
  - legal pages (owner);
  - the unrouted `client/src/components/referrer/ReferrerCockpit.tsx` (dead; F-2 removes it).

## 6. Steps (one commit each)
1. Red-first tests.
2. `pass_release` and the release set (§4.1, §4.2).
3. Seeker notice (§4.3).
4. Consumers (§4.5) and copy (§4.6).
5. Legacy surfaces (§4.4).
6. Docs.

## 7. Tests to write first
In `server/db.referralPassReopen.test.ts` (its bespoke fake supports this path), plus client tests:
1. **"a not-fixable pass after a claim releases the credit".** Claim, pass `role_closed`, then expiry: exactly one refund (`expiry_refund`); withdraw instead: one `withdrawal_refund`. The event action is `pass_release`.
2. **"a fixable pass after a claim keeps it spent".** Claim, pass `needs_experience`, then expiry: no refund; the event action is `pass`.
3. **"a legacy pass with no code releases".** A one-click decline with only `declineReason`.
4. **"the seeker notice names the reason, never the referrer"**, with exact strings for both kinds (§4.3).
5. **"an unclaimed pass moves no money and keeps today's notice"** (L294 control).
6. **"the queue decline and the email review page offer the seven reasons with nothing preselected and send passReason"** (`client/src/pages/myCompanyInbox.pendingStates.test.tsx`, `client/src/pages/emailReviewAction.test.tsx`).
7. **"the weekly baseline counts pass_release as passed"** (`server/flowBaseline.test.ts`).
8. **Controls:** every other test in `server/db.referralPassReopen.test.ts`, `server/declineRouting.test.ts` (its source pins: `passReferralRequestTx` call, `status: "passed"`, `toStatus: "pending"`, the exact patch), `server/referrerOneClickReview.test.ts` and `server/rewardIntegrity.test.ts`.

## 8. Edge cases and races
- **Two passes in quick succession** (claimer, then a colleague on the reopened ask): each writes its own row; only the claimer's pass can be a release. A colleague's unclaimed pass never moves money.
- **A pass after D-038 lapses:** the lapsed referrer is excluded and cannot pass.
- **An old ask passed before this ships:** its event is `pass`, so it keeps today's spent credit. Nothing is backfilled.

## 9. Definition of done
- [x] Gate, draft PR and independent review. Gate green on `2acf64be` (tsc, full vitest in 4 shards, build); draft PR #471. The independent Tier 1 review is the landing gate (D-082), not part of this build.
- [x] Round-2 review fixes on `5ff49788`: `listRefundsAfterPickup` and the referrer reply-latency set read `pass_release`, the packet's queue-surface and file references are corrected, and the refund-kind assertions are added; CI green on that exact commit (local gate green except this host's bash 3.2 migration lint, which the Ubuntu CI runs). Re-review remains the landing gate.
- [x] Docs: `docs/DECISIONS.md` D-035 and D-052 sync cells, the `AGENTS.md` living-map referral and credit rows, plan §6 (the legal lines in Terms, Refund and Cancellation that still say a decline keeps the credit spent, listed for the owner; agents do not edit legal text). Owner note: no legal line needed a hand edit — the Terms and Refund pages render `moneyCopy`'s CREDIT_RULE, so the new wording flows through; policyPages.test.tsx was aligned to assert it. The living-map row already reads "a referrer's decline reason decides what happens to the credit (D-035)".
- [x] One check added to `server/dailyMoneyCheck.ts`: `released_pass_unrefunded`, any ask whose latest pickup-or-release event is `pass_release` and that then closed by expiry or withdrawal without exactly one refund row.
- [ ] Live check; row done.

## 10. Review checklist
1. Is the credit effect decided only on the server from the code (never from the client's label)? Is an unknown or absent code treated as not fixable?
2. Does any referrer-facing surface show a credit effect or a preselected reason?
3. Do the baseline and notification kinds handle `pass_release` everywhere `pass` was handled?
4. Is the seeker notice free of the referrer's identity on every path, including the email review link?

## 11. Stop and ask if
- A pass path does not go through `passReferralRequestTx`.
- A surface sends a code outside the seven.

## 12. Owner questions
None open (D-076 (1), (7)).
