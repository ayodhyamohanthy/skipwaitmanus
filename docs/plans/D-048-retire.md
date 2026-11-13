# D-048 retirement: delete the old design, surface by surface (D-332)

Owner, November 11, 2026, in session: "Make sure old design is completely removed and forcibly changes to goal focused design".

This packet is the build brief for the rows `D-048-K-<surface>`, `D-048-K-inplace`, `D-048-K-kit` and `GATE-goal-design-ratchet` in `docs/plans/assignments.json`. It replaces the K1-K5 rows of `docs/plans/D-048-phase-3-split.md`, which were written on Oct 21 and never registered, so no session was ever handed a deletion.

Goal link: one design, landing to admin, is what a seeker or referrer meets on every page (D-120, D-150). Two designs in the code means a page can still render the old one, every fix is made twice, and a switch can be turned back.

## 1. Where the old design still is (measured on main `baff2550`, Nov 11)

| What | Count | Removed by |
|---|---|---|
| Surface ids declared in `client/src/lib/goalSurfaces.ts` | 46 | - |
| Ids in `RELEASED` (the goal page is what production serves) | 21 | - |
| Ids built and wired but still off | 14: `verify`, `plans`, `email-review`, `links`, `support`, `assistants`, `employer-billing`, `admin-money`, `admin-people`, `admin-approvals`, `inbox`, `profile`, `employer-talent`, `home-signed-in` | their `D-048-R-<id>` rows |
| Ids with no finished goal page | 6: `conversation` (referrer side), `premium`, `pricing`, `sign-in`, `skippy`, `public-profile` | their `D-048-p3-*` build rows, then `D-048-R-<id>` |
| Page files that still hold both designs behind a `goalSurfaceOn` switch | 61 | `D-048-K-<surface>` |
| Non-test files importing `client/src/components/kit` | 92 (none under `pages/goal` or `components/goal`) | `D-048-K-<surface>`, then `D-048-K-kit` |
| `client/src/styles/kit.css` | 291 lines | `D-048-K-kit` |
| Kit v4 token block in `client/src/index.css` (above the phase-2 marker, line 246) | 1 block | `D-048-K-kit` |
| Shell parts on the old system (`AccountMenu`, `NotificationBell`, `BetaNotice`, `CookieConsent`) | 4, on every page | `D-048-F-shell-parts` (waits for the owner, D-231) |

Under vitest the switch ignores `RELEASED`, so every unedited kit test still renders the old page. That is by design while both exist, and it ends per surface when its retirement row lands.

## 2. The order nobody may skip

1. **Build** the goal page (`D-048-p3-<id>`).
2. **Release** it (`D-048-R-<id>`: one line in `RELEASED`, with its QA, captures, kit-drift check and, for Tier 1, an independent review).
3. **Soak**: 7 days live with no new Sentry issue on that surface (split rule 5, unchanged).
4. **Delete** the old page (`D-048-K-<surface>`).
5. **Delete the kit layer** when nothing imports it (`D-048-K-kit`).

An old page is never deleted before its goal page is live: that would break a basic (D-019). "Completely removed" is therefore true on the day `D-048-K-kit` lands, not before, and no report may say otherwise.

## 3. What one retirement row does

One row, one surface, one agent. Its `owns` is its build row's files plus the tests that import its pages.

