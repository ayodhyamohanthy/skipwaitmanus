> Status (Oct 18 2026): historical record — where it conflicts with docs/DECISIONS.md, the register wins (notably D-034, D-038, D-061, D-062).

# Designs for queue tasks 17 and 18 (DESIGN ONLY, nothing built)

Both touch money-adjacent state (asks and credits), so nothing ships until approved. Facts below are from code reads on main at 9c10748; real-DB behaviour not verified.

## 17: inbox-list-enrichment + referrer-preview-expiry + ask-quality-signals
Touches expiry display and referrer inbox payloads. Read-only presentation, no state change, no sends, no credit path.
- Inbox rows (`GET /api/company-referrals/inbox`): add `jobTitle` (jobs.title), `jobFunction`, `askStrength`, quality flags (`officialLinkIncluded`, `fitNoteIncluded`, `resumeAttached`) and `fitNoteExcerpt` (personalPitch trimmed to 280 chars, plain text). Privacy check: the referrer already sees this content in the review preview, so no new disclosure; the excerpt must stay behind the same identity gating as the preview (seeker name never included, task 14 semantics).
- Expiry: the preview prefixes "Expires today / tomorrow / in N days." using the existing `askDaysLeft` in `shared/referral.ts` computed from request createdAt. It does NOT change when asks expire, and does not touch `ask-expiry-sweep` or any credit semantics (an expired unclaimed ask is the existing path; claimed asks never refund).
- Quality flags: computed on read from stored fields. No server-side enforcement at ask-create (task 9 slice B stays held).
- Risk: low. Open question: askStrength formula is the shared/askQuality client logic; reuse it server-side on read only.
- Ship: one API PR, no migration.

## 18: referrer-capacity-routing + named-referrer-visibility
Touches routing of asks and what referrers/seekers see. Design-first because it changes who receives an ask.
Current state: `referralCapacity`, `preferAreas`, `preferLevels` are saved by PUT /api/referrer-preferences. `companyDirectory.ts` already has an `allocatedSlots < referralCapacity` check for allocation; `prepareReferrerReviewEmailNotifications` (who gets the review email) does not consult capacity, areas or levels. Capacity "left" in the UI is computed from active load, not monthly usage.
Proposal in three separable PRs:
1. Read model, no behaviour change: GET /api/referrer/home with `capacity.usedThisMonth`, `capacity.left`, `routing.state` (active / paused / at_capacity). Definition of "used this month": asks the referrer accepted or claimed in the calendar month (founder to confirm).
2. Notification routing only: skip review emails for paused or at-capacity referrers and for referrers whose function/level preferences exclude the job. Fail-open when data is missing (a referrer with no preferences gets everything, as today). The ask itself, its state, and credits are untouched, so an ask with no eligible notified referrer still waits as today.
3. Visible-ask filtering in the referrer inbox by preferences: HELD until 2 is verified. This is what could make an ask invisible to a referrer who could have helped, which risks a seeker paying credits for an ask nobody sees.
Credits: nothing here refunds or spends; ask expiry for an unanswered ask follows existing behaviour. Open founder questions: (a) does at-capacity mean the referrer stops getting email only, or also stops seeing new asks? (b) monthly usage definition above, (c) should a seeker be told when no referrer is currently available.
- named-referrer-visibility: separate, small. Make stored `referrerVisibility = "named"` publish name and headline on the company page and /p/:handle. That is disclosure of a person's identity: needs founder OK on defaults (anonymous stays default) and copy before any build.

## Recommendation
Build 17 now (read-only, no migration) if approved. Build 18 PR 1 (read model) next. Hold 18 PR 2/3 and named visibility for founder answers.
