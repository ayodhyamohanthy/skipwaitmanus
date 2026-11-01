> **D-071 (owner, Oct 18 2026): approved for rollout as the "your pick" comps in `pick/`, without the compensation row.** Every compensation mention below is historical; no compensation field is shown or built until the owner decides it separately.

> **Owner decision D-070 (Oct 18 2026):** the visual target is Triage Desk's layout with Signal's type scale, and there is **no "Seeking / Giving referrals" mode switch** — one navigation shows what each person can do. Pass reasons follow D-052 (7 reasons). Where this brief still describes a mode switch or 5 reasons, D-070 and D-052 win. The comps are in `pick/`.

> **Current rules that replace parts of this brief (DECISION-SYNC-oct26, Nov 1 2026, from the D-221 audit section 9).** This brief stays as the record behind the D-071 comps; build to `DESIGN.md`, `design/goal-ui/DOCTRINE.md` and `docs/DECISIONS.md`, and where a line below disagrees, these win. (1) **No availability status (D-176, superseding D-169):** no "Open to requests" / "Not open yet" dot, ring, chip, grouping, readout ("2 open to requests now") or summary ("7 companies · 2 open to requests"); availability only routes a request. (2) **No expiry clock as launch behaviour (D-174):** day countdowns, the Expired status and the amber "clocks of 2 days or fewer" rule describe legacy runtime clocks that stay only until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193); never design new ones. (3) **Declines (D-147, superseding D-035):** every employee decline keeps the credit spent, whatever the reason; no credit outcome depends on the pass reason. (4) **Referrer money (D-055, D-196, D-219 (7)):** say that basic referring is free and referrers are never paid, not "Referrers are never charged": an opt-in referrer priority plan is recorded (not built, and it charges nothing until its routing design is reviewed and tested). (5) **Light mode:** light is the only shipped mode and the default; a built dark mode waits on the owner's hold (D-224, D-230), so "light mode only" is today's state, not a permanent rule. `content.json` and the `pick/` comps carry some of the same replaced lines and are not edited by this Markdown-only notice.

# SkipWait goal UI: design brief and three directions

D-048 · 18 Oct 2026 · For the owner's review. Nothing here is built or rolled out until the owner picks a direction. Until then the existing tokens and components stay in use.

- This brief: `design/goal-ui/BRIEF.md`
- Shared copy deck and preview fixtures: `design/goal-ui/content.json` (every direction renders exactly this copy and data)
- Comps: `design/goal-ui/<direction-slug>/` (suggested files `a-find.html`, `b-queue.html`, `c-asks.html`)

---

## 1. Brief

```text
Designing the core referral loop of SkipWait (skipwait.me): Find a referral with its ask drawer, the
referrer's Referral queue, and the seeker's My asks, on the web app at 1280 (desktop) and 390 (phone).
For: job seekers (India first, then global; mostly on phones; many first-timers) and verified referrers
(unpaid volunteers who confirmed a work email).
Goal: a seeker sends a referral-worthy ask in one sitting and always knows what happens next and what it
costs. A referrer decides with confidence in about a minute, without being exposed, ranked or rushed.
Tone: daylight, precise, calm about money, warm about people. No hype, no pressure.
Main objection/risk: seekers fear spending a credit on a dead end (on 17 Oct, 1 of 39 listed companies
had an available referrer). Referrers fear exposure, pressure and being judged. Both distrust anything
that smells like a growth trick.
Must remember: the one black action is always the next honest step, and the promise that makes it safe
sits right beside it: the cost above Send ask, the identity lock beside Accept & connect.
Constraints: section 3.1 (binding rules). Later build: React 19 + Tailwind CSS v4. Installed fonts only
(Instrument Sans 400-700, JetBrains Mono 400/500, IBM Plex Mono 400/500). Lucide icons only. No new packages.
Research needed: styles (visual language), screens (directory, triage, drawers, tracking, credits,
verification), flows (triage with auto-advance, notify-me, sheets and drafts). Done in two reports, 18 Oct.
Path: visual exploration. Three reference-locked directions, each rendered as the same three screens at
1280 and 390. The owner picks one; it becomes the build and QA target.
```

---

## 2. Research summary

Refero MCP isn't connected, so the evidence comes from primary sources: production token files, official docs, live renders with computed styles, local checks of the installed fonts and contrast, and SkipWait's own contracts on `main` (dbeb38cb).

### Styles reviewed: 10 external references and 2 local checks

| Reference | What SkipWait takes from it | Job in this brief |
|---|---|---|
| Linear (2024 redesign, 2026 "calmer interface" refresh, Triage docs, live product mock) | Quiet chrome ("Don't compete for attention you haven't earned"; "Structure should be felt not seen"), list then detail, number-key triage, a queue position with up/down, tabular IDs, two-tone sentence headings | Primary for **Triage Desk** |
| Mercury public demo dashboard | Calm white table rows (51px), outlined 20px status tags, struck-through amounts for failed money, the true minus sign, a floating detail sheet with a dated timeline, the Banking/Books segmented switch, one filled primary | Primary for **Ledger** |
| Material 3 Expressive (androidx token files, split-button and navigation specs) | 56dp controls, 48dp targets, 64dp navigation bar and 80/96dp rail with a full-pill active indicator, the menu chevron that flips 180° | Primary for **Signal** |
| Vercel Geist (production CSS) | Role-numbered gray scale, 1px 8% black borders drawn once, 6px controls and 12px floating surfaces, the focus-ring recipe, "one badge per row", Status Dot timing | Shared craft |
| Shopify Polaris (tokens + role and badge docs) | Near-black primary, strict tone roles (success is not for enticing; critical badges are stressful), past-tense one- or two-word badges with a progress glyph | Shared roles; Signal borrow |
| Stripe accessible colour system and badge semantics | Contrast guaranteed by distance on the scale; negative outcomes are "no action required"; semantic borders only for errors | Shared roles |
| Stripe Checkout and balances | A two-column cost ledger directly above Pay; every number exact or "not yet known"; pending to available on a stated date | Ledger borrow |
| Raycast (API docs + live mock) | List-item anatomy; exactly one primary action surfaced with its key, everything else one keystroke away | Triage Desk borrow |
| Superhuman | A speed contract (under 100 ms), minimal animation, shortcut hints shown in the UI | Triage Desk borrow |
| Attio (live computed styles) | The three-part tinted badge: tint fill, 1px tint border, AA text, 20px tall, 6px radius | Signal borrow |
| Local check: installed fonts | Instrument Sans has true tabular figures but draws capital I and lowercase l alike, so IDs need a mono face. JetBrains Mono caps sit level with Instrument Sans; IBM Plex Mono reads about 3% smaller inline and suits receipt-style figures | All |
| Local check: WCAG contrast | Every token value in this brief was measured (sections 3.2 and 4-6) | All |

### Screens and flows reviewed (about 20)

Linear Triage, Inbox and issue drafts; Gmail and Outlook auto-advance; Kula, Accelerator and Greenhouse review queues; Front inbox sections; Raycast Store; Wellfound filters; LinkedIn Open to Work and verification; Airbnb and Upwork verified marks; Resy Notify; Material filter chips; Apple HIG sheets; Stripe ContextView and FocusView; Vaul and shadcn drawers; Baymard's order-tracking research; Stripe payment status mapping; Vercel spend management; Cursor, Raycast AI and OpenAI credits; India's CCPA dark-pattern guidelines (2023).

### What the references agree on (locked for all three)

A near-black primary, one per area. 1px borders drawn once. Status is text plus tone, never colour alone. Tabular figures for every number. 6-12px radii for product UI.

### Where they collide with the owner's Kinetic spec (re-homed, not copied)

1. **Blue.** Every reference spends blue on focus rings, links or info. Here blue means "work email verified" and nothing else: focus rings are ink, links are ink with an underline, info is gray.
2. **Hairlines** measure 1.13-1.31:1. They are fine for dividers. Inputs, radios, checkboxes and segment edges get a control edge of at least 3:1.
3. **Keycaps** are drawn with Unicode glyphs in Raycast, Superhuman and Linear. Here they are letters or lucide icons.
4. **Variable weights** (Linear 510/590, Polaris 450/550/650) map to Instrument Sans 500/600.
5. **Crimson.** Polaris calls critical badges stressful, so crimson only marks a state that has ended, and never appears in a referrer's queue.

