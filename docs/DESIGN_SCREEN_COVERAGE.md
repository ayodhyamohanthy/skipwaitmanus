# Design Screen Coverage — skipwait.me

_Spec: `docs/design/pending-screens-handoff.md` (design source of truth, style preset 17 Takram adapted to brand `#0B57D0`)._
_Coverage verified 2026-09-03; pending-state gap audit + build 2026-09-05 (see "Pending-state pass")._

## Status legend
- ✅ implemented & live · 🔵 partial · ⚪ not implemented

## The 6 spec screens

| # | Screen | Status | Where | Notes |
|---|--------|--------|-------|-------|
| 2.1 | Seeker — Pending requests | ✅ | `client/src/pages/MyRequests.tsx` | list + CreditMeter, View details, Withdraw (pending-only, confirm dialog w/ refund copy) |
| 2.2 | Seeker — Detail + states | ✅ | `MyRequests.tsx` | 3-step progress + **status-history timeline** (`RequestStatusTimeline`), empty state with headline + value line, **≥300 ms skeleton + 15 s honest notice** (`useSlowLoad` + `LoadingSkeleton`), **load-error card with Try again + Back to home** (`ActionErrorCard`), withdraw error w/ Try again + Keep request. _Correction: before 2026-09-05 the 15 s notice and load-error retry were listed here but not implemented._ |
| 2.3 | Referrer — Incoming queue | ✅ | `client/src/pages/MyCompanyInbox.tsx` | New/Saved/Completed tabs + count badge, CreditMeter, capacity-open empty state, save-for-later, impact summary |
| 2.4 | Referrer — Detail + states | ✅ | `MyCompanyInbox.tsx` | candidate preview (resume/documents/Role link/identity-hidden), one-tap accept, **decline chips → confirm step (`role="group"` "Confirm decline" / Cancel) → POST**, race error (E2) **surfaced on the preview with Back to queue**, queue load error **with Try again (list kept)**, ≥300 ms skeleton + 15 s notice. _Correction: before 2026-09-05 decline chips posted immediately with no confirm, and the error state had no retry._ |
| 2.5 | Admin — **Approval queue** | ✅ | `client/src/pages/AdminApprovalQueue.tsx` + `/api/admin/approval-queue` | unified 3-record-type queue (seeker request / referrer enrollment / credit-pack payment), Status·Role·Recent filters + "N open" pill, inline Open record / Approve / Reject w/ optimistic badge, filtered-empty (**+ Clear filters**) + error w/ Retry, 15 s slow notice, shared **AdminNav** |
| 2.6 | Admin — **Record detail + history** | ✅ | `client/src/pages/AdminApprovalRecord.tsx` + `/api/admin/approval-queue/:kind/:id/decision` | kind-appropriate blocks, credit movement, HISTORY timeline (actor + timestamp), always-visible decision note, Approve(solid green)/Reject(red outline), back link |

## Shared components (spec §1)
- **StatusBadge** — ✅ `client/src/components/StatusBadge.tsx` (dot + label, 4.5:1 tint, tone map incl. withdrawn).
- **LoadingSkeleton** — ✅ `client/src/components/LoadingSkeleton.tsx` + `client/src/hooks/useSlowLoad.ts` (role=status, aria-busy, ≥300 ms hold, `slow` line after 15 000 ms, `motion-reduce:animate-none`).
- **ActionErrorCard** — ✅ `client/src/components/ActionErrorCard.tsx` (role=alert; title → detail → reassurance → Try again + quiet dismiss; `#b91c1c` on `#FEF3F2`; 44 px targets).
- **RequestStatusTimeline** — ✅ `client/src/components/RequestStatusTimeline.tsx` (`buildRequestTimeline` derives Request sent → Claimed/Waiting → Decision from seeker-visible fields only; unit-tested).
- **AdminNav** — ✅ `client/src/components/AdminNav.tsx` (same 7 destinations on all 8 admin pages, `aria-current="page"`, horizontal scroll < 768 px).
- **PolicyPageShell** — ✅ `client/src/components/PolicyPageShell.tsx` (long-form disclosure shell with Draft pill + policy footer nav).
- **PendingItemCard** — implemented inline in the queue/detail pages (Row1 title+badge, Row2 muted, Row3 summary, Row4 meta chips, Row5 actions).
- **FilterBar / tabs** — ✅ referrer tabs in MyCompanyInbox + admin filter chips in AdminApprovalQueue.
- **CreditMeter** — ✅ `SeekerCreditsCard` + `ReferrerCreditsCard`.

## Pending-state pass (2026-09-05)

Gap audit of the three pending surfaces against the handoff spec found the items below missing; all are now built with tests.

| Surface | Gap found | Built |
|---|---|---|
| `/requests` | No 15 s slow notice; error was a bare paragraph; empty state had no headline | `LoadingSkeleton` (+ "Routing checks usually take a second."), `ActionErrorCard` w/ Try again, "Nothing pending right now" headline, status-history timeline |
| `/inbox` | Decline posted on first tap; error had no retry and was invisible on the preview screen | Decline confirm step, retry-able error card in list + preview, race copy "Accept failed" w/ Back to queue, 15 s notice |
| `/admin/*` | 8 pages with 4 different header link sets; no slow notice; filtered-empty had no reset | `AdminNav` on all pages, 15 s notice on the queue, "Clear filters" action |
| Fast-Track card | Server had `POST /api/referrer-fast-track/me/deactivate` but no UI | "Pause link" → AlertDialog → paused state → "Create a new link"; inline error w/ Try again (was toast-only) |
| Legal (P0 gate) | No Terms / Refund / Support pages existed | `/terms`, `/refunds`, `/support` (`Terms.tsx`, `RefundPolicy.tsx`, `Support.tsx`), linked from Premium, Plans, Settings, Privacy, 404 |

