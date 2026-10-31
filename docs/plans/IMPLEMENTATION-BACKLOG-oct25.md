# Implementation backlog: owner decisions awaiting main (Oct 25 2026)

Canonical instruction record for implementation agents, written on the
owner's "Push all these to repo" (phonemsg-01M5SQ45KZCVGASZZ5K4BJX6H2,
following phonemsg-01M5SQ4BYZPC38C7JK4FXXTNAE "To implement"). Every item
is ALREADY DECIDED by the owner - this is not a proposal. Each entry names
its source anchors, where the work lives today, and the implementation
route. Gates stand: green required CI on the exact head + independent
non-Instinct exact-head review (D-151) before main; no money, no payment
rail activation, no native-domain exception without the owner.

## 1. Frozen banded pricing, replacing the old plans
Anchors: freeze phonemsg-01M5SNVZEY1P8K169J48T2HGTJ; replace
phonemsg-01M5SNY88BXE470FEN4Z0K7KWF; pause old pricing
phonemsg-01M5SP3S0WNXCX7F1V5Z3PDX9D; no customers phonemsg-01M5SP8S77FSARS87XF1TD8Y30.
Spec: bands Early to Mid ₹229/$4.49 (3E+1M), Mid to Senior ₹899/$17.99
(3M+2S), Senior to Executive ₹1299/$25.99 (3S+1Exec); top-ups ₹49/199/399/799
· $1/4/8/16; volume discounts 5/10/25/50/100/200 at 2/4/8/12/16/20%; free 3
referrals/month any level with verified card; founding caps 500/250/100
non-recycled, lock while continuously active.
Lives in: PR #666 (code + read-only display + legacy purchase pause),
PR #661 (decision record). Route: CI green on exact head -> non-Instinct
review -> merge -> deploy verification. Billing switch-on is separately
gated (USD rail blocked, INR not transaction-verified).

## 2. Razorpay / PayPal / Chargebee plan changes
Anchor: phonemsg-01M5SPFH287HHVNFZ3PVGP7C6F ("Change the plans in Razorpay,
PayPal, and chargebee too"). Route: billing-catalog lane
(todo-01M5SPG19HQMANZC0D43C66GPE) grounds which provider owns each plan
object live, then retires/updates Chargebee items to the frozen spec; no
charges, no USD renewal activation, history preserved.

## 3. Marketing line
"Rule #1: Never cold-apply. Check if you can get referred first."
Lives in: PR #661 (decision record). Route: merge #661, then apply the
line across public marketing pages with pixel proof.

## 4. Automatic company discovery + jobs from career sites
Frozen instructions: PR #660 (head 8f46b80d0f, CI green, awaiting
non-Instinct review). The narrower job-catalog work (#650, flag OFF) does
NOT fulfil this; the full feature (discovery + our referral action instead
of sending people away to apply) needs implementation after #660 lands.

## 5. Device-saved sign-in (passkeys / Face ID / automatic prompts)
Lives in: PR #667 (docs/plans/DEVICE-SIGNIN-REQUIREMENTS.md - behavior,
constraints, current shipped truth, open questions). Route: re-verify the
WorkOS headless-passkey capability against current docs, then implement
session-restore-first + automatic offers + provider prompts per the record.

## 6. Universal search + updated user journey
One universal search box (job keywords, companies, location). Journey
document: PR #645 (review branch, not main). Route: review #645, then
implement against it.

## 7. Light and dark mode
Decision/packet recorded on main; the user-facing switch across the
platform is unfinished (D-048 dark-mode packet exists). Route: finish the
switch with pixel proof in both modes.

## 8. Referral-only wording
Anchor: phonemsg-01M5NCM1K63RW8RRWFCQ4PBT05 (todo-01M5NCMH2VW9Y39X61PRH5AD13).
Pricing copy aligned in PR #666. Remaining: global nav "My asks" and the
wider platform sweep. Route: focused copy PR(s), no structural changes.

## 9. Other recorded product work
Recruiter/HR job posts, referral validation via hiring-system evidence,
assistant capabilities, paid referrer plans, Skippy: decisions recorded on
main but NOT fully delivered. Do not treat records as delivery; each needs
its own implementation row and proof.

## Registration note
Review/build rows for these items belong in docs/plans/assignments.json,
which is the registrar (CEO) lane. The registrar has been quiet since
~17:20 Oct 25; per docs/DELEGATION.md another capable session may perform
authorized CEO work when it is unavailable. This file does not create rows;
it is the canonical instruction record the rows point at.

## Decision log updates (Oct 25 2026, evening) - actual user answers
Each entry is a single answered question, not a blanket approval of old proposals.

1. Company-funded hiring bonuses / success fee: PARKED for launch. User like
   (20:27:28, provider reaction 391d41d1-d914-4e01-8e93-022e190ad145) on the
   explicit park question phonemsg-01M5SS16BEECAE9SCYPS0ZXBX5. This was an
   assistant proposal, never an approved feature. No payout handling, no
   success-fee implementation or research cost. Focus: company posting and
   reporting first.
2. Invite rewards for paying users (D-129): stay OFF, out of launch. User
   like (20:28:25, provider reaction 22f26271-7936-4cce-8176-3c63500fd915)
   on the explicit question phonemsg-01M5SS2DB55NSG9PFAJ6BBD7R4. Ordinary
   sharing stays available; the frozen free 3 monthly referrals are
   unaffected.
3. SimpleWebAuthn dependency: APPROVED. User like (20:26:40, provider
   reaction f80d59f4-5413-4404-b86d-790c381394a8) on the explicit question
   phonemsg-01M5SRZ0WWG3MX9MJ8KARS144Z ("May I add SimpleWebAuthn, a free
   sign-in library, to build native passkey sign-in on skipwait.me?").
   Scope: @simplewebauthn/server + @simplewebauthn/browser (MIT) for native
   passkey sign-in only. No payment or identity bypass, no native-domain
   waiver, no forced prompts; security review and real device testing
   required before launch. Google One Tap (Phase A) remains an independent
   path.
4. Paid-referrer priority window: BOUNDED YES. User like (20:25:26,
   provider reaction f6e042d9-3422-4297-b20d-b6d3319e391a) on the explicit
   question phonemsg-01M5SR6J0RQ9PWQ0YSJ71Z7WK1: paid priority fits inside
   the existing first day; NO additional 24h wait; the poster's 24h first
   look stays protected. The exact routing/duration is NOT settled by this
   answer; no paid activation until a routing design satisfying both rules
   is reviewed and tested. Poster first look repaired to 24h (PR #672).
5. Standing calibrations (user messages, not feature decisions):
   phonemsg-01M5SS16KZVBVH6V28NRHZFEKW: always point out a better free
   option with why/limits before switching; phonemsg-01M5SS30QVFA2BJ3ZPD16H0DZR:
   free products or startup-credit programs first, with expiry/limits/
   auto-billing checked; any cash spend still needs explicit approval.