### Product patterns adopted (all directions)

- **The referrer queue is triage:** a list, the opened ask, one sticky decision bar. Keys open the confirm step and never commit. After a decision, the next ask that closes soonest opens.
- **Directory:** company rows with a yes/no availability line and one chip toolbar. A company that isn't open offers "Get told when a referrer joins" (the Resy pattern, on the live alerts API) with "An alert is not a referral."
- **Drawer on desktop, sheet on phones:** a 480px right drawer; a full-height compose sheet; the pass reasons in a medium sheet; one sheet at a time; closing keeps a draft.
- **Tracker:** a few human statuses over many internal states, one real date under the status, the full stage rail from day one, a dated history (Baymard; Stripe status mapping).
- **Credits:** a quiet mono pill. The cost and its condition are visible in the drawer from the first moment, beside Send ask (Stripe footer content; CCPA rule against drip pricing).
- **Verified:** one mark with one meaning (LinkedIn, Airbnb, Upwork).

### Journey logic

- **Seeker:** Find a referral, then pick an open company, then fill the drawer (job link, resume on file, three reasons) with the cost line in view, then Send ask. My asks shows Sent with its real close date.
- **Referrer:** the queue is sorted by soonest close. Open an ask (role, link, reasons, ask-quality checks; identity locked), then Accept & connect (a confirm with the ethics checkbox) or Pass privately (one of five reasons), then the next ask.
- **After acceptance:** Accepted (neutral), then the referrer submits through the company's own process and taps Mark as referred, then Referred (emerald).

### Recommendation

Render all three on the same content and judge the 390 comps first, since most seekers use phones. My lean before seeing renders is Triage Desk (7/10), because the referrer's decision is the supply bottleneck. I don't know whether seekers will prefer it on phones; a five-person hallway test per side would settle that.

---

## 3. Shared foundation (identical in all three directions)

### 3.1 Binding rules, written as design rules

1. **Icons:** lucide only; every name used in content.json was verified with `tools/lucide.mjs`. No Unicode glyph icons: no check marks, lightning, arrows, or command and return characters. Keycaps are letters or lucide `command`, `corner-down-left`, `arrow-up`, `arrow-down`.
2. **No gradients, glassmorphism, glows, blurred shapes or decorative shadows.** Light mode only.
3. **No invented numbers.** Every count in a comp comes from content.json rows ("7 companies · 2 open to requests" is the seven rows). No referrer counts anywhere.
4. **No public per-referrer metrics:** no response rates, speeds, rankings, "fast responder" chips or filters, streaks, or "viewed" receipts.
5. **Before acceptance a referrer sees** the role, job function, job link, the three reasons, ask-quality checks, a day-level clock and "2 documents". Never the seeker's name, file names, links, photo or plan.
6. **The mode switch appears only for verified referrers** (server verdict). Everyone else sees "Give a referral", which leads to work-email verification, with no social sign-in near it.
7. **No message box, reply field or "request info" before acceptance.**
8. **Accepting is not referring.** Accepted is neutral; emerald starts at Referred. "Mark as referred" is a later step and is not on these screens.
9. **Pass reasons** are the five from `shared/passReasons.ts`, in order, none preselected.
10. **Vocabulary:** Find a referral, Give a referral, Ask for a referral, Accept & connect, Pass privately, Send ask. Never "warm intro", "insider" or "intro request".
11. **Money lines say what the code does today** (Help.tsx line 13). No "free referrals", no blanket "credit returned".
12. **Clocks are day-level** ("2 days left", "Closes 20 Oct"). No hours, minutes or seconds; no "SLA", "respond within" or "act fast".
13. **Accessibility:** text at least 4.5:1; large text, meaningful icons and control edges at least 3:1; touch targets at least 44px at 390; a visible `:focus-visible` ring on every interactive element; `prefers-reduced-motion` honoured.
14. **Motion budget:** micro-interactions 100-150 ms, menus 150-250 ms, drawers and sheets 200-300 ms, nothing over 300 ms; moving through a list is instant.
15. **Exactly one solid black element per screen, and it is the primary action.** Selected chips, segments, tabs and nav items use tints and borders, never a black fill. The brand is a wordmark, not a black block. The Pass confirm is an ink outline.

### 3.2 Semantic roles (measured on white unless stated)

| Role | Means | Value | Contrast | Never used for |
|---|---|---|---|---|
| Primary | The one commit action: Send ask, Accept & connect, Ask for a referral | `#0A0A0A` (Signal: `#111111`), white text | 19.8:1 (18.9:1) | Anything else |
| Trust blue | Work email verified; lucide `badge-check` plus its text | `#1D4ED8` | 6.70; 6.16 on `#EFF6FF` | Focus, links, info, buttons, availability |
| Emerald | Referred (and credits added, on billing surfaces later) | `#047857` | 5.48; 5.21 on `#ECFDF5`; 4.99 on `#F4F4F5` | Accepted, availability, validation |
| Amber | Pending (Waiting, Under review) and clocks of 2 days or fewer | `#B45309` on white or near-white; `#92400E` inside amber tints | 5.02 (4.57 on `#F4F4F5`, 4.80 on `#F8FAFC`); 6.84 on `#FFFBEB` | Text on any surface darker than `#F4F4F5` |
| Crimson | Ended (Expired, a Passed event) and input errors | `#B91C1C` | 6.47; 5.91 on `#FEF2F2` | Anything in the referrer queue |
| Neutral | Accepted, Withdrawn, New, Under review on the referrer side, availability | Each direction's ink scale | See tokens | — |

- **Availability:** "Open to requests" = a solid 8px ink dot plus ink text. "Not open yet" = an 8px ring (1.5px, control-edge colour) plus muted text. Never green, never blue.
- **Validation passes** ("Matches Kestrel Pay's careers site") are ink with lucide `check`, not emerald.
- **Seeker status glyphs** (from content.json): Waiting `circle-dashed`, Under review `circle-ellipsis`, Accepted `circle-dot`, Referred `circle-check`, Expired `circle-x`, Withdrawn `circle-minus`.
- **Stepper nodes:** done `circle-check`, current `circle-dot`, upcoming `circle-dashed`; terminal `circle-x` (Expired) or `circle-minus` (Withdrawn).

### 3.3 Shared content

All visible copy and data come from content.json verbatim; builders may add aria-labels only. The fixtures:

- **Companies are fictional,** so no comp implies that a real company has verified referrers.
- **Preview "today" is Sun 18 Oct 2026.** Dates are written D MMM in mono.
- **The seeker** is on Free with 2 credits and 2 of 3 open asks; the arithmetic is in `shell.creditsPill.fixtureMath`.
- **The referrer** is verified at Kestrel Pay.
- **The money lines** are the live rule.

The Ledger direction uses the cost `receipt`, the other two the cost `line`. Signal uses the two `readout` blocks; the other two show the same facts in their summary line and in the Quillmint row and detail.

### 3.4 Shared shell structure (each direction sets the measurements)

- **Desktop:** an 88px left rail holds the brand wordmark at the top, three destinations, and the account avatar at the bottom. A top bar holds the mode switch or "Give a referral", the credits pill (seeking mode only) and the alerts bell. Seeking destinations: Find, My asks, Inbox. Giving destinations: Queue, Inbox, Impact.
- **Phone:** the top bar holds, in order, the account avatar (left), the mode switch or "Give a referral", then the credits pill compacted to coin icon plus "2" (aria-label "2 credits"), then the bell. The brand wordmark is omitted on phones inside the app. A three-item bottom bar sits at the bottom; it hides on the ask sheet and on an opened request.
- **Which persona each screen shows:** screens A and C show the unverified seeker ("Give a referral" entry, no switch). Screen B shows the verified referrer (switch with Giving referrals selected, the verified mark, no credits pill). On the phone, the opened request keeps the app top bar, so the switch is visible on mobile too.

### 3.5 Comp checklist (every direction)

