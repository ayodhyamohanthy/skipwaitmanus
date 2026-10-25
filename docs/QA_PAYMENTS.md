# QA payments runbook (test gateway only)

Real-money QA is prohibited: agents never make real payments, and the live-site leg is the owner's own (D-065; see docs/PAYMENTS_TEST_RUNBOOK.md for the two-site matrix). Every payment below runs against the Chargebee
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
- Work-email OTP sign-in (`/api/auth/otp/verify`) verifies the login email and
  enrolls a referrer profile on first login for ANY accepted domain. Never sign
  an unverified-seeker fixture in through that endpoint, or it stops being
  unverified. Keep seeker fixtures on the seeker sign-in path.

## 3. Card payment loop (credit pack)

Referrer checkout is refused at runtime (D-055, live since `08d193a0`): a
checkout with `role: "referrer"` on any route answers 403 ("Referrers never
pay on SkipWait. Nothing has been charged.") before any provider call or
intent, behind `REFERRER_PURCHASES_ENABLED = false`
(`shared/referrerPurchases.ts`), and the referrer pages show no pay button.
D-196 adds an opt-in paid referrer plan (level-matched first access); it is
not built, so there is no referrer QA loop yet. QA every purchase as the seeker.

1. Sign in as QA Seeker, open `/premium?role=job_seeker`.
2. Start checkout on a credit pack (packs are the only thing sold, D-146; the
   single credit is not sold while packs are on; see `docs/PRICING.md` for
   the live packs). Pay on the Chargebee hosted page with a
   **test card**: `4111 1111 1111 1111` (Visa, any future expiry/CVC).
   Full test-card list: Chargebee docs → test cards.
3. Expect redirect to `/premium?role=job_seeker&payment=pending`, then
   "referral credits are ready" with the balance up by the pack's credit
   count. (Code and copy still say "credits"; the buyer-facing name becomes
   "referrals" in the terminology lane, D-173.)
4. Promo grants are off until the #35 rebuild (`PROMO_GRANTS_ENABLED=false`,
   `.env.example`): expect no promo credits. Only with the flag on does the
   first verified payment grant **5 promo credits** (30-day expiry):
   check `promoCreditsRemaining: 5` in `/api/credits/summary`.

## 4. Webhooks without a public URL

Chargebee cannot reach localhost. Options, easiest first:

- **Dashboard test event**: Chargebee test site → Webhooks → Send test
  event (`payment_succeeded`) to the staging URL when one exists.
- **Local simulation**: POST a `payment_succeeded` body to
  `localhost:3000/api/chargebee/webhook` with header
  `Authorization: Basic <base64("skipwait:<CHARGEBEE_WEBHOOK_SECRET>")>`
  and the `hostedPageId`/`passThruContent` of a pending intent created in
  step 3. Expect `{"received": true}` and exactly one fulfillment of the pack (replay the
  same `eventId` twice: second answer must be `duplicate`).
- **Recovery path**: return from checkout with an empty session (clear
  `sessionStorage`) and confirm `/premium` re-checks via
  `/api/chargebee/credit-recovery`.

## 5. Plans and passes

No plan or pass is sold, so there is no subscription QA loop today.
- Passes and Keep warm are not sold (D-146; `PASS_SALES_ENABLED` stays false,
  D-084). `POST /api/chargebee/subscription-checkout` (`server/kitCheckout.ts`)
  answers `409 not_available_yet` for them and opens no page.
- The D-132 plans (Entry level / Mid level / Senior level Referrers, D-152)
  are built and stay off behind their flags (D-135). Their test-site QA comes
  with the enable path in `docs/PRICING.md`.
- A legacy Pro/Max body (`{plan: "pro" | "max"}`) is refused with 410
  `plan_retired` ("Nothing has been charged") before any provider call or
  intent (D-067, live in `08d193a0`).

## 5b. Gift subscriptions (retired)

Retired with the legacy monthly plans (D-067): the gift checkout could only sell
those removed plans, stays gated off (503 whatever any env says, and the
`GIFT_CHECKOUT_ENABLED` key is gone;
`docs/BUGFREE_GATE.md` 4.9) and has no QA loop. No current plan or pack can
be gifted.

## 6. Never do this

- No production `DATABASE_URL`, `BILLING_ENV=live`, or live keys in QA.
- No real cards, no matter how small the amount.
- No QA traffic against `https://skipwait.me` except read-only page loads.
