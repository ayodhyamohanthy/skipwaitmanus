# P0-sandbox-isolation: real employees never see the demo seeker's sandbox requests, and the demo referrer can preview them (D-393)

Tier 1 · lane `p0-sandbox-isolation` · branch `agent/queue/p0-sandbox-isolation` · epic D-212 · no dependencies

## Why (found Nov 25 2026 by Claude Code · 43c8 while preparing OPS-live-qa-journeys)

D-393's hard limit: "A sandbox request must never reach a real person by any channel", and the demo referrer acts as
a verified employee of whatever company a sandbox request names. Read from `origin/main` (`server/db.ts`):

- `createCompanyReferralRequest` inserts a sandbox request with `referrerId: null`, `status: "pending"`, not waiting.
- **Defect A (privacy).** `listCompanyReferralInboxByState` scopes a real viewer by `jobs.company` alone, and its
  `scopedRows` filter shows `!row.referrerId` pending rows in "new". So every real verified employee at the named company
  sees the demo seeker's sandbox request in their inbox. `getUnclaimedCompanyReferralPreview` lets them preview its
  title and pitch. Claim and review already refuse them (`mayClaim`, `mayReview`).
- **Defect B (the sandbox does not work).** `getUnclaimedCompanyReferralPreview` has no sandbox branch, so the demo
  referrer (domain `reviewer.skipwait.me`) gets 404 for every sandbox request at a real company, although its inbox
  lists it. D-393 (5) requires the owner to be able to test pre-acceptance privacy in the sandbox.

## The fix (`server/db.ts`, one new test file)

- Inbox and preview use one two-way scope. The demo referrer sees its own domain or the sandbox seeker's requests. A
  real viewer sees its own domain and never the sandbox seeker's requests. The rest of each query is unchanged.
- `saveCompanyReferralRequest` gets the same real-viewer exclusion if it lets a real employee save a sandbox request.

## Tests (red first, `server/db.sandboxIsolation.test.ts`)

A sandbox request at `acme.com` is invisible to a real acme.com employee in the inbox and the preview, and is visible
and previewable, with no candidate name, for the demo referrer. A real request at acme.com is unchanged for the real
employee and invisible to the demo referrer.

## After landing

`OPS-live-qa-journeys` depends on this row: its dispatched run creates sandbox requests at a real company, so it must not
run before real employees are isolated from them. The packet's report says whether any sandbox request was already
created in production before the fix. That needs an admin read of `/admin/activity` for the demo seeker, an owner
action.

## Status

- P0-sandbox-isolation: in progress — Claude Code · 43c8 — 2026-11-25 — branch agent/queue/p0-sandbox-isolation.
