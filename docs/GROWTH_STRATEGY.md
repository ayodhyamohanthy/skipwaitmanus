# Growth strategy — becoming the go-to global site for job referrals (D-043)

Saved as instructions by the owner on 2026-10-16. Read with `docs/DECISIONS.md`: D-010 north star, D-015 supply sprint (dates moved by D-064), D-026 vision, D-031 money rule, D-034–D-042 money rules and the product compass in `AGENTS.md`.

**Status: v2, adopted by the owner on 2026-10-16.** It replaces the v1 single-pass ranking. Dates updated Oct 18: the sprint clock restarted Mon Oct 19 and every dated checkpoint below moved with it (D-059, D-064).
- **How it was made:** 5 research angles (supply, reach, trust and speed, employers, contrarian) produced 25 candidate moves. Three independent skeptics scored every move: evidence, feasibility for a solo founder with no budget, and risk and ethics. A final ranker merged them, checked against `main` (ec440c2d).
- **What changed from v1:** the corridor went 9 → 7, the bounded-answer promise 8 → 5 and referrer links 8 → 6. The bonus-led referrer pitch was rejected (see "Rejected").
- **Scope:** every item that needs new code still goes through the priority queue and owner approval (D-010).

## Why nothing scores above 7
Supply is 0: live `/api/companies` lists 39 companies (Oct 18) and only skipwait.me has an available referrer. The same supply plan produced 0 outside referrers in August–October, because the outreach never actually happened.

**The main risk is founder execution, not strategy.** Every move therefore carries a dated stop rule so a quiet month cannot repeat.

**The 100x for users:** for an outside company today the wait for a referral is effectively forever. Moving it to about 5 days comes only from move 1.

**Money (current, D-146/D-132/D-196):** only credit packs are currently sold; fixed-term and annual plan products are off sale. D-132 plans remain behind off flags. D-196 allows an unimplemented opt-in paid referrer plan with level-matched first access; its prices, contents and access window remain owner-controlled. The $199/mo employer plan stays in the code, switched off, and its false copy is fixed by move 3.

## The moves, ranked

### 1. Corridor 3×3 sprint — D-015 actually executed — 7/10
- **What:**
  - (a) The owner rebases, gates and merges or rejects the D-017 referrer-link fix (P0b, `origin/p0-referrer-link` 9604900b, 113 commits behind `main`). Without it, personal links lose the referrer. **Done Oct 16:** merged as `bfc15f65`.
  - (b) An agent ships the sprint kit `docs/SUPPLY_SPRINT.md` (docs only; queue P0d). **Done Oct 18.** It contains:
    - a shortlist of 10–15 India offices of global and product companies, for lateral engineering, product and data roles, Bengaluru and Hyderabad first;
    - the shortlist ranked by aggregate waiting demand from the D-018 panel × founder access × referral leverage;
    - 3 message templates;
    - a private tracker with aggregate fields only.
  - (c) The founder sends 5 personal one-to-one messages a day from Mon Oct 19 (25 a week, D-064) pointing to `/sign-in` → "Give a referral" (work-email OTP), with one follow-up after 3 days.
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
  1. Merge or reject P0b (done Oct 16).
  2. Ship the sprint kit (done Oct 18).
  3. The owner takes the first production reading of the D-018 panel and fixes the corridor and its focus company (D-064).
  4. The first 25 logged messages go out by Fri Oct 23 (D-064).
- **Metric:** available outside verified referrers per corridor company (D-018 panel, operator domains excluded); tracker funnel message → reply → verified → first decision; weekly active outside referrers; median time to first decision. Every Monday the owner records messages sent, outside referrers verified and available referrers at the focus company in a private sheet (D-064).
- **Stop rules:**
  - **Day 14 (Mon Nov 2):** fewer than 50 messages logged means the plan failed on execution again. Stop and ask the owner whether the founder time exists.
  - **Day 14:** 50 or more messages but fewer than 3 verified → change the corridor or the message, not the effort.
  - **Day 30 (Wed Nov 18):** target one focus company with 3 or more available outside verified referrers and one outside ask decided within 72 hours (D-064). If no company has 2 or more available outside referrers, narrow to one company and apply D-016's revisit clause.
- **Becomes a 10 when:** of the first 100 messages, 10% or more end in a verified referrer, the focus company reaches 3 available outside referrers with an outside ask decided within 72 hours by Wed Nov 18, and the 3×3 gate is met by Fri Dec 18 (D-064).
- **Guardrail:** do not send coverage-invite links with `&invite=` until the live referrer-side credit (`Referrer.tsx:97`), which breaks D-015's "no perks", is resolved under D-055 (referrers stay unpaid).

