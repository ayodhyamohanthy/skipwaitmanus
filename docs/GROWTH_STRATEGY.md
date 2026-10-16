# Growth strategy — becoming the go-to global site for job referrals (D-043)

Saved as instructions by the owner on 2026-10-16. Read with `docs/DECISIONS.md`: D-010 north star, D-015 supply sprint, D-026 vision, D-031 money rule, D-034–D-042 money rules and the product compass in `AGENTS.md`.

**Status: v2, adopted by the owner on 2026-10-16.** It replaces the v1 single-pass ranking.
- **How it was made:** 5 research angles (supply, reach, trust and speed, employers, contrarian) produced 25 candidate moves. Three independent skeptics scored every move: evidence, feasibility for a solo founder with no budget, and risk and ethics. A final ranker merged them, checked against `main` (ec440c2d).
- **What changed from v1:** the corridor went 9 → 7, the bounded-answer promise 8 → 5 and referrer links 8 → 6. The bonus-led referrer pitch was rejected (see "Rejected").
- **Scope:** every item that needs new code still goes through the priority queue and owner approval (D-010).

## Why nothing scores above 7
Supply is 0: live `/api/companies` lists 5 companies and only skipwait.me has an available referrer. There are about 14 asks ever. The same supply plan produced 0 outside referrers in August–October, because the outreach never actually happened.

**The main risk is founder execution, not strategy.** Every move therefore carries a dated stop rule so a quiet month cannot repeat.

**The 100x for users:** for an outside company today the wait for a referral is effectively forever. Moving it to about 5 days comes only from move 1.

**Money (D-042):** nothing here deletes a money path. Passes and Keep warm switch on at the D-037 gate (3 outside companies with 3 or more available referrers each). The $199/mo employer plan stays in the code, switched off, and its false copy is fixed by move 3.

## The moves, ranked

### 1. Corridor 3×3 sprint — D-015 actually executed — 7/10
- **What:**
  - (a) The owner rebases, gates and merges or rejects the D-017 referrer-link fix (P0b, `origin/p0-referrer-link` 9604900b, 113 commits behind `main`). Without it, personal links lose the referrer.
  - (b) An agent ships the never-delivered sprint kit `docs/SUPPLY_SPRINT.md` (docs only; queue P0d, stale since Oct 14). It contains:
    - a shortlist of 10–15 India offices of global and product companies, for lateral engineering, product and data roles, Bengaluru and Hyderabad first;
    - the shortlist ranked by aggregate waiting demand from the D-018 panel × founder access × referral leverage;
    - 3 message templates;
    - a private tracker with aggregate fields only.
  - (c) The founder sends 5 personal one-to-one messages a day (25 a week) pointing to `/sign-in` → "Give a referral" (work-email OTP), with one follow-up after 3 days.
  - (d) The script carries: a neutral "follow your company's referral policy" line; the two vouch questions from move 7; an optional weekly 10-minute review slot as a manual calendar invite; a waiting-demand line only when at least 3 distinct seekers wait, shown as a band; no bonus amounts and no perks.
  - (e) The diaspora phase (US, UK, SG, UAE roles) opens only after the 3×3 gate.
- **Why 7:** it is the only move whose output is the bottleneck itself, it costs nothing and the owner already approved it (D-015). Critic scores: evidence 6, feasibility 7, risk-ethics 8.
- **Why not more:** the same plan gave 0 referrers before; nothing but founder discipline makes the messages go out; 3×3 in 30 days needs about 9 verifications against D-015's own planning rate of 5 a week; the playbooks are retrospectives from winners.
- **Proof:**
  - Almost 80% of marketplaces focused on supply first (Lenny Rachitsky, Greylock, 2019; survivor sample).
  - Direct sales bootstraps supply (Lenny, "28 ways to grow supply").
  - Build the atomic network first (Andrew Chen, 2021).
  - Moderately weak ties produce the most job mobility (Rajkumar et al., *Science* 2022).
  - A written date and time raises follow-through (Milkman et al., PNAS 2011).
- **First steps this week:**
  1. Merge or reject P0b.
  2. Ship the sprint kit.
  3. The owner takes the first production reading of the D-018 panel and fixes the corridor.
  4. The first 25 logged messages go out by Wed Oct 22.
- **Metric:** available outside verified referrers per corridor company (D-018 panel, operator domains excluded); tracker funnel message → reply → verified → first decision; weekly active outside referrers; median time to first decision.
- **Stop rules:**
  - **Day 14 (Oct 30):** fewer than 50 messages logged means the plan failed on execution again. Stop and ask the owner whether the founder time exists.
  - **Day 14:** 50 or more messages but fewer than 3 verified → change the corridor or the message, not the effort.
  - **Day 30 (Nov 15):** if no company has 2 or more available outside referrers, narrow to one company and apply D-016's revisit clause.
- **Becomes a 10 when:** of the first 100 messages, 10% or more end in a verified referrer, and the 3×3 gate is met by Nov 15 with a referred ask decided within 72 hours.
- **Guardrail:** do not send coverage-invite links with `&invite=` until the owner rules on the live referrer-side credit (`Referrer.tsx:97`), which breaks D-015's "no perks".