New tests: `myRequests.pendingStates.test.tsx` (4), `myCompanyInbox.pendingStates.test.tsx` (4), `requestStatusTimeline.test.ts` (5), `referrerFastTrackCard.test.tsx` (3), `policyPages.test.tsx` (4). Board: `docs/design/flow-design-board.html` section 05.

## Full-stack audit + approved-palette re-authoring (2026-09-18)

Audited the complete slice behind the six spec screens: the four pages, every component they render (21 files), and the server contracts each screen calls.

### Server contracts — no gaps found
| Screen(s) | Endpoint(s) | Guard |
|---|---|---|
| 2.1 / 2.2 seeker list + detail | `GET /api/company-referrals/mine`, `GET /api/credits/summary?role=job_seeker` | seeker session |
| 2.1 withdraw | `POST /api/company-referrals/:requestId/withdraw` | owner, `pending` + unclaimed; refunds the reserved credit |
| 2.2 referrer claim/decision | `POST …/:requestId/save`, `POST …/:requestId/claim`, `GET …/:requestId/preview` | verified referrer on the company domain |
| 2.3 / 2.4 referrer queue + review | `GET /api/company-referrals/inbox`, `POST …/:requestId/review`, `POST …/one-click-review`, `POST /api/company-referrals/availability/open` | referrer session |
| 2.5 admin queue | `GET /api/admin/approval-queue?limit=250` | `identity.account.role === "admin"`, else 403 |
| 2.6 admin detail + decision | `GET /api/admin/activity?limit=250`, `POST /api/admin/approval-queue/:kind/:id/decision` | `identity.account.role === "admin"` |

Every field the screens render (Ref-XXXX, stage sentence, claim/OTP/payment context, credit movement, ordered history) is already served; **no screen needs a new endpoint**. Route coverage lives in `server/approvalQueueRoutes.test.ts`.

### Design defects found and fixed
The screens were authored in the earlier Takram / warm-paper palette and only rendered in the approved palette because `client/src/index.css` carries a compatibility shim that rewrites those class names with `!important`. **19 occurrences sat outside the shim**, so the retired palette leaked to production:

| Leak | Surface | Now |
|---|---|---|
| `border-[#ECE8DD]` warm beige hairline | `/requests` ×2 | `border-[#e5e5e5]` |
| `border-[#f3c1bc]` warm salmon | `/inbox`, `ActionErrorCard`, `ReferrerFastTrackCard` | `border-[#b91c1c]/30` |
| `bg-[#eef3fc]` Takram pale blue | `/admin/approvals`, `/admin/approvals/:kind/:id` | `bg-[#ededff]` |
| `bg-[#FEF3F2]` warm error ground | `ActionErrorCard`, `ReferrerFastTrackCard` | `bg-[#b91c1c]/10` |
| `ring-[#191713]` near-black focus ring | `AccountMenu`, `NotificationBell` | `ring-[#0000ff]` |
| `bg-[#166534]` off-palette green | admin Approve hover | `hover:bg-[#15803d]/85` |

Tailwind palette colours (`amber-*`, `emerald-*`, `rose-*`) were replaced with the brand functional tokens (`#B45309` / `#15803d` / `#B91C1C`) and tints derived as `<token>/10` and `/30`. Inert `disabled:opacity-50` classes were deleted — DESIGN.md bans opacity-faded disabled states and `index.css` already forces the solid `#e0e0e0` / `#505050` state.

**492 class tokens re-authored across 16 files.** The six screens no longer depend on the compatibility shim. Third-party share-target colours (`#25D366`, `#229ED9`, `#0A66C2` in `OneTapShareActions`) are intentional and retained.

### Guard against regression
`node scripts/design-token-audit.mjs` walks the pending-screen surface and fails on any hex outside the DESIGN.md palette. Current result: **16 files · 377 approved tokens · 3 whitelisted third-party tokens · 0 violations.**

### Verification (2026-09-18)
- `pnpm check` → exit 0
- Targeted `vitest run` (11 files, 46 tests: the four screens, timeline, credits, AccountMenu, Fast-Track) → 46 passed
- `pnpm build` → exit 0; every migrated utility present in the emitted CSS (alpha tints compile to 8-digit hex, e.g. `#b453091a`)
- Full `vitest run` on the final tree → 736 passed / 7 failed / 15 skipped. The 7 failures are **pre-existing**: reproduced identically at `927cb76` in an isolated worktree (`Unable to find tRPC Context` at `Settings.tsx:18` in `settings.workEmail`, `settings.slackTriage`, `policyPages`). They are a Settings/tRPC test-wiring defect, unrelated to these screens.

### Remaining design debt (out of scope, documented)
51 other client files still author the legacy warm-paper class names and therefore still depend on the `index.css` compatibility shim (`CompanyInviteCard`, `DirectMessageSection`, `OpportunityWall`, `PostOpportunity`, `Referrer`, `Onboarding`, the employer surfaces, …). They render correctly today, but every new utility variant they add can leak the retired palette the way the six pending screens did. Extending `scripts/design-token-audit.mjs` to those paths and re-authoring them the same way is the recommended follow-up — do it one screen group at a time so the visual diff stays reviewable.

### Open design decision (deferred, not silently dropped)
DESIGN.md specifies 24px for task cards/panels and 18px for controls/inputs; the shipped screens use the app-wide Tailwind radii (12px / 8px) because they share cards, credit meters and chrome with surfaces outside this set. Changing the radii for only these six screens would make them inconsistent with the rest of the app, so the change is deferred pending visual QA across the shared components.

## Built 2026-09-03 (2.5 + 2.6)
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