### 2. One link instead of the DM pile — 6/10
- **What:** every verified referrer gets their existing `/refer/<company>/<alias>` link for their LinkedIn bio, plus a copy-paste reply for referral DMs. Askers then arrive with a structured packet (matched job link, resume, 3-line fit note, an honest "how we know each other").
- **Second channel:** one personal reply each to employees who publicly offered referrals in the last 30 days (r/developersIndia "Referral" flair, Blind, LinkedIn). Follow each community's rules and disclose the affiliation. No scraping and no automation. Never onboard anyone who sells referrals (D-006).
- **Guardrail (owner decision needed):** asks through a referrer's own link use the seeker's free monthly credits. Otherwise the referrer looks like they are steering contacts into a pay-to-reach-me product.
- **Why 6:** it is the strongest pitch per founder hour and is useful to an employee on day 1, built on shipped code (`getOrCreateReferrerFastTrackLink`, `server/db.ts:1264`). Against it:
  - adoption evidence is anecdotal;
  - tool-to-network transitions usually fail (Bodnick, 2016);
  - the public-offerer pool skews toward bonus chasers and paid sellers;
  - it was blocked on P0b until Oct 16 (merged as `bfc15f65`).
- **Stop rules (by Wed Nov 18, D-064):**
  - Fewer than 3 of 25 pitched referrers post their link, or fewer than 5 link asks in total → keep the link as a feature only.
  - Any onboarded referrer found selling referrals → remove them and stop public-offerer outreach.
  - 2 or more referrers decline because "my friends would have to pay" → escalate the free-link-ask decision.
- **Becomes a 10 when:** 30% or more of pitched referrers post the link; over 30 or more decisions, link asks are decided faster than broadcasts; and 20% or more of link-sourced seekers ask at a second company within 30 days.

### 3. Truth pass on every money and "free" claim — 6/10 (9 for correctness)
- **What:** a copy-only change, with one shared string and a test so the claims cannot drift again.
  - `AskSent.tsx:22` "your credit returns" and the uncovered-ask line "the moment coverage opens" → describe what the code does today.
  - `landingContent.ts:90` FAQ → the D-036 pack ladder and the current rule.
  - D-063's old literal is not current buyer-facing copy: D-173/D-180 require referral-only public vocabulary. Follow the terminology/copy review; the amounts and money rules stay in `docs/PRICING.md` and `docs/DECISIONS.md`, with no replacement wording or price inferred here.
  - Soften the `/for-companies` $199/mo plan claims (D-040 shipped the placement copy on Oct 16; the plan claims are still open).
- **Why 6:** it is near-certain to be right (false public money claims; D-042; India CCPA dark-pattern rules) but creates no supply, and few people see the copy today. It protects word of mouth before the sprint drives traffic.
- **Proof:** 93% of Indian job seekers have met fake offers (Indeed via Business Today, Jul 2026). US job-scam losses rose from $90M to $501M between 2020 and 2024 (FTC 2025).
- **Owner steps:**
  - Approve one wording (done: D-063, Oct 18).
  - Rule on the referrer-side coverage-invite credit (now reviewed under D-055: referrers stay unpaid). Credits already granted are honoured under the payments runbook.
- **Keep it separate** from the refund-rule build in move 4.

### 4. Ship the approved money rules in order; promise only once it can be kept — 5/10
- **Build order:**
  1. D-034 first, with its delivery rule D-047 right after (D-053). It is the only rule that matters while supply is 0: shipped Oct 18 (`66801d2b`) — an ask to an uncovered company waits free, is charged once at first visibility, and is held when the seeker has no credit.
  2. Then D-038 (with D-050): the claim lapse and the "Referred" timer.
      3. Every employee decline keeps the credit spent, regardless of reason (D-147). No decline-reason/refund path is authorized.
- **Each slice:** follows the payments runbook with tests first; uses idempotent ledger keys; computes time in JS (invariant 5); passes `getCreditLedgerAudit` with 0 mismatches.
- **The promise:** no guaranteed 7-day answer or credit-back promise is in force. D-174 suspends the 7-day visible-expiry, 90-day waiting-close and day-30 confirmation clocks as launch direction; D-193's reconfirm-before-first-spend safeguard must land before the runtime expiry-clock-removal row.
- **Owner questions (answered Oct 18):**
  - Ask-expiry clocks are suspended as launch direction by D-174. The old runtime clocks remain until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193); describe them only as runtime caveats.
  - Any employee decline keeps the credit spent, regardless of reason (D-147). Anonymous decline-reason display is a separate possible proposal only if it never releases credit.
  - There is no 90-day waiting cap or day-30 closure as launch direction (D-174). Before first spend after 30 days, the seeker must reconfirm (D-193); the implementation row is `D-174-held-ask-reconfirm`.
