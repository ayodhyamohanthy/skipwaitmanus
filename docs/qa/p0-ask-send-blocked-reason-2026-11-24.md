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

`sendGuidance` now also shows the job-link mismatch sentence beside Send. Nothing else changes: the
same links are blocked, the server check at send is unchanged, and no copy is new.

## Evidence

- **Live reproduction (before):** Playwright against skipwait.me (web `eeda4afd`, API `b4f034d7`) with a
  faked session in the browser only (every write fulfilled locally, no request reached the API but the
  public company reads and `POST /api/job-link/preview`). With `https://boards.greenhouse.io/stripe/jobs/5512345`
  Send stayed `aria-disabled="true"`, a click made no request, and the only reason was the `sr-only` text
  "This posting looks like stripe.com’s, not Neutrinos’." ([capture](p0-ask-send-blocked-reason/before-live-1280.png)).
  With Neutrinos' own careers page, its Keka postings, a LinkedIn link and a Naukri link, Send was
  enabled and a click started the resume upload, so those links were not the cause.
- **After:** the same session on the built fix shows the sentence beside Send at 1280 and 390
  ([1280](p0-ask-send-blocked-reason/after-1280.png), [390](p0-ask-send-blocked-reason/after-390.png));
  with `https://www.neutrinos.com/careers/` no line shows and Send stays enabled.
- **Tests:** red first, the new drawer test in `client/src/pages/explore/jobLinkPrefill.test.tsx` failed
  (no `ask-send-guidance` element) and passes; 207 tests across 17 composer, drawer and `/ask` suites
  pass; `pnpm check` and `pnpm build` pass.

## Not confirmed

The owner's exact link is not known, so this is the blocked-and-silent path reproduced, not proof that
it was the owner's case. Any blocked Send now states its reason beside the button. Live verification on
the deployed web SHA follows the landing.
