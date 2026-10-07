# Pending Screens — Developer Handoff Notes
_Design source: `docs/design/pending-screens-canvas.html` (interactive infinite canvas — open in any browser; scroll to pan, ⌘scroll to zoom)_
_Style preset: 17 Takram (Soft Precision) for layout, hierarchy, motion and copy — **superseded on colour**._

> **Colour authority: [`DESIGN.md`](../../DESIGN.md) + `client/src/index.css`.**
> This doc governs structure, states, copy and behaviour; it is not a colour
> source. Two palettes have been retired under it: the original `#0B57D0`
> warm-paper preset, and the later "Moving Parts" system (action blue `#0000ff`
> on white). The shipping "Scoreboard" world is paper `#f4f4f1`, ink `#131311`,
> one signal red `#e8442e`, so **every hex quoted in §1 and below is
> historical** — take colours from DESIGN.md and run
> `node scripts/design-token-audit.mjs` to prove the surface is clean.

---

## 1. Shared component sheet (use everywhere, all three roles)

### 1.1 StatusBadge
- Pill: `border-radius: 999px; padding: 3-5px 8-12px; font-size: 10-11px; font-weight: 700;`
- Dot (●) prefix, always colored, no icons otherwise.
- Status → color mapping (THE mapping, identical everywhere):

| Status | bg (tint ground) | text | dot | Meaning |
|---|---|---|---|---|
| Pending | `rgba(180,83,9,.1)` | `#b45309` | `#b45309` | Sent, nobody claimed/decided |
| Under review | `rgba(0,0,255,.08)` | `#000000` | `#0000ff` | Claimed by verified referrer; also used for admin "in-progress" items |
| Approved | `rgba(21,128,61,.1)` | `#15803d` | `#15803d` | Referral accepted; conversation unlocked |
| Declined | `rgba(185,28,28,.1)` | `#b91c1c` | `#b91c1c` | Decision recorded; reason never shown to seeker |
| Withdrawn / closed | `rgba(0,0,0,.06)` | `#505050` | `#767676` | Neutral recorded state |

Source of truth for the live values: `statusToneColors` in `client/src/components/StatusBadge.tsx`.
In Tailwind, express every tint ground as the brand colour at alpha (`bg-[#b45309]/10`) — never a
Tailwind palette colour (`bg-amber-50`) and never a new hex.

- **Rule:** one badge per item, top-right of the card. Never mix tone hues per role — a status means the same thing on every screen.

### 1.2 PendingItemCard
- Card: `border-radius:12px; border:1px solid #e5e5e5; background:#fff; padding:12px;`
- Radius note: DESIGN.md specifies 24px for task cards/panels and 18px for controls/inputs. The shipped screens still use the app-wide Tailwind radii (12px cards / 8px controls) because these cards sit beside other surfaces that share the same components; the change is deferred pending visual QA (tracked in `docs/DESIGN_SCREEN_COVERAGE.md`).
- Row 1: title (left, `font-weight:700`) + StatusBadge (right)
- Row 2 (muted `#78716c`, 11px): company / **Ref-XXXX** · date
- Row 3: one-line context (candidate pitch excerpt / stage explanation)
- Row 4: meta chips (`📄 1 resume` · `🔗 Role link` · `Identity hidden`) — replace emoji with 1.5px-stroke SVG in production
- Row 5: action row (see 1.3)
- Truncation: titles truncate with ellipsis; context clamps to 2 lines.

### 1.3 Action buttons
- Primary: `background:#0000ff; color:#fff; border-radius:9-10px; padding:7-8px; font-weight:700; font-size:11-12px;` (hover `#0000cc`, pressed `#000099`) — max ONE per card row.
- Secondary: `border:1px solid #e5e5e5; background:#fff; color:#000000;`
- Destructive (Withdraw / Reject / Confirm decline): `color:#b91c1c;` either as tinted text-button or `border:1px solid rgba(185,28,28,.3)` on a `rgba(185,28,28,.1)` ground. Never a solid red fill.
- Disabled: one solid state everywhere — `background:#e0e0e0; color:#505050;`, keep the label (never blank while loading). No opacity-faded ghosts.
- Busy: label swaps to a gerund ("Sending…", "Opening…") or spinner replaces icon; button stays sized.

### 1.4 FilterBar (admin; referrer uses inbox tabs)
- Filter chips: `padding:5px 10px; border-radius:999px; border:1px solid #cfcfcf; background:#fff; color:#505050; font-size:10-11px; font-weight:700;` with `▾` affording a dropdown.
- Active count chip: `background:#ededff; color:#0000ff;` showing "N open".
- Tabs (referrer): same geometry, active = solid `#0000ff` bg + white text.

### 1.5 CreditMeter (seeker + referrer variants — already in production)
- Container: `background:#ededff; border:1px solid #c2c2ff; border-radius:12px; padding:10-12px;`
- Row: eyebrow label (`FREE PLAN` / `REFERRAL CREDITS`) + bold right-aligned "N left".
- Bar: 5px, radius 99, track `#e0e0ff`, fill `#0000ff` (→ `#b45309` when 0 left).
- Line: "X of 3 free credits used this month." + pack balance sentence when > 0; secondary lines `#505050`.

---

## 2. Screen-by-screen annotations

### 2.1 SEEKER — Pending requests (canvas page 01)
- Purpose: single list of the seeker's sent requests; each item self-describes stage + next action.
- Fields per card: role title, company domain, `Ref-XXXX`, sent date, StatusBadge, stage sentence, actions.
- Actions: **View details** (opens detail, 2.2) · **Withdraw** (only while `status=pending`; opens confirm dialog).
- Withdraw confirm dialog copy: "Withdraw this request? [Company] employees will no longer see it. Your credit returns to your balance." — credit refund is the product rule; if a referrer already claimed, the card shows "Under review" and Withdraw is hidden.
- CreditMeter sits above the list (sticky region under header) so spend context never scrolls away.

