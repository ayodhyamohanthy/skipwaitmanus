# Packet SUPPORT-A: the kit `/support` page promises only what works today (D-153, D-277)

Tier 2 (client copy only) · lane `support-promises` · branch `agent/queue/support-a` · waits for nothing · builder: a non-Claude development session through the picker (D-225) · registered by D-277 on 2026-11-02 at `main` `27dac5f9`, checked against the register through D-276.

Source: Half A of the packet proposal in PR #811 comment [6567956835](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6567956835) (§1.1, §1.4 row 1, §2.2, §3 R1-R3 and A1-A8), requested by the coordinator handoff in #811 comment [6565673833](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6565673833) and accepted for docs/registry publication in #811 comment [6567969738](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6567969738). Half B of that proposal (`SUPPORT-B1`, `SUPPORT-B2`), the `D-090-BYOR` edge, every `server/db.ts` hunk and the §1.4 residuals other than the one listed in §8 are **not** part of this packet and are not adopted (D-277 (3)).

## 1. Goal
The kit `/support` page (`client/src/pages/Support.tsx`) is live and prerendered, and five of its lines promise a person, a response time, a triage order, a pause capability or a notification that nothing in the product implements. Remove those promises, or reword one to what exists, so the page says only what works today. The email support action, the self-serve cards and the owner's legal line stay exactly as they are.

## 2. Binding rules (quoted)
- D-153 (FROZEN): "the promise has to match what actually works (no display promise without enforcement…)". Short form used in this packet: promise only what works today.
- D-225: "Claude sessions handle intelligence/reasoning; other tools develop." The builder is a non-Claude development session handed this row by the picker.
- AGENTS rule 8: "for UI, captures at 1280 and 390 from a clean browser"; anything without proof is labelled "unverified".
- Coordinator handoff 6565673833: "do not wait for an owner policy decision to remove unsupported operational promises"; no server change; no private finding published.

## 3. Current behaviour (verified on `main` `27dac5f9`)
`client/src/pages/Support.tsx`, by line:

| Line | Text (abridged) | What it is | Implemented mechanism | Action |
|---|---|---|---|---|
| 27 | `title="A person answers. Usually within one business day."` | Staffing and timing promise | Only a `mailto:` link (L20, L39); no ticketing, no timer | **Remove the promise.** `title` is a required prop, so it becomes a plain-intent title with no promise (for example "Support and contact."); exact words are the builder's within §4. |
| 28 | `intro=` second sentence: "Anything about money, verification, or your data reaches an administrator directly." | Staffing and routing promise | Same `mailto:`; no routing | **Remove** the second sentence; the first sentence stays. |
| 29 | `updated="September 5, 2026"` | Page date | — | **Update** to the date the copy changes, same "Month D, YYYY" format. |
| 40 | "Response target: one business day (Mon–Fri, IST). Payment and account-safety issues are handled first." | Timing and triage promise | None | **Remove** the whole paragraph. |
| 64 | "These are triaged ahead of everything else, and the affected request or link can be paused while we look." | Triage promise plus a capability claim | An admin can suspend a user (`server/privateReferralRoutes.ts:1594`); no admin route pauses a request or link | **Remove** the triage clause. The pause clause is removed, or reworded only to a mechanism that exists in source, with no time, person or "we will" commitment. When in doubt, remove. The first sentence ("email us with “Security” in the subject line") stays. |
| 68 | "You will also receive an in-product notification when an administrator decides." | Mechanism claim with no backing | Privacy admin action only sets `in_review` and notifies no one (`server/db.ts:1255-1263`); payment decisions send none | **Remove** the sentence; the first sentence stays. |
| 20, 31, 39 | `mailto`, the footnote "We never ask for passwords…", the Email CTA | Mechanism-true or neutral | — | **Keep unchanged.** |
| 41 | Proprietor identity, address, phone, "(Mon–Fri, IST business hours)" | **Owner-controlled legal and business text** | — | **Keep byte-for-byte.** Any change to the hours is owner-only and goes to the owner, never to the builder. |
| 14–17 | Self-serve cards (`/premium`, `/requests`, `/settings`) | Product-mechanism claims | Routes exist (`client/src/App.tsx`); behaviour not verified by the packet | **Out of scope.** If the builder finds one of them false, stop and report it; do not widen this row. |

`/support` is prerendered (`scripts/prerender-public-pages.tsx:55`) and stays off the goal policy frame (`client/src/pages/goal/policy/policyText.goal.test.tsx:82-89`).

