# Growth strategy — becoming the go-to global site for job referrals (D-043)

Saved as instructions by the owner on 2026-10-16. Read with `docs/DECISIONS.md` (D-010 north star, D-026 vision, D-031 money rule, D-042 "every money path survives, honestly") and the product compass in `AGENTS.md`.

**Status: ratings v1.** These come from the verified monetization audit (8 investigators plus 8 adversarial verifiers) and the employer-channel research, both of Oct 16. A fuller ranking (5 research lenses, 3 skeptics) was still running when this was saved. When it lands, update the ratings here and note what changed. Every item that needs new code still goes through the priority queue and owner approval (D-010).

## Ground truth (Oct 16 2026)
- **Supply:** live `/api/companies` lists 5 companies. Only skipwait.me has an available referrer, so **0 outside companies are open**. The August cold-start plan produced 0 outside referrers in two months.
- **Demand:** about 14 asks ever. No analytics run. The admin revenue panel cannot see pass revenue.
- **Payments:** INR checkout has been blocked at Razorpay review since Oct 14 (`docs/BUGFREE_GATE.md` 4.14).

**The 100x point.** For any outside company today, a seeker's wait for a referral is effectively forever. Going from "never" to "a referral in about 5 days" is the 100x. Every move below serves that. None is rated 10/10, because a 10 means near-certain and nothing is near-certain at this volume. Each move names the result that would make it a 10, and a stop rule.

## The moves, ranked

### 1. Win one corridor completely before going global — 9/10
- **What:** about 10 companies, preferably Indian offices of global product companies (global capability centres). The founder recruits at least 3 available referrers at each. The corridor is chosen on aggregate demand only, never on what paying customers want (D-015).
- **Helps users:** seekers who target those companies get a real answer in days.
- **Money (D-042):** reaching 3 × 3 switches on passes and Keep warm (D-037) and the reverse trial, so every paid tier starts earning.
- **Proof:**
  - 0 outside referrers live.
  - Build the atomic network, one company at a time, first (Andrew Chen, *The Cold Start Problem*, 2021).
  - 14 of 17 large marketplaces focused early on supply (Lenny Rachitsky; a survivor sample).
  - India has 1,700+ global capability centres with about 1.9M employees (NASSCOM–Zinnov), which serve India volume and the global brand at once.
- **First step this week:** deliver the D-015 sprint kit that was never shipped: corridor list, outreach templates, tracker, referrer-link pitch.
- **Metric:** available verified referrers per corridor company.
- **Becomes a 10 when:** 3 companies have 3 or more available referrers within 30 days, and at least 1 referred ask reaches an interview.
- **Stop rule:** if no company reaches 3 by day 30, narrow to one company and test an employer-sanctioned pilot (see move 7).

### 2. Referrers earn their own employer's bonus — never money from SkipWait — 8/10
- **What:** the pitch is "SkipWait sends you screened candidates for the referral bonus your company already pays." After an acceptance, a one-tap referral packet (job link, resume, a three-line "why I fit") lets the referrer submit in their company's own system (Greenhouse, Lever, Workday), then tap "Referred" (D-038).
- **Helps users:** referrers earn their bonus with less effort, and seekers' referrals land in the official system.
- **Money:** supply. D-006 holds because SkipWait pays referrers nothing.
- **Proof:**
  - 75% of organisations pay referral bonuses (WorldatWork 2021, via SHRM); TCS pays up to ₹40,000.
  - Greenhouse lets any user submit a referral to a live job.
  - Being involved in hiring, more than the bonus, drives most of a referral programme's value (Friebel et al., JPE 2023).
- **Counter:** Google and Goldman forbid referring strangers (Bloomberg, Jan 2025: employees referred 1,000+ strangers for bonuses). The decision screen therefore needs "I know them / profile fits" plus a reminder of the employer's policy. SkipWait never advertises bonus amounts.
- **Metric:** share of accepted asks marked "Referred" within 5 days.
- **Becomes a 10 when:** 70% or more of the first 20 accepted asks are marked "Referred" within 5 days.
- **Stop rule:** below 30% after 20 accepts, rework the packet before pitching it.

### 3. The bounded-answer promise is the headline — 8/10
- **What:** "A decision in 7 days, or your credit back." D-034, D-035 and D-038 build it. Ship those first, then lead the landing page and share cards with the promise.
- **Helps users:** certainty instead of being ghosted.
- **Money:** credits are still spent on asks referrers can see and on fixable declines. Lenient guarantees raise purchases more than they raise returns (Janakiraman, Syrdal & Freling, *Journal of Retailing*, 2016 meta-analysis).
- **Proof:** 61% of job seekers were ghosted after an interview (Greenhouse 2024). Blind and LinkedIn promise no answer at all, and LinkedIn refunds an InMail credit on any reply.
- **Metric:** promise-kept rate (asks that got a decision, a referral or their credit back within 7 days); ask-to-purchase conversion.
- **Becomes a 10 when:** a measured lift in conversion after launch.
- **Stop rule:** if the promise is kept less than 90% of the time, stop advertising it until it is.

