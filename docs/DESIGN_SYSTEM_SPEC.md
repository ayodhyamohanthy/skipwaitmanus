# skipwait.me — Design System & Screen Specification

_Coverage updated 2026-09-03 · Style: Breathing Space / calm professional (preset 11 Build) adapted to brand blue_
_Screens live; specs below are the developer handoff contract._

---

## 1. Design tokens (source of truth: `client/src/index.css` `@theme`)

| Token | Value | Notes |
|---|---|---|
| `--font-sans` / `--font-serif` | **DM Sans** | everywhere; body + headings |
| `--color-background` | `#f8fafc` | app bg |
| `--color-foreground` | `#0f172a` | body text |
| `--color-card` / `--card-foreground` | `#ffffff` / `#0f172a` | cards, popovers |
| `--color-primary` / `-foreground` | `#0b57d0` / `#ffffff` | brand blue, buttons, links |
| `--color-secondary` / `-foreground` | `#f1f5f9` / `#334155` | secondary buttons |
| `--color-muted` / `-foreground` | `#f8fafc` / `#64748b` | meta lines, helper text |
| `--color-accent` / `-foreground` | `#e8f0fe` / `#0b57d0` | chips, selected states |
| `--color-border` / `--color-input` | `#e2e8f0` | borders, inputs |
| `--color-ring` | `#0b57d0` | focus ring |
| `--radius` | `0.75rem` | rounded-12 surfaces |

**Type** (see CSS rules): h1/h2 `font-weight:650; letter-spacing:-0.045em`; body normal; small/meta `text-sm` + muted-foreground.

**Focus**: `:focus-visible { outline: 3px solid #bfdbfe; outline-offset: 2px }` on button/a/input. **Reduced motion**: `@media (prefers-reduced-motion: no-preference)` gates transitions; `prefers-reduced-motion` honored.

## 2. WCAG 2.1 AA contrast (verified)

| Pair | Ratio | AA normal | AA large |
|---|---|---|---|
| primary `#0b57d0` / white | 6.39 | ✅ | ✅ |
| foreground `#0f172a` / card white | 17.85 | ✅ | ✅ |
| muted-fg `#64748b` / card white | 4.76 | ✅ | ✅ |
| muted-fg `#64748b` / bg `#f8fafc` | 4.55 | ✅ | ✅ |
| accent-fg `#0b57d0` / accent `#e8f0fe` | 5.57 | ✅ | ✅ |
| secondary `#334155` / `#f1f5f9` | 9.45 | ✅ | ✅ |

All key pairs meet AA. Keyboard nav: visible focus ring; logical tab order; `role`/`aria-label` on interactive surfaces (verified: MyRequests 3, Home 2, MyCompanyInbox + Referrer 1 each). Screen-reader: semantic headings, `aria-live` success regions (`data-referral-success`), labelled inputs.

## 3. Screen inventory (route → screen → states)

### Public / auth
- `/` **Home** — marketing links; light states
- `/start` **Onboarding** — multi-step, error state
- `/referrer` **Referrer sign-in** — empty/error/loading
- `/email-review/:token` **EmailReviewAction** — error
- `/privacy` **TrustPrivacy** — static; policy footer nav
- `/terms` **Terms** — static (PolicyPageShell; Draft pill until legal review)
- `/refunds` **RefundPolicy** — static (PolicyPageShell; Draft pill until legal review)
- `/support` **Support** — static; one mailto primary + self-serve links to `/premium`, `/requests`, `/settings`

### Job seeker
- `/request` **ReferralRequest** — resume step, error, success (`data-referral-success`), compensation meta
- `/requests` **MyRequests** — loading/empty/error/retry, withdraw dialog, progress, compensation
- `/premium` **Premium** — ticket packs, error/retry
- `/plans` **Plans** — subscription, error
- `/wall` **OpportunityWall** — public opportunities, compensation meta, empty
- `/conversation/:requestId` **ReferralConversation** — loading/error

### Referrer
- `/inbox` **MyCompanyInbox** — tabs New/Saved/Completed, loading/empty/error, preview, decline chips, race copy, compensation
- `/share` / `/share-card/:token` / `/fast/:linkCode` / `/refer/:company/:alias` — share/fast-track/vanity flows (error states)

### Admin
- `/admin/activity` **AdminActivity** — activity log
- `/admin/approvals` **AdminApprovalQueue** — unified queue, loading/empty/error/retry
- `/admin/approvals/:kind/:id` **AdminApprovalRecord** — history, decision note
- `/admin/flow-health` **AdminFlowHealth** — funnel stats + revenue
- `/admin/payments` **AdminPaymentsReview** — payment review queue, refund
- `/admin/privacy-requests` / `/admin/token-recovery` — admin tools

### Shared components
`Brand` · `StatusBadge` · `SeekerCreditsCard` / `ReferrerCreditsCard` (CreditMeter) · `MetricCard` · `CompanyInviteCard` · `ReferrerFastTrackCard` · `ZeroActivityShareCard` · `TokenTopUp`

## 4. State matrix (per AC: every screen has empty/loading/error/success)

| Screen | loading | empty | error | success |
|---|---|---|---|---|
| ReferralRequest | ✅ (skeleton) | — | ✅ | ✅ `data-referral-success` |
| MyRequests | ✅ | ✅ | ✅ retry | ✅ (withdrawed state) |
| MyCompanyInbox | ✅ | ✅ | ✅ | ✅ (accept/decline) |
| Preemium/Plans | ✅ | ✅ | ✅ retry | ✅ |
| OpportunityWall | ✅ | ✅ | ✅ | ✅ |
| AdminApprovalQueue | ✅ | ✅ filtered-empty | ✅ retry | ✅ (optimistic badge) |
| Settings | ✅ | "No verified work email yet" | ✅ | ✅ |

## 5. Reusable interaction patterns (from code)

- **PendingItemCard**: Row1 title + StatusBadge(right) · Row2 muted (company · date · context) · Row3 summary · Row4 meta chips · Row5 actions.
- **Optimistic admin decisions**: Approve/Reject update badge in-place, no full reload (API returns 409 on already-resolved → show `safeError`).
- **One-tap referral accept + decline chips** with a confirm.
- **Deterministic error surface**: `data-skipwait-error` cards with **Try again / Keep request**, plus `role="alert"`.

## 6. Compensation (added 2026-09-03, commit `5697760`)

A design audit found pay range absent from the whole flow + schema. Added end-to-end: free-text `compensation` on `jobs` + `companyOpportunities` (migration `0034`); surfaced on PostOpportunity (input), OpportunityWall (meta line), ReferralRequest (carried + submitted), MyRequests / MyCompanyInbox (meta line `normal-case`). Only rendered when present.

## 7. Responsive behavior

`body { min-width: 320px }`; Tailwind utility responsive (sm/md/lg) throughout; touch-action manipulation; `-webkit-tap-highlight-color: transparent`. Key screens verified at 320px–desktop.
