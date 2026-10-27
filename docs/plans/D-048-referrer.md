# Packet D-048 phase 3: referrer workspace and decision surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the referrer cluster rows to the queue. It does not implement the UI.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-referrer` |
| Decisions | D-019, D-030, D-049, D-055, D-057, D-070, D-071, D-077, D-120, D-134, D-149, D-150, D-151, D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 1 or 2 as stated) |
| Branch | `agent/architect/d048-p-referrer` |
| Depends on | `D-048-phase-3` (landed foundation packet) |
| Adds | `D-048-p3-conversation`, `D-048-p3-referrer`, `D-048-p3-referrer-home`, `D-048-p3-invite`, `D-048-p3-post`, `D-048-p3-email-review` |

## 1. Goal and binding rules

Move the referrer-facing W2/W4 surfaces to the goal system one surface at a time while retaining the existing server/data/auth paths. Every page must state the referrer's goal and one next step plainly (D-150/D-153), preserve pre-acceptance privacy and server verdicts (D-019), and keep referrer authentication work-email OTP only through `referrerSignInHref()` (D-030/D-049/D-057). Referrers are never paid, charged, or shown seeker plan/credit information (D-055).
- Note (Oct 24): D-196 (owner, 12:56) is the CURRENT product rule: basic referring stays free; an opt-in referrer plan's benefit is level-matched FIRST ACCESS to referral requests (senior plan -> senior-candidate requests first), then the free pool, shown on the plan card and never promised as a guaranteed referral. It is not registered, flagged or enabled anywhere; prices, the plan's contents and the first-access window are open (the free-3 allowance and D-181's agent-spendability are untouched). The no-paid-copy rules in this packet guard only against advertising an unimplemented benefit; they do not veto D-196. D-055's never-PAID core stands (no payout for referring); D-119 and D-196 narrowed only the never-CHARGE blanket. D-006/D-040 stand: nobody buys a referral, a ranking of people, inbox placement or seeker access, and no outcome is ever guaranteed - narrowed only to admit D-196's referrer-side level-matched first access (first access, never a guaranteed referral or result). The goal shell must not show a credits pill on referrer routes (D-055; D-048-F-credits). No `referrer-home` id enters `RELEASED` until the shell matcher covers `/referrer-home` and `/referrer-setup` (D-217); that matcher is `D-048-F-credits`' work, so this packet's surface rows wait for it instead of editing `AppShell.tsx`.

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main`

- `client/src/pages/Referrer.tsx:21-44` derives invite/request/setup state and distinguishes the verified company email; the existing workspace, sign-in dialog, capacity and claimed-review components are rendered later in that page. Preserve those states and URL return paths.
- `client/src/lib/referrerSignIn.ts:1-13` is the canonical referrer sign-in contract: work-email OTP only, same-origin `returnTo`, never seeker `SignInButton`/`openSignIn`.
- `client/src/pages/ReferralConversation.tsx` selects the seeker or referrer conversation branch; the referrer branch must not expose seeker name/resume/message content before the referrer's own acceptance (D-019).
- `client/src/pages/ReferrerHome.tsx` and `ReferrerSetup.tsx` use the shared referrer data path; retain loading, empty, error and verified-company states and the D-055 never-paid copy.
- `client/src/pages/Invite.tsx` owns company request and invite-link panels; `PostOpportunity.tsx` owns the server-verdict posting gate; `EmailReviewAction.tsx` handles one-click email decisions and must remain behind work-email verification.
- `docs/plans/D-048-phase-3-split.md:105-116` is the authoritative row contract and owned-path list. The split's `Rows each packet adds` section assigns exactly these six rows to this packet.

## 3. Surface contracts and exact queue rows

The builder must use the following rows exactly; `owns` must match the paths below and no additional row may be added by this packet.

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-conversation` | W2 `/conversation/:requestId`, referrer decision panels; seeker name/resume only after the referrer's own acceptance | `d048-thread` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-referrer`, `D-038-reconcile`, `D-105-win-card`, `ROW20-CD` | 1 | in place under D-149, or `goalSurfaceOn('conversation')` if dark | `client/src/pages/ReferralConversation.tsx` (referrer branch); `client/src/pages/conversation/ReferrerConversation.tsx` (new); `client/src/pages/referralConversation.test.tsx` (referrer cases); `design/goal-ui/captures/conversation/**` |
| `D-048-p3-referrer` | W4 `/referrer` and `/referrer/impact`; Impact is a quiet link, not a nav item | `d048-workspace` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-referrer`, `ROW20-A` | 1 | `goalSurfaceOn('referrer')`; no credits pill; sign-in only through `referrerSignInHref()` | `client/src/pages/Referrer.tsx` (switch only); `client/src/pages/ReferrerImpact.tsx` (switch only); `client/src/pages/goal/referrer/**`; `client/src/pages/referrerGoal.test.tsx`; `design/goal-ui/captures/referrer/**` |
| `D-048-p3-referrer-home` | W4 `/referrer-home` and `/referrer-setup`; shared referrer data read-only; current basic-referring/no-payout line | `d048-referrer-home` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-F-credits`, `D-048-P-referrer`, `ROW20-CD`, `D-106-impact-card` | 1 | `goalSurfaceOn('referrer-home')` | `client/src/pages/ReferrerHome.tsx` (switch only); `client/src/pages/ReferrerSetup.tsx` (switch only); `client/src/pages/goal/referrer-home/**`; `client/src/pages/referrerHomeGoal.test.tsx`; `design/goal-ui/captures/referrer-home/**` |
| `D-048-p3-invite` | W4 `/invite`; company request and invite-link panels | `d048-referrer-home` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-referrer`, `ROW20-B` | 2 | `goalSurfaceOn('invite')` | `client/src/pages/Invite.tsx` (switch only); `client/src/pages/goal/invite/**`; `design/goal-ui/captures/invite/**` |
| `D-048-p3-post` | W4 `/post-opportunity` and My openings; posting gate follows server verdict | `d048-post` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-referrer` | 2 | `goalSurfaceOn('post-opportunity')` | `client/src/pages/PostOpportunity.tsx` (switch only); `client/src/pages/goal/post-opportunity/**`; `design/goal-ui/captures/post-opportunity/**` |
| `D-048-p3-email-review` | W4 `/email-review/:linkToken`; one-click email decision behind work-email sign-in | `d048-verify` | `D-048-F-static-frame`, `D-048-F-primitives`, `D-048-P-referrer` | 1 | `goalSurfaceOn('email-review')` | `client/src/pages/EmailReviewAction.tsx` (switch only); `client/src/pages/goal/email-review/**`; `design/goal-ui/captures/email-review/**` |

No row waits on decline-refund work: D-147 requires every employee decline to keep the credit spent regardless of reason.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-referrer.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Build the red-first tests before the surface. Preserve every existing kit assertion and add goal-on assertions for loading, empty, error, offline, server-denied, and success states.
2. Referrer login links must call `referrerSignInHref()`; do not import or invoke seeker sign-in controls. Preserve safe same-origin return targets.
3. Conversation and email-review must prove the pre-acceptance privacy boundary: no seeker name, resume/file name, or message composer before acceptance; server 403/denial is rendered in plain language.
4. Do not infer verified-referrer status from an email string in client code; use the existing server verdict/data contract. Do not add credits, a plan/payment surface, referral ranking or paid-benefit copy here; D-196's future level-matched plan is unimplemented, owner-controlled and outside this packet's scope.
5. Import money/basic-referring copy from existing shared sources where applicable; never retype financial claims. Keep feature flags off by default; `RELEASED` is controlled only by the flags foundation/release work.
6. Use the existing API/data modules read-only. No migration, dependency, env key, route-table edit, shared component edit, or server change is in scope.

## 5. Red-first tests and gate

Before implementation, each builder records the focused failing tests specified by its surface. At minimum, the tests must pin: goal flag-off parity; goal flag-on render; loading/empty/error/offline states; canonical referrer OTP href; no credits pill on referrer routes; D-019 pre-acceptance privacy; D-055 basic-referring/no-payout copy; and server-denied/posting/email-review behavior. `D-048-p3-conversation` extends only referrer cases in the owned test file; it must not remove or weaken seeker assertions.

In a fresh worktree run `pnpm install` before the first `pnpm check` (missing local dependencies fail as TS2688/TS5101; REGISTER-520, Oct 24).

Required gate for each implementation PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; and goal captures at 1280 and 390 for the owned surface. Tier 1 rows require a draft PR and independent review by a model that neither built nor fixed them (D-151); no row lands with skipped/failing checks.

## 6. Definition of done

- Only the row's owned paths changed; named read-only imports are unchanged, including API/data/auth/shared read-only modules; `git diff --check` is clean and no conflict markers exist.
- Goal surface passes the contract and all focused tests plus the full gate on a branch merged with current `origin/main`.
- Capture evidence exists for both viewports where UI changed; no production flag is enabled by the implementation PR.
- Tier 1 builder opens a draft PR, reports `review` with exact head, and stops. Tier 2 builder opens a PR and follows the green-CI landing protocol.
- The packet parent remains docs-only and its six child rows remain separate claims.

## 7. Review checklist

The reviewer records the exact reviewed head and checks scope against `owns`; reproduces red-first tests; verifies no login-rule drift, credits pill, seeker privacy leak, paid-referrer promise, raw money copy, silent catch, unchecked boundary, or changed existing assertion. Review must cover both goal-on and flag-off behavior, mobile/desktop captures, and exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails for an unexplained reason, a required change falls outside `owns`, or a decision about money, sign-in, identity, privacy, or pricing is not already decided. Never guess; report the concrete file/line and question to the CEO.

## 9. Owner questions

None. The split's open design questions are already decided under D-123 in `D-048-phase-3-split.md`; this packet makes no new product or money ruling.

## Status

`D-048-P-referrer`: prepared PR pending landing — GPT · d492 — 2026-10-23 — branch `agent/architect/d048-p-referrer`

`D-048-p3-invite`: done — `fb420761` (#577) — goal `/invite` behind `goalSurfaceOn('invite')`: company request and personal invite-link panels, flag-off parity, canonical referrer OTP href, exact-head CI green (D-085)

`D-048-p3-referrer`: done — Buffy · a8ec — 2026-10-27 — PR #575; /referrer and /referrer/impact goal rebuild behind `goalSurfaceOn('referrer')`: server-verdict gate (no email-domain inference), goal work-email OTP dialog, one black commit, quiet Impact link, referral-only reward copy; 20 focused tests plus 1280/390 captures for signed-out, overview and impact. Independent Tier 1 review pass at `801af659` (nothing after it but merges); full gate 537 files / 4,722 tests green on merge candidate `9f3aa442`, `pnpm check` and `VITE_GOAL_SURFACES=all pnpm build` green.

`D-048-p3-referrer-home`: block cleared — D-217 — 2026-10-27 — PR #576 stays dark and waits for `D-048-F-credits`; the `AppShell.tsx` matcher is the shell row's work, and `referrer-home` may not enter `RELEASED` before it lands.
