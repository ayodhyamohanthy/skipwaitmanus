> Status (Oct 18 2026): historical record — where it conflicts with docs/DECISIONS.md, the register wins (notably D-035, D-046, D-053, D-064, D-067).

# Goal-alignment audit and proposal — 2026-10-14 (revision 2, after red-team review)

**Status: ANSWERED Oct 14 2026 (see section 9) — only the approved items are built.** Nothing below is built until the owner approves it and it is recorded in `docs/DECISIONS.md` (D-010). The owner's answers are recorded in section 9.

- **North star (D-010):** SkipWait becomes the go-to, preferred **global** site for job referrals, getting people referred **faster**.
- **Audited at:** `main` 181d2e0; live API a9f01bc on Oct 14 2026.
- **Evidence tags:** **[live]** observed on skipwait.me · **[code]** read in code on `main` · **[research]** cited source · **[inferred]** reasoning, not measured · **[hypothesis]** desk research to validate with users.
- **Method:** four read-only audit tracks:
  - seeker funnel
  - analytics
  - referrer supply and global reach
  - market

  The method also covered seeker and referrer psychology. Its 32 sources were each opened by a checker: 21 support the claim fully, 11 partly, none fail to support it. On top of that:
  - a whole-project sync sweep: 46 doc findings and 16 code/copy findings, with high-severity items re-verified;
  - three red-team critics: evidence, marketplace strategy, and conflicts/ethics.

  Market, analytics and funnel claims were not independently source-checked.

## 1. Bottom line
1. **No third party is supplying referrers yet. [live]** `/api/companies` lists 5 companies and shows an *available* referrer only at skipwait.me, SkipWait's own domain. External available coverage is **0**. The endpoint exposes only an availability flag, so verified-but-paused or full referrers need an owner-run query to see (§8 Q-data).
2. **We have server data but have never read it. [code]**
   - Every ask transition is recorded with a timestamp (`referralTransitionEvents`), and `/admin/flow-health` shows counts.
   - No client analytics run [live]: the Umami placeholders were never replaced and there is no Clarity code.
   - Demand for uncovered employers is not logged when a link is rejected.
   - Nobody has run the baseline numbers. We can't yet say whether demand or supply is the colder side.
3. **Four verified correctness bugs (P0 candidates under queue rule 1).** All are in [code] and checked by hand on Oct 14:
   - **Seekers' asks can be routed to the wrong company.** Links on 8 common ATS vendors are treated as the employer. A Keka-hosted job at Acme resolves to `keka.com`; the same happens for Darwinbox, Zoho Recruit, Taleo, SuccessFactors, Oracle Cloud, `myworkdaysite` and Freshteam (`shared/referralUrl.ts` `HOSTED_JOB_PLATFORMS` lacks them; `server/employerRouting.ts:19-25`). This is latent today because no vendor employee has verified, but it becomes live the day one does.
   - **The published terms promise a refund the code never makes.** Terms (`Terms.tsx:57`) and the Refund Policy (`RefundPolicy.tsx:26`) say a credit is returned "if a Referrer declines". The code refunds only on withdraw or expiry (`server/db.ts` refund kinds `withdrawal_refund` and `expiry_refund`; `reviewReferralRequest` declines without a refund).
   - **The privacy page promises something the DM route breaks.** It says "Job Seekers and Referrers can message only after the Referrer accepts that specific request" (`TrustPrivacy.tsx:46`). The DM route lets a Pro/Max member, or a mutual follower, message a referrer first (`server/dmRoutes.ts:90`; `Messages.tsx:32` "Pro members can message verified referrers directly and get answers faster").
   - **The landing FAQ describes credits wrongly.** It says extra credits are "used only when an employee accepts your request" (`shared/landingContent.ts:85`, also in the prerendered HTML/JSON-LD). In fact credits are reserved at send.
4. **Overstated public claims. [live]/[code]**
   - The landing "Open doors at launch" row says people at 5 companies "have told SkipWait they are open to referral requests". None of the four non-SkipWait companies shows an available referrer on SkipWait; the owner may hold off-platform commitments (§8).
   - `/api/jobs` and the `/jobs` page show an acme.com "Test role for loop verification" [live]. The sitemap code would publish jobs too, but the live sitemap currently doesn't.
   - The public `/api/referral-impact` counter (10) counts expired asks under its rule. It isn't rendered on any page today, and how many of the 10 are expiries is unmeasured.
