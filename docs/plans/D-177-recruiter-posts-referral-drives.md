# D-177 - Recruiter/HR job posts and employee referral drives

Source: founder message, Oct 24, 2026 12:57 AM IST (phonemsg-01M5N3Q94QHYJK0VEHA3WBERS0, channel-verified, author=user). Verbatim:

> Now as we are showing jobs like career portals and linkedin inside our portal ,we should have recruiters or hr's posting job descriptions too , internal and public , job referrers can publish a internal job referral drive too which is very often happens in corporate

## What this decides

Company job feeds are not the only job source. Three new supply paths, all inside the existing company -> job -> ask journey (D-174-seeker-journey-build), not a competing surface:

1. **Recruiter/HR job posts, public.** A verified recruiter or HR person at a company can publish a job description that any seeker can see and ask against.
2. **Recruiter/HR job posts, internal.** A recruiter/HR person can publish a description whose audience is restricted (see the open question on what "internal" means). An internal description must never render on a public surface, in search, in sitemap, or in any logged-out response.
3. **Employee-published referral drives.** A verified employee (referrer) can publish an internal referral drive - the common corporate practice of "we are hiring for these roles, refer people." A referral drive is meant to be SHARED by employees, including externally; it is not an employee-only secret. Treating it as confidential would defeat its purpose, and treating an employee-only opening as shareable would leak it. These are different audiences and must not be conflated.

## Audience model (must hold before any build)

- **public**: anyone, logged out included. Safe for sitemap/search/prerender.
- **internal-restricted**: employee-only opening. Never leaves authorized surfaces; server enforces, not the client. Exact eligible audience (own-company employees only? employees + their referred candidates?) is an OPEN question below.
- **referral-drive**: published by an employee, intended for external sharing by employees. Public-by-design content with the author's consent, but the drive's existence/terms may still carry internal context (headcount, team) that needs an explicit publish-time confirmation from the author.

## Open questions (not resolved by the founder message; ask before build locks them)

1. What does "internal" mean for a recruiter post: visible to that company's verified employees only, or employees plus candidates those employees choose to refer in?
2. Who verifies a recruiter/HR identity at a company (same employer verification as referrers, or a new role)?
3. Does a referral drive carry any reward/terms fields, and do money-adjacent fields stay frozen under D-132 until its audit?
4. Moderation: can a company admin unpublish an employee's drive?

## Relation to existing work (context, not presumed satisfied)

- D-048-p3-post (todo): /post-opportunity + My openings + server posting verdict. D-177 extends this lane; it does not replace it. Reconciliation of scopes rides the implementation PR.
- D-048-P-employer (architect): employer lane packet; recruiter/HR roles likely live here.
- D-174-seeker-journey-build (todo): the company -> job -> ask journey these posts feed.
- #596/#597 (in review): send-ask/post-copy fixes; wording only, not posting supply.
- Coverage caution (Main, Oct 24): the founder's premise "we are showing jobs like career portals and LinkedIn" is NOT confirmed; current job coverage is limited. This packet adds supply paths; it does not assert existing coverage.

## Money boundary

No pricing, fee, credit, or reward amounts in this packet or its copy. Money lines stay byte-identical to D-132/D-152 until their audit. If referral drives later carry rewards, that is a new owner decision.

## Status

Recorded direction. Implementation rides the posting/employer/journey lanes; no code in this packet.
