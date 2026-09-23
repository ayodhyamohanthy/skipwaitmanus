# QA payments runbook (test gateway only)

Real-money QA is prohibited. Every payment below runs against the Chargebee
TEST site. Nothing here touches production billing.

## 1. Environment

```bash
# .env for local QA (never commit .env)
BILLING_ENV=test
CHARGEBEE_SITE=<test-site-from-chargebee-dashboard>
CHARGEBEE_API_KEY=<test-site-api-key>
CHARGEBEE_WEBHOOK_SECRET=<test-site-webhook-secret>
DATABASE_URL='mysql://... (local or staging — never prod)'
JWT_SECRET='<any-long-random-string>'
VITE_APP_ID=skipwait
```

Start the app: `pnpm dev` (dev-auth plane is active without WorkOS keys).

## 2. Test accounts

```bash
DATABASE_URL='...' JWT_SECRET='...' VITE_APP_ID=skipwait \
  pnpm tsx scripts/seed-test-accounts.ts [--reset]
```

Creates `QA Seeker` (job seeker, onboarded), `QA Referrer` (pre-verified
`acme.example` work email, onboarded) and `QA Admin`, all marked
`loginMethod=test_seed`. Prints fresh `app_session_id` cookies (30-minute
TTL — re-run to rotate). Use the cookie as `app_session_id=<token>` or
`Authorization: Bearer <token>`.

Notes:
- The seeded referrer bypasses OTP (pre-verified profile). To QA the OTP
  flow itself you need a real inbox: set `ZEPTOMAIL_API_KEY` and use a
  company address you control.
- Test emails use `.example` domains: they can never receive real mail and
  can never collide with real users.

## 3. Card payment loop (credit pack)

1. Sign in as QA Seeker, open `/premium?role=job_seeker`.
2. Start checkout (1 credit). Pay on the Chargebee hosted page with a
   **test card**: `4111 1111 1111 1111` (Visa, any future expiry/CVC).
   Full test-card list: Chargebee docs → test cards.
3. Expect redirect to `/premium?role=job_seeker&payment=pending`, then
   "referral credits are ready" with balance +1.
4. First verified payment also grants **5 promo credits** (30-day expiry):
   check `promoCreditsRemaining: 5` in `/api/credits/summary`.

## 4. Webhooks without a public URL

Chargebee cannot reach localhost. Options, easiest first:

- **Dashboard test event**: Chargebee test site → Webhooks → Send test
  event (`payment_succeeded`) to the staging URL when one exists.
- **Local simulation**: POST a `payment_succeeded` body to
  `localhost:3000/api/chargebee/webhook` with header
  `Authorization: Basic <base64("skipwait:<CHARGEBEE_WEBHOOK_SECRET>")>`
  and the `hostedPageId`/`passThruContent` of a pending intent created in
  step 3. Expect `{"received": true}` and exactly one credit (replay the
  same `eventId` twice: second answer must be `duplicate`).
- **Recovery path**: return from checkout with an empty session (clear
  `sessionStorage`) and confirm `/premium` re-checks via
  `/api/chargebee/credit-recovery`.

## 5. Subscriptions

`/plans?role=job_seeker` → Pro/Max checkout with a test card → plan
activates on webhook; cancel schedules end-of-term. First activation also
earns the 5 promo credits (same rule as packs, granted once per account).

## 5b. Gift subscriptions (test gateway only)

Requires Chargebee TEST site keys (founder-blocked until provided); until
then the loop below runs against fixtures/mocks only.

1. Buyer: `/plans` → "Gift Pro" → gift hosted checkout → pay with a test
   card. Buyer wallet MUST NOT change; `/api/chargebee/gifts/mine` shows
   the receipt under `sent` with `fulfillmentStatus: pending`.
2. Recipient (no account yet): sign up with the receiver email, verify it,
   open `/plans` → "You received a gift" → Claim → plan activates
   (`subscriptionStatus: non_renewing`, monthly allowance credited).
3. Recipient (existing verified account): auto-credited on the
   `gift_claimed` webhook; claiming again returns `duplicate`.
4. Negative: claim from a different signed-in account → 403 and no credit;
   expired gift → `expired`, never credited.
5. Local simulation without provider: POST `gift_scheduled` then
   `gift_claimed` bodies (see `server/chargebeeGiftRoutes.test.ts`
   fixtures) to `/api/chargebee/webhook` with the webhook secret; replay
   each `eventId` twice. Gift activation MUST NOT grant promo credits
   (promo interplay belongs to the #35 rebuild).

## 6. Never do this

- No production `DATABASE_URL`, `BILLING_ENV=live`, or live keys in QA.
- No real cards, no matter how small the amount.
- No QA traffic against `https://skipwait.me` except read-only page loads.
