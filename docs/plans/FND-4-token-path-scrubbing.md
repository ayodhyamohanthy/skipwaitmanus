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
| Depends on | nothing (D-163, Oct 23): it lands before the seeker sign-in lane (1.2, PR #324, owner-held), which merges it at its own landing and extends `shared/telemetryScrub.ts` instead of duplicating it |
| Verified against | `main` `e6b87f8` |

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
