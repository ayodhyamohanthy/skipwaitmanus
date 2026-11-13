# LAUNCH-live-qa - live QA, Oct 26 2026 (public/signed-out pass)

**Verdict: the public release passes; the signed-in launch proof is still NOT done.** This run proves the
signed-out surface and the release identity. This session ran no signed-in flow; the coordinator's
authorized QA route separately verified two read-only signed-in sessions (issue #709, reconciled below),
and that evidence covers no transactional flow. It also found one launch-blocking live contradiction:
every INR credit pack reports unavailable on the live catalog, and the LIVE catalog read shows the pack
items were archived on Oct 25.

## Release under test

| Item | Value |
|---|---|
| Web (`<meta name="git-commit">`) | `fb42076157ca64b962979e95ed8c4f7892131faa` |
| API `/api/health/ready` | `40e160e25cb7602dd2c3cd42396fdc750f80a25d`, `state: ready` |
| API `/api/health` | `schemaReconciled: true`, `schemaReconcileState: ready` |
| `origin/main` at run | `edab4119`; no commit after `40e160e2` touches `server/`, `shared/`, `drizzle/` or `src/worker.ts` |
| Run window | 2026-10-26T13:28:39Z - 13:34:49Z |
| Browser | Playwright 1.62.1, headless Chromium, 1280x900 and 390x844, fullPage |

## Method

Thirteen signed-out routes at both widths. Each view waited for network idle (15 s cap), for body text
(12 s cap), scrolled the whole page to trigger reveal, returned to the top, then captured. Every console
error, page error, failed request and >=400 response was recorded. Then safe signed-out API probes with
`curl`. **No sign-in, no code request, no account creation, and no payment or refund action** (D-065).

## Public sweep: 13 routes x 2 viewports

| Route | Path | 1280 status | 1280 chars | 390 status | 390 chars | Issues |
|---|---|---|---|---|---|---|
| landing | `/` | 200 | 3592 | 200 | 3608 | 0 |
| sign-in | `/sign-in` | 200 | 1054 | 200 | 849 | 0 |
| sign-in-referrer | `/sign-in?intent=referrer` | 200 | 1032 | 200 | 827 | 0 |
| explore | `/explore` | 200 | 2090 | 200 | 2063 | 0 |
| explore-go-neutrinos | `/explore/go-neutrinos` | 200 | 1069 | 200 | 1047 | 0 |
| explore-wipro | `/explore/wipro` | 200 | 1109 | 200 | 1091 | 0 |
| plans | `/plans` | 200 | 3284 | 200 | 3255 | 0 |
| referrer | `/referrer` | 200 | 979 | 200 | 955 | 0 |
| jobs | `/jobs` | 200 | 272 | 200 | 272 | 0 |
| wall | `/wall` | 200 | 158 | 200 | 158 | 0 |
| ask | `/ask` | 200 | 998 | 200 | 967 | 0 |
| terms | `/terms` | 200 | 5805 | 200 | 5585 | 0 |
| privacy | `/privacy` | 200 | 3339 | 200 | 3126 | 0 |

All 26 views: HTTP 200, zero console errors, zero page errors, zero failed requests, zero >=400
responses, and no `acme.com` or sample-role text. `/explore` rendered all 39 companies at both widths.
(An earlier 2.5 s-only capture showed loading skeletons at 390; the run above waits for content, and the
stored captures show the loaded page.)

## Sign-in presentation (D-030 public surface)

| View | Social buttons | Work-email OTP | Capture |
|---|---|---|---|
| Seeker `/sign-in` | 5: Google, Microsoft, GitHub, LinkedIn, Slack (no Apple) | no | `sign-in-1280.png`, `sign-in-390.png` |
| Referrer `/sign-in?intent=referrer` | 0 | yes | `sign-in-referrer-1280.png`, `sign-in-referrer-390.png` |

The referrer view shows only "Company email / Send sign-in code" and the line "Work email only. We never
use personal email or social logins for referrers." This matches the founder-locked rule (D-030 as
amended by D-049 and D-057). It is presentation evidence only; no sign-in was completed.

## Public API probes (13:28-13:29Z)

