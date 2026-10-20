# FND-7 triage result — open PRs and remote branches (2026-10-20)

Read-only audit for the owner. Nothing was closed, merged or deleted.

Method: the GitHub API (56 open PRs, three pages), `git branch -r --merged origin/main` / `--no-merged`, `git cherry`, `git log -1` per branch, and greps against current `main` (`2f78916e`, plus the docs-only `87e2c974`). Verdicts use the packet's five labels.

**Counts:** 56 open PRs (the Oct 18 note said 53); 301 remote branches, 37 fully merged (ancestors of `main`, safe to delete), 264 not merged.

---

## 1. Security findings (corrected 2026-10-20)

> **Correction:** this section originally listed three P0s. Two did not survive a
> second pass: dev auth is already fail-closed, and review links do not read
> `X-Forwarded-Host`. The corrected record is below; the fix slice is
> [`P0-security-correction.md`](./P0-security-correction.md).

### P0-a (kept). Storage proxy key check is bypassable — PR #2 claim

`server/_core/storageProxy.ts:6-13` still blocks private documents with a single
`key.startsWith("skipwait/private-referrals/")` check, and `server/_core/index.ts:202`
registers the route. `skipwait//private-referrals/…`, `./skipwait/private-referrals/…`
and `public/../skipwait/private-referrals/…` do not match the prefix and are forwarded
as `path` to the Forge presign endpoint. **Whether the backend normalizes the path is
unverified** — treat this as an app-layer hole, not a confirmed production breach.
The route is unauthenticated.

Impact depends on `BUILT_IN_FORGE_API_URL`/`_KEY` being set in production (the route
500s without them). Verify on staging with
`GET /manus-storage/skipwait//private-referrals/<openId>/<file>`: a 307 to a signed URL
proves the bypass; a 404 does not.

Fix: normalize the key (drop empty and `.` segments, reject `..`, NUL, backslashes and
any `private-referrals` segment) and presign only the normalized key; or retire the
legacy route (documents already stream through `/api/documents/:id`). Regression tests
for each bypass shape.

### P0-b (withdrawn). Dev auth in production — PR #18 claim, already fixed

