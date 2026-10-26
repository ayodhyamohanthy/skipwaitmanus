# PRICING-banded-oct25

**Row:** PRICING / money lane. **Tier:** 1 (money). **Branch:** agent/pricing/banded-plans-oct25 (PR 666).

## Scope
Implements the owner's frozen Oct 25 banded plan family in shared/planFamily.ts (Early-Mid Rs229/$4.49, Mid-Senior Rs899/$17.99, Senior-Exec Rs1,299/$25.99, per-level top-ups, 3 free referrals/month behind a verified card) and rewires Plans/Premium/Pricing/planCatalog/kitCheckout to it, replacing the fee+credits model. PASS_SALES_ENABLED stays false; no sale is enabled by this work. The ci.yml delta raises the tsc old-space limit (OOM gave exit 1 with no diagnostics) and wires the existing design-token-audit into the workflow.

## Authority
Owner freeze Oct 25 (evening iMessages; frozen rules mandate). This row registers the already-open PR 666 so the origin/main scope check can see it; it decides nothing new. docs/PRICING.md alignment rides with this lane per D-214.

## Gate
Green required CI + one independent (non-builder) review per D-151 before merge. Flag-off behavior must stay flag-off.
