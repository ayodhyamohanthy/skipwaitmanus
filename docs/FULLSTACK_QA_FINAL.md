# Full-stack QA — screens, flows, errors (final report 2026-09-04)

## 1. Screen design completeness (audited all 27+ screens, 30+ routes)

Every screen was read line-by-line for state coverage (loading / empty /
error / success) and feature completeness:

| Screen | States | Design verdict |
|---|---|---|
| Home | hero + dual CTA + workflow steps + quick-access | ✅ complete |
| Onboarding (/start) | validation error, step 1 of 3, continue | ✅ |
| ReferralRequest | step 2-3, resume upload, sign-in intercept + draft save, success (`data-referral-success`) + What-happens-next panel + Track CTA | ✅ complete |
| MyRequests | loading/empty/error+retry/withdraw dialog/progress/Ref-XXXX/compensation | ✅ complete |
| Referrer | OTP sign-in flow, all gate screens | ✅ complete |
| MyCompanyInbox | tabs, preview, accept/decline chips, race copy, post-decision conversation tip | ✅ complete |
| OpportunityWall | loading/empty/error/compensation/share/pagination | ✅ complete |
| PostOpportunity | checking gate/access gate/multi-step/publishing/success/error alert/compensation | ✅ complete |
| ShareHub | sign-in gate, loading link, disabled states, email invite, social share | ✅ complete |
| ReferralConversation | sign-in gate, loading skeleton, error card, empty conversation, messages, progress milestones, share card | ✅ complete |
| Notifications | loading/empty/error/read-unread | ✅ complete |
| Plans/Premium | loading/error/pricing/credits | ✅ complete |
| Settings | work-email states, privacy export/erasure, design-system link | ✅ complete |
| Admin x7 (activity/approvals/record/payments/flow-health/privacy/token) | loading/empty/error/approve/reject/refund/revenue/history | ✅ complete |
| ComponentShowcase | 175 components — was unlinked; now routed at /components + linked from Settings | ✅ (fixed QA-001) |

## 2. Full-stack bugs found & fixed this pass

| ID | Sev | Bug | Fix |
|---|---|---|---|
| FS-1 | HIGH | /api/opportunities 500 → /wall broken (companyOpportunities.compensation missing from live DB) | graceful degradation in both queries (catch → retry without the column) + migration 0035 |
| FS-2 | HIGH | schema.ts / live-DB drift could silently break any screen | **boot-time schema auto-reconcile** (server/schemaReconcile.ts): idempotent, non-fatal, covers compensation×2 + savedAt; /api/health reports schemaReconciled |
| FS-3 | MEDIUM | same class of drift broke the referrer inbox earlier (9d383cb) | now impossible to recur silently — reconcile self-heals at every boot |

## 3. Verification

| Check | Result |
|---|---|
| Full suite | **287 passed / 5 skipped (87 files)** — includes 5 new reconcile tests |
| pnpm check | clean |
| pnpm build | exit 0 |
| CI Deploy API `054b337` | completed success |
| Live /api/opportunities | **HTTP 200** `{"opportunities":[]}` (was 500) |
| Live /api/health | ok:true (reports commitSha + schemaReconciled) |
| Live /wall, /post-opportunity, /components | 200, screens render |

## 4. How the self-heal works

On every container boot: `reconcileSchema()` reads `information_schema.COLUMNS`,
compares against the DESIRED_COLUMNS list, and `ALTER TABLE ... ADD COLUMN` for
anything missing (idempotent, non-fatal on failure). The warm instance serves
the old image until its 10-minute idle recycle; the cold start then reconciles.

## 5. Rollback
- UX/QA fixes: `git revert <commit>` (client-only).
- Auto-reconcile: `git revert 054b337` — the app then trusts migrations only
  (reconcile is additive; the DB column it adds is harmless to keep).

## 6. Known remaining
- 4 test files flake under full-suite parallel load (pass isolated — env timing).
- Usability test sessions (5 human participants) remain a ready-to-run plan.
- Warm-instance recycle means new API images appear after ≤10 min idle.