1. Confirm the release row in `dependsOn` is `done`, the id is in `RELEASED` on `origin/main`, and the soak has ended. Record the release commit, the date, and the Sentry check (query and result, no personal data) in the pull request.
2. **Kit-drift check.** `git log` the kit body since the goal page landed. Any behaviour the kit page gained afterwards must already exist in the goal page. If it does not, stop and report: that is a fix on the build row's lineage, not this row's work.
3. In each page file, delete the kit body (`KitX`) and the `goalSurfaceOn` switch. The file's default export renders the goal page alone. Keep the file and its export name, so `client/src/App.tsx` and every importer stay untouched.
4. **Tests.** A kit test is deleted only after each of its assertions is ported to the goal test or listed as dropped with the reason, in the pull request's "Ported assertions" table (GATE-test-integrity rules 1 and 4). Remove the `vi.mock('@/lib/goalSurfaces')` forcing from goal tests that no longer need it. The pinned tests `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx` lose no assertion: if `D-048-K-sign-in` or `D-048-K-verify` cannot keep one, stop and report (rule 5 needs a decision).
5. Delete a non-goal component only when a repository search shows nothing imports it any more. Data modules, `*Api.ts`, models and shared hooks stay.
6. Do not edit `client/src/lib/goalSurfaces.ts`, `client/src/App.tsx`, `client/src/test/goalPagesBoundary.test.ts` or any file outside `owns`. The id stays in `RELEASED` until `D-048-K-kit` removes the module.
7. No behaviour, copy, route, price, legal text or sign-in method changes. A retirement that changes what a user sees is a defect.
8. Gate: `pnpm check`; `node scripts/design-token-audit.mjs`; the surface's goal tests; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build`; captures at 1280 and 390 from a clean browser on the preview, matching the release captures. Tier 1 rows take one independent review (D-151).
9. After landing: `EXPECTED_SHA=<sha> bash scripts/verify-live-release.sh`, the live page at 1280 and 390, then the Status line below.

If the deletion needs a path outside `owns`, stop and ask for a widening (D-200). The list was generated from the build rows, not hand-audited per file.

Rollback after a retirement is a revert of that one pull request. The one-line switch rollback no longer exists for that surface; this is why the soak is kept.

## 4. Rows

Each `D-048-K-<surface>` depends on the row that released (or will release) the surface. Soak start is that row's landing.

| Row | Surface ids | Built by | Released by | Tier |
|---|---|---|---|---|
| `D-048-K-home` | home, home-signed-in | D-048-p3-home, D-048-p3-home-signed-in | D-048-R-home-signed-in | 2 |
| `D-048-K-sign-in` | sign-in | D-048-p3-signin | D-048-R-sign-in | 1 |
| `D-048-K-inbox` | inbox | D-048-p3-inbox | D-048-R-inbox | 1 |
| `D-048-K-conversation` | conversation | D-048-p3-conversation | D-048-R-conversation | 1 |
| `D-048-K-start` | start | D-048-p3-start | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-onboarding` | onboarding | D-048-p3-onboarding | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-verify` | verify | D-048-p3-verify | D-048-R-verify | 1 |
| `D-048-K-plans` | plans | D-048-p3-plans | D-048-R-plans | 1 |
| `D-048-K-premium` | premium | D-048-p3-premium | D-048-R-premium | 1 |
| `D-048-K-pricing` | pricing | D-048-p3-pricing | D-048-R-pricing | 1 |
| `D-048-K-referrer` | referrer | D-048-p3-referrer | D-048-R4 (Nov 9) | 1 |
| `D-048-K-referrer-home` | referrer-home | D-048-p3-referrer-home | D-048-R4 (Nov 9) | 1 |
| `D-048-K-invite` | invite | D-048-p3-invite | D-048-R4 (Nov 9) | 2 |
| `D-048-K-post-opportunity` | post-opportunity | D-048-p3-post | D-048-R4 (Nov 9) | 2 |
| `D-048-K-email-review` | email-review | D-048-p3-email-review | D-048-R-email-review | 1 |
| `D-048-K-settings` | settings | D-048-p3-settings | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-profile` | profile | D-048-p3-profile | D-048-R-profile | 1 |
| `D-048-K-alerts` | alerts | D-048-p3-alerts | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-messages` | messages | D-048-p3-messages | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-assistants` | assistants | D-048-p3-assistants, D-048-p3-agents | D-048-R-assistants | 1 |
| `D-048-K-support` | support | D-048-p3-support | D-048-R-support | 2 |
| `D-048-K-seeker-small` | landed, suggest-company, share | D-048-p3-seeker-small | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-skippy` | skippy | D-048-p3-skippy | D-048-R-skippy | 1 |
| `D-048-K-employer` | employer | D-048-p3-employer | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-employer-talent` | employer-talent | D-048-p3-employer-talent | D-048-R-employer-talent | 1 |
| `D-048-K-employer-billing` | employer-billing | D-048-p3-employer-billing | D-048-R-employer-billing | 1 |
| `D-048-K-for-companies` | for-companies | D-048-p3-for-companies | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-admin` | admin | D-048-p3-admin | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-admin-money` | admin-money | D-048-p3-admin-money | D-048-R-admin-money | 1 |
| `D-048-K-admin-people` | admin-people | D-048-p3-admin-people | D-048-R-admin-people | 1 |
| `D-048-K-admin-approvals` | admin-approvals | D-048-p3-admin-approvals | D-048-R-admin-approvals | 1 |
| `D-048-K-admin-ops` | admin-ops | D-048-p3-admin-ops | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-developers` | developers | D-048-p3-dev | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-policy` | policy | D-048-p3-policy | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-system` | system | D-048-p3-system | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-links` | links | D-048-p3-links | D-048-R-links | 2 |
| `D-048-K-discovery` | discovery | D-048-p3-discovery | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-public-profile` | public-profile | D-048-p3-public-profile | D-048-R-public-profile | 1 |
| `D-048-K-inplace` | queue, ask, company, the seeker conversation, /requests and /explore (moved in place, D-149, no switch) | #360, #362, #426, #429, #431 | already live | 1 |
| `D-048-K-kit` | the kit layer | - | every row above | 2 |