- **Why 5:** the rules protect seekers' money, and guarantees raise purchase intent (Suwelack, Hogreve & Hoyer, *Journal of Retailing* 2011). But with 0 outside companies the promise almost never fires, and the refund path was repaired only days ago.
- **Stop rule:** any ledger-audit mismatch after a slice deploys → roll that slice back at once (P0).

### 5. Seeker brings one insider — concierge first, no rewards — 5/10
- **What:** for each real ask to an uncovered company, the founder emails that seeker an editable message plus `/referrer?company=<domain>` (no `&invite=`, so no reward fires). The seeker sends it to one person they know there, from their own WhatsApp, LinkedIn or email. The founder never handles the contact's details.
- **Build only if the concierge works:** one optional invite card per uncovered ask; a company-only preview; `/verify` reads the invite; any-domain verification only with the B4.3 safeguards. Retire the orphaned "you and I each receive one referral credit" copy (`ReferralRequest.tsx:257`).
- **Stop rule (Fri Dec 18, D-064):** fewer than 10 invites sent or fewer than 2 insiders verified → keep the concierge script only.

### 6. Company-specific link previews now; demand-backed company pages later — 5/10
- **What:** `/fast/:code`, `/refer/:company/:alias` and `/explore/:slug` each get their own canonical URL and a company-specific Open Graph title, description and image. The company name appears as text with a "not affiliated" note. Never show the referrer's alias or any seeker data. Fix the live og:description so it matches D-039.
- **Why now:** verified live, `/explore/wipro` and `/fast/...` unfurl as the generic homepage card, which looks like an ad or phishing on WhatsApp.
- **Owner decision:** moot — D-022 shipped Oct 17, and D-053 queues D-028 (previews and company pages) in its supply-tools tier.
- **Later:** indexable pages, only for companies with real demand or referrers, with minimum-count rules. Google's scaled-content policy applies.
- **Stop rule (Sun Jan 17 2027, day 90 of the restarted D-064 clock):** fewer than 5 companies with real data → keep the pages unindexed and park the work.

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
- **.ics and web push now:** there are no outside referrers to remind. Build after 10 or more are active. Pending-action reminder emails, with a digest beyond one a day, follow D-060 instead.
- **Payment-pattern scanner and a "what money can't buy" page:** the page would be a new false claim until D-040 ships (it shipped Oct 16, except D-040b).
- **Alumni-association corridor:** institutions take months. A shared alma mater did not raise interview invitations (IZA DP 18908, 2026).
- **Diaspora phase now:** it opens after the India corridor meets the 3×3 gate.
- **Broad seeker launches** (Product Hunt, Reddit, campus blasts), **AI matching, public response leaderboards, referral payouts, scraping, a paid Chrome extension, bulk credits to bootcamps, auto-post bots:** all rejected while supply is 0, or by D-006/D-031.

## Sequencing
- **Days 0–30 (Mon Oct 19 to Wed Nov 18, D-064):** P0b merged (Oct 16) and the sprint kit shipped (Oct 18); the D-034 money tier shipped (Oct 18); first D-018 reading; ship move 3 with the approved wording (D-063); rule on free link asks; resolve the referrer-side credit under D-055. From week 1: 25 messages a week, a reading every Monday, concierge emails, free preview baseline. Checkpoints on Mon Nov 2 and Wed Nov 18.
- **Days 31–60 (to Fri Dec 18, the 3×3 target, D-064), only if a corridor company has 3 or more available outside referrers:** the invite card only if the concierge cleared its bar; repeat the sprint at adjacent companies. The 3×3 strategy is not a sales gate under D-146; D-147 rejects decline-refund work. D-038 and D-028 retain separate scope (D-053); D-022 posted roles shipped Oct 17; the D-036 pack prices reach Chargebee through the D-069 catalog sync. If no company has 3 by day 60: narrow to one company, build no supply features, and the owner decides whether the founder time exists.
- **Days 61–90 (to Sun Jan 17 2027):** if the 3×3 gate is met, open the next corridor; this sequence does not authorize fixed-term or annual sales (D-146).
