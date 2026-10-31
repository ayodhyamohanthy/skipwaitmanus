# PRICING-banded-oct25

**Row:** PRICING / money lane. **Tier:** 1 (money). **Branch:** agent/pricing/banded-plans-oct25 (PR 666).

## Scope
Implements the owner's frozen Oct 25 banded plan family in shared/planFamily.ts (Early-Mid Rs229/$4.49, Mid-Senior Rs899/$17.99, Senior-Exec Rs1,299/$25.99, per-level top-ups, 3 free referrals/month behind a verified card) and rewires Plans/Premium/Pricing/planCatalog/kitCheckout to it, replacing the fee+credits model. PASS_SALES_ENABLED stays false; no sale is enabled by this work. This row no longer owns .github/workflows/ci.yml (Oct 28 handoff, holder's acknowledgment: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6464335154). Its only ci.yml delta, the tsc old-space line from c9572fcf (OOM gave exit 1 with no diagnostics), is carried byte for byte by CI-architect-real-checks; the design-token-audit step is already on main. #666 lands no ci.yml change and merges main once that row lands.

## Authority
Owner freeze Oct 25 (user iMessages: "Freezer it" phonemsg-01M5SE7ASV2Y7YCRRZ99E23Y63 17:18 IST, "Freeze this and push to repo" phonemsg-01M5SEPSD0B9BWSEAZZY2Q8XN3 17:26, the banded+card-gated model phonemsg-01M5SFYFY54D3VAEDAEA3591SS 17:48, and "in place of credits we are using name referrals" phonemsg-01M5SG36CB2WMTCKY6HFRS4X7A 17:50). This row registers the already-open PR 666 so the origin/main scope check can see it; it decides nothing new. docs/PRICING.md alignment rides with this lane per D-214.

**Register (Oct 27):** the decision this row implements is D-219 (PR #720), whose authority chain is the 19:13 to 19:35 IST messages Instinct cited on PR #666 (comment 6423014846); the 17:18 to 17:50 messages above are the earlier freeze steps. `docs/PRICING.md` is aligned in #720, not on this branch. D-219's conditions bind this build: nothing goes on sale, referrer and company plans stay unchargeable, and the regular price after a founding cap is unsettled (the code must not price it).

## Gate
Green required CI + one independent (non-builder) review per D-151 before merge. Flag-off behavior must stay flag-off.


## Oct 31 independent findings: bounded remediation on this row

Independent review: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#pullrequestreview-5721976397, exact head `521c86101c4ec799929ffaf221b75e497eabadf5`, verdict commit `d59f14b1afbca22bdb36706cf516f705f8f05d36` (findings), report `41a451f879797eb8eecb7b0f5aa9661b6170a151`. This amendment changes only scope for those findings, not product authority, queue order or the review verdict. Keep the existing row12 branch and PR666.

- F1: `client/src/pages/plansGoal.test.tsx` gains the paused-state assertion (out of requests links to `/plans`, "See plans", no premium purchase link) and a positive control proving the pack CTA returns only when `CREDIT_PACKS_ON_SALE` is true. No assertion is dropped to hide the composed failure. This path's registered owner D-048-p3-plans is done.
- F2: `scripts/prerender-public-pages.tsx` gains only the premium/plans/employer pack-pause copy correction; `shared/landingContent.ts` only its crawler pack-sale link; `client/src/pages/About.tsx` only its pack-sale sentence. Premium metadata and the copy guard in `policyPages.test.tsx` are already owned. Add a red-first guard for paused generated snapshots, About and Premium metadata before the repair. Preserve snapshot markup/layout and on-sale behavior where applicable. Snapshot path owners are done; About has no current registered owner.
- F3: use the already-owned Pricing.tsx and policyPages.test.tsx to state the frozen free rule: 3 referrals a month at any level, verified card, no carry-forward. State the frozen term, not an activated card gate. No shared moneyCopy or legal text rewrite.

Overlap qualification on current main f09b72dc found historical open416/383 landing FAQ changes and110 premium snapshot/FAQ changes. Those branches remain held and are not adopted or resumed. The intended crawler-link hunk is separate from their FAQ hunks; preserve/reconcile the snapshot hunk against current truth and stop for an actual conflicting unpublished holder edit. No silence-as-ACK. Open827 is docs-only and is not adopted as a bundle.

Next stage is a normal FIX claim by an eligible non-Qoder developer after actual assignment/receipt and current preflight, never the Qoder reviewer family fixing its own findings. Claude remains reasoning/handoffs under the latest role split. Keep frozen prices, plan content, display-default behavior, server flag-off gates, paused packs/passes, legal wording and all production/migration/settings/spending holds. Re-review exact repaired composition independently; retained raw evidence at ff78c549 (composition886ccfce, parents521c8610+363dd910) records5451pass/3fail and isolated110pass/1fail, not a green gate; no composed build was run. Full applicable checks and exact CI still apply.

### Existing shared-path serialization

D-048-p3-premium and D-048-p3-pricing wait for this row before editing their Premium/Pricing switch hunks. LAUNCH-legal-copy (owner-held) and D-180-a-free-asks-chip also wait for this row before their policyPages edits. Existing716 changes the Guidelines money-line assertion;659 changes Terms/Cancellation assertions. The new pricing/pack-pause guard is separate: retain those assertions and holds, do not edit legal text, goal switches or Guidelines wording. Historical416/383/110/187/25/18 changes are not adopted or released. Obtain limited serialization only for an actual conflicting in-flight hunk, never a blanket owns transfer; a clean remote alone does not prove no unpublished work.
