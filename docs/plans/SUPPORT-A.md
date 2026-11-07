# Packet SUPPORT-A: the kit `/support` page promises only what works today (D-153, D-277)

Tier 2 (client copy only) · lane `support-promises` · branch `agent/queue/support-a` · waits for nothing · builder: a development session other than the Claude Code session through the picker (D-225) · registered by D-277 on 2026-11-02 at `main` `27dac5f9`, checked against the register through D-276.

Source: Half A of the packet proposal in PR #811 comment [6567956835](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6567956835) (§1.1, §1.4 row 1, §2.2, §3 R1-R3 and A1-A8), requested by the coordinator handoff in #811 comment [6565673833](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6565673833) and accepted for docs/registry publication in #811 comment [6567969738](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6567969738). Half B of that proposal (`SUPPORT-B1`, `SUPPORT-B2`), the `D-090-BYOR` edge, every `server/db.ts` hunk and the §1.4 residuals (except that §9 lists two residuals, not fixed) are **not** part of this packet and are not adopted (D-277 (3)).

**Amended 2026-11-02 (byte-exact table).** The line table, preservation list and acceptance below are replaced by F's test-ready table in #811 comment [6568171976](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6568171976) (R1–R5, P1–P9, S1–S4, D1–D4, the red-first R block and the §3.3 diff guard) and its machine JSON on #962 comment [6568179814](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/962#issuecomment-6568179814) (R1–R5 and P1–P8; where the table and the JSON differ, the JSON wins), accepted in #811 comment [6568189791](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6568189791) (part 1). Every byte-exact string below is copied from that JSON (P9 from the table) and was re-checked against `client/src/pages/Support.tsx` on `main` `27dac5f9` (git blob `fb6b3144`, sha256 `fb6cbfbd…4bab2c`, 71 lines, LF): each R `old` and each P string occurs exactly once, on its stated line. Earlier wording in this packet that let the builder choose the h1 text, reword L64 or move the L29 date is withdrawn.

## 1. Goal
The kit `/support` page (`client/src/pages/Support.tsx`) is live and prerendered, and five of its lines promise a person, a response time, a triage order, a pause capability or a notification that nothing in the product implements. Remove those promises with the exact replacements in §3, so the page says only what works today. The email support action, the self-serve cards and the owner's legal line stay exactly as they are.

## 2. Binding rules (quoted)
- D-153 (FROZEN): "the promise has to match what actually works (no display promise without enforcement…)". Short form used in this packet: promise only what works today.
- D-225: "Claude sessions handle intelligence/reasoning; other tools develop." The builder is a development session other than the Claude Code session handed this row by the picker.
- AGENTS rule 8: "for UI, captures at 1280 and 390 from a clean browser"; anything without proof is labelled "unverified".
- Coordinator handoff 6565673833: "do not wait for an owner policy decision to remove unsupported operational promises"; no server change; no private finding published.

## 3. Replacement table: R1–R5 (byte-exact, from the JSON)

Source file `client/src/pages/Support.tsx`, line endings LF. Applying all five: each `old` occurs exactly once, starting on its line; the file goes from 71 to 70 lines; nothing else changes. Line numbers are for `main` `27dac5f9`; after R3, lines from 41 on move up by one.

| ID | file:line | kind | promise removed |
|---|---|---|---|
| R1 | `client/src/pages/Support.tsx:27` | `replace-line` | staffing + response time |
| R2 | `client/src/pages/Support.tsx:28` | `remove-sentence` | staffing/routing ('reaches an administrator directly') |
| R3 | `client/src/pages/Support.tsx:40` | `delete-line` | response time + triage order |
| R4 | `client/src/pages/Support.tsx:64` | `remove-sentence` | triage order + pause capability |
| R5 | `client/src/pages/Support.tsx:68` | `remove-sentence` | decision notification |

### R1 · `client/src/pages/Support.tsx:27` · `replace-line`

Current (byte-exact):

~~~text
    title="A person answers. Usually within one business day."
~~~

Proposed (byte-exact):

~~~text
    title="Contact support."
~~~

