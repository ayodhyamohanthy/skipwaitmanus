# D-173-referral-words-goal-ui - catch-up registration for PR #598

Terminology shift (D-173, Oct 23): buyer-facing referral wording sweep over the
goal pages, implemented in PR #598 (branch agent/queue/ayo-referral-words).
Registered on that branch Oct 24 but never carried to main, so the picker has
never seen the row and no session has been routed to finish it - this packet
is the main-side registration. Historical inactivity is not a current-holder
acknowledgment or evidence that unpublished work does not exist.

## State at registration (Oct 26)

- PR #598 head fb4b6374, MERGEABLE, CI green but stale (run 40013196253),
  427 commits behind main, zero reviews.
- Scope on the branch: goal shell balance pill reads "N referrals" + the
  GoalInfoNote explainer + goal pages wording (UnifiedInbox, Onboarding,
  ProfileSetup, Landed, ShareHub, SuggestCompany, goal/* shells); test pins
  updated (appShell.test.tsx, myRequests.goal.test.tsx, goalComposites,
  goalInfoNote, goalShellHarness).
- Wording stays inside approved intent: no price, plan-allowance or
  outcome-promise change; money lines byte-identical until the pricing model
  lands; "It delivers your ask to verified employees - a referral itself is
  never promised" routed for review with the PR.

## Recovery route (historical, constrained by current repair below)

Any capable session except the original builder: forward-merge origin/main
into agent/queue/ayo-referral-words (never rebase, never force-push), push,
green CI on the exact new head, then one independent review by a session that
is neither builder nor fixer (D-151; the builder was an Instinct session, so
the reviewer must not be one). Related but separate: D-180-referral-words
(shared copy/nav), D-180-money-label (assistants family).

## Findings the takeover owner must resolve before landing (Oct 26 design review of fb4b6374)

1. Noun "ask" remains in the new GoalInfoNote body (GoalShell.tsx:70, pinned in
   goalInfoNote.test.tsx:12): "Referrals are what you spend to send an ask.
   Each ask shows its cost before you send; ..." Under the Oct 24 referral-only
   rule the mapping is Send ask -> Request referral, Ask sent -> Referral
   requested; rewrite the note accordingly (e.g. "send a referral request"),
   keeping requested -> accepted -> submitted stages and the
   "It delivers your request to verified employees - a referral itself is
   never promised" clarity line (the branch's current "A referral delivers
   your request - it is not a guaranteed referral" phrasing is muddled).
2. "Free plan: 3 free referrals every month" (same string) names an
   eligibility the Oct 25 frozen banded model ties to a verified card. D-042:
   the copy must match the behavior actually in force at build time - verify
   what the live free plan grants and word the true condition, or drop the
   sentence until the banded model ships. Do not invent money semantics by
   word replacement.
3. Registry hygiene: this branch's assignments.json diff is whole-file
   formatting churn (+1706/-1694). After the D-173 row reaches main (#711),
   resolve by taking main's assignments.json wholesale - the branch should
   carry no registry diff at all.


## Current preservation and output order (main 7d69a3ce)

Preserve PR 598 at fb4b6374 and branch agent/queue/ayo-referral-words, plus
both original PR 711 packets/rows. No automatic takeover, close, deletion,
implementation adoption or current holder consent follows from this repair.
The registration writer is recovered from the original archived write/push
record, not merely the commit author label. Implementation assignment still
uses the ordinary picker and checks current holder/unpublished-work state.

Checked through D-281. Its pre-send neutral cost-line and post-save requested
stage remain compatible with this presentation-only slice; this slice never
restores availability, charge or outcome promises. D-282/D-283 affect other
rows. Existing D-222 now defines the shell count and its role boundary.
This row waits for that output, then adapts its old PR forward: no Coins icon,
no ambiguous mobile numeral, no referrer purchase link, no hidden referrer
count, no old exact "4 referrals" pin replacing "N referrals left". Preserve
D-222 loading, error/retry, zero and plain-text referrer states. The optional
explainer must not add a purchase affordance on referrer routes or promise an
unverified free/card allowance. Original pre-landing findings above stay.

Owns list records the eleven actual non-registry files changed in PR 598,
including its four alerts captures. That is a scope declaration, not approval
of those old pixels or wording. AppShell production logic stays with D-222;
this row must not add an unowned edit. Replace historical registry churn with
main's complete registry only once these preserved rows are on main.
No existing main row/wait is modified; D-180 waits for this row's shared test
outputs, not the reverse. Re-prove tests and refresh changed-state captures
on the eventual final implementation head. A green old CI is not acceptance.

Status: preserved registration repair only; no implementation change, review
verdict, takeover, merge, flag enable or live acceptance is asserted.
