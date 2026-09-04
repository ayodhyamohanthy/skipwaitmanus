# PRODUCT.md — skipwait.me

## What it is
skipwait.me is a private job-referral network. Job seekers request referrals from verified employees at target companies; verified referrers (work-email OTP) review and accept; admins moderate. Monetized via credit packs (Razorpay INR / PayPal USD) and subscriptions (Chargebee).

## Who it's for
- **Job seekers**: want a referral at a specific company, privately. Trust and identity-hiding are the product.
- **Referrers**: employees who share hiring signals and review requests on mobile, in spare minutes. Speed and safety matter.
- **Admins**: moderate the unified approval queue, payments, refunds, and flow health.

## Voice
Calm, factual, protective. "Identity stays hidden." No hype. Short sentences.

## Core surfaces
1. Seeker: `/` → `/start` (3 steps) → `/request` → success → `/requests`
2. Referrer: `/referrer` (OTP) → `/inbox` → preview → accept/decline → `/conversation/:id` → `/referrer/impact`
3. Shared: `/wall`, `/post-opportunity`, `/share`, `/notifications`, `/settings`
4. Admin: `/admin/{activity,approvals,approvals/:kind/:id,payments,flow-health,privacy-requests,token-recovery}`

## Never break
- Identity hiding on every referral surface ("Identity hidden" chips)
- The privacy copy on success/confirmation screens
- Credit accounting (3 free monthly; withdraw refunds)
- WCAG AA contrast (verified 4.55–17.85 on all key pairs)