### R2 · `client/src/pages/Support.tsx:28` · `remove-sentence`

Current (byte-exact):

~~~text
    intro="Most questions are answered by a screen you already have access to. Anything about money, verification, or your data reaches an administrator directly."
~~~

Proposed (byte-exact):

~~~text
    intro="Most questions are answered by a screen you already have access to."
~~~

### R3 · `client/src/pages/Support.tsx:40` · `delete-line`

Current (byte-exact, the line plus its trailing LF):

~~~text
          <p className="mt-3 text-xs leading-5 text-[#505050]">Response target: one business day (Mon–Fri, IST). Payment and account-safety issues are handled first.</p>
~~~

Proposed: the empty string. The whole line, including its trailing LF, is deleted; L41 becomes L40.

### R4 · `client/src/pages/Support.tsx:64` · `remove-sentence`

Current (byte-exact):

~~~text
      <p>If a request, message, or link looks fraudulent, or you believe someone accessed your account, email us with “Security” in the subject line. These are triaged ahead of everything else, and the affected request or link can be paused while we look.</p>
~~~

Proposed (byte-exact):

~~~text
      <p>If a request, message, or link looks fraudulent, or you believe someone accessed your account, email us with “Security” in the subject line.</p>
~~~

### R5 · `client/src/pages/Support.tsx:68` · `remove-sentence`

Current (byte-exact):

~~~text
      <p>Privacy requests (data export, deletion) and payment reviews appear with their current status inside <Link href="/settings" className="font-semibold text-black">Settings</Link> and <Link href="/premium" className="font-semibold text-black">Buy credits</Link>. You will also receive an in-product notification when an administrator decides.</p>
~~~

Proposed (byte-exact):

~~~text
      <p>Privacy requests (data export, deletion) and payment reviews appear with their current status inside <Link href="/settings" className="font-semibold text-black">Settings</Link> and <Link href="/premium" className="font-semibold text-black">Buy credits</Link>.</p>
~~~

**R1 wording.** "Contact support." is F's text and is adopted as written (D-153: state the actual action). F rated it 7/10 and named "Email support or use a screen below." as the alternative; that alternative is not adopted, and any change to R1 is a change to this table, not a builder choice.

**R3 / owner note.** L40's "(Mon–Fri, IST)" is only a qualifier on the response-time promise that R3 removes; the business hours themselves are P4 on L41 and stay. If the owner treats the L40 "(Mon–Fri, IST)" qualifier as business hours that must stay, drop R3 from this table and keep everything else (R1, R2, R4, R5, P1–P9 and the rest of §6 except the R3 phrases in the R block).

### 3.1 Architect choices carried, not adopted
- **L17 flag.** `Support.tsx:17` "Requests are actioned by an administrator, not silently." is **kept** by this packet. F flags it for the architect: an admin queue exists (`App.tsx:260`) and Settings shows the requester the status (`AccountPanels.tsx:70-71`); it promises no time. If the architect counts it as staffing, F's removal-only form is `body: "Settings gives you a copy of your personal data and lets you request account deletion review."`. Not adopted; the builder does not change L17.
- **L29 date.** `updated="September 5, 2026"` (L29) is not part of the table and no assertion pins it. Whether to move it at landing is the architect's choice; not adopted, and the builder leaves L29 unchanged unless the architect says otherwise.

Lines reviewed and kept (F §1.1): L14–16 self-serve cards, L17 (flagged above), L28 first sentence, L31 footnote, L38 "We reply from …", L58 refunds pointer, L64 first sentence, L68 first sentence, the L10–11 source comment. None changes.

## 4. Preservation list: P1–P9, all DO NOT TOUCH (byte-exact)

### P1 · Proprietor name · `client/src/pages/Support.tsx:41` · **DO NOT TOUCH**

~~~text
Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me)
~~~

### P2 · Legal address · `client/src/pages/Support.tsx:41` · **DO NOT TOUCH**

~~~text
D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India
~~~

### P3 · Phone link · `client/src/pages/Support.tsx:41` · **DO NOT TOUCH**

~~~text
<a href="tel:+919513064808" className="font-semibold text-black">+91 95130 64808</a>
~~~