5. **The work queue is ordered by kit-design fidelity, not by the goal.** Tier A (pricing XL, password L) adds no referrer and shortens no wait. The cold-start supply plan already written in Aug (`research/skipwait-zero-distribution-playbook.md`, `research/cold-start-launch-system.md`) has produced 0 external referrers in two months. The cause is unknown (§8 Q-root-cause).
6. **Recommendation: two tracks starting today.** (A) A founder supply sprint, which has no code dependency. (B) A build track: P0 and truth fixes → baseline numbers and the privacy notice → safety prerequisites → supply enablers → speed → reach. Pricing moves to a middle path (§6).

## 2. Evidence summary
### 2.1 Production and repository facts
| Fact | Value | Tag |
|---|---|---|
| Companies listed / showing an available referrer | 5 / 1 (skipwait.me only, external = 0) | [live] |
| Directory additions | admin-only. An approved company suggestion does not create a routable row (`db.ts:921-933`) | [code] |
| Enrollment doors | `/referrer` (OTP) accepts any corporate domain; the kit `/verify` accepts only the 5 listed companies, otherwise "Suggest it" | [code] |
| Uncovered demand | rejected links are not logged (`privateReferralRoutes.ts:610`). Uncovered-but-resolvable asks wait, keep a reserved credit, and expire at 7 days | [code] |
| Asks that never expire | asks claimed by a referrer, and fast-track asks created with `referrerId` set (`db.ts:1536`, `askExpirySweep.ts:31`) | [code] |
| Open-ask cap per company (D-006) | not enforced on `main`; exists only on the paused pricing branch | [code] |
| Pull requests | 51 open. #129, #130 and #131 already landed on `main` on Sep 24 (stale duplicates). #2 and #18 have not been re-checked against `main` | [live] gh + git |
| Company pages | `/explore/<slug>` exists but is not in the sitemap or prerender; there is no `/referral-at/` URL | [live] |
| Share previews | `/fast/*`, `/share-card/*` and `/refer/*` unfurl as the generic homepage card | [live] |

### 2.2 Job seeker: mental model and friction [hypothesis + code]
Backdrop [research]: 61% of job seekers were ghosted after an interview and 79% feel anxious about the job market (Greenhouse 2024). Indian web traffic is 77% mobile (StatCounter 2026).

| Step | What the code does | What the seeker likely feels [hypothesis] | Principle [research] |
|---|---|---|---|
| Arrives via a referrer link, `/start`, `/jobs` or `/wall` | `/request` → `/ask` drops the query string (`App.tsx:111`), so the fast-track code is lost. The job link is lost because Onboarding writes localStorage while Ask reads only sessionStorage `askPrefill` | "Where did my referrer go?" | Endowed progress (Nunes & Dreze 2006) |
| Landing / Explore | Static 5-company "open doors" row; an unlisted company is a dead end | False hope, or "is my company even here?" | Truth in advertising (India CPA 2019 / CCPA 2022 misleading-ads guidelines) |
| Compose and send | Sign-in first; a new resume upload per ask; employer and coverage revealed only after send; uncovered ATS links rejected | "Ten minutes, and it says no?" | Sunk cost (Arkes & Blumer 1985) |
| Wait | Referrers notified once, in-app, plus email only if the login email is on the company domain, plus an opt-in Slack webhook. No reminders or push. The uncovered copy promises routing "the moment coverage opens" but the ask expires at 7 days | "Has anyone seen it?" | Uncertain, unexplained waits feel longer (Maister 1985; NN/g 2014) |
| Ending | Expiry or decline sent as an in-app note; claimed and fast-track asks can stick forever | "Nobody even looked." | Peak-end rule (Kahneman et al. 1993); perceived control (Baratta, Seligman & Maier 2023) |

The ending distribution is unmeasured. The query is in §8.

### 2.3 Referrer: mental model and friction [hypothesis + code]
- **The referrer's core worry: "Is this worth my reputation and a minute? Will my employer mind?"**
  - Employers already pay referral bonuses: 75% of US organisations (SHRM 2021); TCS pays up to ₹40,000 for hires who join within 30 days (People Matters 2026).
  - Employers also penalise referring strangers you don't know: Google requires personal knowledge, and Goldman treats it as a code-of-conduct issue (Bloomberg 2025).
  - Implication: **how a referrer is allowed to vouch matters as much as getting them to sign up.**
