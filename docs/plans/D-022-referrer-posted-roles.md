# D-022: referrer-posted roles on company pages (P1, issue #245)

Packet only (D-109). This PR adds no row to docs/plans/assignments.json. Only Claude Code adds rows, per the rules in that file. Nothing here is built or checked against main.

## Spec (from issue #245)
1. Posting gate: any verified employee (SSO or work-email OTP) can post roles they can refer for at their company. Role URLs must be on the company's own careers site or a recognised ATS.
2. Display: openings on /explore/:slug and on /wall, newest first, no paid ordering. The poster is shown as "a verified employee" unless they opt to show their first name.
3. Lifecycle: a post hides after 30 days unless renewed with one tap. The poster can close it at any time.
4. Referral routing (48h first look): a seeker's ask goes only to the poster for 48 hours. If the poster is paused or at capacity, the window is skipped and the ask opens to all verified employees. After 48 hours with no accept or decline, it opens to all verified employees, and the poster may still accept. If the poster declines, it reopens to colleagues per D-021, and the credit stays spent.
5. Tests: unit and integration tests for the posting gate, the 48h window, the paused or capacity bypass, expiry and renewal, and decline reopening. pnpm check and the test suite pass.

## Overlap to check before a row is picked
- #308 (TASK13-pinned-work), #311 (ROW20-B) and #314 (ROW20-CD) are open picker rows in the same ask and referral area. Their migration numbers need checking against main.
- The decline-reopen path touches credits, so it is Tier 1 (D-074): independent review on a draft PR before main.

## Not verified
- Whether any of items 1 to 5 already exist on main. The code was not read.
- Which migration number is free. The D-067 row note says 0098 (Neutrinos) and 0099 (D-067) are taken.

## Suggested split (architect to confirm)
One row each for items 1 to 5 and one for tests, so idle agents can take them in parallel.