### P4 · Business hours · `client/src/pages/Support.tsx:41` · **DO NOT TOUCH**

~~~text
(Mon–Fri, IST business hours).
~~~

### P5 · Whole legal identity line (P1-P4 with separators and markup) · `client/src/pages/Support.tsx:41` · **DO NOT TOUCH**

~~~text
          <p className="mt-3 text-xs leading-5 text-[#505050]">Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me), D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India · <a href="tel:+919513064808" className="font-semibold text-black">+91 95130 64808</a> (Mon–Fri, IST business hours).</p>
~~~

### P6 · Existing mailto constant · `client/src/pages/Support.tsx:20` · **DO NOT TOUCH**

~~~text
const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("skipwait.me support request")}&body=${encodeURIComponent("Account email:\nWhat happened:\nReference (Ref-, payment id, or link), if any:\n")}`;
~~~

### P7 · Existing mailto anchor (href={mailto}, visible address) · `client/src/pages/Support.tsx:39` · **DO NOT TOUCH**

~~~text
          <a href={mailto} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3 text-sm font-bold text-white hover:bg-[#0000cc] sm:w-auto">Email {SUPPORT_EMAIL} <ArrowRight className="h-4 w-4" /></a>
~~~

### P8 · SUPPORT_EMAIL import the mailto depends on · `client/src/pages/Support.tsx:4` · **DO NOT TOUCH**

~~~text
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";
~~~

### P9 · Support email value · `client/src/components/PolicyPageShell.tsx:25` · **DO NOT TOUCH** (asserted, not owned)

~~~text
export const SUPPORT_EMAIL = "support@skipwait.me";
~~~

P9 comes from F's table (the JSON lists only P1–P8). `PolicyPageShell.tsx` belongs to no part of this row: S4 and D4 assert it; the row does not own or edit it.

## 5. Wording limits (D-153)
- **No legal, phone, hours or mailto change.** L41 (P1–P5), the L20 mailto (P6), the L39 anchor (P7), the L4 import (P8) and `SUPPORT_EMAIL` (P9) stay byte-for-byte. Any change to the hours is owner-only.
- **No positive commitment.** Only the R1–R5 bytes change. No time, response-target, person, team, triage, pause or notification promise is added, and the legal pages' "within 2 business days" is not restated on `/support`; any positive service commitment is the owner's call. If the page seems to need one, stop and ask.
- No new component, style or token.

## 6. Files
In scope (the row's `owns`, unchanged):
- `client/src/pages/Support.tsx` — R1–R5 only.
- `client/src/pages/support.promises.test.tsx` — the row's owned test path; §7's S/D/R assertions go here. No other test path (F's suggested `support.legalPreservation.test.tsx` is not used) and no new `owns`.
- `artifacts/support-promises/**` — the 1280 and 390 captures (A7).

Not owned and not changed: `client/src/components/PolicyPageShell.tsx` (P9 is asserted only), `client/src/App.tsx`, `shared/publicRoutes.ts`, `shared/landingContent.ts`, `scripts/prerender-public-pages.tsx`, the kit `client/src/pages/Report.tsx`, every `server/**` file, every goal page.

## 7. Acceptance

All assertions go into the owned `client/src/pages/support.promises.test.tsx` (`// @vitest-environment jsdom`), rendering `/support` with the harness shape of `client/src/pages/goal/policy/policyText.goal.test.tsx:38-42` (`window.history.replaceState` then `render(<Router ssrPath="/support"><Support /></Router>)`). S-checks read the source files' bytes; D-checks read the rendered DOM. None depends on line numbers.

### 7.1 Block 1: DO NOT TOUCH (passes on `main`'s file and on the replaced file)

| ID | Selector or probe | Expected exact value | Covers |
|---|---|---|---|
| S1 | occurrences of the P5 line in `client/src/pages/Support.tsx` source | `1` (string = P5) | P1–P5 |
| S2 | occurrences of the P6 line in source | `1` | P6 |
| S3 | occurrences of the P7 line in source | `1` | P7 |
| S4 | occurrences of the P8 line in `Support.tsx` source; of P9 in `client/src/components/PolicyPageShell.tsx` source | `1`, `1` | P8, P9 |
| D1 | `section[aria-label="Contact support"] a[href="tel:+919513064808"]` → `closest("p").textContent` | `Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me), D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India · +91 95130 64808 (Mon–Fri, IST business hours).` | P1–P5 rendered |
| D1 | same `<p>` → `getAttribute("class")` | `mt-3 text-xs leading-5 text-[#505050]` | P5 markup |
| D2 | `a[href^="tel:"]`: count; `href`; `textContent`; `class` | `1`; `tel:+919513064808`; `+91 95130 64808`; `font-semibold text-black` | P3 |
| D3 | occurrences in `container.textContent` of each string | `1` each: `Ayodhya Ram Mohanthy (sole proprietor, trading as skipwait.me)`, `D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India`, `(Mon–Fri, IST business hours).` | P1, P2, P4 |
| D4 | `a[href^="mailto:"]`: count; inside `section[aria-label="Contact support"]`; `href`; `textContent` | `1`; yes; `mailto:support@skipwait.me?subject=skipwait.me%20support%20request&body=Account%20email%3A%0AWhat%20happened%3A%0AReference%20(Ref-%2C%20payment%20id%2C%20or%20link)%2C%20if%20any%3A%0A`; `Email support@skipwait.me ` (with one trailing space, before the icon) | P6, P7, P9 |

### 7.2 Block 2: red-first R block (fails on `main`'s file, passes after R1–R5)

| ID | Selector | Expected |
|---|---|---|
| R1 | `h1`: count; `textContent` | `1`; `Contact support.` |
| R1–R5 | `container.textContent` | contains none of: `A person answers`, `within one business day`, `reaches an administrator directly`, `Response target`, `handled first`, `triaged ahead of everything else`, `can be paused while we look`, `in-product notification when an administrator decides` |

Red-first proof: run the file against `main`'s `Support.tsx` first (Block 1 passes, Block 2 fails), then against the replaced file (all pass). If R3 is dropped under the §3 owner note, drop `Response target` and `handled first` from the list.

### 7.3 Diff guard (§3.3, verbatim; must print nothing)

~~~bash
git diff origin/main -- client/src/pages/Support.tsx | grep -E '^[-+][^-+].*(sole proprietor|tel:\+919513064808|business hours\)|const mailto|href=\{mailto\}|SUPPORT_EMAIL \} from)'
~~~

### 7.4 Gates and proof
- **A1 — scope:** `node scripts/scope-check.mjs --branch` passes; `git diff --name-only origin/main...HEAD` lists only the owned paths and this packet or status docs.
- **A5 — existing pin:** `pnpm vitest run client/src/pages/support.promises.test.tsx client/src/pages/goal/policy/policyText.goal.test.tsx` is green; `/support` stays off the policy goal frame (`policyText.goal.test.tsx:82-89`).
- **A6 — gates:** `pnpm check`, `node scripts/design-token-audit.mjs` and `pnpm build` pass. Grep the prerendered `/support` HTML body in the build output for the §7.2 phrases; expect 0 (the `<head>` description is the §9 residual).
- **A7 — proof (AGENTS rule 8):** captures of `/support` at 1280 and 390 from a clean browser under `artifacts/support-promises/`. Then green required CI on the exact head.
- **A8 — residuals stated:** the pull request body lists both §9 residuals as open, not fixed.

Landing: Tier 2, on green required CI on the exact head (D-200 (4)). The builder changes only this row's `status` to `done`, in the pull request that lands it.

## 8. Release coupling (D-048-R5)
#954 (`D-048-p3-support`) adds "Contact support" links to `/support` from the goal support pages. This row should land before `D-048-R5` switches the goal support pages on, so those links never lead to the unbacked promises. `D-048-R5` is planned but not registered (`docs/plans/D-048-phase-3-split.md`), so no `dependsOn` edge is added now: when R5 is registered, its packet carries one checklist item, "SUPPORT-A done (or `/support` otherwise free of the §7.2 phrases) before the support ids turn on".

## 9. Residuals outside this row (listed, not fixed)
- `shared/publicRoutes.ts:48` — the `/support` SEO description "…Money, verification, or data questions reach an administrator.", rendered into `<head>` through `PolicyPageShell.tsx:126-131`. Owned by `D-176-public-claims` (todo).
- `shared/landingContent.ts:63` — "A person answers, usually within one business day." on the landing directory. Owned by `PRICING-banded-oct25` (Tier 1, parked at `owner`).

Until those rows change them, the same unsupported claims stay in the `/support` meta description and on the landing directory. Every other residual in the original packet §1.4 (the kit `Report.tsx:138` timing line, the developer-console "safety team" copy, the `/support` goal-UI coverage orphan) and all of Half B are outside this packet and not adopted by D-277.

## 10. Stop and ask
- A self-serve card (L14-17) turns out to be false.
- Any R `old` string is not found exactly once on `main` (the file moved since `27dac5f9`): stop, do not re-derive the bytes.
- The page seems to need any positive service commitment (time, person, team, triage, notification).
- Any change would touch P1–P9 (L4, L20, L39, L41, `PolicyPageShell.tsx:25`), L17, L29, L31, or a file outside §6.

## Status
- 2026-11-02: registered by D-277 (docs/registry only). `status: "todo"`, `syncedTo: "D-277"`. Nothing built.
- 2026-11-02: amended on #962 (docs only) to F's byte-exact R1–R5 / P1–P9 / S1–S4, D1–D4, R block and §3.3 diff guard, per #811 comment 6568189791 part 1. `owns` unchanged. Nothing built.
- 2026-11-07: in progress — `DeepSeek V4.1 Flash Free · 42ac` — branch `agent/queue/support-a` — claimed as `BUILD SUPPORT-A` after the picker's FIFO-front `LAND D-048-p3-admin-approvals` was declined under Instinct's standing landing hold (`6674264172`); exact chain on #811 (`6697368988`). The picker's generic step 3 asks for a `docs/KIT_V4_BUILD_PLAN.md` §3b "D-153" row, but that path is outside this row's `owns` (scope-check would reject it) and no D-153 row exists there; D-074 makes the packet authoritative, so the in-progress record lives here in the packet's own Status section, which the scope allowlist permits.
- 2026-11-07: review — `DeepSeek V4.1 Flash Free · 9c41` — taken over per the picker (`TAKE OVER SUPPORT-A`, quiet since 06:20Z); `origin/main` `6b392259` merged at `a0b6f9fc`. Red-first reproduced on this host: main's `Support.tsx` → 3 failed / 8 passed (Block 1 passes, Block 2's R checks fail), branch file → 23/23 across `support.promises.test.tsx` + `policyText.goal.test.tsx`. Gates: `pnpm check` 0; `design-token-audit` OK (439 files); `pnpm build` 0; prerendered `dist/public/support.html` = 0 occurrences of all eight §7.2 phrases; `scope-check SUPPORT-A` 3 owned paths clean; §3.3 diff guard prints nothing. A7 captures at 1280 and 390 under `artifacts/support-promises/` (manifest: h1 `Contact support.`, 0 leaked phrases, 0 horizontal overflow). Tier 2: lands on green required CI on the exact head; residuals A8 stay open.
- 2026-11-07: done — `efe5e5eb` (implementation + captures; this registry stamp rides the same pull request, #1017) — `DeepSeek V4.1 Flash Free · 9c41`. Tier 2, client copy only: R1–R5 applied byte-exact in `client/src/pages/Support.tsx`; owned test `client/src/pages/support.promises.test.tsx` (S1–S4/D1–D4 preservation + red-first R1–R5); A7 captures at 1280 and 390 in `artifacts/support-promises/`. Evidence in the PR body: red-first 3 failed / 8 passed on main's file, 23/23 green with the branch file, `pnpm check` 0, token audit OK, build 0, prerendered `/support` carries 0 of the eight §7.2 phrases, scope-check clean, diff guard silent. Residuals A8 stay open and are listed in the PR. `status: "done"` in `docs/plans/assignments.json`.