- **Setup:** link `tools/fonts.css` by absolute path, put the direction's tokens in `:root`, and inline the lucide SVGs printed by `tools/lucide.mjs`. Render with `tools/render.mjs` and fix every overflow WARNING.
- **Screen A, desktop:** the directory with Kestrel Pay selected and the ask drawer open. **Phone:** frame 1 is the directory and frame 2 the full-height ask sheet, stacked on one page.
- **Screen B, desktop:** the queue list plus the opened request, with the pass reasons visible in a second frame below (or as the direction specifies). **Phone:** frame 1 is the opened request under the app top bar with its pinned decision bar; frame 2 is the pass-reason sheet.
- **Screen C, desktop:** all six asks plus the focused Quillmint ask in detail. **Phone:** the six asks.
- **Focus ring:** show it once, on the partly written reason 2 in screen A.
- **Gate before handoff:** one black element per frame; no copy outside content.json; every number traceable to content.json; 44px targets at 390; no horizontal overflow.

---

## 4. Direction 1: Triage Desk (`triage-desk`)

**Pitch:** A Linear-quiet, keyboard-precise desk: dense lists, dimmed chrome and one pinned decision bar, so the ask under review always leads.

**Density:** high. 13px UI; desktop rows 44-64px; phone rows at least 56px.

### Reference lock

- **Primary reference:** Linear (2024 redesign, 2026 calmer refresh, Triage).
- **Preserve:**
  1. **Dimmed chrome so content leads.** The rail sits on `#FAFAFA` with ink-3 icons, one active tile, few separators.
  2. **List, then detail,** with a pinned decision bar and a private queue position ("1 / 5") with up and down buttons.
  3. **Dense tabular rows:** 13px/500 labels, 12px mono meta. Status is an 8px dot plus a text label; no filled badges in rows.
  4. **Two-tone sentence headings:** the lead in ink, the continuation in ink-3, at the same size and weight. Always a whole sentence, never a one-word swap.
  5. **Keys as quiet hints:** keycaps beside the verbs (A, P, J/K, 1-5). Keys only open the confirm step.
- **Borrow only:**
  - **Raycast's action-bar anatomy:** the primary label with its keycap at the right, a ghost secondary beside it, one divider.
  - **Superhuman's speed contract:** instant list moves and a prefetched next ask; an honest busy state on Accept and Pass; nothing optimistic on actions that move credits.
- **Role rules:**
  - Black is used only for Send ask, Accept & connect and Ask for a referral.
  - Dots carry state only.
  - Keycaps are hints, never the only label.
  - The selected row's 2px ink bar on its left edge is the only stripe.
  - Gray carries information; blue appears only with `badge-check`.
- **Media strategy:** none. Code-native only: initials marks, lucide icons, dots, keycaps.
- **Reject:**
  - Linear's dark canvas, Inter Display and its fractional weights.
  - Priority bars, cycles, triage rotation, Snooze or "Later".
  - Hover row actions, filled badges in rows, coloured row backgrounds.
  - A reply box before acceptance, swipe to decide, Unicode keycaps, any "respond within" copy.

### Token commitments

```css
:root {
  color-scheme: light;
  /* Surfaces */
  --sw-canvas: #FFFFFF;
  --sw-surface: #FFFFFF;
  --sw-surface-sunken: #FAFAFA;    /* rail, list headers, locked panel */
  --sw-surface-hover: #F4F4F5;
  --sw-surface-selected: #F4F4F5;  /* selected row tile, active rail tile */
  --sw-scrim: rgb(10 10 10 / 0.24);/* phone sheets only; the desktop drawer has no scrim */
  /* Ink */
  --sw-ink: #0A0A0A;               /* 19.80:1 */
  --sw-ink-2: #52525B;             /* 7.73:1 */
  --sw-ink-3: #6B6B73;             /* 5.28:1 on white, 4.81:1 on #F4F4F5 */
  --sw-ink-inverse: #FFFFFF;
  /* Lines */
  --sw-hairline: #EBEBEB;          /* dividers only (1.19:1) */
  --sw-control-edge: #8A8A8A;      /* inputs, radios, keycaps, rings: 3.45:1 */
  /* Primary */
  --sw-primary: #0A0A0A;
  --sw-primary-hover: #262626;
  --sw-primary-pressed: #404040;
  --sw-on-primary: #FFFFFF;
  /* Trust and status: dot + text, same hue for both, no fills in rows */
  --sw-trust: #1D4ED8;
  --sw-emerald: #047857;
  --sw-amber: #B45309;
  --sw-crimson: #B91C1C;
  --sw-dot: 8px;
  /* Type: Instrument Sans 400/500/600 + JetBrains Mono 500, 4px baseline */
  --sw-font-sans: "Instrument Sans", system-ui, sans-serif;
  --sw-font-mono: "JetBrains Mono", ui-monospace, monospace;
  --sw-type-title:   600 24px/32px var(--sw-font-sans); --sw-track-title: -0.02em;   /* phone: 20px/28px */
  --sw-type-heading: 600 20px/28px var(--sw-font-sans); --sw-track-heading: -0.01em;
  --sw-type-body:    400 15px/24px var(--sw-font-sans); --sw-track-body: 0;          /* reasons, notes */
  --sw-type-ui:      500 13px/20px var(--sw-font-sans); --sw-track-ui: 0.01em;       /* phone: 14px/20px */
  --sw-type-meta:    500 12px/16px var(--sw-font-sans); --sw-track-meta: 0.015em;
  --sw-type-micro:   500 11px/16px var(--sw-font-sans); --sw-track-micro: 0.02em;    /* rail labels, keycaps */
  --sw-type-mono:    500 12px/16px var(--sw-font-mono);                              /* IDs, days, counts, dates */
  --sw-type-mono-ui: 500 13px/20px var(--sw-font-mono);                              /* credits pill, "1 / 5" */
  --sw-numeric: tabular-nums;
  /* Space */
  --sw-space-1: 4px;  --sw-space-2: 8px;  --sw-space-3: 12px; --sw-space-4: 16px;
  --sw-space-5: 20px; --sw-space-6: 24px; --sw-space-8: 32px; --sw-space-10: 40px;
  /* Radius */
  --sw-radius-keycap: 4px;
  --sw-radius-control: 6px;        /* buttons, inputs, chips, marks */
  --sw-radius-tile: 8px;           /* selected rows, rail tiles, locked panel */
  --sw-radius-popover: 12px;
  --sw-radius-sheet: 12px;         /* phone sheet top corners */
  --sw-radius-drawer: 0;           /* desktop drawer is docked flush */
  /* Elevation: none on page content */
  --sw-shadow-popover: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.02),
                       0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.06);
  --sw-shadow-drawer: -1px 0 0 #EBEBEB, -16px 0 32px -24px rgb(0 0 0 / 0.16);
  /* Focus */
  --sw-focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #0A0A0A;
  /* Motion */
  --sw-dur-list: 0ms;  --sw-dur-hover: 100ms; --sw-dur-menu: 150ms;
  --sw-dur-drawer-in: 200ms; --sw-dur-drawer-out: 150ms;
  --sw-ease-out: cubic-bezier(0, 0, 0.2, 1); --sw-ease-in: cubic-bezier(0.4, 0, 1, 1);
  /* Layout */
  --sw-rail-w: 88px; --sw-topbar-h: 52px; --sw-bottombar-h: 56px;
  --sw-drawer-w: 480px; --sw-list-w: 360px; --sw-detail-max: 680px;
  --sw-decision-bar-h: 64px; --sw-touch: 44px;
}
@media (prefers-reduced-motion: reduce) { :root { --sw-dur-hover: 0ms; --sw-dur-menu: 0ms; --sw-dur-drawer-in: 0ms; --sw-dur-drawer-out: 0ms; } }
```

### Layout

**Desktop shell (1280):**
- **Rail:** 88px wide on `#FAFAFA` with a right hairline. Wordmark at the top, 13/20 600. Destination tiles are 72x56 with an 8px radius: lucide icon 20px, label 11/16 underneath. The active tile is `#F4F4F5` with ink; inactive items are ink-3. Avatar (32px) at the bottom.
- **Top bar:** 52px, white, with a bottom hairline. Left: the current page name, 13/20 500 ink-3. Right: the switch (28px segmented) or "Give a referral" (ghost with `building-2`), the credits pill (28px, outlined in the control edge, mono), and the bell as a 32px icon button.

**Phone shell (390):**
- **Top bar:** 52px, laid out as in 3.4, with 16px margins.
- **Bottom bar:** 56px. Each of the three items is a 20px icon over an 11/16 label. Active = ink and 600, with no tile.

