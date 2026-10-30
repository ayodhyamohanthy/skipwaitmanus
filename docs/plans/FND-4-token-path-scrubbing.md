# Packet FND-4: single-use link tokens never reach Sentry or admin alert emails

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-4` |
| Decisions | BRIEF "How to ship" ("Logs and Sentry never carry tokens, query strings, personal data or single-use links") |
| Risk tier | 2 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd4-token-paths` |
| Depends on | `D-090-BYOR` (Oct 29, §0b): it owns the same Sentry and alert files and is fixing the same leak for its invite route |
| Verified against | `main` `e6b87f8`; re-verified on `main` `06323e5c` by the CEO addendum below, and on `main` `622d1b0f` by §0b |

## 0. CEO addendum, Oct 23 (D-163): this overrides §1 to §3 where they differ
- **Build against `main` now.** `shared/telemetryScrub.ts` does not exist on `main`: create it. Do not wait for PR #324 or read its branch.
- **Current code on `main` `06323e5c`:** `server/sentry.ts:7-13` (`scrubSentryPath`, browser routes only) is used at `server/sentry.ts:59`; `client/src/lib/sentry.ts:17-20` repeats the same four replaces; `server/errorAlerting.ts:99` puts `req.originalUrl` (path **and query**) into the alert. The browser routes with a token are `/fast/:linkCode`, `/share-card/:token` and `/email-review/:linkToken` (`client/src/App.tsx`), plus `/refer/<a>/<b>`.
- **API routes to scrub, all on `main`:** `server/privateReferralRoutes.ts:964` `/api/referrer-fast-track/:linkCode`, `:974` `/api/referrer-fast-track/vanity/:companySlug/:vanityAlias` (ruling: the alias names one referrer, so it is personal data; keep `:companySlug`, replace the alias), `:1021` and `:1030` `/api/referral-share-cards/public/:shareToken` (and `/image.png`), `:1041` `/share-card/:shareToken` (server-rendered), `:1247` and `:1248` `/api/referrer-review-links/:linkToken` (and `/decision`), and `server/_core/storageProxy.ts:82` `/api/documents/by-key/:key`. Ruling: the route answers 404 to everyone today, but a request to it still logs its path, and a storage key can carry a person's file name, so replace it.
- **Replacement text:** `:token` for every replaced segment (§2.1). Existing tests that expect `[redacted]` change to `:token` in the same commit; say so in the pull request. Query and hash are always dropped, on both server and client.
- **Completeness test** (§2.3): read `server/privateReferralRoutes.ts` and `server/_core/storageProxy.ts`, collect every route whose path has a parameter named `linkCode`, `linkToken`, `shareToken`, `token`, `vanityAlias` or `key`, and assert that the scrubber replaces each one. A route added later with such a parameter then fails the test.
- **Out of scope:** `server/assistantRoutes.ts:155` `:tokenId` is a row id, not a secret; leave it.

## 0b. CEO addendum, Oct 29 (Claude Opus 5.5, D-200 (2)): order and owned files
- **Still true on `main` `622d1b0f`.** `scrubSentryPath` (`server/sentry.ts:7-13`, used at `:59`) and `client/src/lib/sentry.ts:16-20` redact only the browser routes, and `server/errorAlerting.ts:99` still sends `req.originalUrl` with its query. The API routes in §0 now sit at `server/privateReferralRoutes.ts:987` and `:997` (fast track, vanity alias), `:1044` and `:1053` (public share card and its image), `:1064` (`/share-card/:shareToken`), `:1276` and `:1277` (review link and its decision), and `server/_core/storageProxy.ts:82`.
- **Build after `D-090-BYOR` lands.** That row owns `server/sentry.ts`, `client/src/lib/sentry.ts`, `server/errorAlerting.ts` and their tests, and its open fix covers a P1 finding of the same kind: server Sentry carries the raw invite token (Hark · 004c on `2e0789f3`). Building both at once would make two writers edit the same scrubber. Start from what BYOR lands, keep its redaction, and move it into `shared/telemetryScrub.ts`.
- **Completeness test:** also read `server/askInviteRoutes.ts`, so BYOR's token route is covered by the same check.
- **Owned files (now in the row):** `shared/telemetryScrub.ts`, `shared/telemetryScrub.test.ts`, `server/sentry.ts`, `server/sentry.test.ts`, `client/src/lib/sentry.ts`, `client/src/lib/sentry.test.ts`, `client/src/lib/apiResponse.ts`, `client/src/lib/apiResponse.test.ts`, `server/errorAlerting.ts`, `server/errorAlerting.test.ts` and `docs/ARCHITECTURE.md` (its known-gap line, now §11 item 3 "Privacy hygiene"; §3 below says item 4). Status goes in `docs/plans/assignments.json`. `DEPLOY-gate-docs-sync` waits for this row because it also owns `docs/ARCHITECTURE.md`.

## 1. Current behaviour
- `server/sentry.ts` `scrubSentryPath` and `client/src/lib/sentry.ts` redact only the browser routes `/email-review/`, `/share-card/`, `/fast/` and `/refer/x/y`, and drop the query.
- The token-bearing **API** routes are not redacted:
  - `/api/referrer-fast-track/:linkCode`
  - `/api/referral-share-cards/public/:shareToken`
  - `/api/referrer-review-links/:linkToken` (and its `/decision`)
- `server/errorAlerting.ts` puts the raw request path in 5xx alert emails.

## 2. Target behaviour
1. **One shared scrubber.** A pure function in `shared/` (for example `shared/telemetryScrub.ts`; the sign-in branch may already add this file, so extend it rather than duplicate it) replaces the token segment of every route above, browser and API, with `:token`, and drops query and hash.
2. **Callers.** `server/sentry.ts`, `client/src/lib/sentry.ts`, `client/src/lib/apiResponse.ts` and `server/errorAlerting.ts` (alert path and dedupe key) all use it.
3. **Completeness.** A test lists every route in `server/privateReferralRoutes.ts` with a `:linkCode`, `:linkToken` or `:shareToken` parameter (read the file in the test, as other source-pin tests do) and asserts that each is covered. A new token route without scrubbing then fails the test.

## 3. Files
`shared/telemetryScrub.ts` (new or extended), `server/sentry.ts`, `client/src/lib/sentry.ts`, `client/src/lib/apiResponse.ts`, `server/errorAlerting.ts`, their tests, the §3b row, and `docs/ARCHITECTURE.md` §11 item 4.

## 4. Definition of done
Gate green; row done. Tier 2.
