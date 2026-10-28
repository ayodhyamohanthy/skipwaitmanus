# PRICING-banded-oct25

**Row:** PRICING / money lane. **Tier:** 1 (money). **Branch:** agent/pricing/banded-plans-oct25 (PR 666).

## Scope
Implements the owner's frozen Oct 25 banded plan family in shared/planFamily.ts (Early-Mid Rs229/$4.49, Mid-Senior Rs899/$17.99, Senior-Exec Rs1,299/$25.99, per-level top-ups, 3 free referrals/month behind a verified card) and rewires Plans/Premium/Pricing/planCatalog/kitCheckout to it, replacing the fee+credits model. PASS_SALES_ENABLED stays false; no sale is enabled by this work. This row no longer owns .github/workflows/ci.yml (Oct 28 handoff, holder's acknowledgment: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6464335154). Its only ci.yml delta, the tsc old-space line from c9572fcf (OOM gave exit 1 with no diagnostics), is carried byte for byte by CI-architect-real-checks; the design-token-audit step is already on main. #666 lands no ci.yml change and merges main once that row lands.

## Authority
Owner freeze Oct 25 (user iMessages: "Freezer it" phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63 17:18 IST, "Freeze this and push to repo" phonemsg-01M5SEPSD0B9BWSEAZZY2Q8XN3 17:26, the banded+card-gated model phonemsg-01M5SFYFY54D3VAEDAEA3591SS 17:48, and "in place of credits we are using name referrals" phonemsg-01M5SG36CB2WMTCKY6HFRS4X7A 17:50). This row registers the already-open PR 666 so the origin/main scope check can see it; it decides nothing new. docs/PRICING.md alignment rides with this lane per D-214.

**Register (Oct 27):** the decision this row implements is D-219 (PR #720), whose authority chain is the 19:13 to 19:35 IST messages Instinct cited on PR #666 (comment 6423014846); the 17:18 to 17:50 messages above are the earlier freeze steps. `docs/PRICING.md` is aligned in #720, not on this branch. D-219's conditions bind this build: nothing goes on sale, referrer and company plans stay unchargeable, and the regular price after a founding cap is unsettled (the code must not price it).

## Gate
Green required CI + one independent (non-builder) review per D-151 before merge. Flag-off behavior must stay flag-off.
