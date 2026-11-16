# How we talk about SkipWait (D-323)

> Read [`docs/BRIEF.md`](./BRIEF.md) first. This page is the source for marketing language: the landing page, search snippets, outreach, replies to recruiters and anything written in SkipWait's voice. `docs/DECISIONS.md` wins any conflict. Money sentences still come only from `shared/moneyCopy.ts`, and legal text stays the owner's.

Owner direction, Nov 11, 2026 (D-323): SkipWait is presented as a trust and matching product, never as paid referrals, and a calm answer is ready on how it works within employer rules.

## 1. The story in one breath

SkipWait is a trust and matching service for job referrals. It checks that the person on the other side holds a work email at the company, sends a referral request only to that company's verified employees, and keeps both people private until the employee says yes. The employee decides for themselves, is never paid, and refers through their employer's own process.

Three beats, in this order, wherever there is room for them:

1. **The problem is trust, not access.** A job seeker cannot tell who really works somewhere. An employee cannot tell which stranger is worth their name. So most requests are ignored.
2. **SkipWait supplies the trust and the match.** Work-email verification on one side, a specific role with a resume and a short note on the other, routed only to people at that company, private until acceptance.
3. **The referral stays the employee's.** Their judgment, their employer's process, nothing in return. A referral is an introduction, never a promise of an interview or a job.

"Trust and matching" is the frame the copy demonstrates. It is not a phrase to print in a headline: nobody searches for it and it tells a visitor nothing (D-153). The category word stays "job referral", which is the goal (D-010, D-026) and the search term.

## 2. What the story rests on (true in the product today)

Every line of marketing must trace to one of these. If one stops being true, the copy that leans on it changes in the same pull request (D-042, D-044).

| Claim we may make | Why it is true | Where |
|---|---|---|
| Referrers are never paid by SkipWait | No reward at accept, no payout | D-055; `REFERRER_ACCEPT_REWARDS_ENABLED = false` in `server/db.ts` |
| No money moves between a seeker and a referrer | A community rule, reportable | `client/src/pages/Guidelines.tsx` ("No money, gifts, or favours"), `/report` |
| Before accepting, the employee confirms they will refer only through their company's official process and accept nothing in return | The server refuses an acceptance without it | `server/privateReferralRoutes.ts` (`ethicsConfirmed`); the confirmation on `/queue`, the thread and the email-review page |
| Only work-email-verified employees of that company can see a request | Company-matched visibility | the verified-referrer gate, `shared/referrerAccess.ts` |
| Names and resumes stay private until the employee accepts | Documents and the seeker's name need the referrer's own acceptance | D-019(e), `server/referrerDocumentAccess.ts` |
| The employee can always pass | Passing is a normal outcome | the decision panel; `/how-employees-refer-candidates` |
| Once an employee picks a request up, the charge is the same whether they accept or pass | A pass refunds nothing; the charge comes back only if the seeker withdraws before pickup or nobody picks it up | D-147; `askCostLine` in `shared/moneyCopy.ts` ("Once picked up, it stays charged, even if they pass") |
| A referral never guarantees an interview or a job | Stated on every public page | `GOAL_LANDING_QUOTE` |

Limits to state plainly when asked: work-email verification confirms control of an address on a company domain. It does not prove current employment, and it is not the employer's endorsement.

## 3. Words

| Say | Do not say | Why |
|---|---|---|
| request a referral, referral request | buy a referral, get a referral, paid referral, referral marketplace | The seeker asks; the employee decides. Nothing here is a sale of a referral. |
| verified employee, work-email-verified | insider access, our network of referrers, guaranteed insider | Verification is the product. "Access" sounds like something sold. |
| matched to employees at that company | connections, hook-ups, a way around the process | The employer's process is the route, not the obstacle. |
| the employee decides, can always pass | get referred, unlock a referral, skip the queue | No outcome is promised (D-006). |
| what you pay for: a verified, private request | the cost of a referral, price per referral, extra referrals | See open question 6.1. |
| referrers are never paid | referrers earn, rewards for referring, your company already pays you a bonus | D-055; the bonus-led pitch is rejected in `docs/GROWTH_STRATEGY.md`. |
| their company's official referral process | fast-track, backdoor, we submit you | SkipWait never submits anything to an employer. |
| an introduction, never a promise | your odds, boost your chances, land the job | Outcome language sells what nobody controls. |

Never name an employer in this context. Never write "approved by", "compliant with" or "allowed at" any company. We do not know any employer's internal policy, and saying so is part of the calm answer.

## 4. The calm answer

Use the shortest version that answers the question asked. Do not lead with it on pages for job seekers: most of them never had the objection, and raising it for them costs trust.

### 4.1 One line (a chip, a footnote, a reply in a thread)

SkipWait never sells a referral and never pays an employee: it verifies people, matches a request to the right company, and leaves the decision and the employer's own process to the employee.

### 4.2 Short (a recruiter or an HR lead asks "isn't this paid referrals?")

No. Nobody on SkipWait is paid to refer, and nobody can buy a referral.

A job seeker pays for a service: we verify that the people who can see their request hold a work email at that company, and we keep the request private. Once an employee picks a request up, the charge is the same whether they accept or pass, so nobody is paying for a yes.

The employee reads the role, the resume and a short note, then decides on their own. Before they can accept, they confirm they will refer only through their company's official process and accept nothing in return. If their employer's policy does not allow it, the right answer is to pass, and we say so.

We do not claim any employer has approved this. Each company's policy is its own, and it wins.

### 4.3 Full (the public answer, for an employee)

**Does this fit my employer's referral rules?**