**Drawer:**
- **Desktop:** 480px, docked flush right under the top bar at full height. A left hairline and a soft shadow; no scrim, so the list stays visible and the selected row stays lit.
- **Header (56px):** title 15/24 600, context 12/16 ink-3, a 32px close button.
- **Body:** padding 24px.
- **Footer (sticky):** the cost line (13/20 500 ink) and its detail (12/16 ink-3) at full width, then a row with Save draft (ghost, 36px) and Send ask (black, 36px, with keycaps `command` + `corner-down-left`).
- **Phone:** a full-height sheet with an 8px top inset, 12px top corners, a 32x4 grabber in the control edge, 44px inputs, and a footer of full-width 44px buttons split 1:2.

**Screen A (Find a referral):**
- **List column:** 712px with the drawer open (648px of content inside 32px padding).
- **Heading:** two-tone. The heading is ink and the subheading continues in ink-3, both 24/32 600.
- **Search:** 36px tall, 6px radius, edge in the control edge, lucide `search` 16px.
- **Chips:** 28px tall with 44px hit areas on the phone. Selected = `#F4F4F5` fill, ink text, `check`. Unselected = hairline outline, ink-2 text.
- **Summary:** "7 companies · 2 open to requests", numerals in mono 12.
- **Company rows:** 44px. A 24px mark (`#F4F4F5`, 6px radius, 11/16 600), the name 13/20 500, the functions 12/16 ink-3, and on the right the availability marker plus 12/16 500.
- **Selected row:** a `#F4F4F5` tile with an 8px radius and a 2px ink bar inside the left edge.
- **Footnote:** 12/16 ink-3.

**Screen B (Referral queue):**
- **List column:** 360px.
  - **Header (52px):** "Referral queue" 13/20 600 and "5 waiting" in mono; underneath, the verified mark ("badge-check" plus "Verified · Kestrel Pay", 12/16 trust blue).
  - **Rows (56px):** the role 13/20 500 on the first line; "function · time left" on the second (time in mono, amber at 2 days or fewer). The state sits right: New = ink dot plus ink 12/16 500; Under review = ink-3 text.
  - **Footer:** "Referrers are never charged." 12/16 ink-3.
- **Detail column:** padding 32px 40px, content capped at 680px.
  - Eyebrow 12/16 500 ink-3, then the role 20/28.
  - **Meta row:** the ref in mono; `clock` plus "2 days left" in amber; the job posting link with `external-link`; the compensation.
  - **Why me:** a 12/16 label, then reasons numbered 01-03 in ink-3 mono 12 with 15/24 body text.
  - **Ask quality:** `check` plus text, 12/16 ink-2, 16px gaps; no pills.
  - **Locked panel:** `#FAFAFA`, a 1px hairline, 8px radius, padding 12px 16px. Inside: `lock` 16px, the title 13/20 500, and on the right "2 documents" in mono 12 ink-3 with `file-text`.
  - **Accept note:** 12/16 ink-2, directly above the bar.
- **Decision bar:** 64px, pinned, with a top hairline.
  - **Left:** "1 / 5" in mono 13, plus 32px up and down buttons (`chevron-up`, `chevron-down`).
  - **Right:** "Pass privately", a 36px ghost with keycap P; then "Accept & connect", 36px black with keycap A. The keycap on black has a 1px border at `rgb(255 255 255 / 0.4)`.
- **Pass reasons:** a 320px menu anchored above Pass privately, with a 12px radius and the popover shadow.
  - Title 13/20 600 and description 12/16 ink-2.
  - Five 36px radio rows, with keycaps 1-5 at the right.
  - Footer: Cancel (ghost) and Pass (ink outline, enabled after a choice).

**Screen C (My asks):**
- **List column:** 440px.
  - **Header:** "My asks" 20/28 600; "Open asks 2 of 3 · Free plan" in mono 12; "Ask for a referral" (black, 32px) on the right.
  - **Section labels:** "Active · 4" and "Closed · 2", 12/16 500 ink-3.
  - **Rows (64px):** first line, the company 13/20 500, the role 13/20 ink-2, and on the right the status dot plus label. Second line, the next step 12/16 ink-2 (truncated) and the date in mono on the right.
  - **Mini stepper:** four 6px dots joined by 8px connectors, placed before the status label.
- **Detail column:** padding 32px 40px.
  - Company and role 20/28; status dot plus label plus the date in mono.
  - **Full stepper:** four labelled steps, 16px lucide nodes, 1px connectors.
  - The credit line, then the dated history (12/16, dates in mono), then Withdraw (ghost).

**Phone frames:**
- **Screen A:** 56px rows, then the sheet.
- **Screen B:** the opened request under the top bar, with a 48px sub-header (back with `chevron-left`, "1 / 5", 44px up and down) and a 72px decision bar (Pass privately ghost 48px | Accept & connect black 48px, flex). No keycaps on touch. Frame 2 is the pass sheet at medium height, with 48px radio rows.
- **Screen C:** 72px rows.

### Memorable move

**The decision bar.** "1 / 5" with up and down sits on the left; "Pass privately · P" as a ghost and one black "Accept & connect · A" sit on the right. The accept consequence ("Accepting shares names both ways and their resume…") sits directly above it, and the identity lock just above that. Everything a referrer needs in order to decide lives in one 64px strip.

### Advisor view: 7/10

- **For:** it speeds up the decision on the scarce side of the market without measuring anyone.
- **Strongest argument against:** most seekers are on phones, where density and keycaps buy nothing. A volunteer with three asks may also read "1 / 5" and keycaps as a job, not a favour.
- **Risk:** 13px UI can feel cold to an anxious first-time seeker.
- **Must not drift:** the dimmed rail, dot-plus-text status, one pinned decision bar, 13px density.

---

## 5. Direction 2: Ledger (`ledger`)

**Pitch:** Mercury-calm tables where every ask and every credit carries a state and a date, and the cost sits directly above Send ask.

**Density:** medium. 14px body; 48px table rows (56px with two lines); 64px stacked rows on phones.

### Reference lock

- **Primary reference:** Mercury's public demo dashboard (transactions table, status tag, detail sheet, segmented switch).
- **Preserve:**
  1. **Calm white tables:** 48px rows, rgba hairline separators, 12px muted headers, right-aligned numeric columns.
  2. **Outlined status tags:** 12/16 500, 20px tall, padding 0 8px, 4px radius, no fill. A 1px border in the hue at 28-30% alpha, text in the AA tone. One tag per row.
  3. **A floating detail sheet** inset from the viewport (480px wide here, 16px inset, 16px radius) with a dot-and-line dated timeline.
  4. **Truthful money typography.** Spends use the true minus ("−1 credit"). A returned credit keeps its amount struck through in ink-3, with a dated "Returned 10 Oct" line in ink. Colour only ever marks money coming in.
  5. **Segmented switch anatomy:** a gray track; the selected segment is white with a 1px border and a 1px shadow.
- **Borrow only:**
  - **Stripe Checkout's two-column cost receipt directly above the action** (Your balance / This ask / After sending), exact numbers only.
  - **Stripe balances' dated state transitions for credits:** spent, then returnable until pickup, then either stays spent or is returned on a date.
- **Role rules:**
  - Black is used only for the commit action.
  - Emerald appears only for Referred. A returned credit is struck ink-3 plus a dated ink line, not green.
  - Status lives in outlined tags only, and borders stay neutral except for errors.
  - Blue appears only in the verified tag (blue text plus a blue-alpha border).
  - The company or role always leads the row; the credit is a column, never the headline.