For the sixteen rows whose surface went live on Nov 9, the soak ends on Nov 16. A session handed one earlier may build it ahead as a draft (D-315) and lands it no earlier than that date.

`policy` deletes design code only. Terms, Privacy, Refund and Cancellation wording is the owner's and stays byte-identical.

## 5. `GATE-goal-design-ratchet`: the forced part

Until the kit layer is gone, CI makes the old design a one-way street. A vitest file in the required unit job (no workflow edit):

1. **A released page stays released.** Every id in the baseline's `released` list is in `RELEASED`. Taking a released surface back is then a deliberate edit of the baseline in the same pull request, with the incident or decision named, never a quiet one-line revert.
2. **No new old-design code.** Only files on the baseline's allow-list may import `client/src/components/kit` or call `goalSurfaceOn` outside `client/src/pages/goal`, `client/src/components/goal` and the flag module. A new file doing either fails.
3. **The list only shrinks.** A baseline entry is removed when its file stops importing the kit or loses its switch; an entry is never added without a decision id in the same pull request.
4. Each rule has a fixture that fails it.

The baseline is measured on `origin/main` when the row is built. Read `client/src/test/goalPagesBoundary.test.ts` and `scripts/designTokenAuditCore.mjs` first and do not repeat what they already refuse (goal pages reaching kit modules; legacy tokens and colour literals in goal scope). This row changes no page and no runtime code.

Release rows are not slowed by it: adding an id to `RELEASED` passes rule 1 unchanged. Retirement rows are not slowed by it: an allow-list entry whose file no longer matches is harmless and is pruned by `D-048-K-kit`.

## 6. What this packet does not decide

- **Order in the list.** Retirement and the gate are new work and sit last (FIFO). Only the release rows moved (D-332 (2)).
- **The soak length.** Seven days, as the split set it. Shortening it is an owner question (D-332).
- **`D-048-F-shell-parts`.** Held by the owner on PR #767 (D-231). `D-048-K-kit` cannot finish while those four parts import the kit.
- **`D-048-dark-mode`.** Unrelated to removal; still the owner's (D-230).
- **The legacy `/plans` page and its parts.** They retire with the pricing rows, not here (split K1 note; D-219, D-221).
- **Prices, legal text, the login rule, what is on sale.** Untouched.

## Status

The rows share the plan row "D-048": each task writes one line here, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).

- (none started)
