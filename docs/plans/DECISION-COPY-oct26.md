# Packet DECISION-COPY-oct26: user-facing lines that still state a superseded decision

> Read [`docs/BRIEF.md`](../BRIEF.md) first, then this packet. Written by Claude Code under D-218 (the Oct 26 decision audit). Copy only: no money, routing, flag or schema change.

| Field | Value |
|---|---|
| Queue row | `DECISION-COPY-oct26` in `docs/plans/assignments.json` (status lives there) |
| Decisions | D-034 (a referral is spent only when a verified employee can see the request), D-147 (any employee decline keeps it spent; the referrer never sees a credit effect, D-066 (4)), D-176 (no availability framing), D-216 (banded pricing; old plans and packs not sold), D-153 (writing rule), D-173/D-180 (referral words) |
| Risk tier | 2 (copy and the tests that pin it) |
| Verified against | `main` `ad8bbb23` on 2026-10-26 |

## 1. The lines (each states a rule a newer decision replaced)
| File:line | Says today | Replaced by | Target |
|---|---|---|---|
| `client/src/components/referrer-home/WaitingAsks.tsx:29` | "Waiting on you · releases the credit if you pass" | D-147, D-066 (4) | Drop the credit clause: a referrer never sees a credit effect, and a pass releases nothing. |
| `client/src/components/referrer-home/WaitingAsks.tsx:38` | "Seekers can now find a verified referrer at X" | D-176 | Say what the referrer gets ("Referral requests for X now reach you privately"), never that the company is open or available. |
| `client/src/components/alerts/SavedAlerts.tsx:31` | "Free: 3 alerts · Momentum and Land: unlimited" | D-146, D-216 | Show only the Free limit; no retired plan names. Update `savedAlerts.test.tsx`. |
| `client/src/pages/Help.tsx:16` | "paid plans allow more" open asks | D-216 | State the Free limit only; no unsold paid plan. Leave line 17 (7-day expiry) alone: it is true of runtime until `D-174-expiry-clock-removal` lands, which owns that copy. |
| `client/src/content/guides.ts:80` | "The credit leaves your balance when you send a request" | D-034 | A referral is used only when a verified employee can see the request. Keep the rest true of runtime. |
| `client/src/pages/ForCompanies.tsx:62` | "PEOPLE OPEN TO REFERRALS AT LAUNCH" | D-176 | A label with no availability claim (for example "Companies on skipwait.me"). Update `forCompanies.test.tsx`. |
| `client/src/components/VisualJourney.tsx:15` | "Look for a company with someone available to refer" | D-176 | "Search a company, pick a job, request a referral" (D-174 journey); no availability. |

Not in this row: `client/src/pages/explore/useAskComposer.tsx:527` ("This company just opened up to referrals", D-176) belongs to `D-048-fix-send-ask-blocker`, which owns that file. The `slot_open` alert text in `server/db.ts` waits for a ruling on the notify-me feature under D-176 and D-193 (6). Money lines in `shared/moneyCopy.ts` stay with the D-180 wording rows.

## 2. Tests first
Before changing any line, make the existing pins (`savedAlerts.test.tsx`, `forCompanies.test.tsx`, `trustCluster.test.tsx` where it pins guides) assert the new rule; they must fail on today's code. Add one test that `WaitingAsks` renders no "credit" text.

## 3. Proof (rule 8)
`pnpm check`, the focused tests, `pnpm build`, the design-token audit, and captures of `/for-companies`, `/help` and the referrer home at 1280 and 390.

## Status
- `DECISION-COPY-oct26`: registered by D-218 (Oct 26 audit); todo.