### 2.2 SEEKER — Detail + states (canvas page 02)
- **Status history** (the traceability block): vertical 3-dot timeline. Entries: `Request sent — date` → `Claimed by a verified employee — date` → `Decision — waiting`. Future entries append; completed steps get semantic colors, waiting step is gray.
- Withdraw button opens confirm; destructive style; input-free.
- **Empty state** (first-use AND cleared): dashed border card, ✉ mark, headline "Nothing pending right now", one value sentence, CTA "Ask another referral" → `/start`.
- **Loading**: 3-bar skeleton + "Loading your requests… Routing checks usually take a second." Show ≥ 300 ms to avoid flash; add "taking longer than expected" line after 15 s.
- **Error / action-failed**: card, red border tint. Copy pattern: what happened ("Withdraw didn't go through") → why ("network dropped before we could reach the server") → reassurance ("Your request is still active and nothing was lost") → **Try again** primary + **Keep request** escape hatch. Never clear the list on error.

### 2.3 REFERRER — Incoming queue (canvas page 03)
- Scopes as tabs: New (badge count) / Saved / Completed — same tabs as live `/inbox`.
- CreditMeter (referrer variant) pinned above tabs: accepting a request consumes one credit.
- Card fields: candidate display name, role title, `Ref-XXXX`, timestamp, pitch excerpt (1 line), meta chips, actions **Accept referral** (primary) / **Decline** (secondary).
- Both actions are one-tap from the queue; Accept is idempotent server-side — see edge case E2.

### 2.4 REFERRER — Detail + states (canvas page 04)
- Detail card: `Ref-XXXX` eyebrow + "Awaiting your decision" badge; candidate block and role block side-by-side (stack on mobile); Accept/Decline.
- **Decline flow**: chips for reasons (Not my team / Timing / Can't assess) + optional private note (never shown to seeker) + explicit **Confirm decline** (two-step; avoids accidental declines). Declining does NOT consume a credit — credits only burn on Accept/capacity.
- **Empty state**: "Your queue is clear" + value sentence + reassurance that email notification exists ("no need to keep this page open").
- **Error state E2 (race)**: "Accept failed — Another employee accepted this request a moment earlier. Nothing was charged to your credits." + Back to queue. This is a real product event (one-claim-per-request); design acknowledges it instead of a generic error.
- Loading: same skeleton pattern as seeker (≥300ms; 15s fallback line).

### 2.5 ADMIN — Approval queue (canvas page 05)
- Filter chips: Status ▾ · Role ▾ · Date range ▾ + open-count chip.
- Queue items span three record types (all share the same card + actions):
  1. Seeker request under review
  2. Referrer enrollment (work-email verified, awaiting first action)
  3. Credit-pack payment `requires_review`
- Row 2 shows the operational context admin needs to triage: company · opened date · claim time / OTP time / payment provider.
- Actions inline: **Open record** → detail; **Approve** (green-outline) / **Reject** (red-outline) apply instantly and update the row badge without a page reload.

### 2.6 ADMIN — Record detail + states (canvas page 06)
- Full record: seeker block, referrer block, role link, credit movement, then **HISTORY** — ordered events with actor + timestamp ("request created", "1 credit reserved (monthly)", "claimed by verified referrer").
- Decision note field: always visible, recorded on the item (audit trail), optional.
- Approve (solid green `#15803d`) / Reject (red outline). Both write to the history; the badge in queue + seeker/referrer surfaces update through the same status vocabulary.
- **Empty (filtered)**: "Queue clear — No items match these filters. Widen the date range or clear filters." (echo the filters; never a blank table).
- **Error**: "Decision failed to save — The record is unchanged and still in the queue. No notifications were sent." + **Retry decision**. Idempotent retry is safe.

---

## 3. Status transition rules (single source of truth)

```
pending ──claimed──▶ under review ──accept──▶ approved ──▶ intro_made ──▶ interview ──▶ offer ──▶ closed
   │                      │
   │ withdraw (seeker)    └─decline──▶ declined
   └────────────────────────────────▶ withdrawn
```
- `withdrawn` only from `pending` (before claim). After claim the seeker sees "Under review" with no withdraw action.
- Credit timing: reserved at creation; **refunded on withdraw**; **consumed on accept**; **not consumed on decline**.
- Every transition appends a history row: `{actor, action, timestamp, note?}`. Seeker-visible history hides actor identity; admin history includes emails and credit movement.
- Admin approve/reject is an operational override available on any non-closed item; it writes the same history format.

## 4. Responsive notes
- Designs are desktop-first (400–460px frames shown mobile-like because the product is a mobile-first PWA).
- ≥768px: two-column grid for queue cards (seeker/referrer), admin keeps single column with a right-side detail panel.
- <768px: single column; action buttons go full-width stacked; filter chips horizontally scrollable (no wrap).
- All interactive targets ≥ 44px height.

## 5. Accessibility baseline
- Badge colors pass 4.5:1 on white at the 10%-alpha tint (checked `#b45309`, `#0B57D0`, `#15803d`, `#b91c1c` on `#fff`).
- Status is never color-only: dot + text label.
- Progress bars: `role="progressbar"` with aria-valuenow/min/max (existing pattern).
- Buttons carry visible text (no icon-only actions in these screens).
- Focus order follows DOM order in each card; error cards get `role="alert"`.