- **Media strategy:** none; code-native.
- **Reject:**
  - Mercury's indigo CTA and blue links; weight-360 text; the Arcadia typeface.
  - Superscript minor units on credit counts (they belong only on INR/USD prices, which these screens don't show).
  - A comment box before acceptance; filled status chips.
  - Money as the hero; blanket "credit returned"; green for anything but Referred.

### Token commitments

```css
:root {
  color-scheme: light;
  /* Surfaces: cool slate neutrals (Mercury and the owner's Kinetic draft) */
  --sw-canvas: #FFFFFF;
  --sw-surface: #FFFFFF;
  --sw-surface-sunken: #F8FAFC;    /* table header band, selected row, locked panel */
  --sw-surface-track: #F1F5F9;     /* segmented track, active rail tile, marks */
  --sw-surface-hover: #F8FAFC;
  --sw-surface-selected: #F8FAFC;
  --sw-scrim: rgb(15 23 42 / 0.24);/* phone sheets only; the desktop sheet has no scrim */
  /* Ink */
  --sw-ink: #0F172A;               /* 17.85:1 */
  --sw-ink-2: #475569;             /* 7.58:1; 6.92:1 on the track */
  --sw-ink-3: #64748B;             /* 4.76:1 on white, 4.55:1 on #F8FAFC; never on the track */
  --sw-ink-inverse: #FFFFFF;
  /* Lines */
  --sw-hairline: rgb(15 23 42 / 0.08);  /* row separators */
  --sw-hairline-strong: #E2E8F0;        /* table header rule, sheet header and footer rules */
  --sw-control-edge: #7C8798;           /* 3.64:1 on white, 3.32:1 on the track */
  /* Primary: true near-black (the owner asked for black) */
  --sw-primary: #0A0A0A;
  --sw-primary-hover: #262626;
  --sw-primary-pressed: #404040;
  --sw-on-primary: #FFFFFF;
  /* Trust and status: outlined tags (text + 1px border), no fills */
  --sw-trust: #1D4ED8;    --sw-trust-border: rgb(29 78 216 / 0.30);
  --sw-emerald: #047857;  --sw-emerald-border: rgb(4 120 87 / 0.30);
  --sw-amber: #B45309;    --sw-amber-border: rgb(180 83 9 / 0.30);
  --sw-crimson: #B91C1C;  --sw-crimson-border: rgb(185 28 28 / 0.28);
  --sw-neutral-tag-border: rgb(15 23 42 / 0.20);
  /* Type: Instrument Sans 400/500/600 + IBM Plex Mono 500, 4px baseline */
  --sw-font-sans: "Instrument Sans", system-ui, sans-serif;
  --sw-font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --sw-type-title:   600 24px/32px var(--sw-font-sans); --sw-track-title: -0.02em;
  --sw-type-heading: 600 20px/28px var(--sw-font-sans); --sw-track-heading: -0.01em;
  --sw-type-body:    400 14px/20px var(--sw-font-sans);                              /* table cells */
  --sw-type-reading: 400 14px/24px var(--sw-font-sans);                              /* the three reasons */
  --sw-type-label:   500 13px/20px var(--sw-font-sans); --sw-track-label: 0.01em;    /* fields, chips, buttons */
  --sw-type-header:  500 12px/16px var(--sw-font-sans); --sw-track-header: 0.01em;   /* table headers, ink-2 */
  --sw-type-tag:     500 12px/16px var(--sw-font-sans); --sw-track-tag: 0.02em;
  --sw-type-mono:    500 13px/20px var(--sw-font-mono);   /* inline numbers: set 1px above neighbouring 12px text */
  --sw-type-mono-ledger: 500 14px/20px var(--sw-font-mono); /* credit column, receipt values */
  --sw-numeric: tabular-nums;
  --sw-minus: "\2212";                                    /* spends always use U+2212 */
  /* Space */
  --sw-space-1: 4px;  --sw-space-2: 8px;  --sw-space-3: 12px; --sw-space-4: 16px;
  --sw-space-6: 24px; --sw-space-8: 32px; --sw-space-12: 48px;
  /* Radius */
  --sw-radius-tag: 4px; --sw-radius-control: 8px; --sw-radius-mark: 8px;
  --sw-radius-popover: 12px; --sw-radius-sheet: 16px;
  /* Elevation: page flat */
  --sw-shadow-segment: 0 1px 2px rgb(15 23 42 / 0.06);
  --sw-shadow-popover: 0 0 0 1px rgb(15 23 42 / 0.08), 0 12px 24px -8px rgb(15 23 42 / 0.12);
  --sw-shadow-sheet: 0 0 0 1px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.04),
                     0 24px 48px -12px rgb(15 23 42 / 0.18);
  /* Focus */
  --sw-focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #0F172A;
  /* Motion */
  --sw-dur-hover: 120ms; --sw-dur-tag: 150ms;
  --sw-dur-sheet-in: 240ms; --sw-dur-sheet-out: 180ms;   /* 24px slide + fade */
  --sw-ease-out: cubic-bezier(0, 0, 0.2, 1); --sw-ease-in: cubic-bezier(0.4, 0, 1, 1);
  /* Layout */
  --sw-rail-w: 88px; --sw-topbar-h: 64px; --sw-topbar-h-phone: 56px; --sw-bottombar-h: 64px;
  --sw-content-max: 1040px; --sw-gutter: 24px;
  --sw-drawer-w: 480px; --sw-sheet-inset: 16px;
  --sw-row-h: 48px; --sw-row-h-2line: 56px; --sw-row-h-phone: 64px; --sw-table-header-h: 36px;
  --sw-touch: 44px;
}
@media (prefers-reduced-motion: reduce) { :root { --sw-dur-hover: 0ms; --sw-dur-tag: 0ms; --sw-dur-sheet-in: 120ms; --sw-dur-sheet-out: 0ms; } } /* fade only */
```

### Layout

**Desktop shell (1280):**
- **Rail:** 88px, labelled. Items are 64px tall: a 20px icon over an 11/16 label. Active = `#F1F5F9` tile, 8px radius, ink; inactive = ink-3. Wordmark 14/20 600 at the top; avatar at the bottom.
- **Top bar:** 64px. Left: the segmented switch (32px track, 28px segments, 13/20 500; unselected labels in ink-2) or "Give a referral" as a 32px outlined button. Right: the credits pill (32px, 1px `#E2E8F0` border, 8px radius, `coins` 16px plus Plex 13/20) and the bell (32px).
- **Content:** capped at 1040px with 24px gutters. When the sheet opens, the content reflows into the 680px to its left; nothing hides under the sheet.

**Phone shell (390):**
- **Top bar:** 56px, laid out as in 3.4.
- **Stacked rows:** 64px. First line, the lead plus a right-aligned value; second line, the secondary text plus the tag.
- **Bottom bar:** 64px, labelled.
- **Sheets:** bottom sheets with 16px top corners and a 36x4 grabber. Compose opens at full height and the pass reasons at medium.

**Sheet (desktop):**
- 480px wide, inset 16px from the top, right and bottom, 16px radius, the sheet shadow, no scrim.
- **Header (64px):** title 20/28 600, context 13/20 ink-2, a 32px close button.
- **Body:** padding 24px.
- **Footer:** sticky, under a `#E2E8F0` rule.
  - Receipt rows, 32px each: the label 13/20 ink-2 on the left, the value in Plex 14/20 on the right; the minus is U+2212.
  - The condition, 12/16 ink-2.
  - Save draft (ghost, 44px) and Send ask (black, 44px, flex).

**Screen A (Find a referral):**
- **Header:** title 24/32 and subheading 14/20 ink-2.
- **Search:** 40px tall, 8px radius, edge in the control edge.
- **Chips:** 32px, outlined. Selected = a 1px ink border plus `check` on white.
- **Summary strip:** "7 companies · 2 open to requests", numerals in Plex.
- **Table:** a 36px header row (Company · Functions · Availability) and 48px rows. Each row has a 28px mark (`#F1F5F9`, 8px radius), the name 14/20 500, the functions 13/20 ink-2, and the availability right-aligned at 13/20.
- **Selected row:** `#F8FAFC` with a 2px ink bar inside the left edge.
- **Footnote:** 12/16 ink-3.

**Screen B (Referral queue):**
- **Header:** title, then the verified tag (outlined blue), then the subheading.
- **Summary strip:** "5 waiting · Referrers are never charged."
- **Table:** Role (title 14/20 500 above the function 12/16 ink-2; 56px rows) · State (tag; New = ink text, Under review = ink-2 text, both on the neutral border) · Time left (right-aligned, Plex; amber at 2 days or fewer) · Closes (right-aligned date in Plex).
- **Sheet:**
  - Eyebrow 12/16 ink-2, then the role 20/28.
  - **Record list:** 40px label/value rows between hairlines, Mercury-style: Job posting, Compensation, Received, and Closes with the time left.
  - **Why me:** numbered 1-3 in Plex, body 14/24.
  - **Ask quality:** outlined neutral tags with `check`.
  - **Locked panel:** `#F8FAFC`, a 1px `#E2E8F0` border, 8px radius.
  - **Footer:** the accept note, then Pass privately (ghost, 44px) and Accept & connect (black, 44px, flex).
- **Frame 2:** the same sheet at its pass step. It shows the title, the description, and five 44px radio rows (16px radios edged in the control edge). The footer holds Cancel and Pass (ink outline).

**Screen C (My asks):**
- **Header:** title and subheading, then the summary strip "4 active · 2 closed · Open asks 2 of 3 · Free plan", with "Ask for a referral" (black, 40px) on the right.
- **Table columns:**
  - **Ask:** the company 14/20 500 above the role 12/16 ink-2.
  - **Status:** a tag with its glyph.
  - **Stage:** four 12x4 ticks. Ticks are ink up to the reached stage and emerald when Referred; a terminal tick is crimson (Expired) or ink-3 (Withdrawn).
  - **Credit:** right-aligned. Either "1 credit spent", or a struck "1 credit" with "Returned 10 Oct".
  - **Date:** the label plus the date in Plex.
- **Sheet for the focused Quillmint ask:**
  - Header: company, role, status tag.
  - **Credit block:** "1 credit spent · comes back if nobody picks it up by 24 Oct".
  - **Dated timeline:** 12px dots on a 1px line. Past events are ink, the current one an ink ring, the future one a dashed line with ink-3 text.
  - The next-step line, then Withdraw (ghost).

### Memorable move

**The ledger.** Every ask row ends in a credit cell with a state and a date. A struck "1 credit" beside "Returned 10 Oct" reads at a glance as "this cost me nothing". The ask sheet ends in a three-line receipt (Your balance 2 credits / This ask −1 credit / After sending 1 credit) directly above the one black Send ask, like Stripe's "Total due" above Pay.

### Advisor view: 6/10

- **For:** it makes the credit rules visible and boring before D-034, D-035 and D-038 land. It is the best fit for "payments safe and boring" and for support.
- **Strongest argument against:** coupling a cost to every row raises the pain of paying (Prelec and Loewenstein, 1998) and can make SkipWait read like billing software. Referrers never pay, so the signature does little on the queue.
- **When it would score 7:** if the owner's top worry is credit disputes rather than send volume.
- **Must not drift:** outlined tags, struck returned amounts, the receipt above Send ask, the inset sheet, Plex numerals.

---

## 6. Direction 3: Signal (`signal`)

**Pitch:** Phone-first and bold: one big honest number per seeker screen over a chunky four-step track, with the single next step in the thumb zone.

**Density:** low. Designed at 390 first; desktop centres a 640px column.

### Reference lock

- **Primary reference:** Material 3 Expressive (control scale, navigation bar and rail tokens, menu-button behaviour).
- **Preserve:**
  1. **Big-control scale:** a 56px full-width primary in the thumb zone on phones; targets and inputs of at least 48px.
  2. **M3 navigation:** the 64px bottom bar and the 88px rail both use a full-pill active indicator (`#F4F4F5`, 64x32 on the bar, 56x32 on the rail) behind a 24px icon, with a 12/16 label below.
  3. **Large, confident type:** 28/36 700 titles, 16/24 body, one 48/52 mono readout per seeker screen.
  4. **Shape:** 12px for interactive containers (company and ask cards are the interactive object, so they qualify as cards); 24px top corners on phone sheets. Pills only for the nav indicator and the mode switch.
  5. **M3 menu-button behaviour:** Pass privately carries a `chevron-down` that flips 180° in 200 ms when the reasons open (0 ms under reduced motion).
- **Borrow only:**
  - **Attio's three-part tinted badge:** a tint fill, a 1px tinted border and AA text, 24px tall here with a 6px radius.
  - **Polaris's progress glyph inside the badge,** with past-tense one- or two-word labels (glyph set in 3.2).
- **Role rules:**
  - **What the readout may show:** the seeker's own answer for that screen, computed from real rows, as a day count or a plain count. Never about a person, and never on a referrer screen, where the role title takes the big type instead.
  - **Readout colour:** the numerals stay ink; they turn amber only on an ask's last day.
  - Tints carry status only. Black is used only for the commit action.
- **Media strategy:** none; code-native.
- **Reject:**
  - M3 tonal and dynamic colour; FABs; spring or expressive motion; pills on every control.
  - Filled black chips or segments.
  - Any big number about another person; red or animated countdowns; big clocks aimed at referrers.

### Token commitments

```css
:root {
  color-scheme: light;
  /* Surfaces: neutral, highest contrast of the three */
  --sw-canvas: #FFFFFF;
  --sw-surface: #FFFFFF;
  --sw-surface-sunken: #FAFAFA;    /* locked panel */
  --sw-surface-tonal: #F4F4F5;     /* nav pill, selected chip, selected segment, neutral badge, marks */
  --sw-surface-hover: #F4F4F5;
  --sw-scrim: rgb(10 10 10 / 0.32);/* drawer and sheets */
  /* Ink */
  --sw-ink: #111111;               /* 18.88:1 */
  --sw-ink-2: #3F3F46;             /* 10.44:1 */
  --sw-ink-3: #6B6B73;             /* 5.28:1; 4.81:1 on #F4F4F5 */
  --sw-ink-inverse: #FFFFFF;
  /* Lines */
  --sw-hairline: #E4E4E7;          /* card borders and dividers (cards are also separated by space) */
  --sw-track-connector: #D4D4D8;   /* upcoming track connectors, decorative */
  --sw-control-edge: #737373;      /* inputs, outlined buttons, segmented outline, rings: 4.74:1 */
  /* Primary */
  --sw-primary: #111111;
  --sw-primary-hover: #2A2A2A;
  --sw-primary-pressed: #3F3F46;
  --sw-on-primary: #FFFFFF;
  /* Trust and status: three-part tinted badges (text / tint / border) */
  --sw-trust: #1D4ED8;   --sw-trust-tint: #EFF6FF;   --sw-trust-border: #BFDBFE;    /* 6.16 on tint */
  --sw-emerald: #047857; --sw-emerald-tint: #ECFDF5; --sw-emerald-border: #A7F3D0;  /* 5.21 on tint */
  --sw-amber: #92400E;   --sw-amber-tint: #FFFBEB;   --sw-amber-border: #FDE68A;    /* 6.84 on tint, 7.09 on white */
  --sw-crimson: #B91C1C; --sw-crimson-tint: #FEF2F2; --sw-crimson-border: #FECACA;  /* 5.91 on tint */
  --sw-neutral: #3F3F46; --sw-neutral-tint: #F4F4F5; --sw-neutral-border: #E4E4E7;  /* 9.50 on tint */
  /* Type: Instrument Sans 400/500/600/700 + JetBrains Mono 500, 4px baseline */
  --sw-font-sans: "Instrument Sans", system-ui, sans-serif;
  --sw-font-mono: "JetBrains Mono", ui-monospace, monospace;
  --sw-type-display: 700 28px/36px var(--sw-font-sans); --sw-track-display: -0.02em; /* titles; the role on the queue */
  --sw-type-heading: 600 20px/28px var(--sw-font-sans); --sw-track-heading: -0.01em;
  --sw-type-body:    400 16px/24px var(--sw-font-sans); --sw-track-body: 0;
  --sw-type-label:   600 14px/20px var(--sw-font-sans); --sw-track-label: 0.01em;    /* buttons, field labels */
  --sw-type-meta:    500 13px/20px var(--sw-font-sans); --sw-track-meta: 0.01em;
  --sw-type-badge:   500 12px/16px var(--sw-font-sans); --sw-track-badge: 0.02em;
  --sw-type-readout: 500 48px/52px var(--sw-font-mono); --sw-track-readout: -0.02em; /* one per seeker screen */
  --sw-type-mono:    500 13px/20px var(--sw-font-mono);                              /* IDs, dates, counts, counters */
  --sw-numeric: tabular-nums;
  /* Space */
  --sw-space-1: 4px;  --sw-space-2: 8px;  --sw-space-3: 12px; --sw-space-4: 16px;
  --sw-space-6: 24px; --sw-space-8: 32px; --sw-space-12: 48px; --sw-space-16: 64px;
  /* Radius */
  --sw-radius-badge: 6px; --sw-radius-chip: 8px;
  --sw-radius-control: 12px; --sw-radius-card: 12px; --sw-radius-mark: 12px;
  --sw-radius-sheet-desktop: 16px; --sw-radius-sheet-phone: 24px;
  --sw-radius-pill: 999px;          /* nav indicator and mode switch only */
  /* Elevation: cards are flat with a 1px border */
  --sw-shadow-popover: 0 8px 24px rgb(10 10 10 / 0.14);
  --sw-shadow-sheet: 0 -8px 32px rgb(10 10 10 / 0.16);
  /* Focus (bolder, 3px ink) */
  --sw-focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 5px #111111;
  /* Motion */
  --sw-dur-press: 100ms; --sw-dur-chevron: 200ms; --sw-dur-indicator: 200ms;
  --sw-dur-sheet-in: 280ms; --sw-dur-sheet-out: 200ms;
  --sw-ease-out: cubic-bezier(0, 0, 0.2, 1); --sw-ease-in: cubic-bezier(0.4, 0, 1, 1);
  /* Layout */
  --sw-rail-w: 88px; --sw-topbar-h: 64px; --sw-bottombar-h: 64px;
  --sw-column: 640px; --sw-side-panel: 360px; --sw-drawer-w: 480px;
  --sw-primary-h: 56px; --sw-touch: 48px; --sw-input-h: 48px;
}
@media (prefers-reduced-motion: reduce) { :root { --sw-dur-press: 0ms; --sw-dur-chevron: 0ms; --sw-dur-indicator: 0ms; --sw-dur-sheet-in: 0ms; --sw-dur-sheet-out: 0ms; } }
```

### Layout

**Phone shell (390, designed first):**
- **Top bar:** 64px, laid out as in 3.4. The switch is a 44px pill reading "Seeking | Giving"; a selected segment shows `#F4F4F5`, a `check` and 600 weight.
- **Margins:** 16px.
- **Bottom bar:** 64px, with the pill indicator.
- **Primary button:** where the screen has one, it is 56px and pinned 12px above the bottom bar, with 16px side margins.
- **Sheets:** compose opens at full height with 24px top corners and a 36x4 grabber; the pass reasons open at medium.

**Desktop shell (1280):**
- **Rail:** items 56px tall, with a 56x32 pill indicator. Wordmark 15/20 700 at the top.
- **Top bar:** 64px.
- **Content:** one 640px centred column. The queue adds a 360px panel to its left.
- **Drawer:** 480px from the right at full height, 16px left corners, scrim `rgb(10 10 10 / 0.32)`.

**Screen A (Find a referral):**
- **Header:** title 28/36 700 and subheading 16/24 ink-2.
- **Search:** 48px tall, 12px radius, 1px control edge.
- **Chips:** 32px visible, 48px target, 8px radius. Selected = `#F4F4F5`, a 1px ink border and `check`.
- **Readout block:** "2" at 48/52 mono, "open to requests now" at 16/24, "of 7 companies shown" at 13/20 ink-3.
- **Company cards:** 12px radius, 1px hairline, padding 16px, at least 72px tall. A 40px mark (`#F4F4F5`, 12px radius, 14/20 600), the name 16/24 600, the functions 13/20 ink-2, and the availability marker plus 13/20 500.
- **Selected card:** a 2px ink border.
- **Footnote:** 13/20 ink-3.
- **Drawer:**
  - Header: title 20/28 600, context 14/20 ink-2, a 48px close button.
  - Fields: 14/20 600 labels, 48px inputs. The reasons are 16/24 textareas with counters in mono 13.
  - Footer: the cost line 14/20 600 and the detail 13/20 ink-2, then Save draft (56px outline) and Send ask (56px black, flex).

**Screen B (Referral queue):**
- **Panel (360px):**
  - Header: "Referral queue" 20/28 600, the verified badge (blue tint), "5 waiting" in mono 13.
  - Cards (72px): the role 14/20 600; the function and time left at 13/20 (amber at 2 days or fewer); a state badge.
  - Footer: "Referrers are never charged."
- **Column (640px):**
  - Eyebrow 13/20 600 ink-2, then the role at 28/36 700. This is the big type on this screen, and there is no readout.
  - **Meta:** a time-left badge (amber tint with `clock`) and the ref in mono 13.
  - **Job posting row:** `link`, the address 16/24 ink underlined, `external-link`.
  - The compensation.
  - **Why me:** three rows numbered 1-3 in mono 20/28, body 16/24.
  - **Ask quality:** neutral tinted badges with `check`.
  - **Locked panel:** `#FAFAFA`, 12px radius, padding 16px. Inside: `lock` 20px, the title 16/24 600, "2 documents" in mono 13.
  - **Accept note:** 13/20 ink-2.
  - **Decision bar:** sticky at the column bottom, two equal-width 56px buttons. Pass privately is an outline button with `chevron-down`; Accept & connect is black.
- **Pass reasons:** on desktop they open as a panel directly above the bar (48px radio rows) and the chevron flips. On the phone they open in a medium sheet.

**Screen C (My asks):**
- **Header:** title 28/36, the subheading, and the slots line "Open asks 2 of 3 · Free plan" with mono numerals. "Ask for a referral" sits at the header's right on desktop (48px) and is pinned at 56px on the phone.
- **Hero card (the focused Quillmint ask):**
  - The company 16/24 600 and role 14/20 ink-2, with the Waiting badge.
  - **Readout:** "6 days" at 48/52, the label at 16/24, the context at 13/20 ink-3.
  - **Big track:** four 24px lucide nodes on 2px connectors (reached = ink, upcoming = `#D4D4D8`), with 13/20 labels under each; the current label is 600.
  - The next-step line at 16/24, then Withdraw (48px outline).
- **The other five asks:** under "Active · 4" (the hero counts as one) and "Closed · 2". Cards have a 12px radius and 16px padding:
  - First line: the company 16/24 600, with the badge on the right.
  - Second line: the role 14/20 ink-2 and the date in mono.
  - A compact track of four 12px nodes.
  - The next step at 14/20, plus the credit note at 13/20 ink-3 when a credit was returned.

### Memorable move

**The readout.** One 48px mono number answers the screen's question: "2" companies open to requests now on Find a referral, and "6 days" left for the Quillmint ask on My asks. It sits directly above the four-step track. The referrer screen deliberately has none: there, the role title is the big type, so no volunteer is ever shown a large count or clock.

### Advisor view: 6/10

- **For:** the clearest one-glance answer for first-time seekers on phones, and the biggest targets.
- **Strongest argument against:** a 48px "2" can read as scarcity marketing even though it is true. Low density makes a referrer with many asks scroll. With M3's colour and motion rejected, the style risks looking like a generic mobile app.
- **Must not drift:** the readout over the big track, the 56px thumb-zone primary, the pill nav indicator, tinted badges with glyphs, 12px cards.

---

## 7. How the three differ (never averaged)

| | Triage Desk | Ledger | Signal |
|---|---|---|---|
| Dominant reference | Linear | Mercury | Material 3 Expressive |
| Borrowed details | Raycast action bar; Superhuman speed | Stripe receipt; Stripe dated states | Attio tinted badge; Polaris glyphs |
| Density | High (13px UI) | Medium (14px body) | Low (16px body, 390-first) |
| Mono face | JetBrains Mono 12/13 | IBM Plex Mono 13/14 | JetBrains Mono 13 and 48 |
| Neutrals | Zinc, dim chrome | Cool slate | Zinc, highest contrast |
| Status | 8px dot + text | Outlined 20px tag | Tinted 24px badge + glyph |
| Shape | 6px controls, 8px tiles, flush drawer | 8px controls, 4px tags, 16px inset sheet | 12px controls and cards, pills for nav and switch |
| Desktop layout | Rail, list, detail, pinned bar | Rail, 1040px table, floating sheet | Rail, 640px column (+360px panel) |
| Drawer | Docked flush, no scrim | Floating inset, no scrim, table reflows | Full-height modal with scrim |
| Signature | Decision bar with "1 / 5" and keycaps | Credit cell per row + receipt above Send ask | One 48px honest readout over a big track |
| Best for | Referrers deciding several asks | Paying seekers who worry about credits | First-time seekers on phones |
| Weakest at | Phone-first seekers | Referrer screens | Referrers with many asks |

---

## 8. Decision ledger

| Decision | Source | Role rule | Why |
|---|---|---|---|
| White canvas, light mode only; sunken grays only for the rail, headers and the locked panel | Owner's Kinetic spec; refero anti-slop (light by default); Linear 2026 refresh | The canvas is the reading surface | The owner asked for daylight-first |
| One solid black element per screen, and it is the commit action | Owner's Kinetic spec; Polaris brand role ("don't use multiple brand roles in the same area"); Attio near-black primary | Black = commit only; selected states use tints | The next honest step is never ambiguous |
| Trust blue `#1D4ED8` appears only with `badge-check` | Owner's Kinetic spec and draft token; LinkedIn, Airbnb and Upwork one-mark pattern | Blue = work email verified | Every reference spends blue elsewhere, so it was re-homed |
| Ink focus ring (2px white + 2px ink; 3px in Signal) | Geist focus recipe with blue swapped for ink; refero craft rules | Focus is never blue | Keeps blue's meaning and gives AA-visible focus |
| Links are ink with an underline; info states are gray | Geist, Polaris and Stripe info roles rejected | Same as above | Same as above |
| Emerald only for Referred | Owner's palette; Polaris success role ("don't use to entice") | Emerald = completed outcome | A green Accepted would claim a referral that hasn't happened |
| Accepted is neutral ink | Research recommendation; owner rule "accepting is not referring" | Milestone, not outcome | Avoids false success; owner's call (question 1) |
| Amber for pending and clocks of 2 days or fewer; `#B45309` text, `#92400E` inside tints | Owner's palette; Polaris warning and caution roles; live 2-day "expiring soon" rule; measured contrast | Amber = pending, time-bound | Moves the live crimson "Expires tomorrow" to amber |
| Crimson only for ended states and input errors; none in the referrer queue | Owner's palette; Polaris (critical is stressful); Stripe (negative = no action required) | Crimson = ended | No red pressure on volunteers |
| Availability is an ink dot or a ring, never green or blue | Polaris success role; trust-blue role; live supply (1 of 39 open) | Availability is a fact, not a success | A wall of green would overstate supply |
| Status is text plus tone, one status per row | Geist badge rules; Polaris; WCAG 1.4.1 | A label is always present | Safe for colour-blind users |
| Tabular mono numerals for counts, IDs, clocks, credits and dates | Owner's Kinetic spec; local font test (Instrument Sans draws I and l alike) | Mono = data only | IDs stay unambiguous and numbers align |
| Instrument Sans at 400/500/600 (700 for Signal titles) | Installed fonts; Linear's 510/590 mapped to 500/600 | — | No new font package |
| Control edges of at least 3:1 (`#8A8A8A`, `#7C8798`, `#737373`); hairlines decorative only | WCAG 1.4.11; hairlines measured at 1.13-1.31 | Hairline = divider; edge = control | Inputs and radios stay visible |
| 88px rail, three-item bottom bar, top mode switch | Owner's Kinetic spec; M3 rail (80/96) and navigation bar (64) | — | The owner's spec fits M3's tested ranges |
| Mode switch only for verified referrers; everyone else gets "Give a referral" leading to work email | D-030; `useReferrerAccess` server verdict | Switch = verified only | Founder-locked login rule |
| 480px drawer on desktop, sheet on phones; compose at full height; pass reasons at medium; one sheet at a time | Owner's draft; Stripe ContextView/FocusView; Apple HIG sheets | — | Composing needs room; choosing a reason is a small scoped task |
| Cost line and its condition sit in the drawer footer from the first moment | Stripe FocusView footer content; Checkout total above Pay; India CCPA (drip pricing); Help.tsx line 13 | A money line is truthful and complete | No surprise at Send ask |
| Closing the drawer keeps a draft; Save draft is the secondary | Linear drafts; live server-side drafts | — | A seeker never loses work |
| The locked panel shows "2 documents" only | Binding privacy rule; the P0 pre-accept privacy fix target | — | Keeps the pre-accept promise |
| The accept consequence sits directly above the decision | Stripe footer content; live accept-modal copy | — | The referrer knows exactly what Accept does |
| Pass is separate from Accept; five shipped reasons, none preselected; the Pass confirm is an ink outline | `shared/passReasons.ts`; M3 (opposite decisions stay separate); one-black rule | — | No accidental pass; equal visibility |
| Keys open confirm steps and never commit | Linear Triage; Kula (shortcuts off while typing) | Keycaps are hints only | Accepting reveals identity, so it must be deliberate |
| Queue sorted by soonest close, then advance after each decision | Gmail and Outlook auto-advance; Kula | — | Fair, and the oldest asks get seen first |
| Day-level clocks only | Owner; India CCPA (false urgency) | — | No pressure on anyone |
| A company that isn't open offers "Get told when a referrer joins" and "An alert is not a referral." (detail only) | Resy Notify; live `/api/seeker-alerts` | — | An honest path when nobody can help yet |
| Fictional companies in the fixtures | Truth rule; live data from 17 Oct | — | No real company is implied to have referrers |
| Non-sequential display refs (`R-8F3K2`) | Research: `Ref-{1000+id}` leaks platform volume | — | Owner's call (question 6) |
| Three reasons of up to 140 characters with live counters | Owner's Kinetic draft (three-field rule); `shared/askQuality.ts` | — | Coaches specific proof (compass point 2) |
| Motion under 300 ms; list moves instant; reduced motion instant or fade | AGENTS.md founder motion guidelines; Superhuman | — | The frequency principle |
| Lucide only; keycaps are letters or lucide icons | Binding rule; local lucide tool | — | No glyph icons |
| Triage Desk: Linear-led desk (dim rail, list then detail, decision bar, JetBrains Mono, 13px) | Linear; Raycast; Superhuman | Content leads, chrome recedes | Speed of the referrer's decision |
| Ledger: Mercury-led ledger (tables, outlined tags, inset sheet, struck amounts, Plex Mono, receipt) | Mercury; Stripe Checkout and balances | Money states are exact and dated | Money truth |
| Signal: M3-led signal (56px thumb primary, pill nav, readout, tinted badges, 12px cards) | Material 3 Expressive; Attio; Polaris | The readout is the seeker's own answer | Clarity on phones |

---

## 9. Approvals and open questions

### Fonts and assets needing owner approval

None. All three directions use only installed fonts (Instrument Sans, JetBrains Mono, IBM Plex Mono), lucide icons and code-native shapes. These would need approval if anyone proposes them later:
- **Fonts:** Inter or Inter Variable (the font stack in the owner's Kinetic draft), Inter Display, Geist Sans or Mono, Arcadia, Material Symbols.
- **Assets:** real company logos (the comps use initials), any photography or illustration.
- **Packages:** none needed. Radix Dialog already ships; Vaul is unmaintained upstream, so avoid it.

### Open questions for the owner (with my recommendation)

1. **Accepted: neutral or emerald?** I recommend neutral (8/10). An emerald Accepted tells the seeker a referral happened when it hasn't. D-038 exists precisely because accepted asks stall before anyone refers.
2. **How should Expired and Passed look in crimson?** Compare the three renders: dot plus text (Triage Desk), outlined tag (Ledger), tinted badge (Signal). I lean to the outlined tag (6/10); it is the calmest of the three that still reads as ended.
3. **Should a referrer see the private queue position "1 / 5"?** It appears only in Triage Desk. Keep it only if it doesn't read as workload (6/10). I don't know how volunteers will read it; ask two referrers.
4. **Three "why me" reasons in place of the single 600-character note?** This is a composer change from the live product. The live strength checks still apply. Whether the server should store three lines inside the existing note field or as structured data is a build question I can't answer from the design side.
5. **Which mono face:** JetBrains Mono (Triage Desk, Signal) or IBM Plex Mono (Ledger)?
6. **Non-sequential display refs** (`R-8F3K2`) instead of `Ref-{1000+id}`, which reveals roughly how many asks exist (7/10).
7. **Filter chips.** The comps show the four chips set for this round, with "Product & design" grouping two functions. Production should offer all ten job functions; the live filter shows 5 of the 10 (7/10).

### Not shown on purpose (approved but not built, or pending approval)

- D-034 waiting asks (no credit until a referrer can see the ask).
- D-047 held asks.
- D-038 claim and referral timers.
- D-035 credit outcomes that depend on the pass reason.
- The paid coach rewrite (1 credit, cost awaiting approval).
- Pinned work.

When any of these ship, the cost line and tracker copy change. content.json names the live rule each money line follows.
