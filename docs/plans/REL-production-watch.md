# Packet REL: the systems know before a user does, and fix what they can (D-212)

> Read [`docs/BRIEF.md`](../BRIEF.md) and [`ENTERPRISE-PIPELINE.md`](ENTERPRISE-PIPELINE.md) first. Written by Claude Code as CEO (D-085, D-212) on Oct 26 2026. Several tasks share this packet (D-134): the picker hands out one at a time; do only the task it prints, and write your status line in the Status section at the end. Line numbers drift: find each function by name before you trust a number. The register wins any conflict.

| Field | Value |
|---|---|
| Verified against | `main` `927dfaca`, register through D-206, on 2026-10-26; every fact below was re-checked by an independent read-only review that day |
| Decisions | D-212 (this packet), D-200, D-205, D-204, D-174, D-166, D-151, D-100, D-082 |

## Rules for every task here
1. **Free only** (D-031, D-204). Cloudflare cron triggers and KV on the existing Workers plan, GitHub Actions on this public repo, the Sentry free tier, the existing ZeptoMail sender. No new paid service and no new npm dependency.
2. **Never break what works.** A probe or a capture never changes a response, a status code, a credit or a row. A watch that cannot run says so loudly; it never passes silently (AGENTS.md 0a, "Silent failure is a defect").
3. **No personal data or tokens** in alerts, Sentry events, issue titles or logs, and **no ids in Sentry fingerprints or issue titles** (each id would open its own Sentry issue and spend the free quota). Paths are route templates (`/api/referrer-review-links/:linkToken`), never the raw URL. An owner email may name an internal numeric row id (a request, payment or job-run id), as the payment-review alerts already do, so he can find the row.
4. **Proof before done** (AGENTS.md rule 8): the PR carries a real run (a workflow run link, the subject of an alert email the change produced, a `curl` of the new endpoint on production after landing).
5. **Landing.** Red-first tests; the gate on your commit merged with `origin/main`; CI green on the exact head. Land with GitHub's merge-commit button (`gh pr merge <number> --merge`; never `--admin`, `--squash` or `--rebase`, D-134 (6), D-200). The picker's printed landing step still says `git push origin <sha>:main`, which works only as an admin bypass; follow this rule instead until BRANCH-HYGIENE-2 rewrites that step. In the landing pull request, set this row's `status` to `done` in `docs/plans/assignments.json` (scope-check always allows that file): the merge button deletes the branch, and the picker sees only the newest 100 closed pull requests, so without it the row is handed out again. After the live check, delete your review lock and heartbeat branches (D-205 rule 3).
6. **Docs (D-068) without blocking each other.** A task that adds a route, a job, a workflow or a Worker writes the `AGENTS.md` living-map text it needs at the end of its done line here (`— map: <row name>: <text>`), and any session folds those lines into `AGENTS.md` in the next registry pull request (D-200 (2)). No REL task owns `AGENTS.md`, so they can run side by side.
7. **Nothing waits for one session** (D-200 (2)). Where a step below says "stop and report", push your branch, `--report blocked` with the evidence, and any other session may widen the row's `owns` or amend this packet.

## REL-watchdog: an external probe every 5 minutes that alerts the owner (lane `watchdog`, Tier 2)
**Why.** D-100 approved "an external uptime check that alerts the owner ... after 2 consecutive failures"; it was never built. The stand-in, `.github/workflows/api-health-watch.yml` (cron `*/5`), ran 24 times in its first 79 hours on schedule, where about 950 runs were due, because GitHub delays scheduled workflows; and it probes `/api/health`, which answers 200 even when the schema failed and never touches the database (`server/healthRoutes.ts`). The Oct 22 outage lasted about 10 minutes and was found by hand (`docs/INCIDENT-2026-10-22-api-1101.md`). Cloudflare cron triggers fire on time.

**What.**
1. **A separate Worker** `skipwait-watchdog` in a new folder `watchdog/`:
   - `watchdog/wrangler.jsonc`: its own `name`, `"triggers": { "crons": ["*/5 * * * *"] }`, `"workers_dev": false`, no routes, one KV namespace binding `WATCHDOG_STATE`, and a var `WATCHDOG_BASE_URL` (default `https://skipwait.me`).
   - `watchdog/src/index.ts`: the `scheduled()` handler and I/O only.
   - `watchdog/src/core.ts`: pure (the probe list, result evaluation, the state machine, the email and issue text).
   - `watchdog/tsconfig.json` and `watchdog/src/env.d.ts`: declare the few Workers types it uses (`ScheduledController`, `ExecutionContext`, a KV interface with `get` and `put`) locally, because `@cloudflare/workers-types` is not a dependency and none may be added. Do not edit the root `tsconfig.json`: it is in `deploy-api.yml`'s path filter, so the edit would roll out the API container, and its `types` hold no Workers globals.
   - It imports nothing from `server/` or `client/`.
2. **Probes** against `WATCHDOG_BASE_URL`, each with a 10 s timeout. All are read-only: none signs in, sends a code, writes a row or costs money.
   - `GET /` → 200 and the HTML holds `<meta name="git-commit"`.
   - `GET /api/health/ready` → 200 with `"state":"ready"`. A 503 whose JSON says `"state":"validating"` is a rollout, not a failure, until it has lasted 3 runs (15 minutes): `scripts/deploy-cloudflare-two-phase.sh` polls this same route while a new container validates. `"state":"failed"`, any other 5xx, a Cloudflare error page or an HTML body fails at once.
   - `GET /api/health/latency` → 200 and `dbRoundTripMs` is a number. That route answers 200 with `null` when the database fails.
   - `GET /api/plans/catalog` → 200 and the body parses as JSON (an HTML body is a failure). Also record how many entries of `packs` have `available: true`, for the weekly note only; it never fails a round. D-219 (6) pauses pack sales, so on Oct 27 the live catalog answered `available: false` for every pack by design. The catalog cannot tell a pack switched off on purpose from one whose provider check failed (`server/plansCatalogRoutes.ts` returns the same `false` for both). A drop to none can only become a failing probe once the catalog says which it is, and that is work for whichever row puts packs back on sale, not this one.
   - `GET /api/auth/workos/sign-in?provider=google`, without following redirects → 302 whose `Location` carries a `redirect_uri` with host `skipwait.me` and path `/api/auth/workos/callback`. The route builds the URL locally (`getAuthorizationUrl` in `server/_core/workosAuth.ts`) and calls no provider when the request has no `login_hint` and no `fresh=1`. The probe discards the return cookie. A 502 means seeker social sign-in is broken.
   - `POST /api/auth/otp/send` and `POST /api/auth/workos/email-code/send` with the body `{"email":"watchdog-probe"}` → 400 JSON. Both handlers refuse a malformed email before any provider call, rate counter or database write (`registerReferrerOtpLoginRoutes` in `server/_core/otpLogin.ts`; `server/_core/seekerEmailCode.ts`). No rate limiter, origin check or CSRF guard runs before them. Re-read them first; if that is no longer true, drop the probe and say so in the PR. A 5xx or an HTML answer means sign-in is broken.
