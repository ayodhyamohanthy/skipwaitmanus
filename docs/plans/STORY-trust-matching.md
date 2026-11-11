# STORY-trust-matching: the landing and the employer-rules answer tell the trust and matching story (D-321)

> Read [`docs/BRIEF.md`](../BRIEF.md) first, then [`docs/POSITIONING.md`](../POSITIONING.md), which is the source for every string below.

**Decision:** D-321 (owner, Nov 11, 2026). **Rows:** `STORY-trust-landing` and `STORY-employer-rules-answer`, both Tier 2, both `todo`. **Written by:** a Claude session (intelligence and reasoning, D-225). **Built by:** any other capable tool, from the picker.

## 0. Why

Paid job referrals can clash with employer referral rules, and a recruiter may read SkipWait as a conflict. The product already enforces the rules that answer that (referrers never paid, official-process confirmation at accept, private until acceptance). The public copy does not say so, and parts of it still use the pre-D-180 noun "ask". These two rows change words only.

Goal fit: employees who fear their employer's policy do not verify, and supply is the bottleneck (`docs/GROWTH_STRATEGY.md`, move 1). Growth loop: L1.

## 1. Rules for both rows

1. **Words only.** No layout, component, route, flag, price, eligibility or behaviour change. No new dependency.
2. **Money sentences are not retyped or edited.** Everything exported by `shared/moneyCopy.ts` stays byte-identical; rows `D-180-a-free-asks-chip` and `D-180-referral-words` own it. If a string below sits next to a money sentence, leave the money sentence alone.
3. **Legal pages are untouched** (Terms, Privacy, Refunds, Cancellation, Shipping).
4. **No employer is named.** No "approved by", "compliant with" or "allowed at". No figure without its live source and date (D-089).
5. **Single source.** A string rendered by both the page and the prerendered snapshot lives in `shared/` and is imported by both, so `home.snapshotParity.test.tsx` keeps them identical.
6. **Check the claim before you ship it (D-153).** Before the official-process sentence lands, re-read `server/privateReferralRoutes.ts` and confirm an acceptance is still refused without `ethicsConfirmed === true` on every accept route. If that has changed, stop and `--report blocked "STORY-trust-landing: official-process confirmation is not enforced"`.
7. **Shared files (D-314).** Other open rows touch some of these files; that holds nothing. If one lands first, merge `main` and keep both changes. Never drop another row's hunk.

## 2. Row `STORY-trust-landing`

Branch `agent/queue/story-trust-landing`. The signed-out landing (`GoalLandingV9`, surface `home`, released) and its snapshot.

### 2.1 Owned paths

- `shared/landingContent.ts`
- `client/src/pages/GoalLandingV9.tsx`
- `scripts/prerender-public-pages.tsx`
- `client/index.html`
- `client/src/pages/GoalLandingV9.test.tsx`
- `client/src/pages/GoalLanding.test.tsx`
- `client/src/pages/home.snapshotParity.test.tsx`
- `scripts/prerenderPublicPages.test.ts`
- `scripts/prerenderOutput.test.ts`
- `server/appTitle.test.ts`
- `design/goal-ui/captures/story-trust/**`

Not owned, do not edit: `client/src/pages/Home.tsx` (the kit page signed-in visitors still see; three open rows own it), `client/src/pages/GoalLanding.tsx` (V7, not rendered; it picks up the new fair rules through `goalLandingFairRules`), `shared/moneyCopy.ts`, `shared/publicRoutes.ts`, `client/src/pages/About.tsx`.

### 2.2 Strings in `shared/landingContent.ts`

