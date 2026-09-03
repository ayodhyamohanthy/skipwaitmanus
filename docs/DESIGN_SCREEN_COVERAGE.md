# Design Screen Coverage — skipwait.me

_Spec: `docs/design/pending-screens-handoff.md` (design source of truth, style preset 17 Takram adapted to brand `#0B57D0`)._
_Coverage verified 2026-09-03._

## Status legend
- ✅ implemented & live · 🔵 partial · ⚪ not implemented

## The 6 spec screens

| # | Screen | Status | Where | Notes |
|---|--------|--------|-------|-------|
| 2.1 | Seeker — Pending requests | ✅ | `client/src/pages/MyRequests.tsx` | list + CreditMeter, View details, Withdraw (pending-only, confirm dialog w/ refund copy) |
| 2.2 | Seeker — Detail + states | ✅ | `MyRequests.tsx` | 3-step progress timeline, empty state, >=300ms skeleton + 15s fallback, error-card w/ Try again + Keep request |
| 2.3 | Referrer — Incoming queue | ✅ | `client/src/pages/MyCompanyInbox.tsx` | New/Saved/Completed tabs + count badge, CreditMeter, capacity-open empty state, save-for-later, impact summary |
| 2.4 | Referrer — Detail + states | ✅ | `MyCompanyInbox.tsx` | candidate preview (resume/documents/Role link/identity-hidden), one-tap accept + decline-reason chips, race error (E2), empty + loading states |
| 2.5 | Admin — **Approval queue** | ✅ (built this session) | `client/src/pages/AdminApprovalQueue.tsx` + `/api/admin/approval-queue` | unified 3-record-type queue (seeker request / referrer enrollment / credit-pack payment), Status·Role·Recent filters + "N open" pill, inline Open record / Approve / Reject w/ optimistic badge, filtered-empty + error w/ Retry |
| 2.6 | Admin — **Record detail + history** | ✅ (built this session) | `client/src/pages/AdminApprovalRecord.tsx` + `/api/admin/approval-queue/:kind/:id/decision` | kind-appropriate blocks, credit movement, HISTORY timeline (actor + timestamp), always-visible decision note, Approve(solid green)/Reject(red outline), back link |

## Shared components (spec §1)
- **StatusBadge** — ✅ `client/src/components/StatusBadge.tsx` (dot + label, 4.5:1 tint, tone map incl. withdrawn).
- **PendingItemCard** — implemented inline in the queue/detail pages (Row1 title+badge, Row2 muted, Row3 summary, Row4 meta chips, Row5 actions).
- **FilterBar / tabs** — ✅ referrer tabs in MyCompanyInbox + admin filter chips in AdminApprovalQueue.
- **CreditMeter** — ✅ `SeekerCreditsCard` + `ReferrerCreditsCard`.

## Freshly built this session (2.5 + 2.6)
- **Server**: `db.listAdminApprovalQueue()` / `listReferrerEnrollmentsAwaitingAction()` / `resolveAdminApproval()`; routes `GET /api/admin/approval-queue` + `POST /api/admin/approval-queue/:kind/:id/decision` (admin-guarded; records to operationalActivityLogs).
- **Client**: `AdminApprovalQueue.tsx` (route `/admin/approvals`) + `AdminApprovalRecord.tsx` (route `/admin/approvals/:kind/:id`) + `lib/adminApproval.ts` (status vocab). Admin nav links added to AdminActivity + AdminFlowHealth.
- **Tests**: 13 new (5 server route + 8 component). Full suite **274 passed / 5 skipped**.

## Behavior notes / deviations (documented)
- `referrer_enrollment` has no status column → decisions recorded in `operationalActivityLogs` only; badge derived from latest `admin.approval_*` row (still shows Approved/Declined).
- No claim-time column → `meta.claimTime` uses row `updatedAt`; `company_referral.claimed` activity events preferred on detail history.
- Detail reuses queue-list + activity endpoints and client-filters (no new get-by-id endpoint) so it survives refresh/direct links.
- Approving a payment credits tokens (delegates to existing `resolveRequiresReviewPayment`); admin approvals send no notifications (spec only references notifications in the failure copy).

## Deploy
- Commit `41e5538`, pushed. Web deploy ✅ (1m10s). API deploy cycling via sleep-first verify; `/admin/approvals` returns 200 (route live).