| Probe | Result |
|---|---|
| `GET /api/auth/workos/sign-in` | 302 to `api.workos.com/user_management/authorize`, `provider=authkit` |
| `GET /api/credits/summary` | 401 "Sign in to view your referral credits" |
| `GET /api/company-referrals/mine` | 401 "Sign in to view your referral requests" |
| `GET /api/company-referrals/inbox` | 401 "Sign in to view employee requests" |
| `GET /api/documents/1` | 401 "Sign in to view this document" |
| `GET /api/blocks/mine` | 401 "Sign in to view your blocks" |
| `GET /api/referrer/impact-card` | 404 "Not found" (flag off; expected) |
| `GET /api/jobs` | 200 `{"jobs":[]}` |
| `GET /sitemap.xml` | 200, 59 `<loc>`, 0 acme matches |
| `GET /api/health`, `GET /api/health/ready` | 200, identity above |

## Finding 1 (launch blocker): all INR credit packs report unavailable

Live `GET https://skipwait.me/api/plans/catalog` on API `40e160e2` returned `region: "IN"`,
`currency: "INR"`, `priceNote: "India price"`, and every credit pack `available:false` on every poll:

| Pack | Credits | Amount | `available` | Polls |
|---|---|---|---|---|
| `pack_2` | 2 | Rs99 | false | 13:28:52Z, 13:29:06Z, 13:36:03Z, 13:37:11Z, 13:38Z, 14:48:04Z |
| `pack_25` | 25 | Rs1,199 | false | same |
| `pack_60` | 60 | Rs2,599 | false | same |
| `pack_150` | 150 | Rs5,999 | false | same |

`/plans` renders **"Not on sale yet"** on all four packs at both widths (`plans-1280.png`,
`plans-390.png`), while `docs/PRICING.md` line 37 says "Credit packs: LIVE in INR and USD ... Packs stay
on sale", and packet LAUNCH-oct25 opens from "the product deployed and current, with packs on sale".

What the response tells us:

- The route answered 200, not the all-unknown 503 ("Prices are unavailable right now"). At least one
  availability verdict was definite, so this is not the "billing not configured" path.
- The container validates `BILLING_ENV` and the live Chargebee settings at boot (`server/_core/index.ts`),
  and the API is ready, so the live billing environment is configured and the provider was reachable.
- The remaining explanations are provider-side: the four INR item prices (`skipwait_pack_2-INR`,
  `skipwait_pack_25-INR`, `skipwait_pack_60-INR`, `skipwait_pack_150-INR`) are archived/inactive, their
  amount or currency no longer matches `shared/planCatalog.ts`, or the configured site is not the site
  that holds them.

**Root cause established at the provider catalog level** by the coordinator's read-only Chargebee console
access (issue #709, Oct 26 19:42 IST): the LIVE site `skipwait.chargebee.com` is the only site on the
account, and the consumer pack items `pack_2`, `pack_5`, `pack_25`, `pack_60` and `pack_150` (with
`token_1/5/10` and `live_session`) were **ARCHIVED on Oct 25, 20:06-20:08 IST**. The app resolves only
`skipwait_<pack>-<currency>` ids, so `available:false` is the true provider state - not a missing-config
fallback.

The repo side of that reading was re-verified here: deployed revision `40e160e2` is an ancestor of
`origin/main`, and `src/worker.ts`, `Dockerfile`, `wrangler.jsonc`, `shared/planCatalog.ts`,
`server/kitCheckout.ts`, `server/plansCatalogRoutes.ts` and `server/chargebeeEnvironment.ts` are
byte-identical between `40e160e2` and `origin/main` (zero diff). `PASS_SALES_ENABLED` is hard-coded
false (`shared/planCatalog.ts:101`), and `catalogPackItemPriceId` builds exactly
`skipwait_<pack>-<currency>` (`shared/planCatalog.ts:269`). Container billing env is settled too
(coordinator read of the Worker's runtime vars: `BILLING_ENV=live`, `CHARGEBEE_LIVE_SITE=skipwait`,
live key/secret present; the deployed `src/worker.ts` passes them through explicitly).

Still open, and kept open (no conclusion drawn):

1. **Intent of the archival** - who archived the pack prices on Oct 25 and whether re-enabling or
   recreating them for launch, or correcting `docs/PRICING.md`, is the right call. Owner decision.
2. **Per-price read for the packs** - item-level archival is established; an item-price-level read of
   the four INR pack ids and `pack_5` (USD) would pin exact status, amount and currency.
3. **Runtime checkout refusal** - no checkout POST has been or may be issued without separate
   authorization, so provider/app refusal behavior remains unverified. USD is also unverified: this
   run's region was IN and `pack_5` is USD-only.

## Finding 2: empty states are real, not failures

- `/jobs` serves `{"jobs":[]}` and the page's empty state (272 chars) at both widths; no acme or sample data.
- `/wall` shows its empty state plus share block (158 chars). This is the known open issue #98 (empty but
  shareable and in the sitemap), not re-filed here.