| Constant | Now | Change to |
|---|---|---|
| `LANDING_TITLE` | Private job referrals from verified employees | Request a job referral from a verified employee |
| `GOAL_LANDING_H1` | Nobody reads the pile. | no change (owner-picked; nothing in it conflicts) |
| `GOAL_LANDING_HERO_LEAD` | Mass applications meet software, not people. Here, one verified employee at the company you want to join reads your ask - and can open a private conversation. No commissions, no outcome promises. | Mass applications meet software, not people. skipwait.me matches your referral request to verified employees at the company you want to join. They read it privately and decide for themselves. Nobody is paid to say yes. |
| `GOAL_LANDING_BAND_LEAD` | A verified employee inside the company picks your ask and opens a private conversation - so you arrive as a person, not one more application in the pile. | A verified employee inside the company chooses your request and opens a private conversation - so you arrive as a person, not one more application in the pile. |
| `GOAL_LANDING_EMPLOYEE_LEAD` | Review asks when it feels right and open a door you believe in. Referring is always free - and referrers are never paid, so every yes stays genuine. | Review requests when it feels right, and refer only people you believe in, through your company's own referral process. Referrers are never paid, so every yes stays genuine. |
| `GOAL_LANDING_COMPARE_ROWS[0][2]` | One ask, read by a verified employee inside the company. | One request, read by a verified employee inside the company. |
| `GOAL_LANDING_COMPARE_ROWS[1][2]` | One thoughtful ask with your resume and a short note - not another form. | One thoughtful request with your resume and a short note - not another form. |
| `GOAL_LANDING_COMPARE_ROWS[3][0]` | Your odds | The numbers |
| `goalLandingSteps` step 1 body | See the companies with verified employees inside, and the roles you can ask about. | See the companies with verified employees inside, and the roles you can request a referral for. |
| `goalLandingSteps` step 2 title | Ask with the cost up front | Request with the cost up front |
| `goalLandingSteps` step 3 body | An accepted ask opens a private conversation. A referral is an introduction, never a promise of an interview or a job. | An accepted request opens a private conversation. A referral is an introduction, never a promise of an interview or a job. |
| `goalLandingTrust` card 1 body | Every referrer proves their company email before they can see a single ask. | Every referrer proves their company email before they can see a single request. |

The step 2 body, trust card 3 and fair rule "cost" line come from `askCostLanding` in `shared/moneyCopy.ts`. They are not this row's (rule 2), so the noun "ask" stays in them until `D-180-referral-words` lands.

`goalLandingFairRules` gains two lines, as new exported constants in the same file. The list becomes, in order:

1. `REFERRING_FREE_LINE` (unchanged)
2. new `GOAL_LANDING_FAIR_NO_SALE`: Nobody can buy a referral. You send a request; a verified employee decides on their own, and can always pass.
3. new `GOAL_LANDING_FAIR_EMPLOYER_PROCESS`: The employer's process, every time. Before accepting, a referrer confirms they will refer only through their company's official process and accept nothing in return.
4. `costCopy.fairRule` (unchanged)
5. No outcome promises: a referral is an introduction, not an interview or a job. (unchanged)
6. Private by default: your name stays hidden until a referrer accepts. (unchanged)

Add three exported constants so the page and the snapshot share them:

- `GOAL_LANDING_KICKER`: Verified referral matching
- `GOAL_LANDING_FOOTER_BLURB`: A warmer way in. Verified employees, private requests, their decision. skipwait.me is in beta.
- `GOAL_LANDING_COMPARE_COLUMN`: One request on skipwait.me

### 2.3 Inline strings in `client/src/pages/GoalLandingV9.tsx` and `scripts/prerender-public-pages.tsx`

Replace each inline literal with the shared constant, in both files:

| Where | Now | Becomes |
|---|---|---|
| hero kicker | Private job referrals | `GOAL_LANDING_KICKER` |
| comparison column header | One referral on skipwait.me | `GOAL_LANDING_COMPARE_COLUMN` |
| footer blurb | A warmer way in. Private job referrals from verified employees. skipwait.me is in beta. | `GOAL_LANDING_FOOTER_BLURB` |

Everything else on the page stays: the H1, the band H2, the comparison H2 and figures with their source line, the quote, "Real insiders. / Real rules.", "What never changes", the search form, every link.

### 2.4 `client/index.html`

`<title>`, `og:title` and `twitter:title` follow `LANDING_TITLE` ("Request a job referral from a verified employee — skipwait.me"); `server/appTitle.test.ts` pins them. Change the JSON-LD `description` values that repeat the old title the same way. Do not touch the description meta (`LANDING_SUMMARY`, a money sentence).

### 2.5 Tests (failing first)

- `scripts/prerenderOutput.test.ts` or `scripts/prerenderPublicPages.test.ts`: the home snapshot contains `GOAL_LANDING_FAIR_NO_SALE` and `GOAL_LANDING_FAIR_EMPLOYER_PROCESS`, and contains none of: `your ask`, `Review asks`, `One referral on skipwait.me`, `Your odds`.
- `client/src/pages/GoalLandingV9.test.tsx`: the rendered page shows the kicker, both new fair rules and the new employee lead.
- A guard in one of the owned tests: no string exported from the goal-landing block of `shared/landingContent.ts` matches `/buy a referral|paid referral|compliant|approved by/i`.
- Update the existing expectations that pin the old strings. Never delete or loosen an assertion to get green (`GATE-test-integrity`).

### 2.6 Acceptance

