# P0: "Send referral request" did nothing on /explore/go-neutrinos (Nov 24 2026)

Reported by the owner: on https://skipwait.me/explore/go-neutrinos, after a job link, three reasons and a
resume, pressing **Send referral request** did nothing. A broken seeker flow is a P0 (D-019).

## Cause

A blocked `GoalButton` swallows the click and keeps its reason for screen readers only (`sr-only`). On a
company door, a job link whose preview names another company blocks Send (`jobLinkMismatch`,
`client/src/pages/explore/jobLinkPrefill.ts`). The mismatch sentence showed only at the job-link field,
above the fold, and the guidance line beside Send (`sendGuidance` in
`client/src/pages/explore/useAskComposer.tsx`) covered offline and balance but never the job link. So the
seeker saw an outlined button that did nothing, with no reason in sight.

## Fix

Owner follow-ups, Nov 24: "the errors are not clearly highlighted", "errors should be shown in red", "if
there's any error show a toast. follow worldclass ui and ux and microcopy".

1. **Say why, beside Send.** `sendGuidance` now also shows the job-link mismatch sentence.
2. **Red.** Send errors and, once Send is pressed, the blocking reason use `GoalFieldError`, the crimson
   input-error line `GoalField` already drew (DESIGN.md rule 5: crimson is for input errors, seeker side). The
   mismatch line at the field and the reasons error use it too, and the link field is marked `aria-invalid`.
3. **A press is never silent.** `GoalButton` gains an optional `onBlockedClick`; the drawer uses it (and
   Cmd/Ctrl+Enter) to mark the attempt, raise the toast and move focus to the field to fix.
4. **Toast.** Every send problem raises one error toast (`goalErrorToast`, crimson icon, id
   `ask-send-problem`, so a second press replaces it): the problem as the title, the fix as the description
   where one helps ("Paste a job link from Neutrinos’ careers site, then send."). Server and network refusals
   toast as well. The inline red line stays, because a toast disappears and sits away from the field (inline
   errors plus focus are the accessible pattern; the toast is the headline, not the only place it lives).
5. **No contradictions, no repeats.** The grey "We’ll confirm it’s a … role when you send" hint is hidden
   under a link already known to be another company's, and a message is shown once beside Send.

Nothing else changes: the same links are blocked, the server check at send is unchanged, and no money,
sign-in or server behaviour moves.

## Evidence

- **Live reproduction (before):** Playwright against skipwait.me (web `eeda4afd`, API `b4f034d7`) with a
  faked session in the browser only (every write fulfilled locally, no request reached the API but the
  public company reads and `POST /api/job-link/preview`). With `https://boards.greenhouse.io/stripe/jobs/5512345`
  Send stayed `aria-disabled="true"`, a click made no request, and the only reason was the `sr-only` text
  "This posting looks like stripe.com’s, not Neutrinos’." ([capture](p0-ask-send-blocked-reason/before-live-1280.png)).
  With Neutrinos' own careers page, its Keka postings, a LinkedIn link and a Naukri link, Send was
  enabled and a click started the resume upload, so those links were not the cause.
- **After:** the same session on the built fix, after pressing Send: toast, crimson line at the field and
  beside Send, focus on the link field (`aria-invalid="true"`) at 1280 and 390
  ([1280](p0-ask-send-blocked-reason/after-1280.png), [390](p0-ask-send-blocked-reason/after-390.png)); with
  empty reasons, one crimson line beside Send, the toast and focus in the first reason
  ([390](p0-ask-send-blocked-reason/after-missing-reasons-390.png)). With
  `https://www.neutrinos.com/careers/` no line shows and Send stays enabled.
- **Tests:** red first, each new test failed on the code before it (no `ask-send-guidance` element; no
  `onBlockedClick`; no crimson error, toast or focus) and passes now: two drawer tests in
  `client/src/pages/explore/jobLinkPrefill.test.tsx`, one in `client/src/components/goal/goalAtoms.test.tsx`.
  899 tests across 85 composer, drawer, `/ask` and goal-primitive suites pass; `pnpm check`, `pnpm build` and
  `node scripts/design-token-audit.mjs` pass. `JobLinkFromPosting.tsx` joins the goal-boundary list: it is
  rendered only by the moved AskDrawer and Ask pages.

## Not confirmed

The owner's exact link is not known, so this is the blocked-and-silent path reproduced, not proof that
it was the owner's case. Any blocked Send now states its reason beside the button. Live verification on
the deployed web SHA follows the landing.