- `/referrer`, `/ask` and `/plans` render their signed-out states.

## Reconciliation: authenticated read-only evidence (issue #709)

The coordinator's authorized QA route signed in the two approved alias accounts on Oct 26 18:59 IST,
reading each email code from the alias inbox itself (no owner relay; both sign-ins ran under the
owner-approved scope of up to 4 sign-in emails, 2 used). **This session did not sign in and does not
share those sessions**; the following is reported on issue #709 and recorded here as such, not as
independent proof.

| Check (coordinator-reported) | Result | What it proves |
|---|---|---|
| Seeker alias sign-in via email code | Session verified; plan free, 3 credits/month, 2 remaining | A WorkOS email-code sign-in produces a valid seeker session, and the wallet reads |
| Seeker `GET /api/jobs`, `/api/saved-roles`, `/api/opportunities/mine` | All 200 | Authenticated seeker read paths answer |
| Referrer alias sign-in via email code | Session verified | The work-email code path produces a valid referrer session |
| Referrer `GET /api/referrer/home-bundle` | 200, `verifiedCompanyAccess: true` (workEmailDomain skipwait.me) | The verified-referrer gate resolves on a real session |
| Referrer `GET /api/admin/billing/ledger` | 403 | Admin gating holds for a non-admin session |

**What this does NOT prove, and must not be read as passed:** the authenticated screens were empty
states ("No asks right now"; packs "Not on sale yet"). No populated inbox or conversation, no ask
creation, no send, no upload, no withdraw, no cross-user read and no payment flow was exercised. An
empty inbox is not proof of a populated one. Gate items 2.2-2.6, 3.1-3.4 and 4.1-4.4, 4.11 stay
**BLOCKED/unverified**; 1.1 is partial (email-code session + wallet read; silent-SSO leg not run) and
1.4 is verified for today's sign-in code path (delivery timing, From line and subject were not
re-measured).

Route correction recorded on the issue: the qa-sweep-1/2 work-email aliases are stale and excluded;
the approved identities are the two alias accounts used since Oct 23. No codes, cookies, sessions or
secrets change hands through this repo.

## Access: available route and open requests

Further authenticated checks are **requested through Instinct on GitHub** (issue #709), scoped to
read-only GETs; sessions are never shared, and no passwords, codes or sessions are requested from the
founder. The reads that would close specific gate rows: seeker `GET /api/credits/summary` and
`GET /api/company-referrals/mine`; referrer `GET /api/company-referrals/inbox` and
`GET /api/blocks/mine`. Everything that needs a write (ask creation, withdraw, upload, claim/accept,
checkout) stays blocked until it has its own explicit authorization.

Still open on the money lane (kept open deliberately): runtime checkout refusal behavior (needs an
explicitly authorized no-wallet-risk path, not a live checkout POST), the item-price-level read for the
four INR pack ids and `pack_5`, and the owner's decision on the Oct 25 pack archival.

Consequently these BUGFREE_GATE items are **not verified for this release**: 1.1 (partial), 1.5
completion, 2.2-2.6, 3.1-3.4, 4.1-4.4, 4.9-4.18. Gate 3.1's Oct 15 re-run debt also still stands.

## Limits

- This is not a signed-in QA and not launch proof; AGENTS.md rule 8 remains unmet for the signed-in flows.
- The authenticated session results are coordinator-reported on issue #709 and were not re-run by this
  session; they cover sessions and reads only, never a transaction.
- No hosted payment page was opened; there is no wallet, credit, ask, referrer, queue or conversation
  evidence. Runtime checkout refusal stays unverified.
- The pack finding's root cause is established at the provider catalog level (items archived Oct 25); the
  intent of that archival, the item-price-level read and USD availability remain unverified.
- Full-page captures depend on client-side reveal; the script scrolls each page before capturing. Surfaces
  that exist only after sign-in are not reachable in this run.
- `/wall` being empty is a known open issue (#98), not a new finding.

## Evidence

- 26 full-page captures in `docs/qa/launch-live-qa-oct26/`, named `<route>-<width>.png` (1280 or 390).
- `sweep-results.json`: raw per-view status, title, H1, char count, console/page/network errors, button
  texts and the sign-in provider counts.
- Issue #709: the coordinator's Oct 26 updates (authorized-alias read-only sessions, LIVE Chargebee
  console snapshot, container billing-env read); state re-read at 2026-10-26T14:48:04Z (same release,
  packs still `available:false`).
- The sweep script is a local temp file and is deliberately not committed.