### 2. One link instead of the DM pile — 6/10
- **What:** every verified referrer gets their existing `/refer/<company>/<alias>` link for their LinkedIn bio, plus a copy-paste reply for referral DMs. Askers then arrive with a structured packet (matched job link, resume, 3-line fit note, an honest "how we know each other").
- **Second channel:** one personal reply each to employees who publicly offered referrals in the last 30 days (r/developersIndia "Referral" flair, Blind, LinkedIn). Follow each community's rules and disclose the affiliation. No scraping and no automation. Never onboard anyone who sells referrals (D-006).
- **Guardrail (owner decision needed):** asks through a referrer's own link use the seeker's free monthly credits. Otherwise the referrer looks like they are steering contacts into a pay-to-reach-me product.
- **Why 6:** it is the strongest pitch per founder hour and is useful to an employee on day 1, built on shipped code (`getOrCreateReferrerFastTrackLink`, `server/db.ts:1264`). Against it:
  - adoption evidence is anecdotal;
  - tool-to-network transitions usually fail (Bodnick, 2016);
  - the public-offerer pool skews toward bonus chasers and paid sellers;
  - it is blocked on P0b.
- **Stop rules (by Nov 15):**
  - Fewer than 3 of 25 pitched referrers post their link, or fewer than 5 link asks in total → keep the link as a feature only.
  - Any onboarded referrer found selling referrals → remove them and stop public-offerer outreach.
  - 2 or more referrers decline because "my friends would have to pay" → escalate the free-link-ask decision.
- **Becomes a 10 when:** 30% or more of pitched referrers post the link; over 30 or more decisions, link asks are decided faster than broadcasts; and 20% or more of link-sourced seekers ask at a second company within 30 days.

### 3. Truth pass on every money and "free" claim — 6/10 (9 for correctness)
- **What:** a copy-only change, with one shared string and a test so the claims cannot drift again.
  - `AskSent.tsx:22` "your credit returns" and the uncovered-ask line "the moment coverage opens" → describe what the code does today.
  - `landingContent.ts:90` FAQ → the D-036 pack ladder and the current rule.
  - Replace "Referrals are free. Always." (`Home.tsx:52,107`, pinned by home tests), `SignIn.tsx:48`, `Guidelines.tsx:24/32`, "Candidates never pay" (`ForCompanies.tsx:14/17/52`) and `ReferralConversation.tsx:155` with one owner-approved line. Example: *"Referrers are never paid and never charge. You pay SkipWait only to send an ask, never a person."*
  - Soften `/for-companies` "no paid priority — enforced in the product" until D-040 ships, and the $199/mo plan claims.
- **Why 6:** it is near-certain to be right (false public money claims; D-042; India CCPA dark-pattern rules) but creates no supply, and few people see the copy today. It protects word of mouth before the sprint drives traffic.
- **Proof:** 93% of Indian job seekers have met fake offers (Indeed via Business Today, Jul 2026). US job-scam losses rose from $90M to $501M between 2020 and 2024 (FTC 2025).
- **Owner steps:**
  - Approve one wording.
  - Rule on the referrer-side coverage-invite credit. Credits already granted are honoured under the payments runbook.
  - If the wording is not approved by Oct 23, ship the AskSent and FAQ facts alone (P0-class false money claims).
- **Keep it separate** from the refund-rule build in move 4.

### 4. Ship the approved money rules in order; promise only once it can be kept — 5/10
- **Build order:**
  1. D-034 first. It is the only rule that matters while supply is 0: `server/db.ts:1620-1625` spends at creation for uncovered asks, and ask creation counts paused, suspended and full referrers as coverage.
  2. Then D-038: the claim lapse and the "Referred" timer.
  3. Then D-035: decline reasons.
- **Each slice:** follows the payments runbook with tests first; uses idempotent ledger keys; computes time in JS (invariant 5); passes `getCreditLedgerAudit` with 0 mismatches.
- **The promise:** the headline ("a clear answer within 7 days of a verified employee seeing your ask, or your credit back") ships only after 30 or more covered asks keep it at least 90% of the time.
- **Owner questions:**
  - Does the clock start when the ask becomes visible to a referrer? (Recommended: yes.)
  - Is "Prefer not to say" a not-fixable reason?
  - Should uncovered asks keep waiting past 7 days with a check-in?
- **Why 5:** the rules protect seekers' money, and guarantees raise purchase intent (Suwelack, Hogreve & Hoyer, *Journal of Retailing* 2011). But with 0 outside companies the promise almost never fires, and the refund path was repaired only days ago.
- **Stop rule:** any ledger-audit mismatch after a slice deploys → roll that slice back at once (P0).

