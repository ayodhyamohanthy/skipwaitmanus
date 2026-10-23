# Referral queue: goal-first review packet

This branch proposes “Help the right person get referred.” as the queue’s goal. Before selection, the single commit opens the next ask. After selection, the bordered next-step block contains Accept & connect; Pass privately remains a ghost action. The company’s official-process attestation stays directly above Accept and in its keyboard help.

## What changed

The queue now explains the goal and next decision instead of opening on a list label. A failed private preview offers an explicit retry and cannot be accepted while unavailable. Decision failures are announced in the visible detail, not the phone-hidden list. J/K/P/A shortcuts pause during the pass dialog or a decision save, and ignore form controls. Claimed requests navigate to their conversations consistently through rows, deep links, next-step and previous/next controls. A successful acceptance opens that conversation directly. The detail heading no longer has a duplicate HTML ID.

## Behaviour carried over from the pre-426 kit

Compared with `c1690f40^1:client/src/pages/MyCompanyInbox.tsx` and its auth, pending-state, server-access and unhandled-rejection tests:

| Behaviour | Evidence in this branch |
| --- | --- |
| Signed-out referrer goes to sign-in; no private inbox read | `myCompanyInbox.goalReview.test.tsx` |
| Server-verdict verification, checking, unverified and retryable-error states; verified personal SSO account allowed | Existing `myCompanyInbox.serverAccess.test.tsx`, unchanged |
| Open one private capacity slot; routed new asks plus saved asks, deduplicated; no scope tabs or pager | Existing auth and empty-state tests |
| Role, HMAC public reference, function, dates/countdowns and honest queue count | Existing auth and pending-state tests |
| No seeker name or resume filename before acceptance; locked document count only | Existing auth tests plus synthetic identity/file traps in the goal-review tests |
| All seven existing pass codes and legacy mappings; no acceptance attestation on a pass | Parameterised goal-review tests; no credit endpoint requested |
| Cancel records nothing; private pass posts only after a reason choice | Existing pending-state tests, unchanged assertions |
| Load-error recovery, accept-race feedback, slow-load copy, no unhandled secondary rejection | Existing pending-state and unhandled tests |
| Successful acceptance hands off to its own conversation | Restored direct-navigation regression; claimed deep links have a separate no-preview regression |
| Official-process attestation on both click and A | Existing P1 tests retained; keyboard tests now wait for the preview to be ready |
| Send-time pinned-work snapshot and safe links | Existing pinned-work tests, unchanged |

The kit’s card layout is intentionally replaced by the goal list/detail pattern. The old second Accept dialog/checkbox is not restored: the already-landed P1 ruling in `docs/plans/LIVE-OCT22-regressions.md` explicitly makes the visible sentence plus click/A the confirmation. Pass uses its existing reason sheet; Cancel and Escape still record nothing. No price, credit/refund rule, identity-disclosure rule, server route or feature flag changes are made here. The seven pass codes are existing API compatibility, not implementation of the rejected D-035 refund proposal.

## Visual and browser evidence

`list`, `selected`, `preview-error`, `decision-error`, `pass-dialog` and `empty-quiet` each have 1280px and 390px captures. `fixture.json` uses the fictional Quillmint company and synthetic account data; no real company is represented as open. `report.json` records zero horizontal overflow, zero page errors and no more than one primary action in all twelve cases. Browser assertions also press J/K while the pass dialog is open and confirm that its ask does not change.

To reproduce with the local Vite server on port 3012, run `node design/goal-ui/captures/queue/goal-review/capture.mjs`. The script mocks the HTTP boundary; it sends no live asks, decisions, emails or payment requests.

## Review boundary

This is a Tier 1 builder packet, not an independent approval. The draft PR must receive an eligible independent review and green checks on its exact landing candidate before any merge or deployment. D-106 and the blocked PR #557 landing slot remain untouched.