- **First decision.**
  - The email review link offers "Accept & submit referral" with no role or resume.
  - The queue hides the resume until after acceptance.
  - People hesitate to refer because a bad referral damages their own standing. Sandra Susan Smith (2010) found this in US low-income job networks; Beaman & Magruder (2012) found referrers screen well, but mainly under performance pay. Both studies were of other populations and may transfer imperfectly.
- **Broadcast.** Blair et al. (2005, a library-link request to 400 students) found 38% replied when asked alone, 33% when one other person was asked, and 14% when 14–49 others were asked. With 0–3 referrers per company the effect is small today.
- **Feedback.** Grant et al. (2007) found large gains only after face-to-face contact with a beneficiary; a written letter showed no effect. Written thank-yous are therefore an experiment, not a proven driver.
- **Money.** Small payments can crowd out voluntary effort (Gneezy & Rustichini 2000; Mellström & Johannesson 2008; Ariely, Bracha & Meier 2009). Bigger bonuses raise referral volume but lower quality (Friebel et al., NBER).

### 2.4 Market [research; not independently source-checked]
- **Referrals work, and they are rare.** They are about 1% of applications, but 40% of referred applicants reach interview against 3% of inbound (Ashby 2025). Referred hires quit substantially less (Burks et al. 2015). Simply having a referral programme cut store-level attrition by about 15% (Friebel et al.).
- **Marketplaces start with supply.** 14 of 17 large marketplaces Lenny Rachitsky interviewed focused early resources on supply; this is a survivor sample. Others advise constraining the market (NFX) and building an atomic network, here one employer (Chen).
- **Competition.**
  - Blind is free, verified and growing in India (press, Feb 2025).
  - LinkedIn ask-for-referral works with connections only.
  - Paid rivals buy supply: Refermarket, ReferralHub and Refer Me; RefOpen and Reffconnect each claim 500+ companies (vendor claims).
  - SkipWait's edge has to be something Blind and LinkedIn structurally won't offer: a **bounded-answer commitment** (a decision or your slot back within N days), a **one-minute structured decision** for referrers, and **employer-sanctioned referral intake**.

### 2.5 Whole-project sync
- **Contradicts the register (verified):**
  - `AGENTS.md:35` "founder's autonomy rule" contradicts D-010.
  - GST wording in `docs/PRICING_RECOMMENDATION.md` and the paused branch `shared/billingRegion.ts` contradicts D-007.
  - `PRICING.md`, `LLM_HANDOFF.md` §9 and `FOR_AI_BUILDERS.md` contradict D-005.
  - Both START_HERE files claim to be the "single source of truth", contradicting D-008.
  - `PAYMENT_PROVIDER_READINESS.md` contradicts D-004.
  - Live B2B "priority placement" and sponsored-first ordering conflict with D-006 (owner call).