## 4. Wording rule (D-153)
- State only what exists: the support email address, the self-serve screens and the report flow.
- No time or response-target promise, no person or team ("a person", "an administrator directly", "safety team"), no triage or priority order, and no notification promise.
- No new service commitment of any kind. Any positive response-time or staffing commitment is the owner's call, not the builder's; if the page seems to need one, stop and ask.
- Copy matches the kit page's existing voice; no new component, style or token.

## 5. Files
In scope (the row's `owns`):
- `client/src/pages/Support.tsx` — the lines in §3 only.
- `client/src/pages/support.promises.test.tsx` — new (§6 A2-A4).
- `artifacts/support-promises/**` — the 1280 and 390 captures (A7).

Not owned and not changed: `client/src/components/PolicyPageShell.tsx`, `client/src/App.tsx`, `shared/landingContent.ts`, `scripts/prerender-public-pages.tsx`, the kit `client/src/pages/Report.tsx`, every `server/**` file, every goal page.

## 6. Acceptance (A1-A8, from packet §3)
- **A1 — scope:** `node scripts/scope-check.mjs --branch` passes. `git diff --name-only origin/main...HEAD` lists only the owned paths and this packet or status docs.
- **A2 — red first:** the new test fails on main's `Support.tsx`, then passes. It asserts the rendered `/support` text does **not** match `/A person answers|business day|Response target|handled first|triaged ahead|reaches an administrator directly|notification when an administrator decides|safety team/i`. It reuses the shape of #954's guards (`supportGoal.test.tsx` `unbacked` and `OPERATIONAL`).
- **A3 — legal guard:** the same test asserts the L41 identity/phone line and the L31 footnote are byte-identical to main. Additionally, `git diff origin/main -- client/src/pages/Support.tsx | grep -c 'sole proprietor'` must print `0`.
- **A4 — mechanism kept:** the test asserts the `mailto:` href still targets `SUPPORT_EMAIL` and the Email CTA still renders.
- **A5 — existing pin:** `pnpm vitest run client/src/pages/support.promises.test.tsx client/src/pages/goal/policy/policyText.goal.test.tsx` is green; `/support` stays off the policy goal frame.
- **A6 — gates:** `pnpm check`, `node scripts/design-token-audit.mjs` and `pnpm build` pass. Grep the prerendered `/support` HTML in the build output for the A2 phrases; expect 0.
- **A7 — proof (AGENTS rule 8):** captures of `/support` at 1280 and 390 from a clean browser under `artifacts/support-promises/`. Then green required CI on the exact head.
- **A8 — residual stated:** the pull request body lists `shared/landingContent.ts:63` ("A person answers, usually within one business day.") as an open residual owned by `PRICING-banded-oct25`, not as fixed (§8).

Landing: Tier 2, on green required CI on the exact head (D-200 (4)). The builder changes only this row's `status` to `done`, in the pull request that lands it.

## 7. Release coupling (D-048-R5)
#954 (`D-048-p3-support`) adds "Contact support" links to `/support` from the goal support pages. This row should land before `D-048-R5` switches the goal support pages on, so those links never lead to the unbacked promises. `D-048-R5` is planned but not registered (`docs/plans/D-048-phase-3-split.md`), so no `dependsOn` edge is added now: when R5 is registered, its packet carries one checklist item, "SUPPORT-A done (or `/support` otherwise free of the A2 phrases) before the support ids turn on".

## 8. Residuals outside this row
- `shared/landingContent.ts:63` repeats "A person answers, usually within one business day." on the landing directory. It is owned by `PRICING-banded-oct25` (Tier 1, parked at `owner`, branch `5116c114` edits the same file), so this row cannot own it without an edge to a parked pricing row. It stays live until that row's holder or a follow-up after PRICING lands removes it. Listed, not fixed.
- Every other residual in packet §1.4 (the kit `Report.tsx:138` timing line, the developer-console "safety team" copy, the `/support` goal-UI coverage orphan) and all of Half B are outside this packet and not adopted by D-277.

## 9. Stop and ask
- A self-serve card (L14-17) turns out to be false.
- The page seems to need any positive service commitment (time, person, team, triage, notification).
- Any change would touch L41, L31, L20 or L39, or a file outside §5.

## Status
- 2026-11-02: registered by D-277 (docs/registry only). `status: "todo"`, `syncedTo: "D-277"`. Nothing built.
