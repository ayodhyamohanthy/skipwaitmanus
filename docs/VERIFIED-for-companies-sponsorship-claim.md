# Verification: is `/for-companies` making a false public claim?

**Checked 2026-10-16.** The strategy note (item 7, "Fix first") asserts two things:

> *"/for-companies claims 'no paid priority — enforced in the product' while sponsored-first ordering
> is live, and it advertises a $199/mo plan with nothing behind it. Both are false public claims
> today."*

## Claim A — "sponsored-first ordering is live" → NOT SUPPORTED

**The referral queue is ordered by arrival time and nothing else:**

```ts
// server/askExpirySweep.ts:32
.orderBy(asc(referralRequests.createdAt), asc(referralRequests.id))
```

Searched every `orderBy` in `server/` for a referral-review or referral-queue ordering: no
reputation, payment, sponsorship or tier column participates. The queue is FIFO.

**`sponsoredTier` exists, but it is an *employer-side advertising tier on job postings*, not referral
priority.** Where it is read:

| site | ordering | who sees it |
|---|---|---|
| `listSponsoredCompanyOpportunities` (`server/db.ts:3540`) | `desc(sponsoredUntil)` | **`/api/admin/sponsorships` only** |
| `listEmployerOpportunities` (`server/db.ts:3546`) | `desc(createdAt)` | the employer's own list |

`sponsoredTier` is **never** used in any seeker-facing query. The `/sponsor` route
(`/api/employer/opportunities/:id/sponsor`) sets `sponsoredUntil`/`sponsoredTier` on a
`companyOpportunities` row — an employer featuring a vacancy.

**Claim B — "no paid priority, enforced in the product" → TRUE as worded**

`client/src/pages/ForCompanies.tsx:14` reads *"Candidates never pay: No commissions, no paid
priority, no pay-to-win — enforced in the product."* It is a claim about **candidates**, and the
FIFO queue is what enforces it.

**Conclusion: the two statements describe different products.** An employer paying to feature a job
posting is advertising a vacancy; a candidate buying their place in the referral line is paid
priority. D-006 forbids the second. The first exists, and the second does not.

## Claim C — "advertises a $199/mo plan with nothing behind it" → TRUE, AND DELIBERATE

`client/src/components/employer/employerPlans.ts`:

```
{ id: "referral_programme", name: "Referral programme", price: { kind: "from", monthlyUsd: 199 }, featured: true }
```

The file's own docstring states it plainly:

> *"Every plan is sales-led: 'Get started' opens the demo request. **No self-serve checkout or
> employer entitlement exists yet.**"*

So the $199 is real and there is no checkout — but that is the design, documented in the module, not
an oversight. `employerPlans.test.ts` guards it against drift from `PRICING.md`.

## Verdict

**Item 7's "Fix first" should be dropped.** It would burn time correcting a public claim that is
accurate, and the underlying concern (D-006) is already enforced by the FIFO queue.

## What this does not clear

- **Web Push is genuinely absent** — no subscription storage, no VAPID, no service worker.
- **`sw-theme` is genuinely absent** — and needs a design decision.
- **i18n / RTL is genuinely absent.**
- The honest risk is the opposite of the one flagged: when `listSponsoredCompanyOpportunities` stops
  being admin-only and starts feeding a seeker-facing list, the claim stops being true **at that
  moment**. The guard belongs there.
