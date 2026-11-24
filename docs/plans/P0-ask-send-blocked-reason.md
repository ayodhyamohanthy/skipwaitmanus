# P0-ask-send-blocked-reason: Send is never silent on the ask drawer (D-019 P0, owner report Nov 24)

Tier 1 · lane `p0-ask-send` · branch `agent/queue/p0-ask-send-blocked-reason` · pull request #1548

## Why

Owner, Nov 24: on `/explore/go-neutrinos`, "Send referral request" did nothing after the job link, three
reasons and a resume; then "the errors are not clearly highlighted", "errors should be shown in red" and "if
there's any error show a toast. follow worldclass ui and ux and microcopy". A blocked `GoalButton` swallows the
click and keeps its reason for screen readers only, and the job-link mismatch that blocks Send on a company door
was grey text above the fold. A broken seeker flow is a P0 (D-019): fixed first, reported after.

## The fix (PR #1548)

The blocking reason shows beside Send; send errors use the crimson input-error line (`GoalFieldError`) at the
field and beside Send; a blocked press (`GoalButton.onBlockedClick`) raises one error toast (`goalErrorToast`,
problem then fix) and moves focus to the field to fix; server and network refusals toast too; no contradictory
hint and no repeated line. The same links stay blocked; no server, money or sign-in behaviour changes.
Evidence: `docs/qa/p0-ask-send-blocked-reason-2026-11-24.md` on the branch.

## Acceptance

Required CI green, then on the deployed web SHA: a mismatched link on a company door shows the red reason, a
toast and focus on the link field when Send is pressed, at 1280 and 390.

## Status

- P0-ask-send-blocked-reason: done — agent/queue/p0-ask-send-blocked-reason — PR #1548 (lands on green required CI; live check on the deployed web SHA follows)
