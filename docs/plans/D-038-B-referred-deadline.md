# Packet D-038-B: an accepted ask must be marked "Referred" within 5 days, or it reopens to colleagues with the credit released

> Read `docs/BRIEF.md` first, then this packet. D-038-A must be live; this packet extends its job, its exclusion codes and its "pickup since release" rule.

| Field | Value |
|---|---|
| Queue row | §3b `D-038-B` (add it when you claim, under the money-rules tier) |
| Decisions | D-038(b), D-066 (2) and (3), D-076 (1), (4), (5), (8), (9), D-019(e) |
| Risk tier | 1 (credits and privacy: grants close on reopen) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/d038-b-referred` |
| Depends on | D-038-A live |
| Do not run at the same time as | D-035 or anything editing accept, progress or transition code |
| Verified against | `main` `e6b87f8` plus D-038-A's target |

## 1. Goal
An acceptance is not a referral. Today an accepted ask can sit forever without anyone submitting the referral, and the seeker cannot tell. After this packet:
- the accepting referrer has 5 days to tap "Referred", with one 3-day extension;
- the seeker can confirm "I got the referral email";
- a missed deadline, or the referrer stepping back, reopens the ask to colleagues, closes the referrer's access to the seeker's name and files, and releases the credit;
- the admin panel shows the new north-star number: asks referred within 7 days.

## 2. Binding rules (quoted)
- D-038(b): "After accepting, the referrer has 5 days to tap 'Referred — submitted in our system' (reminders on day 2 and day 4; one 'need 3 more days'); the seeker can confirm 'I got the referral email'. If the deadline passes, the seeker is told plainly, the ask reopens to colleagues and the credit is released. New north-star metric: asks referred within 7 days."
- D-066 (2): "After accepting, a referrer can step back with 'I can't refer this after all': no fault, the credit is released and the ask reopens to colleagues." D-066 (3): "An ask closed before 'Referred' never counts as a referral."
- D-076 (4), (5), (8), (9) as written in `docs/DECISIONS.md`.
- D-019(e): "A referrer sees no seeker name or resume … until that referrer accepts." After a reopen, that referrer's access must end.

## 3. Current behaviour (verified)
1. Acceptance records a transition with resulting status `approved`: one-click and email link (`oneClickReviewReferralRequest`, action `approve`) and `/review` (`reviewReferralRequest`). `transitionReferralRequestTx` opens the accepter's document grant and releases their slot.
2. `updateReferralProgress` (`server/db.ts`, about 2911) moves forward only: `approved → intro_made` (the referrer's "Mark as referred", optional `referenceId`), then `interview`, `offer`, `closed`.
3. Document access needs an accepted status *and* the referrer's own recorded acceptance; a revoked grant always wins (`server/referrerDocumentAccess.ts`).
4. Nothing times an acceptance today.

## 4. Target behaviour
1. **Deadline.** Due at `max(acceptEvent.createdAt, REFERRAL_TIMERS_SINCE) + 5 days`, or + 8 days once a `referred_extension` event exists. `acceptEvent` is the latest event with `resultingStatus = "approved"`. Add the helpers `referredDueAtMs(acceptedAt, extended)` and the reminder times (day 2, day 4) in `shared/referral.ts`.
2. **Reminders.** Day 2 and day 4, one each, `eventKey` `referred-reminder:<acceptEventId>:2` and `:4`, in-app. Title "Did you submit the referral?"; body "When you have referred them in <company>'s system, tap Referred so they know. If you can't, you can step back with no fault."
3. **"Need 3 more days".** The accepting referrer, while the ask is `approved` and before the deadline, once per acceptance:
   - transition `referred_extension`, `approved → approved`, `operationKey: referred-extension:<acceptEventId>`;
   - a second press is a replay (unique key), not an error;
   - route `POST /api/company-referrals/:id/extend-referred-deadline`, authenticated, accepting referrer only, 409 when not allowed.
4. **"I got the referral email".** The seeker, while the ask is `approved`:
   - transition `seeker_confirmed_referred`, `approved → intro_made`, actor = seeker;
   - route `POST /api/company-referrals/:id/confirm-referred`, seeker only;
   - either this or the referrer's existing mark stops the clock.
5. **Missed deadline.** One transaction under the row lock:
   - transition `referred_lapse`, `approved → pending`, actor = the accepting referrer, `operationKey: referred-lapse:<acceptEventId>`;
   - patch `{ referrerId: null, referrerMessage: null }`;
   - revoke that referrer's document grant (`revokeReason: "referred_lapse"`);
   - exclusion row `lapsed_referred`;
   - seeker notice: "Update on your referral request — <company>" / "The employee who accepted didn't confirm the referral within the deadline. Your ask is open again to other verified employees at <company>. If nobody picks it up, your credit comes back, " + `CREDIT_ENDED_CAVEAT` + ".";
   - referrer notice, neutral: "An accepted ask went back to your colleagues." / "It wasn't marked Referred in time, so it's open to other verified employees at <company> again."
6. **Step back.** The accepting referrer, while the ask is `approved` (not referred): the same as rule 5 with action `step_back`, exclusion code `stepped_back` and `operationKey: step-back:<acceptEventId>`.
   - Route `POST /api/company-referrals/:id/step-back`.
   - Seeker body starts "The employee who accepted stepped back, no reflection on you."
   - The referrer's private stats do not count it against them.
7. **Release set.** `referralWasClaimedTx`'s set becomes {`claim`, `claim_lapse`, `referred_lapse`, `step_back`}: the latest must be a `claim`. Add `"lapsed_referred"` and `"stepped_back"` to `REFERRER_EXCLUSION_CODES`.
8. **Job.** `referral-timers` gains two steps: referred reminders and referred lapses (same bounds, isolation and re-decide-under-lock rules as slice A).
9. **Referrer UI** (`client/src/components/thread/ThreadDecisionPanels.tsx`, accepted state): "Mark as referred by <date>"; "Need 3 more days" (hidden after use); "I can't refer this after all" with a confirm dialog: "Step back from this referral?" / "They'll be told kindly, and the ask opens to your colleagues. No fault."
10. **Seeker UI** (same file, seeker accepted state): "I got the referral email" with a confirm dialog: "Confirm you received the referral email from <company>?"
11. **North star (D-076 (9)).**
    - The admin baseline (`shared/flowBaseline.ts`, `server/flowBaselineSource.ts`, `server/flowBaseline.ts`, `client/src/components/admin/BaselineMetricsPanel.tsx`) adds the weekly count and share of asks whose first move to `intro_made` came within 7 days of first visibility (`coverageVisibleAt`, else creation), by the referrer's mark or the seeker's confirmation.
    - The new baseline field must be optional in the client schema (`client/src/components/admin/adminApi.ts` nests it), or the Admin Overview load fails while the API is older.

## 5. Files
- **In scope:**
  - `shared/referral.ts`, `shared/passReasons.ts`, `shared/flowBaseline.ts`;
  - `server/db.ts`, only: `referralWasClaimedTx` (set), new `extendReferredDeadlineTx` / `confirmReferredBySeeker` / `stepBackFromReferral` / `lapseReferredTx`, and the thread payload (`referredDueAt`, `extensionUsed`);
  - `server/referralTimers.ts`;
  - `server/privateReferralRoutes.ts` (three routes);
  - `server/flowBaselineSource.ts`, `server/flowBaseline.ts`;
  - `client/src/components/thread/ThreadDecisionPanels.tsx`, `client/src/lib/threadApi.ts`, `client/src/components/admin/BaselineMetricsPanel.tsx`, `client/src/components/admin/adminApi.ts`;
  - tests in §7;
  - docs in §9.
- **Out of scope:**
  - pass-reason credit effects (D-035);
  - emails (D-060);
  - any migration;
  - the public impact number (TRUTH-1);
  - the thank-you wall (PR #314: tell its owner the referred rule).

## 6. Steps (one commit each)
1. Red-first tests.
2. Shared clocks and codes.
3. Release set and lapse/step-back transactions.
4. Extension and seeker confirmation, with their routes.
5. Job steps.
6. UI.
7. North-star metric.
8. Docs.

## 7. Tests to write first
1. **"an accepted ask reopens 5 days after acceptance when nobody marked it referred".**
   - At accept+5d+1ms: status `pending`, `referrerId` null, one `referred_lapse` event, exclusion row, the grant revoked;
   - the referrer gets 404 on `GET /api/documents/:id` and loses the seeker's name in the thread payload;
   - the seeker notice matches §4.5 exactly.
2. **"the credit is released"**: after the lapse, expiry at the ask's window returns exactly one credit; withdraw returns it once. Control: an ask the referrer marked referred never refunds.
3. **"one extension moves the deadline to 8 days"**: there is no lapse at day 6; a second extension is a replay.
4. **"the seeker's confirmation stops the clock and counts as referred"**: status `intro_made`, no lapse at day 9, and the north-star count includes it.
5. **"stepping back reopens with no fault"**: as test 1 with `step_back`; the private impact stats exclude it.
6. **"reminders on day 2 and day 4, once each"**, even when the job runs repeatedly.
7. **"acceptances older than the deploy get 5 days from REFERRAL_TIMERS_SINCE"**.
8. **Authorization**: another referrer, the seeker calling extend or step-back, the referrer calling confirm-referred → 403 or 409; a blocked pair → the neutral denial.
9. **The admin baseline parses with and without the new field.**
10. **Controls:** every slice A test; `server/documentAccessLifecycle.test.ts`; `server/referralTransitionIntegrity.test.ts`, whose event-key template and write order stay unchanged.

## 8. Edge cases and races
- **The referrer marks referred while the lapse runs:** the first lock wins; the loser re-reads (`intro_made` means no lapse; `pending` means the mark is refused).
- **The seeker confirms while the referrer steps back:** the first wins. The second gets 409 with `currentState`.
- **DMs** between the two keep the D-012(3) rule as implemented today. Do not change the DM gate here; flag in the row whether a reopened ask leaves an open DM thread.
- **Time:** app clock only.

## 9. Definition of done
- [ ] Every §7 test was red first and is green now.
- [ ] Gate, draft PR and independent review.
- [ ] Docs: the `AGENTS.md` living map (referral row, scheduled-jobs row), `shared/moneyCopy.ts` `CREDIT_RULE` (add "or when an accepted ask wasn't referred in time"), and the `docs/DECISIONS.md` D-038 sync cell (done), D-066 and D-076.
- [ ] One check added to `server/dailyMoneyCheck.ts`: `referred_deadline_stuck`, any `approved` ask more than 24 hours past its referred deadline. Its credit release is overdue.
- [ ] Live check; §3b row done with evidence.

## 10. Review checklist
1. Does every reopen revoke the document grant and remove the seeker's name for that referrer, proven by a route-level test?
2. Is "Referred" reachable only through the referrer's mark or the seeker's confirmation, and does nothing else count as a referral in the new metric?
3. Are the reminders neutral, no more than D-038 lists, and idempotent?
4. Does the release set match D-076 exactly, and is it no broader (passes stay out until D-035)?

## 11. Stop and ask if
- An accepted ask can reach `pending` by some path other than the two in this packet.
- The DM gate reads the historical acceptance in a way that reveals the seeker after a reopen.

## 12. Owner questions
None open.
