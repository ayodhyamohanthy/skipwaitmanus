# PRICING-banded-oct25

**Row:** PRICING / money lane. **Tier:** 1 (money). **Branch:** agent/pricing/banded-plans-oct25 (PR 666).

## Scope
Implements the owner's frozen Oct 25 banded plan family in shared/planFamily.ts (Early-Mid Rs229/$4.49, Mid-Senior Rs899/$17.99, Senior-Exec Rs1,299/$25.99, per-level top-ups, 3 free referrals/month behind a verified card) and rewires Plans/Premium/Pricing/planCatalog/kitCheckout to it, replacing the fee+credits model. PASS_SALES_ENABLED stays false; no sale is enabled by this work. This row no longer owns .github/workflows/ci.yml (Oct 28 handoff, holder's acknowledgment: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6464335154). Its only ci.yml delta, the tsc old-space line from c9572fcf (OOM gave exit 1 with no diagnostics), is carried byte for byte by CI-architect-real-checks; the design-token-audit step is already on main. #666 lands no ci.yml change and merges main once that row lands.

## Authority
Owner freeze Oct 25 (user iMessages: "Freezer it" phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63 17:18 IST, "Freeze this and push to repo" phonemsg-01M5SEPSD0B9BWSEAZZY2Q8XN3 17:26, the banded+card-gated model phonemsg-01M5SFYFY54D3VAEDAEA3591SS 17:48, and "in place of credits we are using name referrals" phonemsg-01M5SG36CB2WMTCKY6HFRS4X7A 17:50). This row registers the already-open PR 666 so the origin/main scope check can see it; it decides nothing new. docs/PRICING.md alignment rides with this lane per D-214.

**Register (Oct 27):** the decision this row implements is D-219 (PR #720), whose authority chain is the 19:13 to 19:35 IST messages Instinct cited on PR #666 (comment 6423014846); the 17:18 to 17:50 messages above are the earlier freeze steps. `docs/PRICING.md` is aligned in #720, not on this branch. D-219's conditions bind this build: nothing goes on sale, referrer and company plans stay unchargeable, and the regular price after a founding cap is unsettled (the code must not price it).

## Release check: no page still offers a paused pack (D-234, Oct 29)
This PR sets `CREDIT_PACKS_ON_SALE` to false and refuses a new pack checkout with a 409 before any provider call. Before it lands, every pack offer on a page this row owns reads `CREDIT_PACKS_ON_SALE`, so its words stay true whichever state is live (D-044, D-153). On `main` `622d1b0f` two such pages sit outside the original diff, and this row now owns both:
- `shared/landingContent.ts:17-18, 58, 99`, rendered by `client/src/pages/Home.tsx`, `GoalLanding.tsx` and `GoalLandingV9.tsx`: the landing page's "Buy credits" link ("Extra referral credits are sold in one-time packs that never expire") and its "What does it cost?" answer ("Extra credits are sold in one-time packs (from ₹99 for 2 in India, $5 for 5 elsewhere)").
- `client/src/pages/About.tsx:22`: "more use credits, which they can buy online as one-off credit packs that never expire."

A test pins each with `CREDIT_PACKS_ON_SALE` false, and the reviewer checks both at the exact head. New words follow D-180: no page says "credit(s)" or the noun "ask". Two more lines sit in files other open rows own, so they are not this PR's: `/premium`'s search title and description (`shared/publicRoutes.ts:39`) go to `D-176-public-claims`, and the composer's no-credits lines (`shared/moneyCopy.ts:114-116`) go to `D-180-a-free-asks-chip`. Terms (`client/src/pages/Terms.tsx:23`) stays with `LAUNCH-legal-copy` and the owner. Merging `main` into #666 is clean on `622d1b0f` (tree `73c61fde`) and leaves no `ci.yml` delta, so that merge meets the Oct 28 handoff condition.

## Gate
Green required CI + one independent (non-builder) review per D-151 before merge. Flag-off behavior must stay flag-off.