### 5. Seeker brings one insider — concierge first, no rewards — 5/10
- **What:** for each real ask to an uncovered company, the founder emails that seeker an editable message plus `/referrer?company=<domain>` (no `&invite=`, so no reward fires). The seeker sends it to one person they know there, from their own WhatsApp, LinkedIn or email. The founder never handles the contact's details.
- **Build only if the concierge works:** one optional invite card per uncovered ask; a company-only preview; `/verify` reads the invite; any-domain verification only with the B4.3 safeguards. Retire the orphaned "you and I each receive one referral credit" copy (`ReferralRequest.tsx:257`).
- **Stop rule (Dec 15):** fewer than 10 invites sent or fewer than 2 insiders verified → keep the concierge script only.

### 6. Company-specific link previews now; demand-backed company pages later — 5/10
- **What:** `/fast/:code`, `/refer/:company/:alias` and `/explore/:slug` each get their own canonical URL and a company-specific Open Graph title, description and image. The company name appears as text with a "not affiliated" note. Never show the referrer's alias or any seeker data. Fix the live og:description so it matches D-039.
- **Why now:** verified live, `/explore/wipro` and `/fast/...` unfurl as the generic homepage card, which looks like an ad or phishing on WhatsApp.
- **Owner decision:** split this part of D-028 ahead of D-022.
- **Later:** indexable pages, only for companies with real demand or referrers, with minimum-count rules. Google's scaled-content policy applies.
- **Stop rule (Jan 14 2027):** fewer than 5 companies with real data → keep the pages unindexed and park the work.

### 7. Honest vouch plus a referral packet into the employer's own system — 5/10
- **What now (no code):** ask the first 5 verified referrers two questions. Does your referral form ask how you know the candidate? Would you refer a profile-match stranger, and what would you write?
- **Build after 10 accepted outside asks:**
  - one required tap at accept: "I know their work" / "Profile match: I don't know them" / "Forward to a recruiter";
  - a truthful pre-drafted note laid out in the ATS fields (Greenhouse: Relationship, Work History, Rating, Notes);
  - a one-tap packet submitted in the employer's own Greenhouse, Lever or Workday, then "Referred" (D-038);
  - a seeker consent line.
- **Proof:** Greenhouse's default referral form asks for exactly those fields. Google requires personal knowledge, and Goldman treats unapproved referrals as a code-of-conduct breach (Bloomberg 2025). Contacts hold back when vouching threatens their reputation (Smith, *AJS* 2005).
- **Stop rules:**
  - If 4 of the first 5 referrers say their form doesn't ask and they would write nothing differently, drop the vouch step.
  - After the build, if the accept rate falls by more than 10 points over 30 decisions, remove the extra tap.

## Rejected (and why)
- **Bonus-led referrer pitch** ("your company already rewards you"; v1 move 2): near-fatal on ethics. It markets the "refer strangers for bonuses" side hustle that Google and Goldman police (Bloomberg, Jan 2025). Bigger bonuses mean more but worse referrals (Friebel et al.). Keep only "follow your company's referral policy".
- **Employed seekers verifying as referrers:** wait until queue task 3 stores work emails only as HMACs. A leak today would expose people as job hunting.
- **Employer-sanctioned pilot now, and waiting-demand counts shown to employers:** an HR "no" can produce a policy memo that closes corridors before their employees verify. D-028 recorded employer programmes as "not chosen now".
- **Selling the $199/mo employer plan now:** no pilot, no validated price, no GST invoices (D-007). It stays in the code, switched off (D-042).
- **Server-side ask quality gate now:** it would gate the only demand that exists. Draft the free "referral-ready ask" standard for the assistant first.
- **Publishing per-company norms on referring strangers:** invites employer crackdowns and can identify answerers. Aggregates only, ever.
- **Reminder digests, .ics and web push now:** there are no outside referrers to remind. Build after 10 or more are active.
- **Payment-pattern scanner and a "what money can't buy" page:** the page would be a new false claim until D-040 ships.
- **Alumni-association corridor:** institutions take months. A shared alma mater did not raise interview invitations (IZA DP 18908, 2026).
- **Diaspora phase now:** it opens after the India corridor meets the 3×3 gate.
- **Broad seeker launches** (Product Hunt, Reddit, campus blasts), **AI matching, public response leaderboards, paying referrers, scraping, a paid Chrome extension, bulk credits to bootcamps, auto-post bots:** all rejected while supply is 0, or by D-006/D-031.

## Sequencing
- **Days 0–30 (to Nov 15):** merge or reject P0b; ship the sprint kit; first D-018 reading; approve the money wording, ship move 3, start the D-034 tests; rule on free link asks and the referrer-side credit. From week 1: 25 messages a week, concierge emails, free preview baseline. Checkpoints on Oct 30 and Nov 15.
- **Days 31–60 (to Dec 15), only if a corridor company has 3 or more available outside referrers:** D-038 and D-035; company previews (if D-028 is reordered); D-022 posted roles; the invite card only if the concierge cleared its bar; repeat the sprint at adjacent companies; track Razorpay approval and the D-036 pack prices. If no company has 3 by day 60: narrow to one company, build no supply features, and the owner decides whether the founder time exists.
- **Days 61–90 (to Jan 14 2027):** if the 3×3 gate is met, switch on passes and Keep warm (D-037) and open the next corridor.