- **Competing plans in open PRs:** #115 `PLAYBOOK.md` and #47 `OPERATIONS.md`. Note that `scripts/productCopyGuard.mjs` on `main` already enforces Playbook §0.3, §1.1 and §4.9; those rules need register entries before #115 is closed.
- **Register gaps (de-duplicated, about 25).** They include:
  - AGENTS invariant 3: the invite reward is unlocked by the referrer's first acceptance, which conflicts with D-006.
  - The ask lifetime, the credit rule, the referrer notification policy, anonymous-by-default referrers, and the landing no-fetch contract.
  - The reported "no third-party script on landing" rule (PR #108 body; owner to confirm).
  - The launch-company list, gift subscriptions, the region-detection rule, support SLAs, and an age gate (the Terms say 18+ but nothing enforces it).

## 3. Track A — founder supply sprint (starts day 1, no code)
- **Root cause first:** why did the Aug plan produce 0 external referrers? (§8 Q-root-cause.)
- **Proposal:** 30 days with weekly targets.
  - Effort: 10 or more hours a week of outreach.
  - Weekly inputs: 25 targeted messages leading to 5 verifications.
  - Day-30 review: at least 3 external companies with at least 3 available referrers; if not, narrow the corridor.
  - Day-60 review: if still short, test an employer-sanctioned pilot or concierge matching.
- **Channels:**
  1. The founder's former colleagues and alumni network.
  2. Employees who already post public "I can refer at X" offers on LinkedIn, Blind Tech Referrals or r/developersIndia. Pitch the referrer link as the fix for their DM overload, the Calendly pattern.
  3. College alumni associations, which reach working alumni, not students.
- **Corridor choice:** score each employer on demand × referral leverage × founder access × whether the employer's policy allows "profile fits" referrals.
  - Lateral product and engineering hiring benefits more from a referral than test-gated fresher pipelines (TCS NQT).
  - Global companies' India offices (GCCs and MNC product teams) serve India volume and the global brand at once.
- **Guardrails:**
  - Corridors are chosen on aggregate demand, never on what paying customers want (D-006).
  - No perks, credits or gifts for recruited referrers.
  - No seeker data goes into outreach.
  - Every referrer verifies themselves.

## 4. Track B — build, in order (each item needs approval; S ≤ 1 day, M ≤ 3 days, L ≤ 2 weeks)
| # | Item | Why (evidence) | Metric | Size | Conflicts / prerequisites |
|---|---|---|---|---|---|
| B1.1 | **Stop the ATS misrouting:** add the vendor hosts to `HOSTED_JOB_PLATFORMS` so their links resolve by employer handle or wait, never route to the vendor; one regression test per vendor | §1.3 | 0 misrouted asks | S | P0 (queue rule 1) |
| B1.2 | **SUPERSEDED Oct 14 (founder): decline does not refund; fix the Terms copy instead.** Original: Refund on decline, as the Terms promise; remediate past declines-after-claim (owner-run query, then a reviewed refund script) | §1.3; Terms/Refund policy are binding | 0 broken refund promises | S | P0 money; no Terms change |
| B1.3 | **Messaging matches the privacy notice:** no first message to a referrer before acceptance, on any path | §1.3 | 0 privacy-notice breaches | S | D-005 "Pro/Max keep what they pay for" vs privacy notice: owner picks the transition (§8 Q1) |
| B1.4 | **Truthful public copy:** remove the static "open doors" row until at least 3 external available referrers exist at a company (k-threshold avoids exposing individual referrers); fix the credits FAQ/JSON-LD; take the acme.com test role out of production via a reviewed data-fix script, with a fixture guard on `/api/jobs` and the sitemap (PR #104); the public counter excludes expiries and is relabelled "asks accepted" (an acceptance is not a referral, Playbook §1.1) | §1.4 | 0 false claims | S | Landing no-fetch contract: prerender the row at deploy |
| B1.5 | **Uncovered asks reserve neither a credit nor a slot** | cold-start research note (Aug 18; unregistered); avoids charging into an empty market | — | S | Credit rule (register gap) |
| B2.1 | **Baseline numbers:** owner-run read-only SQL snapshot: asks per week by final status, expiries, time to first decision, verified referrers per domain including paused or full ones, top waiting domains | D-010 step 2 requires data | — | S | Owner runs it; no code |
| B2.2 | **Demand log** for uncovered or unresolvable links: host plus ATS tenant handle only, no user id, 90-day retention; per-host URL query allowlist before anything is stored or shown | Supply audit; query strings can carry personal tokens | uncovered demand by company | S–M | Privacy notice first (B2.3) |
| B2.3 | **Privacy notice and data inventory:** list processors (WorkOS, Cloudflare, ZeptoMail, Chargebee, Razorpay, PayPal, Sentry, AI provider), retention per data class, lawful bases, named grievance officer, GDPR/DPDP; an age gate for 18+ | Conflicts critic | — | M | Owner action: Indian consumer/privacy counsel review |
| B2.4 | **First-party funnel events** (rebase #108/#109): country only as anonymous aggregates; no session replay on resume, DM, OTP or verify screens | Analytics audit | link → ask → decision funnel | M | After B2.3; tool choice §8 |
| B3 | **Safety prerequisites before widening supply:** queue task 3 (store only an HMAC of work emails), task 6 (server-side 90-day re-verify; asks return when someone leaves), task 4 (erasure) | Plaintext work emails; referrers who change jobs | — | L | Before B4.3 and B4.4 |
| B4.1 | **The referrer's personal link works end-to-end:** fast-track code and job link survive `/request` → `/ask` and sign-in; a "share your referral link" step after verifying | Calendly-style supply tool; §2.2 row 1 | asks via referrer links | M | — |
| B4.2 | **Honest referrer pitch (#101):** "many employers run referral programmes — check your policy", fit, privacy, control; restore the user-initiated coverage-invite card **without** any referrer credit tied to acceptance | §2.3 | `/referrer` view → verified | S–M | **Amends AGENTS invariant 3** (D-entry) |
| B4.3 | **Verify any corporate domain on both doors, with safeguards:** the referrer is enrolled at once, but **routing** to a new company needs admin approval plus objective checks (domain age, MX, website; ideally 2+ independent referrers or DNS TXT, task 33); never listed publicly on its first referrer; block contractor/vendor/staffing domains; "direct employee" attestation; aliases only for the same legal entity via admin-gated `companyDomains` | Supply blocker 1; resume-harvesting risk | verified external referrers/week | M | D-001 kit picker stays plus "Not listed? Verify with your work email"; needs B3 |
| B4.4 | **Waiting list instead of rejection:** unresolvable links stored as demand only and never auto-delivered; when coverage opens, notify the seeker, who sends afresh with consent and a current resume; 90-day retention; withdraw control | Demand capture; invariant 4 forbids unverified mapping | notify-me → covered ask time | M | **Amends AGENTS invariant 4** (D-entry); needs B2.3, B3 |
| B5.1 | **Answer before effort:** signed-out company/link check shows coverage (k ≥ 3 available referrers, rate-limited) before resume or sign-in (#99, PR #107) | Sunk cost | link-check → ask-sent; covered-ask share | M | — |
| B5.2 | **Keep momentum:** compose signed-out and sign in at Send; resume on file (task 8) | Endowed progress | ask-start → ask-sent | M | Resume retention period in B2.3 |
| B5.3 | **Bounded waits:** response window and no-fault hand-back for claimed and fast-track asks; truthful expiry copy; email on every state change including expiry; an honest ending plus one next step | Maister; peak-end | expired with no decision | M | — |
| B5.4 | **One-minute decision:** structured, non-identifying role/level/function/quality fields in the email and queue; vouch-strength choice ("I know them" / "profile fits") with an employer-policy reminder; pledge on the email path | §2.3 | time to decision | M | Resume-before-accept would change the privacy promise: not proposed |
| B5.5 | **Post-accept referral kit + one-tap "Mark as referred"** (task 16): creates the referrer-confirmed *referred* state the north star needs | Speed after acceptance | accept → referred | M | — |
| B6.1 | **Demand-capture company pages:** an indexable page per company people have asked about, with honest coverage state, notify-me and invite-a-colleague; waiting counts only at k ≥ 5 distinct people, banded and weekly; names without logos plus a "not affiliated" note. Share unfurls (#97/#105) follow coverage | SEO takes months; demand is the referrer pitch | organic entries | M | Google scaled-content policy: unique real content only |
| B6.2 | **Job-board handles:** resolve vendor tenant handles to employers via the directory; LinkedIn job IDs parsed from the URL, never fetched | Supply audit matrix | resolvable-link share | M | After B1.1 |

**Deferred with reasons:**
- **Routed single-referrer asks (task 18):** at 0–3 referrers per company the bystander gain is small and sequential hand-off slows answers. Revisit at 5 or more available referrers per company.
- **Outcome loop to referrers (task 20):** written-contact evidence is null (Grant 2007). Run it as an A/B experiment once volume allows; every outcome share needs per-update seeker opt-in.
- **Password sign-in (task 2):** Google, Microsoft, GitHub and email sign-in already exist (D-011).
- **Translations:** still owner-blocked.

## 5. Metric ladder (replaces a single north star for now)
- **Stage 1 (until 10 external companies are covered).**
  - Primary: **weekly active external referrers**: unpaused, below capacity, at least 1 decision or verification in 14 days, excluding operator and test domains.
  - Secondary: **demand-weighted serviceability**: the share of seeker intents (link checks, asks, logged rejected links) that land at a company with 3 or more available external referrers.
- **Stage 2.** Share of covered asks with a first referrer decision within 72h, and the median time to first decision.
- **Stage 3 north star (once B5.5 ships).** **Asks referrer-confirmed "referred" within 7 days, per week.** "Accepted" stays a separate guardrail, because Playbook §1.1 says an acceptance is not a referral.
- **Always:** operator domains (skipwait.me) are excluded from every liquidity number and every public count.

## 6. Money: paid passes vs liquidity (decision needed; conflicts D-005, D-009)
| Option | What | Pros | Cons |
|---|---|---|---|
| **M1 Middle path (recommended)** | Sell credit packs and AI tools now, since they promise no referrer. Sell 30/90-day passes only with a **covered-ask guarantee**: the pass clock starts at the first covered ask, and a covered ask with no decision in 7 days returns its slot and extends the pass 7 days (extends the existing `expiry_refund` path). Gate each plan on capacity: a plan with N open asks sells only when external covered companies ≥ N/2. The 14-day trial starts at the first covered ask. | Revenue continues; never charges for an empty market; a marketable "answer or time back" promise | More build than D-005 as approved |
| M2 Free only until liquidity | No new paid sales until Stage 1 targets are met; existing subscribers unchanged | Simplest, most trust | Zero new revenue for weeks or months |
| M3 As approved (D-005) | Sell passes now | Revenue upside | Charges people where 0 external companies are covered; refund and chargeback risk |

Facts needed from the owner: current MRR, the number of paying Pro/Max users, monthly burn (§8).

## 7. Older decisions this proposal changes (impact check)
| Decision | Change proposed | Why |
|---|---|---|
| D-001 (every PNG "as it is") | PNGs define how a screen looks. Which screens are built, and when, follows D-010. **Consent law, the ethics guardrail and D-006 override PNGs:** no pre-checked consent or pledge boxes, no pre-filled messages, no popularity badges without data | The kit pre-checks thank-you-wall consent and the developer terms box |
| D-005 / D-009 | Pricing build paused; M1 replaces "sell passes now" if approved | §6 |
| D-002 | Password sign-in deferred | Adds no supply or speed |
| D-006 | Owner rules on employer-paid sponsored placement and pay-per-unlock talent discovery; interim: remove "priority placement" copy | Live B2B copy |
| AGENTS invariants 3 and 4 | Invariant 3: no referrer reward tied to acceptance. Invariant 4: rejection becomes a demand-only waiting list, never misrouting | B4.2, B4.4 |
| AGENTS.md:35 autonomy clause | Retired in favour of D-010 approval | Contradiction |

**Remediation for people already affected:** refund past declines-after-claim (B1.2), and notify Pro/Max subscribers who were sold "get answers faster" about the change (B1.3).

## 8. Questions for the owner
- **Q1 (P0 fixes B1.1–B1.4):** approve now? For B1.3, choose how existing Pro/Max subscribers transition.
- **Q2 (plan shape):** two parallel tracks with the Track B order above, pricing and password paused?
- **Q3 (money):** M1, M2 or M3?
- **Q4 (Track A):** can the founder commit 10 hours a week for 30 days? What happened with outreach since Aug (root cause)?
- **Q-data:** please run the B2.1 read-only queries, or authorise an admin-read script, and share MRR / paying-subscriber counts.
- **Q-launch:** did people at Wipro, TCS, Merkle and Go Neutrinos actually commit off-platform?
- **Later calls (recorded as open questions in the register):**
  - Analytics tool: first-party vs PostHog.
  - D-006: employer placement and talent unlocks.
  - Referrer sign-in model.
  - Gift subscriptions.
  - Region detection.
  - Support SLAs.
  - Closing #115 and #47 after harvesting their rules.
  - Closing the stale #129, #130 and #131.
  - Re-checking #2 and #18.

## 9. Owner answers (Oct 14 2026)
- **Q1 P0 fixes → "Fix all 4 now"** (D-012): routing, refunds incl. past declines, truthful FAQ; block pre-acceptance messages to referrers for everyone; notify Pro/Max subscribers with a pro-rata credit or refund offer.
- **Q2 plan shape → "Keep the current queue"** (D-013): Track B re-ordering not adopted; items stay proposals.
- **Q3 money → "M3 sell passes as approved"** (D-014).
- **Q4 founder time → "Yes, ~10 hours a week"** (D-015): Claude prepares the sprint kit.
- **Root cause** of 0 external referrers since Aug: "outreach never really started" (D-015).
- **Referrer link → "Fix now, before outreach"** (D-017).
- **Launch row → "Yes, they committed — keep it"** (D-016).
- **Baseline data → "Add an admin page"** (D-018).
- Still open: uncovered asks reserving credits (B1.5).


> Amendment Oct 14 2026 (founder, via D-012): the proposals to refund on decline and to refund past declines (B1.2 and the remediation lines above) are withdrawn. A declined ask stays active for other employees and the credit stays spent.