### 4. Make every seeker referral-worthy, and charge for the coaching — 8/10
- **What:** a free ask quality check, plus decline reasons (D-035) fed into the assistant ("fix this, then send again"), plus the paid resend and the credit tools (queue tasks 12 and 28).
- **Helps users:** seekers become referable, and referrers only see good asks (compass point 2).
- **Money:** the paid resend is a new revenue line, and the 11 credit tools finally get a real job to do.
- **Proof:**
  - Referred applicants reach interview 40% of the time, against 3% for inbound (Ashby, May 2025). That edge holds only while referrers trust what they forward.
  - Explanations make a rejection feel fairer (Truxillo et al. 2009 meta-analysis; cited from memory, re-check before quoting publicly).
- **Metric:** fix rate after a decline; resend acceptance vs first-send acceptance.
- **Becomes a 10 when:** resends after a fix are accepted at a clearly higher rate than first sends.
- **Stop rule:** if, after 50 resends, they are accepted no more often than first sends, revisit the coaching before charging for it.

### 5. Referrer links that beat LinkedIn DMs — 8/10
- **What:** pitch the personal referrer link (`/fast/:code`, `/refer/:company/:alias`) as the fix for DM overload (the Calendly pattern). Add a one-minute structured decision, and protect referrers' reputation with that structure.
- **Helps users:** referrers get an organised inbox; seekers reach a named person instead of a crowd.
- **Money:** asks sent through a personal link are paid asks.
- **Proof:**
  - A referrer's core fear is damage to their own standing (Sandra Smith, *Lone Pursuit*, 2007).
  - People reply 38% of the time when asked alone, against 14% when 14 or more others were asked too (Blair et al. 2005).
  - Employees already post "I can refer at X" publicly on LinkedIn, Blind and r/developersIndia.
- **Metric:** time to decision for link asks vs broadcast asks.
- **Becomes a 10 when:** link asks are decided measurably faster in our own data.
- **Stop rule:** if link asks are no faster after 30 decisions, deprioritise.

### 6. Turn waiting demand into supply — 7/10
- **What:** per-company pages and share cards (D-028), with honest coverage and notify-me. Show real, anonymous "N people want a referral at your company" counts, and only above a minimum group size the owner sets. These counts open the founder's outreach messages.
- **Helps users:** demand recruits referrers at no cost to anyone.
- **Money:** waiting demand is the hook for the labeled employer plan later (move 7).
- **Proof:**
  - `research/cold-start-launch-system.md`: "a waiting request is … a high-intent signal" of where to recruit.
  - Blind's verified community became an employer product (Talent by Blind, 2022).
  - Rated 7 because it does nothing until volume exists.
- **Becomes a 10 when:** an employer shown a real count gets 3 or more employees to verify within 14 days.
- **Stop rule:** if no company crosses the minimum group size by day 60, park it.

### 7. Employer money that survives D-006 — 6/10 now
- **What:** labeled "Featured listing" ads (D-040). A tooling-only "Referral programme" plan, sold only after one pilot company proves value: at least 10 asks and 3 referred in 60 days.
- **Fix first:** `/for-companies` claims "no paid priority — enforced in the product" while sponsored-first ordering is live, and it advertises a $199/mo plan with nothing behind it. Both are false public claims today.
- **Proof:** RippleHire sells referral tooling to Indian enterprises.
- **Counter:** Drafted was acquired and shut down, and Firstbird was absorbed as a bolt-on. Standalone referral software is hard. Talent teams may also refuse stranger referrals on policy grounds.
- **Becomes a 10 when:** a pilot talent team pays for a named tool at a stated price, without asking for ranking or seeker access, and a second company does the same.
- **Stop rule:** if no pilot company asks to pay within 90 days, park the plan and keep the labeled listings.

### 8. Measure "referred within 7 days" first — 9/10 as the prerequisite
- **What:**
  - Reassign the stale D-018 claim and build the admin baseline panel.
  - Turn on Clarity, which is free (D-031), only after masking `/ask`, `/verify` and `/messages`.
  - Log out-of-credit refusals.
  - Add pass and employer revenue to the admin revenue panel.
- **Why first:** it moves nothing by itself, but without it nobody can tell which of moves 1–7 works.
- **Done when:** the panel shows asks referred within 7 days, per week, with operator and QA accounts excluded.

## Rejected, even though they look tempting
- **Paying referrers:** small payments crowd out helping (Gneezy & Rustichini 2000; Deci, Koestner & Ryan 1999), larger bonuses lower quality (Friebel et al.), and Rooftop Slushie users said paid referrers "take money and don't refer".
- **Paid ads or paid tools:** ruled out by D-031.
- **Scraping, or mass-messaging on LinkedIn, Reddit or WhatsApp:** platform bans, and it burns referrers' trust.
- **Selling seekers priority or visibility:** ruled out by D-006.

## What a smart critic would say
"Nothing here is new; it is supply, trust and speed." That's correct, and it's the point. The audit found these plans already written and never executed. Move 1 is founder hours, not code.
