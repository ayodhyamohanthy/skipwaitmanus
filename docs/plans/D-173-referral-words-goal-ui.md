# D-173-referral-words-goal-ui - catch-up registration for PR #598

Terminology shift (D-173, Oct 23): buyer-facing referral wording sweep over the
goal pages, implemented in PR #598 (branch agent/queue/ayo-referral-words).
Registered on that branch Oct 24 but never carried to main, so the picker has
never seen the row and no session has been routed to finish it - this packet
is the main-side registration (D-085 recovery: a claim quiet over 2 hours has
nobody on it; the owner session has been quiet since Oct 24).

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

## Recovery route

Any capable session except the original builder: forward-merge origin/main
into agent/queue/ayo-referral-words (never rebase, never force-push), push,
green CI on the exact new head, then one independent review by a session that
is neither builder nor fixer (D-151; the builder was an Instinct session, so
the reviewer must not be one). Related but separate: D-180-referral-words
(shared copy/nav), D-180-money-label (assistants family).
