# D-048 phase 3: moving every surface onto the goal system

> Read `docs/BRIEF.md` first, then this. Phase 2 (tokens, primitives, `DESIGN.md`, token audit) is
> live; this is the map for phase 3. It is **not** a licence to re-skin ad hoc — `BRIEF.md:24`:
> "Until a screen is moved over, keep its tokens and components; never re-skin ad hoc." Each wave
> below becomes its own packet and its own PR.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-048` (phase 3) |
| Decisions | D-048, D-070, D-071, D-077, D-033, D-006/D-040, D-055, D-063, D-120, D-123, D-130 |
| Risk tier | 2 (UI only) — **except W3 (money)**, which is Tier 1 because every line of copy there is a truth claim |
| Depends on | phase 2 live (it is: `client/src/components/goal/`, `--g-*` in `index.css`, `DESIGN.md`, `scripts/design-token-audit.mjs`) |
| Rule | One wave = one packet = one PR. Nothing moves that is not in a wave. |

## 1. What "across the app" means

A surface is **moved** when all six hold:

1. it renders inside `GoalShell` (or a wave names the exception and why);
2. it imports only `@/components/goal/*` — no `@/components/kit/*` import left;
3. it carries no colour literal (`design-token-audit` counts zero off-brand tokens);
4. its empty, loading and error states come from `GoalStates`;
5. it has captures at **1280 and 390** on the branch, not just a passing test;
6. its copy has been re-read against the decisions it touches (§5).

Until then it keeps today's components. A half-moved screen is worse than an unmoved one.

## 2. The invariants — this is a system, not a theme

- **Shell.** Rail on desktop, top bar + bottom bar on phones (`GoalShell`). Nav is **Find a
  referral, My asks, Inbox**, plus **Referral queue** for a verified referrer. Impact is *not* a
  nav item: it is the quiet link in the queue header (D-077). A non-referrer gets the quiet
  "Give a referral" link, which leads to work-email verification (D-070).
- **One primary action per screen.** Everything else is ghost or outline. Two filled buttons on
  one screen is a bug, not a style choice.
- **Status vocabulary.** Accepted is neutral (it is not a referral, D-038). Emerald is Referred
  only. Amber is pending and clocks ≤ 2 days. Crimson is ended and input errors, and **never**
  appears in the referrer queue.
- **Numerals.** `GoalNum` (JetBrains Mono) for counts, clocks, credits and references. Display
  references are the HMAC short code, never `Ref-{1000+id}` (D-077).
- **Density.** 44px list rows, list + detail rather than nested cards, no gradients (the landing
  hero's warm band, `.g-hero-warm`, is the one exception, D-130), no decorative kickers, no sample
  data (D-001).
- **Focus and disabled.** `.g-scope` neutraliser; `aria-disabled` instead of `disabled` so the kit's
  grey `!important` cannot win (phase 2 gotcha).
- **Motion.** 100–150 ms micro, 200–300 ms drawers and modals, nothing that runs 100+ times a day.

## 3. Waves, in order

Order is traffic × risk × cost. Each wave is one PR.

### W0 — the shell (do this alone, first)
`client/src/components/AppShell.tsx` → `GoalShell`, `goalNavFor`, credits in the header, account
menu unchanged. Every shell-wrapped route inherits it, so this single PR changes the frame of 27
routes without touching any of them. Highest leverage change in the project.
**Acceptance:** nav correct for seeker / verified referrer / signed-out; bottom bar on 390; no route
regression in `client/src/components/appShell.test.tsx` or `client/src/components/goal/nav.test.ts`;
captures of three representative routes.

### W1 — the three approved comps (transcription, not invention)
`/explore` (Find a referral + ask drawer), `/queue` (Referral queue, 7-reason pass picker),
`/requests` (My asks). The comps exist in `design/goal-ui/pick/`; this wave is faithful transcription
at 1280 and 390, not a redesign. If the comp and D-070 disagree, the comp wins unless a decision says
otherwise (D-077 already resolved drawer timing and the Impact link).
**Acceptance:** the three comps' sample names and numbers do **not** ship (D-071); real data only.

### W2 — the seeker spine
`/ask` → `/ask-sent` → `/requests` → `/conversation/:id`, plus `/explore/:slug`, `/sign-in`,
`/verify`, `/start`, `/onboarding`. This is the path a seeker walks end to end; moving it in one wave
keeps the transition from comp to comp coherent.
**Not in this wave:** `/sign-in` keeps D-033's two role cards exactly as they are — moved into the
goal shell, not redesigned.

### W3 — money (Tier 1: copy is a truth claim)
`/plans`, `/billing`, `/premium`, `/pricing`. The risk here is not layout, it is that a re-skin is
when stale copy gets copied. Every line must be re-read against D-063 (the money sentence),
D-035 (a not-fixable pass releases the credit), D-038 (a lapse returns it), D-079 (Free credits
need a payment method on file), and D-067 (no monthly plans exist).
**Acceptance:** no plan badge on any queue row or inbox row (D-006/D-040); the D-063 sentence
verbatim where it appears; the copy test suite updated in the same PR.

### W4 — the referrer side
`/referrer`, `/referrer-setup`, `/referrer-home`, `/referrer/impact`, `/invite`, `/safety`.
Referrer surfaces are where pressure would show up if it ever did: no countdowns, no "hurry", no
counts of other people, no crimson, and the never-paid line wherever money is mentioned (D-055).
**Acceptance:** every reminder/decision chip is neutral wording; the queue shows no compensation
field (D-071).

### W5 — account and support
`/settings`, `/profile`, `/work`, `/alerts`, `/help`, `/report`, `/suggest-company`, `/landed`,
`/messages`, `/share`, `/assistants`, `/approve`.
**Acceptance:** settings keeps its section order (muscle memory); destructive actions keep their
confirm step.

### W6 — employer and admin (deliberately last, deliberately denser)
`/employer*`, `/admin/*`, `/developers`, `/developer-console`, `/connect-assistant`, `/post-opportunity`,
`/admin/catalog-sync`.
**Recommendation:** admin keeps its current density and gets the tokens, the type scale and the focus
ring — not the marketing polish. Admin is a work surface read hundreds of times by one person;
the Frequency Principle says reduce, not decorate. Employer surfaces get the goal system proper.

### W7 — public, marketing, legal
`/` (home), `/about`, `/contact`, `/support`, `/guidelines`, `/wall`, `/jobs`, `/p/:handle`,
`/share-card/:token`, `/fast/*`, `/refer/*`, `/email-review/:linkToken`, the guide pages, and the
legal pages.
**Legal text does not move.** `Terms`, `Privacy`, `Refunds`, `Shipping`, `Cancellations` may take the
shell and the type scale; their words are the owner's (agents never edit legal text). The home page
keeps D-130's warm hero band (`.g-hero-warm`, `--g-warm-1/2/3`); every other block on every public
page stays ink-on-white.

## 4. What must not move, in any wave

- D-033's two sign-in role cards.
- Legal text (owner only).
- Admin table density (W6 recommendation).
- No plan badge on queue rows or inbox rows (D-006, D-040).
- No preview chips, sample names, or invented numbers (D-001, D-071).
- No dark patterns, false urgency, or pressure on referrers (`BRIEF.md:21`).

## 5. Mechanics that keep it one app

- Put `g-scope` on the shell root once; every goal primitive assumes it.
- One surface per commit inside a wave, so a revert is a revert, not an archaeology project.
- Remove the `kit/` import in the same commit that replaces the component; a surface with both is
  half-moved.
- Re-read copy on every moved surface (§3, W3). A re-skin is exactly when a sentence that was true
  two decisions ago gets carried forward.
- No new dependency (phase 2 verified everything needed is installed).
- Each wave: the full gate, `design-token-audit`, and captures at 1280 and 390.

## 6. Calls made on merit (D-123: decide, ship, report — the owner may change any of them)

D-123 (Oct 21) retired open questions to the owner. These four were the only blockers before W2, so
they are decided here as current best, changeable, and reported in the landing pull request.

1. **`/wall` and `/jobs`** take the goal shell: both are live product surfaces (real openings, the
   job explorer) that link straight into an ask. **`/p/:handle`** keeps a standalone public frame
   with the goal type scale and no app nav: it is a stranger's first page, and an app frame with an
   empty credits pill and Inbox would tell them they are inside an account they do not have.
2. **Employer surfaces** follow the goal system proper, with denser tables on list screens — not the
   admin treatment. An employer is a customer doing a job, not an operator.
3. **Admin** keeps its current density and takes the tokens, the type scale and the focus ring only:
   one person reads it hundreds of times a day, and the Frequency Principle says reduce, not decorate.
4. **Home (`/`)** stays a standalone marketing surface on the goal tokens with D-130's warm hero band,
   and links into the app; it does not become the app shell. W7 therefore keeps `.g-hero-warm` and
   still forbids every other gradient.

## 7. First packet

**W0 + W1 in one branch is acceptable** (shell plus the three comps), because the comps are drawn
inside the shell and splitting them means drawing the shell twice. Everything after that is one wave
per PR.

**Live order (Oct 21):** the queue already runs these as separate tickets and PRs — W0 shell
(`D-048-p3-w0-shell`), `/explore` (`D-048-p3-explore`), `/requests` (`D-048-p3-requests`) — so the
combined branch is no longer needed; the wave boundaries below still decide what each PR may touch.