3. **When it alerts.** A round fails when any probe fails. Each run probes; after a failed round it waits 30 s and probes again. Two failed rounds in a row open an outage (D-100's "2 consecutive failures").
   - **State** lives in KV as `{ state: "up" | "down", since, lastAlertAt, lastWeeklyAt, weekRuns, weekOutages, validatingRuns, packsAvailable, failing: [probe names] }`. It is written once per run, which is 288 writes a day, below even the free tier's 1,000.
   - **Up to down:** one alert "SkipWait DOWN: <probe names> (<status>)".
   - **While down:** a reminder at most every 60 minutes.
   - **Down to up:** one alert "SkipWait recovered after <minutes> min".
   - **Every Monday at 03:30 UTC (09:00 IST):** one "SkipWait watchdog: all probes green this week (<weekRuns> runs, <weekOutages> outages, <packsAvailable> packs on sale)" note, so a dead watchdog is noticed by its silence.
4. **How it alerts, on two channels**, so an email outage cannot silence it:
   - **Email** through the ZeptoMail HTTP API, with the request shape `server/emailDelivery.ts` uses (copy the few lines; do not import it), to the two addresses in `server/errorAlerting.ts` (`ADMIN_ERROR_RECIPIENT`, `ADMIN_ALERT_COPY_RECIPIENT`), from `noreply@skipwait.me`. Secret: `ZEPTOMAIL_API_KEY`. This is email only: D-100's iMessage leg has no free API a Worker can call.
   - **GitHub issue**, when the optional secret `GITHUB_ISSUES_TOKEN` is set (a fine-grained token for this repository only, Issues: read and write). The watchdog opens or comments on one issue `SkipWait DOWN: <probe names>` labelled `incident` and closes it on recovery. It creates the label idempotently (POST `/labels`, ignoring 422). GitHub notifies the owner by its own email, and the picker's lights 6 and 7 read it.
   - If either channel fails, log it and keep the state, so the next run tries again.
5. **Deploy.** `.github/workflows/deploy-watchdog.yml`.
   - **Triggers:** on push to `main`, and on `pull_request`, both with a block-list `paths:` filter whose entries are double-quoted (`- "watchdog/**"` and `- ".github/workflows/deploy-watchdog.yml"`; this is the only form `scripts/check-deploy-triggers.mjs` recognises). Also on `workflow_dispatch`.
   - **Every run:** `npx tsc -p watchdog --noEmit`.
   - **On `main`:**
     - When `npx wrangler kv namespace list` lacks `WATCHDOG_STATE`, create it.
     - Write its id into `watchdog/wrangler.jsonc` in the job workspace only (never commit a resource id: D-204).
     - Run `npx wrangler deploy` in `watchdog/` with the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
     - Run `npx wrangler secret list --name skipwait-watchdog`, and **fail the job** when `ZEPTOMAIL_API_KEY` is missing, printing the owner command. Print a warning, not a failure, when `GITHUB_ISSUES_TOKEN` is missing.
   - Add the workflow to `scripts/check-deploy-triggers.mjs` (`watchdog: { file: ".github/workflows/deploy-watchdog.yml", must: ["watchdog/**", ".github/workflows/deploy-watchdog.yml"] }`).
6. **Keep the GitHub watch** (`api-health-watch.yml`) as a slow third layer. Do not delete it.

**Tests** (`scripts/watchdogCore.test.ts`, which Vitest already collects, importing `watchdog/src/core.ts`):
- **Probes:** each probe's pass and fail, including an HTML body on a JSON probe and a 5xx on a sign-in probe.
- **Rollout and packs:** a `validating` 503 passes for 2 runs and fails on the third. A catalog with no pack available passes, and so does a drop from some to none; the count reaches the weekly note.
- **Alert rules:** one failed round opens nothing. Two in a row open one outage, with one email and one issue action. A further failed run sends nothing until 60 minutes pass. Recovery sends one email and closes the issue.
- **Weekly note:** it fires once a week with the counts.
- **Failed channel:** a failed channel leaves the state unchanged.
- **Content:** no alert holds anything but probe names, status codes and times.

**Owned paths.** `watchdog/`, `scripts/watchdogCore.test.ts`, `.github/workflows/deploy-watchdog.yml`, `scripts/check-deploy-triggers.mjs` (the new entry only). Map line: "External watchdog".

**Owner actions** (D-200 (6): accounts and tokens are his; the PR prints both):
- `npx wrangler secret put ZEPTOMAIL_API_KEY --name skipwait-watchdog`, pasting the key the API Worker already uses. Nothing alerts until this is done.
- Optionally, a fine-grained token for this repository with Issues: read and write (and Actions: read and write, for REL-self-heal), set with `npx wrangler secret put GITHUB_ISSUES_TOKEN --name skipwait-watchdog`.

**Done:**
- Tests pass and CI is green.
- Landed.
- deploy-watchdog is green.
- Proof that it alerts: run it locally with `wrangler dev --test-scheduled` and `WATCHDOG_BASE_URL` pointing at a URL that 404s (never a production change), and paste the subject of the email it sent.

## REL-review-email-retry: a referrer's review email that never went out is sent (lane `notifications`, Tier 1, after D-174-job-catalog)
**Why.** When a seeker sends a referral request, verified employees get a review email (`dispatchReferralReviewDeliveries` in `server/referralReviewDispatch.ts`). It is fire-and-forget (`void run()`) and runs once. A failed send is stored as `failed` or `unknown`, with an `attemptCount` and a backed-off `nextAttemptAt` (`completeReferralReviewDelivery` in `server/db.ts`). A container that restarts between `prepareReferrerReviewEmailNotifications` and the claim leaves its rows `pending` forever, and a crash during the send leaves a row `leased` with an expired lease. `claimReferralReviewDelivery` accepts all of these while `attemptCount < 5`, but nothing ever retries them. The referrer never hears of the request, and the seeker waits for nothing. The row waits for D-174-job-catalog (#650, already built), which registers a scheduled job in the same files.

**What.**
1. An hourly job `review-delivery-retry`, registered in `server/scheduledJobRegistry.ts`, `shared/scheduledJobs.ts` and the name list in `server/scheduledJobsContract.test.ts` (one entry each).
2. **What it reads:** up to 50 email delivery rows with `attemptCount < 5`, oldest first, that are any of:
   - `failed` or `unknown` with `nextAttemptAt <= now`;
   - `pending` and created more than 10 minutes ago;
   - `leased` with `leaseExpiresAt < now`.
3. **What it skips:** a row whose request can no longer be reviewed by that referrer:
   - the request is no longer open (withdrawn or closed);
   - the referrer and seeker are blocked either way (`server/blockedPairs.ts`);
   - its review link is consumed or past `referrerReviewEmailLinks.expiresAt`.
4. **How it sends:** it claims the row with `claimReferralReviewDelivery`, sends, and records the result with `completeReferralReviewDelivery`, exactly as the first attempt does.
5. **The link (already decided at `927dfaca`).** `referrerReviewEmailLinks.linkToken` (varchar 64, unique) is stored raw when the request is created and looked up by equality in `resolveReferrerReviewEmailLink`. Calling `prepareReferrerReviewEmailNotifications(requestId)` again re-issues nothing and revokes nothing. It returns each eligible referrer's existing token, skips rows already `sent` or `revoked`, and re-applies the eligibility rules (request still `pending`, referrer not paused or opted out, not passed, first look, assigned referrer, blocked pairs).
   - So the retry calls it once per due request and sends only to the due row's referrer, with that referrer's existing token.
   - It writes no token and never calls `rotateReferralReviewGrant`, which revokes the working link.
6. **When a row reaches 5 attempts:** alert the owner once (`sendAdminAlertEmail`) with the request id and channel.
7. **The provider status:** `server/emailDelivery.ts` gets an optional `providerStatus?: number` on `TransactionalEmailResult` when the provider answers non-2xx. The error thrown at `if (!response.ok)` is caught inside the same function, so it never reached `lastError`. The retry records `error: "<reason>:<providerStatus>"`. Existing callers keep working.

**Tests** (red first):
- Each of the three due kinds is sent once and marked `sent`.
- A row not yet due, a sent row, a revoked row, a row at 5 attempts, and a row with an expired or consumed link are untouched.
- A withdrawn, closed or blocked request is skipped.
- Two runs in the same window send once (the lease).
- A retry never changes another referrer's link.
- The fifth failure alerts once.
- No token is written.

**Owned paths.** `server/reviewDeliveryRetry.ts` and its test (new; the due-rows query lives here, not in `server/db.ts`, which many money rows hold). Also `server/scheduledJobRegistry.ts (switch only)`, `shared/scheduledJobs.ts (switch only)`, `server/scheduledJobsContract.test.ts (switch only)`, and `server/emailDelivery.ts` with its tests. Map line: "Scheduled jobs".

**Done:**
- Red-first tests pass and CI is green.
- The independent review passed (Tier 1: it emails real people).
- Landed.
- The job's first run shows as succeeded in `/api/admin/jobs`.

## REL-5xx-capture: every server error reaches Sentry and the owner, sign-in and webhooks included (lane `observability`, Tier 2, after D-090-BYOR — a **serialization** edge, not an output need: BYOR owns `server/_core/index.ts` in full and `server/errorAlerting.ts` outright, and this row edits both, so `validateAssignments` and `filesBusy` (PICKER-owns-scope, D-223 (1)) force the wait. It clears only when BYOR narrows those two paths to a declared anchor and this packet names the same one, or when BYOR lands)
**Why.**
- **Most 5xx answers go unreported.** Measured 2026-10-28 at `main` `0ae5dcde` and re-checked at this branch's head: **239** literal `status(500|502|503)` matches sit in **36** non-test server files (`git grep -nE 'status\((500|502|503)\)' <sha> -- server/ ':!*.test.*'`). **11** non-test server files import `captureServerError` directly (`_core/index.ts`, `askExpirySweep.ts`, `blockedPairs.ts`, `db.ts`, `jobCatalogRoutes.ts`, `jobSources/sync.ts`, `paymentRefundReview.ts`, `privateReferralRoutes.ts`, `referralTimers.ts`, `scheduledJobsRoutes.ts`, `workosWebhooks.ts`); a raw name-mention count reads 12 because it includes the defining `server/sentry.ts`. **This is a literal source inventory, not handled-response coverage:** it excludes 501/504, computed status codes and tests, and it does not establish whether any individual response is reported. **Import count is also not the whole picture:** `server/adminCatalogSyncRoutes.ts` imports nothing from `./sentry` yet receives `reportError: captureServerError` injected at `server/_core/index.ts:312` and calls it at `:45` and `:60`, so "non-importing files never report" is false. Nothing global reports a 5xx: the `/api` finish hook in `server/_core/index.ts` only logs slow requests. Per-response coverage is **unverified** and needs a call-graph and test audit, not this count.
- **The owner's 5xx email misses sign-in and webhooks.** `materialErrorAlertMiddleware` (`server/errorAlerting.ts`) is registered after the payment and WorkOS webhooks and after the sign-in routes, so a broken sign-in code send or webhook emails nobody.
- **One sender for alerts and codes.** The alert email and users' sign-in codes share one sender, so a ZeptoMail outage silences its own alarm.
- **4xx noise.** tRPC `onError` sends every error to Sentry, 4xx included, which spends the free quota.

**What.**
1. **`server/httpErrorCapture.ts` (new)** exports:
   - **`httpErrorCaptureMiddleware`:** on `/api` requests other than `/api/health/*`, on `res.once("finish")`, when `statusCode >= 500` and `res.locals.errorReported !== true`, it calls `Sentry.captureMessage` from `@sentry/node`, guarded by `isServerSentryActive()`, with the fingerprint `[method, routeTemplate, String(statusCode)]` and tags only.
     - `/api/health/*` answers 503 while a new container validates on every rollout, and the watchdog and release verify own those routes.
     - `routeTemplate` is `req.baseUrl + req.route.path` when Express matched a route. For `/api/trpc` it is `req.baseUrl + req.path` (the procedure name). Otherwise it is `"unmatched"`. Never `req.originalUrl`, `req.url` or a query.
   - **`markErrorReported`:** an error middleware that sets `res.locals.errorReported = true` and calls `next(error)`.
   - **`isClientTrpcCode(code)`:** true for `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `CONFLICT` and `PRECONDITION_FAILED`.
2. **In `server/_core/index.ts`** (at most 12 lines):
   - Import the three.
   - Register `httpErrorCaptureMiddleware`, and move `app.use(materialErrorAlertMiddleware)` to directly after `app.use(globalSecurityHeaders)`, before `registerPaymentWebhookRoutes`.
   - Register `markErrorReported` directly before `app.use(sentryErrorMiddleware)`.
   - In the tRPC `onError`, skip Sentry when `isClientTrpcCode(error.code)`, and set `req.res.locals.errorReported = true` when it captures.
   - Do not edit `server/sentry.ts` (FND-4). The four files that already call `captureServerError` before answering a 5xx — `server/jobCatalogRoutes.ts` at `:156-157` (`captureServerError(...)` then `res.status(500)`), then `server/privateReferralRoutes.ts`, `server/scheduledJobsRoutes.ts` and `server/workosWebhooks.ts`, which is the count this packet states at `:116` and D-212 (2) records — stay outside this row and may leave a second event.
3. **In `server/errorAlerting.ts`:**
   - `materialErrorAlertMiddleware` skips `/api/health/*`, and its dedupe key and email path use the route template, so one systemic failure is one email and no token reaches an inbox. If FND-4 has landed, keep its scrubbed path in the email body.
   - `sendAdminAlertEmail` also raises a Sentry message carrying only the fixed part of the subject (the text before the first ` · `), with the fingerprint `["admin-alert", <that text>]`. That way an email outage still leaves a trace, and no payment, invoice, event or subscription id reaches Sentry.

**Tests** (red first):
- **Coverage:** a 503 from a route registered before the old position (a test app with a fake `/api/auth/otp/send` answering 503) gives one capture and one alert, keyed on the template.
- **No capture:** a 400 or 404 gives neither, and neither does `GET /api/health/ready` answering 503.
- **One capture per error:** an error that reaches `sentryErrorMiddleware` is captured once, not twice. A tRPC 500 is captured once, with its procedure in the template.
- **No ids:** `/api/referrer-review-links/abc123` answering 500 gives a fingerprint and an alert key without `abc123`.
- **Second channel:** an admin alert whose email fails still produces the Sentry message, without the id.
- **tRPC filter:** it skips `UNAUTHORIZED` and keeps `INTERNAL_SERVER_ERROR`.
- **Order pin:** a source-pin test asserts both middlewares are registered before `registerPaymentWebhookRoutes`.

**Owned paths.** `server/httpErrorCapture.ts` and its test (new), `server/_core/index.ts (switch only)`, and `server/errorAlerting.ts` with its tests. Do not edit `server/sentry.ts` or any sign-in or payment file.

**Done:**
- Tests pass and CI is green.
- Landed.
- One real production event in Sentry, or, if none occurs within a day, the result of `POST /api/admin/alerts/test` and its Sentry link.

## REL-release-verify: after every deploy, a machine checks the live release and says so (lane `deploy-workflows`, Tier 2)
**Why.**
- **SHA-only checks.** A deploy is verified only by its SHA: `deploy-api.yml` checks readiness and the admin gate, and `deploy-pages.yml` reads the `git-commit` meta.
- **Misdirected notices.** Both deploy workflows post their result as a comment on whichever issue is newest.
- **No end-to-end record.** Nothing records that a release was checked end to end.
- **Drift watch is unreliable.** `drift-watch.yml` derives the expected SHA from path filters. That rule has raised false drift again and again (issues #94 and #475, closed; #687 opened Oct 25 and is still open, with PR #689 repairing it). It also runs only every few hours on GitHub's schedule.

**What.**
1. **`scripts/release-smoke.mjs`** (read-only: no sign-in, no writes, no money). Its pure part is `scripts/releaseSmokeCore.mjs`. Given a base URL, an expected API SHA and an expected web SHA, it checks:
   - `/` answers 200 and its `git-commit` meta equals the web SHA;
   - `/api/health` reports `commitSha` equal to the API SHA;
   - `/api/health/ready` is ready;
   - `/api/health/latency` returns `dbRoundTripMs` as a number;
   - `/api/plans/catalog` answers 200 JSON with the keys `client/src` reads;
   - `/sitemap.xml` answers 200;
   - one signed-out API that the client calls only when signed in answers 401 (name it in the PR);
   - the admin sign-in redirect answers 302, as `deploy-api.yml`'s admin gate checks.

   Then a signed-out Playwright pass (`import { chromium } from "playwright"`) runs over the public pages `scripts/live-flow-audit.mjs` lists. It fails on any page error or 5xx response, and on console errors other than the browser's "Failed to load resource" line for a response the check expects (the 401 above). The script prints one line per check and exits non-zero on any failure.
2. **`.github/workflows/release-verify.yml`.**
   - **Triggers:** `on: workflow_run` with `workflows: ["Deploy API (Cloudflare Containers)", "Deploy Web (Cloudflare Pages)"]` (the exact `name:` lines of the two deploy workflows; a test reads both names from the workflow files and fails if they differ), `types: [completed]`, `branches: [main]`. Also `workflow_dispatch` with a SHA input.
   - **Expected SHAs.** Never derive either SHA from path filters.
     - **Web:** the `head_sha` of the newest successful "Deploy Web (Cloudflare Pages)" run on `main`. A push deploys its head commit (`VITE_GIT_COMMIT_SHA: ${{ github.sha }}`), whatever that commit touched.
     - **API:** the commit `refs/tags/api-runtime` points to (`git ls-remote origin refs/tags/api-runtime`). `deploy-api.yml` moves that tag only after a verified runtime deploy, and a run classified `skip` or `pipeline` leaves the API unchanged.
   - **Every completion is checked (D-240).** A completion of either deploy is planned whatever its conclusion (`success`, `failure`, `cancelled`, `timed_out`), against the expected SHAs above: a failed API run never moves `api-runtime`, so the check is of what actually went live. A partial deploy (one kind succeeded for a commit, the other did not) checks each side at its own expected SHA, so neither side's failure is reported as the other's.
   - **Timing:** if a newer deploy of the same kind, or any deploy of the other kind, is queued or running, exit as superseded, with no status and no issue. Otherwise wait up to 45 minutes for the API to serve its SHA (rollouts converge in 15 to 40 minutes), then run the smoke.
   - **Result:** a commit status `release/verified` on that SHA (`permissions: statuses: write, issues: write`). A completion that did not succeed never sets `release/verified` success on its own `head_sha` (that commit did not ship); a passing smoke after it sets no success status there, since its `Deploy failed` incident speaks for it (D-240).
   - **On failure:** create the label first (`gh label create incident --color B60205 --force`), then open or update one issue `Release not verified: <sha8>` labelled `incident`, with the failing lines; two completions that check the same live SHAs update that one issue, never open a second.
   - **On the next verified release:** comment on and close every open `Release not verified` issue.
3. **Both deploy workflows:**
   - Replace the "Notify" step's comment on the newest issue: on failure, open or update one issue `Deploy failed: <workflow name>` labelled `incident` (label created as above); on success, close it if open.
   - In `deploy-api.yml`, give the step "Deploy container image + worker" `id: deploy` (it has none) as the job's addressable deploy step. Leave "Verify administrator sign-in gate" and "Verify active Cloudflare container release" on their existing `if: steps.changes.outputs.classification == 'runtime'`: #748's pinned `scripts/requireGreenRelease.test.ts` (a `wrangler.jsonc` read counts as a production step) and `scripts/assert-api-workflow-selection.sh` both require that condition, and D-238 records the run that proves `always()` fails them. A deploy that fails midway is still seen: the Notify step opens its incident, and `release-verify.yml` runs on the failed deploy's completion and checks what actually went live (D-240: the owned planner `scripts/releaseSmokeCore.mjs` plans that check instead of skipping a trigger that did not succeed).
   - Leave "Update deployed runtime marker" as it is, so a failed deploy never moves `api-runtime`.
4. **`drift-watch.yml` stays for now.** PR #689 repairs #687, and an open registry PR (#690) gives it a row. Once `release/verified` has been green on `main` for 3 days, any session retires it with a one-line row; do not delete it here.

**Tests** (red first, `scripts/releaseSmoke.test.ts`):
- Each check's pass and fail on fixture responses: HTML on a JSON route fails, an unexpected console error fails, a 5xx on a public page fails, and `dbRoundTripMs: null` fails.
- The expected SHAs come from the newest successful web run and the `api-runtime` tag.
- A superseded run exits without a status.
- The `workflows:` names match the deploy files.
- D-238: `deploy-api.yml` keeps `id: deploy`, both verify steps on `if: steps.changes.outputs.classification == 'runtime'`, and the marker step unchanged.
- D-240 (red first on `16a84a7e`): a failed deploy (`failure`, `cancelled`, `timed_out`) plans a live check at the newest successful web head and the unmoved `api-runtime` tag and never marks the failed `head_sha` verified; a partial deploy in both directions (API live but web not, and the reverse) checks each side at its own expected SHA; a newer queued or running run of the same kind, or any of the other kind, supersedes a failed completion with no status and no issue, and two completions over the same live SHAs yield one issue title. This replaces the branch's "a deploy that did not succeed is left to its Deploy failed issue" test.

**Owned paths.** `scripts/release-smoke.mjs`, `scripts/releaseSmokeCore.mjs`, `scripts/releaseSmoke.test.ts`, `.github/workflows/release-verify.yml` (new), and `.github/workflows/deploy-api.yml` and `.github/workflows/deploy-pages.yml` (only the Notify steps and the deploy step id; every existing `if:` line and the `paths:` filters stay as they are). Map lines: "Container/runtime deploy" and "Pages deploy".

**Done:**
- Tests pass and CI is green.
- Landed.
- A link to the first `release-verify` run on `main` with `release/verified` green.

## REL-rollback-skew: the web never runs ahead of its API, and rollback works (lane `deploy-workflows`, Tier 2, after REL-release-verify)
**Why.**
- **Web ahead of its API.** After a release, the web can call an API that is still rolling out (15 to 40 minutes, `scripts/deploy-cloudflare-two-phase.sh`), so new client code may hit routes the live API does not have yet (AGENTS.md invariant 6).
- **The API has a deliberate recovery; the web has none.** `rollback.yml` was rebuilt by #751 (`d550ffd7`, `69dc58bc`) and is no longer the blank-commit path this packet was first written against. It takes `target` (the only choice is `api`), `commit` (a full 40-character SHA), `confirm` (the same SHA again) and `reason`; its `recovery-gate` job runs `scripts/require-green-release.mjs --target api --recovery` from the workflow's own trusted commit, and `recover-api` then refuses a target whose `wrangler.jsonc` has no `API_RELEASE` or whose `Dockerfile` does not copy `commit-sha.txt`, writes the SHA to `commit-sha.txt` (`:107`), stamps `API_RELEASE` (`:129`), deploys with `scripts/deploy-cloudflare-two-phase.sh`, verifies with `scripts/verify-cloudflare-container-release.sh`, and only then moves `refs/tags/api-runtime` (`:149`). It has never run. **What is still missing is the web leg:** `target` offers only `api` and there is no `rollback-web` job, so recovering the web still means redeploying the current `main` rather than the release before it, and nothing checks which web build actually went live.

**What.**
1. **`deploy-pages.yml`.**
   - Give its checkout `fetch-depth: 0`: `scripts/classify-api-changes.sh` diffs `before..head`, and a depth-1 checkout lacks those commits.
   - When the push changed API paths (the classifier prints `classification=runtime`), wait before `pages deploy` until `/api/health/ready` reports this SHA or a descendant of it (`git merge-base --is-ancestor <this sha> <live sha>`). GitHub cancels a queued Deploy API run when a newer push queues behind it, so this exact SHA may never be served.
   - Wait up to 45 minutes; then deploy anyway and open the `Deploy failed` issue saying the API did not converge.
2. **`rollback.yml`.**
   - **Keep the API recovery as it is.** Do not add an automatic target: an earlier draft derived the SHA from the newest Deploy API run, which would replace a typed-twice, green-gated, recorded decision with an automatic choice. The four inputs and the `--recovery` gate stay.
   - Add `web` to the `target` choice (`all` for both legs) and a `rollback-web` job with the same `commit`, `confirm` and `reason` inputs and the same green-CI gate on the target, run from the workflow's own trusted commit.
   - `rollback-web` builds the target ref and deploys it with the same `wrangler pages deploy` commands `deploy-pages.yml` uses, under `concurrency: { group: deploy-pages }` so it never runs beside a web deploy; the API leg keeps `deploy-api`.
   - It verifies the build it put live: read the deployed deployment's commit from Cloudflare and fail loudly when it is not the target. No `web-runtime` tag is needed for that check, but `REL-release-verify` will **not** cover a recovery on its own — it triggers on `workflow_run` of the two deploy workflows and derives the expected web SHA from the newest successful Deploy Web run, and a recovery is neither — which is exactly why this leg verifies itself.
   - A `commit` equal to the live SHA stays accepted, so REL-self-heal can redeploy the live release — but it must pass all four inputs (`target`, `commit`, `confirm`, `reason`), because `confirm` and `reason` are required and a two-input dispatch is refused before any job starts.
   - It stays manual or dispatched; it never runs on push.
3. **One drill.** On a quiet hour, roll the web back to the release before and then forward again, and paste both run links.

**Tests** (red first): the web recovery refuses a dispatch whose `confirm` differs from `commit` or whose `reason` is empty, and one whose target has no green main CI run; it reports failure and leaves the live web alone when the deployed commit is not the target; the API leg keeps its `--recovery` gate and still moves `api-runtime` only after the release verifies.

**Owned paths.** `.github/workflows/deploy-pages.yml` (the checkout and the API wait only), `.github/workflows/rollback.yml`, `scripts/rollbackTarget.mjs` and `scripts/rollbackTarget.test.ts` (new, if the SHA rule needs code).

**Done:**
- Tests pass and CI is green.
- Landed.
- Both drill links.

## REL-heartbeats: the watchdog sees a stopped scheduler (lane `jobs`, Tier 2, after REL-watchdog — an **output** edge, this row reads its probe contract — and D-090-BYOR, a **serialization** edge only: both own `server/_core/index.ts`, so PICKER-owns-scope (D-223 (1)) forces the wait even though nothing of BYOR's output is used)
**Why.** Several jobs stop together when the hourly cron, the tick or the job store fails: payment reconcile, coverage delivery, the D-038 timers and the money check. Nobody hears about it:
- The overdue flag (`OVERDUE_WINDOWS` in `server/scheduledJobsRoutes.ts`, an inline rule) is computed only when someone opens `/api/admin/jobs`, and no client calls it.
- A job that exhausts its attempts is skipped silently.
- The daily money check emails only when it finds something, and is flagged overdue only after 72 hours.

**What.**
1. **One rule for overdue.** Add one exported function `isJobOverdue(job, lastSucceededAt, nowMs, processStartMs)` in `server/scheduledJobsRoutes.ts`, used by both the admin read and the new route.
   - A job is overdue when its last success is older than `min(OVERDUE_WINDOWS * job.windowMs, job.windowMs + 6 h)`. That is 3 hours for hourly jobs, as today, and 30 hours instead of 72 for `daily-money-check`.
   - A job with no `jobRuns` row is not overdue until that span has passed since `processStartMs`. A job that a landing has just registered has not run before the next hourly tick, and without this exception it would page the owner.
2. **`GET /api/health/jobs`** (public, `no-store`, cached 60 s in process) returns `{ ok, jobs: [{ name, overdue }] }` for every registered job. Names and booleans only: no times, counts, ids or errors. `ok` is false when any job is overdue or the job store cannot be read.
3. **Watchdog probe.** In `watchdog/src/core.ts`, add a probe: `/api/health/jobs` answers 200 with `ok: true`. It joins the two-round outage rule.
4. **No deps route.** There is no `/api/health/deps`:
   - a database check would duplicate the latency probe;
   - "configured" flags change only with a deploy, and release verify checks every deploy;
   - `/api/plans/catalog` already answers 503 when Chargebee is unreachable.

**Tests** (red first):
- A job past its span reads overdue on both reads; the daily check is overdue at 30 hours.
- A newly registered job is not overdue during the grace period.
- An unreadable store gives `ok: false` and still answers 200.
- The body holds no field beyond the contract (pin the key set).
- The new probe fails on `ok: false`.

**Owned paths.** `server/healthRoutes.ts`, `server/scheduledJobsRoutes.ts` (the overdue rule only), `server/_core/index.ts (switch only)` (the `registerHealthRoutes` deps only), `watchdog/src/core.ts`, `scripts/watchdogCore.test.ts` and their tests. Map line: "Health and release identity".

**Done:**
- Tests pass and CI is green.
- Landed.
- `curl https://skipwait.me/api/health/jobs` output in the PR after the deploy.

## REL-webhook-auth-alarm: a payment webhook refused for its secret is noticed (lane `payments-ops`, Tier 1)
**Why.** `server/chargebeeRoutes.ts` answers a webhook with a bad or missing secret with a 401 and records nothing. If the secret drifts, every refund, card-validation and renewal event is refused. The hourly reconcile covers only checkouts SkipWait started, and nobody is told.

**What.**
- **New module.** `server/webhookAuthAlarm.ts` exports `recordWebhookUnauthorized(recordActivity)`, which does two things:
  - It writes one `operationalActivityLogs` row (`chargebee.webhook.unauthorized`, outcome `failure`, no headers or body).
  - At most once per 10 minutes per process, it raises `Sentry.captureMessage("chargebee webhook unauthorized", { fingerprint: ["chargebee-webhook-401"] })` from `@sentry/node`, guarded by `isServerSentryActive()`.
- **The 401 branch.** In `server/chargebeeRoutes.ts`, the 401 branch calls it (at most 12 lines).
- **Daily finding.** The daily money check (`server/dailyMoneyCheck.ts`) adds a read-only finding, `webhook_unauthorized_24h`, when such a row exists in the last 24 hours.
- **No behaviour change.** Nothing about accepting or refusing a webhook changes.

**Tests** (red first):
- A 401 writes one row and one capture.
- A burst inside 10 minutes captures once.
- A valid webhook writes neither.
- The money check reports the finding from a seeded row and stays silent without one.

**Owned paths.** `server/webhookAuthAlarm.ts` and its test (new), `server/chargebeeRoutes.ts (switch only)`, `server/dailyMoneyCheck.ts`, and tests named `server/chargebeeRoutes*.test.ts` and `server/dailyMoneyCheck*.test.ts`.

**Done:**
- Red-first tests pass and CI is green.
- The independent review passed (payments file).
- Landed.

## REL-self-heal: when the API container is dead, the watchdog redeploys the live release once (lane `watchdog`, Tier 2, after REL-watchdog and REL-rollback-skew)
**Why.** The Oct 22 outage (error 1101 on every `/api` path while Pages stayed up) ended about 10 minutes after it began, when someone re-ran the last good Deploy API run by hand (`docs/INCIDENT-2026-10-22-api-1101.md`). Detection alone leaves users on a dead API until someone reads an email.

**What.**
- **Trigger.** It acts only when all of these hold:
  - an outage opens;
  - `/api/health/live` and `/api/health/ready` both fail with a 5xx or a Cloudflare error page;
  - `GET /` still answers 200.
- **Action.** The watchdog dispatches `rollback.yml` once, with all four inputs the current workflow requires: `target: api`, `commit` and `confirm` both the SHA of `refs/tags/api-runtime` (a redeploy of the live release, not an older one), and a fixed `reason` naming the watchdog, e.g. `self-heal: the API container stopped answering`. A two-input dispatch is refused at validation, before the recovery gate runs, so the pair must always be sent together.
- **Who allowed the copied confirmation.** Sending `commit` and `confirm` from one machine-read value satisfies the workflow's syntax check; it does not reproduce the human decision that check encodes (the same SHA, typed twice, on purpose). The exception is bounded and named in D-212 (3) — the reliability engineer's self-heal redeploys a dead API container once, automatically — and it is allowed only because the SHA is not chosen: it is `refs/tags/api-runtime`, the release already live and already verified, dispatched only when both health routes are dead, at most once per 6 hours, and reported in the DOWN email and issue. Any other dispatch (an older release, a forward deploy, the web recovery) still needs a person to type the SHA twice. If the owner wants the typed-twice rule absolute, this becomes an owner question under D-200 (6) and the watchdog must stop dispatching instead of filling the field.
- **Never** when only the sign-in, catalog or packs probes fail.
- **Limit.** At most one dispatch per 6 hours (KV `lastHealAt`).
- **Messages.** The DOWN email and issue say "redeploy of <sha8> dispatched".
- **Token.** It needs `GITHUB_ISSUES_TOKEN` with Actions: read and write. Without that secret, it only says "self-heal not configured" in the DOWN alert.

**Tests** (red first):
- It dispatches only on dead-container rounds.
- The dispatch carries all four inputs the workflow requires, with `confirm` equal to `commit`, so the request is not refused at validation.
- At most once per 6 hours.
- Never on a probe-only failure.
- The token never appears in a log or an alert.

**Owned paths.** `watchdog/src/index.ts`, `watchdog/src/core.ts`, `scripts/watchdogCore.test.ts`.

**Done:**
- Tests pass and CI is green.
- Landed.
- A local `wrangler dev --test-scheduled` run against a stub that answers 1101 on `/api/*` shows exactly one dispatch request, made against a dry-run endpoint.

## REL-client-capture: a failed call in the browser is recorded (lane `observability-client`, Tier 1, after FIX-device-signin)
**Why.**
- **Query and mutation errors.** React Query and mutation errors reach only `console.error` (`client/src/main.tsx`).
- **HTML instead of JSON.** Errors containing "Unexpected token '<'" are dropped even there. That is the API answering HTML, which is what an outage looks like.
- **Sign-in and checkout calls.** Many components call `fetch` without `readApiJson` (`client/src/lib/apiResponse.ts`), the sign-in forms and the checkout return among them (`client/src/components/SeekerSignIn.tsx`, `WorkEmailSignIn.tsx`, `ReferrerOtpSignIn.tsx`, `client/src/components/plans/PendingCheckoutReturn.tsx`). `SeekerSignIn.tsx` is left to DEVICE-SIGNIN-passkeys, which rewrites that form and adopts `apiFetch` there.
- **The result.** A seeker whose code send fails sees an error and leaves, and nothing is recorded. The row waits for FIX-device-signin, which edits the same sign-in forms.

**What.**
1. **`client/src/lib/apiFetch.ts`:** a thin wrapper over `fetch`, with the same signature, that never changes what it returns or throws.
   - It reports to `captureClientError` a 5xx, an HTML body where JSON was expected, and a network failure, at most once per route per page load.
   - It tags each report with a route template that `apiFetch` builds itself: the query is dropped, and every path segment that is all digits, or 16 or more characters of `[A-Za-z0-9_-]`, becomes `:id`. The existing `scrubSentryUrl` only redacts four page-link prefixes, not API paths.
2. **`client/src/main.tsx`:** send React Query and mutation errors that are not a 4xx to `captureClientError`, and report the "Unexpected token '<'" case as `api_html_response` instead of dropping it.
3. **Three components:** use `apiFetch` in `WorkEmailSignIn.tsx`, `ReferrerOtpSignIn.tsx` and `PendingCheckoutReturn.tsx`.
   - Their requests, bodies, responses and screens stay exactly the same.
   - The login-rule pins (`client/src/pages/loginRule.test.tsx`, `client/src/pages/signIn.test.tsx`) stay green untouched.

**Tests** (red first):
- `apiFetch` reports a 503, an HTML body and a network error once each.
- It returns or throws exactly what `fetch` did.
- A 400 is not reported.
- The route tag carries no token or id.
- The three components' existing tests pass unchanged.

**Owned paths.** `client/src/lib/apiFetch.ts` and its test (new), `client/src/main.tsx` (the error handlers only), and the three components (the `fetch` call only, switch only).

**Done:**
- Red-first tests pass and CI is green.
- The independent review passed (sign-in surfaces).
- Landed.
- Captures at 1280 and 390 of each sign-in screen show no change.

## REL-ops-invariants: a daily check for failures that still answer 200 (lane `ops-check`, Tier 1, after REL-review-email-retry and D-174-job-catalog)
**Why.** The Oct 22 regressions answered 200: nothing errored, so no error monitor could see them. Some delivery failures are just as quiet. A read-only daily check of the product's own rules finds them from the data, the way the money check (D-065) does for credits.

**What.** A new daily job `daily-ops-check` (`server/dailyOpsCheck.ts`), read-only and modelled on `server/dailyMoneyCheck.ts`: the same window handling, the same owner email only when there are findings, and the same Sentry path on failure. Its findings carry counts and internal row ids only:
1. **`review_email_stuck`:** review email rows still `failed` or `unknown` with `attemptCount >= 5`, or whose `nextAttemptAt` is more than 2 hours past (the retry job is not running).
2. **`request_drought`:** no request created in the last 24 hours while the 7-day daily average is at least 3.
3. **`job_exhausted`:** a `jobRuns` row with `status = 'failed'` and `attempt >= JOB_RUN_MAX_ATTEMPTS` (3, `shared/scheduledJobs.ts`) whose `finishedAt` falls in the last 24 hours. `attempts_exhausted` is a tick outcome only, and `jobRuns` never stores it.
4. **`work_email_codes_unused`:** in the last 24 hours, the purge deleted at least 5 work-email codes that expired unused and none that were consumed.
   - The hourly purge (`server/workEmailOtpPurge.ts`) deletes consumed and expired rows, so it first records one `operationalActivityLogs` row `work_email_otp.purged` with `{ consumed, expiredUnused }` (counts only).
   - A provider that accepts sends but never delivers shows up here and nowhere else, and referrers cannot sign in while it lasts.

It also sends one short "all clear" line every Monday, so a check that stopped running is noticed by its silence. A personal-link leak check is not here: no column records the link (it is inferred in `server/heldAsk.ts` and cleared by a pass), and the e2e journey pins that regression.

**Tests** (red first, rows seeded through the real writers, never hand-written shapes):
- Each finding fires on its case and stays silent on its control.
- The job writes nothing but the purge's count row.
- The email holds counts and ids only.

**Owned paths.** `server/dailyOpsCheck.ts` and its test (new), `server/scheduledJobRegistry.ts (switch only)`, `shared/scheduledJobs.ts (switch only)`, `server/scheduledJobsContract.test.ts (switch only)`, `server/workEmailOtpPurge.ts`. Map line: "Scheduled jobs".

**Done:**
- Red-first tests pass and CI is green.
- The independent review passed (it reads sign-in and request data).
- Landed.
- The first run shows as succeeded.

## REL-synthetic-journeys (architect, Tier 1): signed-in journeys checked on the QA preview
Signed-in flows are never exercised after a release:
- send a referral request;
- a referrer accepts;
- withdraw it, and the referral returns;
- a checkout page opens and is never paid.

Any agent writes the packet first (D-109). It targets the isolated QA preview Worker from #383, not production:
- Basic Auth, fictional data, the Chargebee test site and its own QA database. The repository secrets `SKIPWAIT_QA_DB_*` and `QA_CHARGEBEE_TEST_API_KEY` exist.
- No test accounts or excluded rows in production.
- It runs on the Cloudflare credits D-204 allows, behind a hard stop.

It needs the owner's confirmation of that hard stop (D-204, D-200 (6)), and #383 brought up to date, before any build.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).
REL-watchdog: landed — PR #845, merge c91c7ca1, main CI green (built by Hark · 03f3, landed by Deepseek-V4.1-Flash · 812d). The Worker is not deployed yet and the secret is not the blocker: deploy-watchdog run 41050824580 failed at the KV namespace step with Cloudflare `Authentication error [code: 10000]` - CLOUDFLARE_API_TOKEN has Workers Scripts but no Workers KV Storage scope. Owner, in order: add Account -> Workers KV Storage: Edit; `gh workflow run deploy-watchdog.yml --ref main` (deploys the Worker, then fails the secret check by design); `npx wrangler secret put ZEPTOMAIL_API_KEY --name skipwait-watchdog`; dispatch once more for green. Alert proof still owed. — map: External watchdog: `watchdog/` Worker `skipwait-watchdog`, cron */5, read-only probes of /, /api/health/ready, /api/health/latency, /api/plans/catalog, the Google sign-in redirect and two malformed code sends; two failed rounds email the owner and open an `incident` issue; deployed by `.github/workflows/deploy-watchdog.yml`.
REL-release-verify: done — bc454c4a — built by Hark · 6699, landed by Qoder · 3415 — planVerification checks every deploy completion (failed and partial deploys against what is live, no release/verified on a failed head, supersession first, one incident per live state, D-240); D-238 shape, #748 pins and marker unchanged; full gate green on the main merge, PR #853. — map: after every Deploy API/Deploy Web completion, `.github/workflows/release-verify.yml` smoke-checks the live release (`scripts/release-smoke.mjs`, planner `scripts/releaseSmokeCore.mjs`) and sets `release/verified`; failures open one `Release not verified` incident (REL-watchdog map line records the watchdog deploy state).
REL-webhook-auth-alarm: review — agent/queue/rel-webhook-auth-alarm — 34e0700d — takeover Gemini 3.8 Flash · e4fe 2026-10-31: addressed review findings on Sentry scope isolation (stripping request headers, Authorization, and body canary via withIsolationScope/withScope/eventProcessor) and bounded pending recorder writes (MAX_PENDING_WEBHOOK_UNAUTHORIZED_WRITES = 10); full gate green (pnpm check 0, 70 focused tests pass, design tokens and deploy triggers OK, scope-check 6 owned paths clean). Ready for independent Tier 1 review.
