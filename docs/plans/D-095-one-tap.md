# Packet D-095: the five one-tap cuts — email first, a pricing CTA, and no buttons for what is not for sale

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` → `D-095-one-tap` (there is **no** `§3b` row for D-095 on `main` at `cd4c58bd`; the queue entry is the status home until the CEO adds one — see §3.7) |
| Decisions | D-095, D-030 (with D-049), D-055, D-084, D-097, D-120, D-042, D-068 |
| Risk tier | 2 (a user flow; no credit, price, refund, identity or migration change) |
| Size | S–M |
| Implementer | any model |
| Branch | `agent/<model>/d095-one-tap` from the latest `origin/main` |
| Depends on | nothing unlanded |
| Do not run at the same time as | any row editing `client/src/components/plans/**` or `client/src/components/SeekerSignIn.tsx` |
| Verified against | `main` `cd4c58bd` on 2026-10-23 |

## 1. Goal

The owner's one-tap rule (D-095) named five places where a seeker spends a tap for no reason. **Two of the five are already built on `main`** and only need pinning (§3, items 1 and 3). This packet builds the three that are not — the email field up front on the seeker sign-in page, a signed-out call to action on the public price list, and hiding the buy buttons for things that are not for sale — and adds the tests that keep all five honest. Nothing here changes a price, a credit rule, who may sign in, or a flag.

## 2. Binding rules (quoted, not paraphrased)

- **D-095:** "Make things 1 click wherever necessary for our business or for users' ease. Experience should be great, users should love the product." … "Every flow gets a one-tap check (sign-in, ask, accept, share, premium upsells, forms). The designer justifies any flow over one tap; build implements one-tap paths; QA reports tap counts per core path." … the five items quoted in §4. Status: "adopted; slices queued behind flags (D-097)".
- **D-030 (with D-049):** job seekers sign in with social logins **or personal email**, hosted on skipwait.me; referrers sign in with a **work-email code only** — "no personal email, no social logins, on any referrer-facing sign-in". The founder-locked rule is pinned by `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx`.
- **D-084:** passes and Keep warm are **not sold** while `PASS_SALES_ENABLED` is false.
- **D-097:** every new behaviour lands behind its flag, **off**. Turning a flag on is a separate step after QA, never part of this task.
- **D-055:** referrers are never paid and never charged. No referrer-facing surface may gain a purchase CTA from this packet.
- **D-042:** a money path that cannot deliver is **switched off, never deleted**.
- **D-120:** the goal UI is the one design; a new screen state uses `client/src/components/goal/` primitives.
- **D-068:** every affected markdown file is updated in the same push.

## 3. Current behaviour (verified)

1. **Item 1 (sign-in during purchase) is built, behind a flag that is off.** `client/src/lib/oneTap.ts:1-7` defines `ONE_TAP_PAY_SIGNIN` from `VITE_ONE_TAP_PAY_SIGNIN` (declared, empty, at `.env.example:242`); `client/src/pages/Premium.tsx` uses it to send a signed-out buyer to the in-app `/sign-in` with the chosen pack in `returnTo`; `client/src/pages/premium.oneTapSignin.test.tsx` pins both the flag-on path (pack kept in `returnTo`, `openSignIn` never called) and the flag-off legacy path. **No build work; QA and enabling only (D-097).**
2. **Item 2 is open.** `client/src/components/SeekerSignIn.tsx:66-71` renders the five provider buttons plus a "Continue with email" button; the email input exists only after that click (`:73-79`, `setEmailMode(true)` at `:70`). A seeker who wants email spends one tap before they can type.
3. **Item 3 (job card prefills /start) is built.** `client/src/pages/JobExplorer.tsx:85-101` (`requestReferral`) writes the draft (`saveReferralDraft`, `bridge-target-url`) and navigates to `/start`; `/start` is `Onboarding` (`client/src/App.tsx`, `path="/start"`), which reads it at `client/src/pages/Onboarding.tsx:18,24,30`. The card's button calls it with no sign-in gate (`JobExplorer.tsx` job card, the `onClick={() => requestReferral(job)}` button). The QA baseline that produced D-095 predates this wiring: **pin it, do not rebuild it.**
4. **Item 4 is open.** `client/src/pages/Pricing.tsx` is a `PolicyPageShell` with four sections and two inline links (`:27` shipping, `:30` employer). There is no call to action anywhere on the page — a signed-out reader finishes reading the price list with nowhere to go.
5. **Item 5 is open.** `shared/planCatalog.ts:101` holds `PASS_SALES_ENABLED = false`; `shared/billingCatalog.ts:293` derives `available` from it; `client/src/components/plans/PlansKitSections.tsx:131,180` render a **disabled** button reading "Not on sale yet" for every unsold pass and Keep-warm card. `client/src/pages/plans.goLive.test.tsx:83,103` currently *pin the disabled buttons*.
6. `/plans` renders `PlansV2` when `PLAN_FAMILY_V2_CLIENT`, else `Plans` (`client/src/App.tsx`); both compose `PlansKitSections`. `/pricing` is public and signed-out-visible.
7. **There is no `§3b` row for D-095.** `docs/KIT_V4_BUILD_PLAN.md` at `cd4c58bd` does not mention D-095; the queue entry exists only in `docs/plans/assignments.json` (`row: "D-095"`, tier 2, lane `one-tap`). The packet template assumes a §3b row is the status home, so this packet records its status in the assignments row instead. Adding a queue row reorders the queue, which is the CEO's call (D-085) — flagged for them in §12, not done here.

## 4. Target behaviour

1. **Item 2 — the email field is the first thing a seeker sees.** `SeekerSignIn` renders the email input and its "Send sign-in code" button **above** the provider list, with the provider list and its "or" divider beneath. No click is needed to reach the field; `autoFocus` on it is allowed. The email flow itself (`/api/auth/workos/email-code/*`), the provider list, the six-digit code stage and "Use a different email" are unchanged. The referrer path (`ReferrerOtpSignIn`) is untouched.
2. **Item 4 — `/pricing` ends with a signed-out call to action.** A single primary CTA links to `/plans`, labelled "See plans and prices". It is not a second price list and states no figure of its own. *(Assumption, changeable: the destination is `/plans`; if the owner wants `/start` instead it is a one-line change.)*
3. **Item 5 — nothing unsold is offered.** While `PASS_SALES_ENABLED` is false, the pass and Keep-warm cards are **not rendered** on `/plans` (collapsed, not disabled): no "Not on sale yet" button, and no empty section heading left behind. Credit packs, the free plan and the plan cards stay exactly as they are. *(Assumption, changeable: "collapses" means hide the card and its section heading, not grey it out.)* With the flag true the cards render as they do today.
4. **Items 1 and 3 are pinned, not rebuilt.** A test asserts the job card's tap writes the `/start` draft and that the email field is reachable in one tap; the Premium flag-on test stays as it is.
5. **No price, credit, refund, plan-content or identity rule changes.** No flag is turned on.

## 5. Files

- **In scope (edit only these):**
  - `client/src/components/SeekerSignIn.tsx`
  - `client/src/pages/Pricing.tsx`
  - `client/src/components/plans/PlansKitSections.tsx` (and `Plans.tsx` / `PlansV2.tsx` only if the section heading lives there)
  - tests: `client/src/pages/signIn.test.tsx`, `client/src/pages/plans.goLive.test.tsx`, a new `client/src/pages/pricing.test.tsx`, `client/src/pages/jobExplorer.test.tsx`
  - docs: `docs/plans/assignments.json` row `D-095-one-tap`, `docs/DECISIONS.md` D-095 sync cell
- **Read only:** `client/src/lib/oneTap.ts`, `shared/planCatalog.ts`, `shared/billingCatalog.ts`, `client/src/pages/Premium.tsx`, `client/src/pages/Onboarding.tsx`, `client/src/pages/JobExplorer.tsx`, `client/src/components/PolicyPageShell.tsx`, `client/src/pages/loginRule.test.tsx`.
- **Out of scope (never edit here):** `shared/moneyCopy.ts` and any price or credit copy; `client/src/components/plans/PlanCards.tsx` prices; `ReferrerOtpSignIn`; `server/**` (no server change is needed for any item); `docs/` legal pages; anything under `design/goal-ui/captures/**` unless you add a capture for a changed screen.

## 6. Steps (one commit each)

1. **Red tests first** (§7) — every new assertion fails on today's code for the reason §7 gives. Commit: `D-095 tests: the three open one-tap cuts, red first`.
2. **Item 2, email up front** — `SeekerSignIn.tsx` only. Run `client/src/pages/signIn.test.tsx` and the new case; `pnpm check`. Commit: `D-095: the seeker sign-in shows the email field first`.
3. **Item 4, the pricing CTA** — `Pricing.tsx` only. Run the new `pricing.test.tsx`. Commit: `D-095: /pricing ends with a signed-out CTA to the plans`.
4. **Item 5, collapse what is not for sale** — `PlansKitSections.tsx` (+ the section heading's owner). Update `plans.goLive.test.tsx`'s disabled-button pins to assert **absence** while the flag is false, and keep a flag-true case asserting presence. Commit: `D-095: /plans collapses the cards that are not for sale`.
5. **Item 3 pin + docs** — the job-card draft test, then the §3b row and the D-095 sync cell. Commit: `D-095 docs: the one-tap row and the D-095 sync cell`.

## 7. Tests to write first (red before the fix)

1. **`client/src/pages/signIn.test.tsx` — "the email field is reachable without a tap".** Render `/sign-in` with intent `seeker`. Assert `screen.getByLabelText(/email address/i)` is in the document **before** any click, that it is the first focusable control, and that the five provider buttons are still present. Fails today: the input only mounts after "Continue with email" (`SeekerSignIn.tsx:66`).
2. **`client/src/pages/signIn.test.tsx` — control, referrer unchanged.** Intent `referrer` renders `referrer-work-email-otp` and **no** social button and **no** personal-email input. Must stay green (D-030, founder-locked).
3. **`client/src/pages/pricing.test.tsx` — "a signed-out reader gets a call to action".** Render `Pricing`; assert a link whose accessible name matches `/see plans and prices/i` and whose `href` is `/plans`. Fails today: no link exists.
4. **`client/src/pages/plans.goLive.test.tsx` — "nothing unsold is rendered while the flag is off".** With `PASS_SALES_ENABLED` false (today's constant), assert `queryAllByRole("button", { name: /not on sale yet/i })` is **empty** and that no pass/Keep-warm card heading renders; assert credit packs and the free plan still render. Fails today: `PlansKitSections.tsx:131,180` render the disabled buttons.
5. **`client/src/pages/plans.goLive.test.tsx` — control, flag true.** With the module mocked to `PASS_SALES_ENABLED: true`, the pass cards render and their buttons are enabled. Must stay green (D-042: switched off, never deleted).
6. **`client/src/pages/jobExplorer.test.tsx` — "a signed-out Request referral keeps the job link for /start".** Click the card's Request referral button while signed out; assert the draft store holds the normalised `targetUrl` and that navigation went to `/start`. Fails only if the wiring regresses — this is the pin §3.3 says is missing, so confirm it is **green on today's code** and record that in the PR (it is a guard, not a red).
7. **Controls that must stay green:** `client/src/pages/loginRule.test.tsx`, `client/src/pages/premium.oneTapSignin.test.tsx`, `client/src/pages/plans.kit.test.tsx`, `client/src/pages/plans.paymentRoute.test.tsx`, `client/src/pages/GoalSignIn.test.tsx`. Never weaken, skip or delete an assertion to go green.

## 8. Edge cases and races

- **A signed-out tap on `/pricing`'s CTA** lands on `/plans`, which is public; buying still needs sign-in and item 1's flow stays behind its flag. Do not add a second sign-in path.
- **Item 5 must not hide a *purchasable* thing.** Only entries whose `available` is false because `PASS_SALES_ENABLED` is false collapse. A card that is unavailable for another reason (no price id, not in the catalog) keeps today's behaviour.
- **Item 2 must not change what sign-in does**, only where the field sits: the same endpoints, the same code stage, the same `returnTo`.
- **A referrer who lands on `/sign-in`** never sees the seeker form, whatever the order change does.
- **The email field must remain keyboard-reachable and labelled** (`<label htmlFor="seeker-email">`), and the page must still fit 390px without horizontal overflow.

## 9. Definition of done

- [ ] Every §7 test was red first (except the two declared guards) and is green now; every control is green.
- [ ] Gate on your commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] Docs in the same push (D-068): the `docs/plans/assignments.json` row `D-095-one-tap` (its status, and the `DECISIONS.md` D-095 sync cell). No `§3b` row exists to update (§3.7).
- [ ] Pushed, live check done; screens checked at 1280 and 390 for `/sign-in`, `/pricing` and `/plans`.
- [ ] Status line set to `done — <sha>` with the evidence block (`docs/DELEGATION.md` §5).
- [ ] Items 1 and 3 recorded as already built in the landing note, with the test that pins each.

## 10. Review checklist (for the independent reviewer)

1. Does the seeker sign-in page still obey D-030 in both directions — social **and** personal email for seekers, work-email OTP only for referrers — with `loginRule.test.tsx` green?
2. Is the email field genuinely reachable in zero taps, and does the email flow still work end to end in the component test?
3. Does `/pricing`'s CTA state no figure of its own and link to `/plans`?
4. With `PASS_SALES_ENABLED` false, is **nothing** unsold rendered — no disabled button, no empty heading — and with it true do the cards come back unchanged?
5. Did any price, credit, refund or plan-content string change? (It must not.)
6. Is the job-card draft still written and read, and is that test green on the pre-change commit too (a guard, honestly labelled)?

## 11. Stop and ask if

- A cited function no longer matches this packet (line numbers drift; find it by name first).
- Item 5 cannot be done without editing a price or the billing catalog's `available` derivation.
- A test you were given fails for a reason other than the one §7 names.
- You need a file outside §5, or a new flag, dependency, env key or migration.

## 12. Owner questions

None for the implementation. D-095 is recorded as changeable, and both open choices this packet makes (the CTA's destination, and what "collapses" means) are stated as assumptions in §4 and are one-line reversals.

**For the CEO, not the builder:** D-095 has no `§3b` row on `main` (§3.7), so this row cannot follow the template's "status lives in §3b, nowhere else". Adding a queue row sets the order, which only the CEO may do (D-085). Until one exists, the status lives in `docs/plans/assignments.json`.

## Status

Built by Gemini 3.8 Flash · 8f37 on 2026-10-23.
- Item 1: verified already built (`ONE_TAP_PAY_SIGNIN` in `client/src/lib/oneTap.ts`, `client/src/pages/Premium.tsx`), pinned by `client/src/pages/premium.oneTapSignin.test.tsx`.
- Item 2: implemented in `client/src/components/SeekerSignIn.tsx` (email input and "Send sign-in code" button up front, social buttons beneath divider, keyboard and screen reader accessible), pinned by `client/src/pages/signIn.test.tsx`.
- Item 3: verified already built (`JobExplorer.tsx` prefills draft and navigates to `/start`), pinned by `client/src/pages/jobExplorer.test.tsx`.
- Item 4: implemented in `client/src/pages/Pricing.tsx` (signed-out CTA button linking to `/plans`), pinned by `client/src/pages/pricing.test.tsx`.
- Item 5: implemented in `client/src/components/plans/PlansKitSections.tsx` (`PassesSection` collapses when passes are not available), pinned by `client/src/pages/plans.goLive.test.tsx`.
All 5 items verified and full local gate passing.

**Landing — Qoder · b796 — 2026-10-23 — PR #495.** Items 1 and 3 were already built and stay pinned by `client/src/pages/premium.oneTapSignin.test.tsx` and `client/src/pages/jobExplorer.test.tsx`; items 2, 4 and 5 shipped here. The landing gate re-ran in full on the branch head `0a78ef69`, merged with `origin/main` `ad6f4826`, and GitHub CI is green on that exact commit. The live check and its screens run on the landed merge.

```text
Evidence — D-095-one-tap — Qoder · b796 — 2026-10-23
Branch `agent/claude/d095-one-tap` @ `0a78ef69`, merged with origin/main `ad6f4826`
Red first: builder commit `1bd6adf8` adds the three failing tests before their fixes (`signIn.test.tsx`, `pricing.test.tsx`, `plans.goLive.test.tsx`); items 1 and 3 are the two declared guards, already built and green
Gate: check 0 · token audit OK · migration lint OK · deploy triggers OK · vitest 454 files / 4,140 passed / 17 skipped / 2 failed, both host timeouts proven alone (`settings.gating.test.tsx` 4/4 isolated; `deployMigrations`' 20 s cap vs this Mac's 21.7 s lint) · build 0
Live: checked on the landed merge; the status line below records the SHA and the result
Left out / follow-ups: none; items 1 and 3 were already built
```