That depends on your employer's policy, and it wins. Here is exactly what SkipWait does, so you can check it against yours.

- **Nobody pays you.** SkipWait never pays for a referral, and a job seeker must never pay you or offer anything. If one does, report it.
- **You decide.** You read the role and the candidate's note first. Their name and resume open only if you accept. Passing is always fine.
- **You use your company's process.** Before you can accept, you confirm you will refer only through your company's official process and accept nothing in return. SkipWait submits nothing to your employer.
- **You tell the truth about how you know them.** You reviewed their resume and note on SkipWait. If your company's form asks whether you know the candidate personally or have worked with them, answer honestly.
- **If your policy says no, pass.** Some employers ask you to refer only people you know or have worked with. If that is your policy, do not accept. That is the product working as intended.

Work-email verification shows you control an address at your company. It is not your employer's endorsement of SkipWait, and we never say it is.

### 4.4 For a job seeker ("am I paying for a referral?")

No. You pay to send a verified, private request to people who work at that company. The employee is never paid, decides for themselves, and can pass. Once they pick your request up, the charge is the same either way, and a referral never guarantees an interview or a job.

## 5. What we must not claim

- That SkipWait is approved by, partnered with or compliant with any employer's referral policy.
- That an employee is safe from their employer's rules by using SkipWait. They are responsible for their own policy, and we tell them to pass when it says no.
- That verification proves current employment.
- Any outcome, speed or odds for one person. Published figures need their live source and date beside them (D-089).
- That nothing is ever charged. Say what is charged and for what, from `shared/moneyCopy.ts`.

## 6. Where the product still contradicts the story (owner-reserved, rated)

These are not fixed by D-323 or its packet. Each is the owner's call. Ratings are how much each one matters to the pivot, 1 to 10.

### 6.1 Money lines count "referrals", not "referral requests" - 9/10

"3 free referrals every month" and "extra referrals" at a price per level are the first thing a recruiter reads, and they read as referrals for sale. This is the single line that most undoes the new story. The owner chose "3 free referrals" as the headline on Oct 23 (D-180); D-180's own design note already recommends stage-qualified wording ("referral requests left", "uses 1 referral request").

Recommendation: every money line counts **referral requests**, including the free chip. The counter-argument is real: "3 free referrals" is shorter and converts better, and D-153 asks for the plainest word. But a short phrase that says the wrong thing to the people who can shut a corridor is not the plain truth; it is the paid-referral story in four words. Rows `D-180-a-free-asks-chip` and `D-180-referral-words` own these strings.

### 6.2 The paid referrer priority plan (D-196, D-219 (7)) - 9/10

An employee paying for first access to candidates is the hardest thing in the catalog to defend to an employer. The obvious question is why an employee would pay to see candidates first, and the obvious answer is their employer's referral bonus. That is the side hustle `docs/GROWTH_STRATEGY.md` already calls near-fatal. It is unbuilt and unsold today.

Recommendation: keep it unbuilt and out of every public page, and reopen it before any build. The counter-argument: it is the only referrer-side revenue in the plan, and referrers who pay may be more active. I do not know whether any referrer would buy it; nothing has tested that. One week of asking verified referrers would settle it at no cost.

### 6.3 Prices that rise with job level (D-219) - 6/10

A request for a senior role costs more than one for a junior role. Verification and routing cost the same at every level, so a price that tracks seniority reads as pricing the referral's value, not the service. It weakens "you pay for the service".

Recommendation: no change now (frozen, and it is how the business earns). Have the answer ready: senior requests reach fewer, busier people and are capped harder to protect their time. Only say that if the product enforces it.

### 6.4 "A decline keeps the charge" is what makes the story true (D-147) - 8/10

Today, once an employee picks a request up, it costs the same whether they accept or pass. That fact is the proof that a seeker pays for the request, not for a yes. If declines are ever refunded (D-035, rejected, but its scope question is still open), SkipWait becomes pay-per-acceptance: a seeker would be paying only when an employee says yes, which is the paid-referral model in everything but name.

Recommendation: treat D-147 as part of the positioning, and weigh any future refund-on-decline against this. The counter-argument: seekers find paying for a "no" unfair, and that costs word of mouth. Both are true; this is a real trade-off, not a free win.

### 6.5 Smaller leaks, already owned elsewhere

- `/premium` still titles itself "Buy referral credit packs" and the kit FAQ still says "Extra credits are sold in one-time packs". Packs are paused (D-219). Row `PRICING-banded-oct25` owns these files.
- The landing's comparison row is labelled "Your odds". The figures are sourced and carry a disclaimer, but the label sells an outcome. The packet renames the label only.
- The referrer impact card shows "referred this month" (flag off). A shareable count of referrals is exactly what a recruiter looking for referral farming would screenshot. Weigh that before the flag goes on.

## 7. The strongest argument against this pivot

A smart critic would say the wording is not the risk. The risk is the model: a stranger asks an employee to put their name on a candidate they have never met, and many referral policies are written to stop precisely that, paid or not. No copy changes that. What the copy can do is stop making it worse, stop inviting the "paid referrals" reading, and tell employees the truth about their own responsibility. What would actually reduce the risk is product, not words: the honest-vouch step at acceptance ("I know their work" / "profile match: I do not know them"), which `docs/GROWTH_STRATEGY.md` move 7 already describes and which is not built.

Rating of the pivot as decided: **8/10**. It costs nothing, it makes the public story match rules the product already enforces, and it removes the most quotable evidence against us. It stays below 9 because 6.1 and 6.2 are still in the catalog, and a story the price list contradicts does not hold for long.