- `pnpm check`; `node scripts/design-token-audit.mjs`; the six owned tests; `pnpm build`; the prerendered `dist/public/index.html` shows the new strings.
- Captures of `/` signed out at 1280 and 390 in `design/goal-ui/captures/story-trust/`, before and after. The fair-rules list is six lines; check it does not overflow at 390.
- The pull request quotes this packet section and lists each string changed. Tier 2: green required CI, no separate review (D-200 (4)).

## 3. Row `STORY-employer-rules-answer`

Branch `agent/queue/story-employer-rules-answer`. The calm answer, readable by anyone, in one place per audience.

### 3.1 Owned paths

- `shared/employerRulesCopy.ts` (new)
- `shared/employerRulesCopy.test.ts` (new)
- `client/src/content/guides.ts`
- `client/src/pages/Safety.tsx`
- `client/src/pages/goal/support/supportContent.ts`
- `client/src/pages/goal/support/GoalSafety.tsx`
- `client/src/pages/goal/support/supportGoal.test.tsx`
- `client/src/pages/policyPages.test.tsx`
- `client/src/pages/trustCluster.test.tsx`
- `client/src/pages/goal/policy/policyText.goal.test.tsx`
- `scripts/prerenderOutput.test.ts`
- `design/goal-ui/captures/story-employer-rules/**`

### 3.2 `shared/employerRulesCopy.ts` (new, the one source)

Export exactly the text of `docs/POSITIONING.md` section 4.3:

- `EMPLOYER_RULES_QUESTION`: Does this fit my employer's referral rules?
- `EMPLOYER_RULES_LEAD`: That depends on your employer's policy, and it wins. Here is exactly what SkipWait does, so you can check it against yours.
- `EMPLOYER_RULES_POINTS`: the five points, each a `{ title, body }` pair, word for word from section 4.3.
- `EMPLOYER_RULES_VERIFICATION_NOTE`: Work-email verification shows you control an address at your company. It is not your employer's endorsement of SkipWait, and we never say it is.
- `EMPLOYER_RULES_SHORT`: the one line of section 4.1.

`shared/employerRulesCopy.test.ts` pins: no employer name from `shared/companyDirectorySeed.ts` appears in any export; none matches `/compliant|approved by|allowed at|guarantee/i`; the points include "official process" and "pass".

### 3.3 Where it renders

1. **`/how-employees-refer-candidates`** (`client/src/content/guides.ts`, released `policy` surface): a new section after "The decision itself", heading `EMPLOYER_RULES_QUESTION`, the lead as its paragraph, the five points as its `points` (title and body joined as `Title. Body`), the verification note as a closing paragraph. This is the link to send a recruiter or an employee.
2. **`/safety`** (`client/src/pages/Safety.tsx`, the live kit page): one new entry in `ANSWERS` after "What does work-email verification mean?": question `EMPLOYER_RULES_QUESTION`, answer `EMPLOYER_RULES_LEAD` followed by a text link "How referring works here" to `/how-employees-refer-candidates`.
3. **Goal `/safety`** (`supportContent.ts` / `GoalSafety.tsx`, not released yet): the same entry, so the answer does not disappear when the `support` surface is released.

Do not change any other answer on those pages. The existing cost answer ("There are no commissions and no paid priority: a referral is a voluntary introduction, not a purchase.") already fits and stays.

### 3.4 Acceptance

- `pnpm check`; the owned tests; `pnpm build`; the prerendered guide page contains the heading.
- Captures of `/how-employees-refer-candidates` and `/safety` at 1280 and 390, before and after.
- Tier 2: green required CI.

## 4. Out of scope (owner questions, `docs/POSITIONING.md` section 6)

- Counting "referral requests" instead of "referrals" in money lines (6.1).
- The paid referrer priority plan (6.2), level-based prices (6.3), decline-keeps-the-charge (6.4).
- `/premium` and the kit FAQ's pack wording (owned by `PRICING-banded-oct25`).
- The referrer pages (`/referrer`, `/referrer-home`): they carry sign-in and step-up code (Tier 1). A one-line pointer to the guide there is worth a later row once D-057's gate has landed.

## 5. Status

- `STORY-trust-landing`: todo. Not started.
- `STORY-employer-rules-answer`: todo. Not started.

Read receipt for this packet (Nov 11, 2026): written against `origin/main` `5f297cb6`; register read through D-320, plus D-006, D-040, D-055, D-147, D-153, D-173, D-176, D-180, D-196, D-219, D-225, D-314; no earlier session or packet exists for this work.