`workosConfigured()` throws when any of `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`,
`WORKOS_COOKIE_PASSWORD` is missing and `NODE_ENV=production`
(`server/_core/workosAuth.ts:49-60`, landed `5c8d98a3`, PR #92). Boot fails, so
`registerDevAuthRoutes` at `server/_core/index.ts:199-200` is unreachable in production
and `resolveIdentity` never flips to the dev path there. **No P0, no code change.** A
boot check is already the behaviour; the comment in `workosAuth.ts` records why.

### P0-c (recast, defence in depth). Edge forwarded headers are not fully canonical — PR #18 claim

Review links build from `req.get("host")` (the `Host` header), not `req.hostname`, and
the Worker rejects any request whose Cloudflare-set URL host is not `skipwait.me`
(`src/worker.ts:70-77`). A client `X-Forwarded-Host` therefore does **not** move the
one-click approve/decline token to another host — the original finding does not hold.

The residue is real but narrower: `shared/clientIp.ts:17-37` deletes only the IP
forwarding headers, so `X-Forwarded-Host` and `X-Forwarded-Proto` pass through even
though the trust-proxy comment (`server/_core/index.ts:115-128`) says every forwarding
header is rewritten. Six link builders (`server/privateReferralRoutes.ts:735, 745, 919,
980, 1020, 1133`) still use the request origin. Fix both as defence in depth: overwrite
`x-forwarded-host`/`x-forwarded-proto` at the edge and build links from
`PUBLIC_BASE_URL` when set.

### Not a finding: PR #2's "fail-open session signing" headline

`server/_core/sdk.ts:17` still passes `ENV.cookieSecret` (default `""`) straight to
`jose`, but jose 6.1.0 rejects it: a local sign with an empty key throws
`DataError: Zero-length key is not supported`, and `verifySession` catches and returns
`null`. The path fails closed, as PR #18 said. A loud boot-time check is still good
hardening, not a P0.

### Already fixed on `main` (PR #18's other claims)

- Dev auth cannot fall through in production: `workosConfigured()` throws when keys are incomplete (`server/_core/workosAuth.ts:49-60`, `5c8d98a3` #92).
- Work-email enrollment receipt is bound to the consuming account: `server/workEmailOtp.ts:160-167` stores `userId` with the receipt.
- Chargebee test/live cannot be steered by a request header: `server/chargebeeEnvironment.ts:29-33` ignores the host and reads `BILLING_ENV`.
- CSRF: session cookies are `SameSite=Lax` (`server/_core/cookies.ts:16-19`), so cross-site form POSTs do not carry them.
- OAuth state is a random UUID inside a signed token (`server/_core/workosAuth.ts:241-255`); the admin bootstrap constants remain but are checked (`:62-66`).
- `appId` is compared (`server/_core/sdk.ts:30,39`).
- PayPal webhook reads `PAYPAL-TRANSMISSION-TIME` as a fallback (`server/paymentWebhooks.ts:154`).
- Sign-out clears private referral browser data (`client/src/components/AccountMenu.tsx:28`).
- 256 kb JSON/form limits (`server/_core/index.ts:155,174`), not 50 mb.

---

## 2. Open PRs (56)

Verdicts: **ACTIVE** (recent, owned by a §3b row), **SUPERSEDED** (`main` or a decision has it), **STALE-SALVAGE** (still relevant, no row or an unowned row; needs a packet), **STALE-DROP** (contradicts a decision), **DEPENDABOT** (version checked against `main`).

| # | Branch | Updated | Verdict | Evidence |
|---|---|---|---|---|
| 325 | `agent/qoder/integrate-kit-v4` | 10-19 | SUPERSEDED | D-048 (Oct 18) retired Kit v4 as binding; D-071 replaced its direction. |
| 324 | `agent/claude/seeker-signin-finish` | 10-19 | **ACTIVE** | Row 2: review passed (round 3 `bcff1742`), landing blocked by D-080 + WorkOS dashboard + `SEEKER_CODE_VERIFY_UNTIL`. |
| 322 | `agent/kat/d067-allocated-0098-oct19` | 10-19 | **ACTIVE** | D-067 billing-review recovery outbox; plan §8 records migration 0098 claimed by this branch. |
| 319 | `agent/workbuddy/payment-method-gate` | 10-19 | SUPERSEDED | D-079 shipped as PR #323 (`e4142dbc`) and owns the card-validation gate; flag off in production. |
| 314 | `agent/qoder/row20cd-thank-you-wall` | 10-17 | STALE-SALVAGE | Row 20 C+D (thank-you wall); row 20 is `todo`; 0097 is claimed by this branch. |
| 311 | `agent/qoder/row20b-company-demand` | 10-17 | STALE-SALVAGE | Row 20 B (company demand as votes); row 20 still `todo`. |
| 310 | `agent/qoder/row20-referral-lifecycle` | 10-17 | STALE-SALVAGE | Row 20 A (Impact metrics from history); row 20 still `todo`. |
| 309 | `agent/qoder/money-copy-truth` | 10-17 | STALE-SALVAGE | D-035 copy: stop promising a credit back on every decline/withdrawal. D-035 row still queued; rebase against the D-063 sentence. |
| 308 | `agent/qoder/ask-pinned-work` | 10-17 | **ACTIVE** | Row 13 slice A `in progress — Qoder`; branch owned; 0096 renumber pending (D-079 took it). |
| 287 | `agent/cline/integrity-fixes` | 10-16 | STALE-SALVAGE | Test-only: cap Vitest workers; `vitest.config.ts` has no cap today (`quality:gate` runs `--maxWorkers=1` only). |
| 216 | `dependabot/…/esbuild-0.28.1` | 10-14 | DEPENDABOT | `main` has `esbuild ^0.25.0`; 0.28.1 is a major bump (owner approval, package gate). |
| 187 | `implement-terms-screen-…` | 10-09 | STALE-DROP | Terms is live legal text (D-001 lasting rules); the design prototype is Kit v4, retired by D-048. |
| 146 | `dependabot/…/sharp-0.35.5` | 10-07 | SUPERSEDED | `main` already has `sharp ^0.35.5`. |
| 141 | `fo/skipwaitmanus-devsec-overrides` | 10-06 | SUPERSEDED | `main` has the overrides (`package.json` 139-156: `tar ^7.5.22`, `dompurify >=3.4.16`, etc.). |
| 140 | `fo/skipwaitmanus-deps-stack` | 10-06 | SUPERSEDED | `main` has `axios ^1.20.0` (`package.json:63`) and `dompurify >=3.4.16` (`:156`). |
| 139 | `fo/skipwaitmanus-main-green3` | 10-07 | SUPERSEDED | `main` is green: 421 test files / 3,510 passed at FND-3/FND-2. |
| 136 | `agent/qoder/referral-fanout-health` | 10-16 | STALE-SALVAGE | No fan-out code on `main`; analytics lane D-054, no row. |
| 135 | `agent/qoder/job-link-canonical-identity` | 10-16 | STALE-SALVAGE | No canonical job-link column on `main` (`drizzle/schema.ts`, `server/db.ts`); data-integrity slice, no row. |
| 133 | `fix/auth-load-timeout` | 09-24 | SUPERSEDED | Auth was rewritten for D-049 (seeker passwords, PR #324); the AuthKit SDK wait path this caps is gone. |
| 132 | `agent/qoder/env-contract-both-ways` | 09-24 | SUPERSEDED | FND-5 landed the read-implies-forwarded contract (`server/configContract.test.ts`, `src/worker.ts`). |
| 128 | `agent/qoder/ai-fallback-contract` | 09-24 | SUPERSEDED | `server/_core/modelRouter.ts:25,67` always returns the caller's deterministic fallback. |
| 127 | `agent/qoder/employer-route-guards` | 09-24 | STALE-SALVAGE | `server/employerRoutes.ts` has no `safeParse` at the edge today; route tests still missing. No row. |
| 126 | `agent/spark-v008-launchprep` | 09-24 | STALE-DROP | Historical V0 evidence docs; D-048/D-074 replaced the plan they describe. |
| 125 | `agent/spark-v007-visibility` | 09-24 | STALE-DROP | Historical V0; D-054 owns analytics. |
| 124 | `agent/qoder/product-copy-guard` | 09-24 | SUPERSEDED | `scripts/productCopyGuard.mjs` + `scripts/productCopyGuard.test.ts` on `main`. |
| 123 | `agent/spark-v006-checks` | 09-24 | STALE-DROP | Historical V0 evidence. |
| 122 | `agent/spark-v005-recovery` | 09-24 | STALE-DROP | Historical V0 evidence. |
| 121 | `agent/spark-v004-stack` | 09-24 | STALE-DROP | Historical V0 evidence; the stack is deployed on Cloudflare. |
| 120 | `agent/qoder/truthful-outcome-status` | 09-24 | SUPERSEDED | "Request accepted" copy is live (`client/src/components/thread/ThreadMain.tsx`, `MyCompanyInbox.tsx`). |
| 119 | `fix/schema-contract-rebuildable` | 09-24 | SUPERSEDED | `server/schemaReconcile.ts` reconciles at boot. |
| 118 | `agent/cline/reputation-signals` | 10-01 | STALE-SALVAGE | Draft; no §3b row owns reputation. Needs an owner proposal before any merge. |
| 117 | `agent/spark-v003-audit` | 09-24 | STALE-DROP | Historical audit; current state is `BUGFREE_GATE.md` + Sentry. |
| 116 | `agent/spark-v002-mapping` | 09-24 | STALE-DROP | Historical mapping. |
| 114 | `agent/spark-v0-inventory` | 09-24 | STALE-DROP | Historical inventory. |
| 113 | `agent/spark-frontend-states` | 09-24 | STALE-DROP | The surfaces were rebuilt by D-048 phase 2/3; goal UI handles its own states. |
| 112 | `agent/spark-ats-blurb` | 09-24 | STALE-SALVAGE | No ATS blurb drawer on `main` (only marketing copy); small feature, no row. |
| 111 | `ci/self-hosted-mac-runner` | 09-24 | STALE-DROP | Title says "do not merge until runner is online"; Cloudflare is the deploy path. |
| 110 | `fix/credits-policy-copy` | 09-24 | STALE-DROP | D-035/D-061 replaced the credit policy he describes. |
| 109 | `fix/102-first-party-funnel` | 09-24 | STALE-SALVAGE | No funnel code on `main`; D-054 analytics lane. |
| 108 | `fix/102-remove-dead-umami` | 09-24 | STALE-SALVAGE | `client/index.html` still carries the Umami placeholders; D-054. |
| 107 | `fix/99-step1-coverage` | 09-24 | SUPERSEDED | D-034 coverage (waiting asks, first-visibility spend) + the job-link preview. |
| 106 | `fix/96-seo-routing` | 09-24 | SUPERSEDED | `scripts/prerenderSeo.ts` + per-route canonical/noindex on `main`. |
| 105 | `fix/97-share-link-og` | 09-24 | SUPERSEDED | Share cards on `main` (`getOrCreateReferralShareCard`, `/share-card`, `smartPitchAndShareCards.test.ts`). |
| 104 | `fix/98-trust-empty-states` | 09-24 | STALE-DROP | The `/jobs` surface was replaced by `/explore` + `/wall` (D-022). |
| 95 | `test/mysql-concurrency-harness` | 09-24 | STALE-SALVAGE | Test infra; `ledgerFixtureDb` exists but no real-InnoDB harness; no row. |
| 93 | `fix/identity-email-alias-merge` | 09-23 | STALE-DROP | One-off founder data change (#89); D-067 identity rules own merges now. |
| 25 | `fix/settings-trpc-test-mocks` | 09-18 | SUPERSEDED | Current Settings/policy suites mock tRPC context themselves. |
| 18 | `fix/security-and-quality-review` | 09-17 | STALE-SALVAGE | Most claims fixed on `main` (§1); three live → P0-a/P0-b/P0-c. Rebase or close after the P0s. |
| 14 | `hoplite/kalchedon-cd4bc95f` | 09-18 | STALE-DROP | D-035's decline reason codes replaced the two-step decline design. |
| 2 | `devin/…-security-hardening` | 09-17 | STALE-SALVAGE | Session headline not exploitable (jose rejects empty keys); storage bypass live → P0-a; dependency bumps largely on `main`. |
| 1 | `devin/…-low-coverage-unit-tests` | 09-17 | SUPERSEDED | 421 test files / 3,510 passing today. |

### Dependabot detail (owner approval; package gate)

| # | Package | `main` | PR target | Verdict |
|---|---|---|---|---|
| 216 | esbuild | `^0.25.0` | 0.28.1 | SALVAGE (major) |
| 146 | sharp | `^0.35.5` | 0.35.5 | CLOSE (already there) |
| 11 | @types/node | `^24.7.0` | 26.6.1 | SALVAGE (major) |
| 10 | tsx | `^4.19.1` | 4.23.14 | SALVAGE |
| 9 | @radix-ui/react-select | `^2.2.6` | 2.3.7 | SALVAGE |
| 8 | prettier | `^3.6.2` | 3.9.6 | SALVAGE |
| 7 | @aws-sdk/client-s3 | `^3.1113.0` | 3.1131.0 | SALVAGE |

---

## 3. Branches

### Fully merged (37) — safe to delete

```
agent/claude/chargebee-catalog-sync, agent/claude/d082-enforced, agent/claude/green-main-rule,
agent/claude/p0-allocated-ask, agent/claude/pro-max-removal, agent/fo/truth1-impact,
agent/instinct/company-cap-d006, agent/instinct/d048-phase2-foundation,
agent/opencode/design-token-guide, agent/opencode/kit-catalog-d039-d041,
agent/opencode/kit-pricing-model, agent/opencode/kit-v4-update-plan,
agent/queue/d065b-slice-checks, agent/queue/fnd2-dead-code, agent/queue/fnd3-dup-keys,
agent/queue/fnd5-env, agent/queue/fnd5-live-note, agent/queue/fnd6-row-audit,
agent/union-cobalt-home, design/scoreboard-rebrand, docs/monetization-decisions-oct16,
docs/workers-builds-red-check, feat/close-my-opening, feat/company-directory-batch2,
feat/company-directory-expansion, feat/kit-v4-screens, feat/opportunity-caps-expiry,
feat/wall-verified-badge, fix/dm-idempotency-client, fix/referrer-home-no-signed-out-401,
fix/schema-reconcile-recovery, fix/unblock-main, kit-v4-fullstack, main, p0-referrer-link,
p0/referral-transition-cas, reconcile-fixes
```

Squash-merged lane branches appear in the next list even though their PR is closed
(e.g. `agent/instinct/card-validation`, merged by PR #323). Confirm the PR before deleting.

### Not merged (264) — grouped

| Group | Count | What it is | Action |
|---|---|---|---|
| `agent/skipwait-eng/*` | 51 | Pre-D-048 engine experiments (api timing, ask credit spend, container basics, …); no open PR. | Historical; spot-check then delete. |
| `agent/qoder/*` | 16 | Nine open PRs above plus `hermetic-test-credentials`, `opportunity-url-ssrf`, `slack-allowlist`; the SSRF fix is on `main` (`server/jobLinkPreview.ts:16`), the Slack allowlist too (`server/referrerSlackDelivery.ts:19`), the credential scrub is test-only. | Keep the open-PR lanes; the other three are superseded. |
| `agent/workbuddy/*` | 6 | Kit-v4 screens/landing/SEO plus `payment-method-gate` (#319). | D-048 supersedes; close with a pointer. |
| `agent/queue/*` | 3 | `fnd1-toolchain` (row FND-1 still `todo`; head says it marked the row done), `fnd7-triage` (this), `go-live-plans` (GO-LIVE-1 docs). | FND-1 needs a decision (merge/rebuild); keep GO-LIVE-1. |
| `agent/claude/*` | 3 | `goal-ui` (D-048 phase 3), `seeker-signin` (keep), `seeker-signin-finish` (#324). | Never delete; `goal-ui` is the phase-3 lane. |
| `agent/opencode/*` | 2 | `d038-a-lapses` (6 commits, 17 files: D-038-A lapses + `shared/scheduledJobs.ts`), `v4-missing-screens` (superseded). | **D-038-A branch is real work not on `main`** — inspect before restarting D-038-A. |
| `agent/cline/*` | 2 | `integrity-fixes` (#287), `reputation-signals` (#118). | See PR table. |
| `agent/spark-*` | 13 | V0 evidence/UI sweep branches, most with an open PR. | Historical. |
| Other | ~40 | `agent/forge/d067-independent-review` (review marker), `agent/kat/d067-allocated-0098-oct19` (#322), `agent/instinct/card-validation` (merged by #323), `arena/*`, `ayodhyamohanthy-patch-*`, `backup/pre-brand-split`, `ci/*`, one-off task branches. | Keep the review marker, #322, `backup/pre-brand-split`; the rest are owner-scratch. |

**Never delete (packet list):** `agent/claude/seeker-signin`, `agent/claude/seeker-signin-finish`,
`agent/claude/chargebee-catalog-sync`, `agent/opencode/task12-coach-rewrite` (already absent from
`origin`), and every `agent/qoder/*` branch that owns an open PR.

---

## 4. Owner action list (15 minutes)

1. **Approve the corrected P0 set**: P0-a storage-key normalization (fixed on `agent/queue/p0-security-correction`, `da4be6c6`) and the P0-c edge/link hardening (defence in depth, `3ea10eff` + `f305a792`). The dev-auth finding was withdrawn — `workosConfigured()` already fails the production boot. Nothing else in this report is an active exploit.
2. **Keep three lanes**: #324 (wait for D-080 + dashboard), #322 (D-067 recovery), #308 (row 13 slice A).
3. **Close #146** (sharp already on `main`). **Decide the row-20 set**: #310/#311/#314 (merge as row 20, or close and restart), #309 (rebase on D-035/D-063).
4. **Close the superseded/dropped list** with a one-line pointer (D-059): 325, 319, 187, 141, 140, 139, 133, 132, 128, 124, 120, 119, 117, 116, 114, 113, 111, 110, 107, 106, 105, 104, 93, 25, 14, 1. That is 26 PRs off the board.
5. **Decide the seven dependabot bumps** (package gate): 216, 11, 10, 9, 8, 7; close 146.
6. **Give packets to the salvage set** if wanted: 287 (test cap), 136 (fan-out), 135 (canonical link), 127 (employer edge), 118 (reputation — product decision first), 112 (ATS blurb), 109/108 (D-054 analytics), 95 (InnoDB harness), 2/18 (rebase after the P0s).
7. **Delete the 37 merged branches** and the historical groups (`agent/skipwait-eng/*`, `agent/spark-*`, `agent/workbuddy/*` kit-v4) after a spot check; keep the never-delete list.

No PR was closed, no branch deleted, no code changed by this audit. The three P0 rows
are recorded in `docs/KIT_V4_BUILD_PLAN.md` §3b for the architect to packetize.
