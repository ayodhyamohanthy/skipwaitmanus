# Packet TRUTH-1: the public impact number counts accepted asks only, never expired ones

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `TRUTH-1` (add it under "Drift from approved decisions") |
| Decisions | BRIEF "Privacy and trust" (no invented numbers), D-066 (3), D-076 (8) |
| Risk tier | 2 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/truth1-impact` |
| Depends on | nothing; parallel-safe with every lane |
| Verified against | `main` `e6b87f8` |

## 1. Current behaviour (verified)
- `getPublicReferralImpact` (`server/db.ts`, about line 2667) counts asks whose status is `approved`, `intro_made`, `interview`, `offer` **or `closed`**. It is served unauthenticated by `GET /api/referral-impact` (`server/privateReferralRoutes.ts`).
- An expired ask is also `closed`: `expireStalePendingReferralRequest` writes `toStatus: "closed"`. A claimed ask that expired without acceptance is `closed` **with** `referrerId` still set. So the number includes every expired ask.
- No live screen renders it today; only screenshot fixtures in `scripts/kit-screens/fixtures/` mention it. It is still a public, false number.

## 2. Target behaviour
1. `acceptedReferrals` counts asks that a referrer accepted and that were not undone:
   - the current status is `approved`, `intro_made`, `interview` or `offer`;
   - **or** the status is `closed` **and** an acceptance transition exists for the ask (`referralTransitionEvents.resultingStatus = 'approved'`).
   - Expired asks (closed with no acceptance) never count, and nor do asks reopened by D-038-B (back to `pending`).
2. The route's response shape is unchanged (`{ acceptedReferrals: number }`).
3. A code comment above the function cites D-066 (3): a *referral* count (`intro_made` or later) is a different number. Add it when a surface needs it; never relabel this one as "referrals made".

## 3. Tests first (`server/db.publicReferralImpact.test.ts`, new; use the in-memory test kit or a small fake, as in `server/db.referrerImpact.test.ts`)
1. An expired unclaimed ask (closed, no referrer) is not counted.
2. A claimed-then-expired ask (closed, referrer set, no acceptance) is not counted.
3. A hired ask (closed after acceptance) is counted.
4. `approved`, `intro_made`, `interview` and `offer` are counted; `pending`, `withdrawn` and `declined` are not.
5. The route returns the same shape; the existing route tests stay green.

## 4. Files
`server/db.ts` (`getPublicReferralImpact` only), the new test, the §3b row, and `docs/ARCHITECTURE.md` §11 item 3 (remove it once fixed).

## 5. Definition of done
Gate green; push; API CONVERGED; `curl https://skipwait.me/api/referral-impact` answers. Row done. Tier 2.
