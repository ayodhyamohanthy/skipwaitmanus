# skipwait.me Pre-Launch Checklist

**Purpose.** This is the operating checklist for a controlled public launch of skipwait.me. It distinguishes the **launch blockers** that must be complete before accepting real traffic and payments from the work that should follow during the first operating cycle. A completed software build is necessary but not sufficient: launch also requires correct domain ownership, live payment delivery, operational ownership, and clear user protections.

> **Current verified application baseline.** The release has passed the full quality gate: TypeScript, 61 automated test files, 177 passing tests, two intentional provider-dependent skips, production PWA build, published API boundary checks, and desktop/mobile route-shell review. The remaining technical blocker is binding `skipwait.me` to this project and completing the canonical live Chargebee webhook delivery test.

## A. Mandatory go-live gates

| Priority | Gate | Accountable owner | Done means | Current state |
| --- | --- | --- | --- | --- |
| **P0** | Bind the canonical domain | Founder / domain owner | `skipwait.me` is bound in the project’s **Settings → Domains** panel, loads the current app over HTTPS, and no longer points to the legacy deployment. | **Open — external account action required.** |
| **P0** | Cut over live billing to the canonical host | Engineering | After domain binding, `CHARGEBEE_LIVE_DOMAIN` is switched from the temporary managed hostname to `skipwait.me`; managed and preview hosts remain on test credentials. | Prepared and regression-tested; perform immediately after P0 domain binding. |
| **P0** | Move and verify the live Chargebee webhook | Engineering + billing owner | Webhook receiver is `https://skipwait.me/api/chargebee/webhook`; unsigned POST returns 401; the live Chargebee dashboard records an authenticated provider-originated 2xx test delivery; it does not credit an account. | Prepared; requires domain binding and live Chargebee dashboard login. |
| **P0** | Run one controlled real-money payment per route | Billing owner + Engineering | One India/INR Razorpay and one international/USD PayPal payment succeed with legitimate buyer accounts; Chargebee event, stored checkout reconciliation, webhook delivery, and exactly-one entitlement change reconcile. Approved refunds/cancellations are documented. | Not yet performed on live; do not simulate or fabricate. |
| **P0** | Confirm customer-facing legal and commercial disclosures | Founder + legal/compliance advisor | Published, jurisdiction-appropriate Terms, Privacy Notice, Refund/Cancellation policy, support contact, subscription renewal/cancellation disclosure, and applicable tax/invoice disclosures are linked before checkout and account commitment. | Needs founder/legal review. |
| **P0** | Confirm production authentication settings | Engineering + Clerk owner | Canonical production origin, redirect URLs, and allowed sign-in paths are configured; personal Job Seeker sign-in and company-email-only Referrer OTP are verified with real controlled accounts. | Code is covered; real canonical-domain verification is pending. |
| **P0** | Prove data-recovery and incident access | Engineering + administrator | Administrator access works, database/storage recovery procedure has an accountable owner, and a least-privilege emergency contact path exists. A restore drill is documented without using customer data. | Procedure and access confirmation required. |
| **P0** | Establish minimum support operations | Founder + administrator | `ayodhya@skipwait.me` can receive and act on privacy-safe error alerts; support inbox response target, escalation process, referral-dispute policy, and abuse-report route are documented. | Needs operating-owner confirmation. |

## B. Launch-week readiness gates

| Priority | Gate | Evidence required | Why it matters |
| --- | --- | --- | --- |
| **P1** | Start with focused company coverage | A named initial company cohort, one accountable Referrer acquisition plan per company, and realistic target-role links. | A referrals marketplace is useful only when requests reach legitimate, relevant employee supply. Do not launch broadly into companies with no coverage and no follow-up plan. |
| **P1** | Set an operating service standard | A written first-review target, for example a manual follow-up window for uncovered requests and a decision-response target for claimed requests. | Clear expectations protect Job Seekers from uncertainty without pressuring Referrers. |
| **P1** | Test the first 10-user concierge loop | Invite a small, consented group of Job Seekers and Referrers; observe onboarding, OTP, request creation, review, document access, accept/decline, and post-acceptance communication. Log friction without storing private content. | A controlled cohort exposes real operational gaps before public acquisition amplifies them. |
| **P1** | Verify deliverability | Test account, OTP, error-alert, and notification emails on major inbox providers. Confirm sender alignment for `noreply@updates.skipwait.me`, suppression handling, and a human support reply path. | Authentication and notifications are core workflow infrastructure, not marketing extras. |
| **P1** | Define live monitoring routines | Daily review of employer-resolution failures, encrypted upload failures, OTP failures, webhook anomalies, subscription changes, no-coverage requests, and privacy requests. | The application already records privacy-safe activity; the launch team needs an operating cadence around it. |
| **P1** | Configure fraud and user-safety response | Review tokens, self-invite/duplicate-account flags, referral abuse reports, impersonation reports, and suspicious payment recovery actions. Keep Referrer decisions voluntary and free. | Trust is the product’s durable moat. |
| **P1** | Establish analytics governance | Approve the launch metrics, retention definitions, access limits, and event-retention policy. Track aggregate funnel behavior; do not use resume content, private messages, OTPs, or Referrer identities as analytics data. | Enables iteration without compromising the platform’s privacy promise. |

## C. Required launch dashboard

The administrator should review these aggregated metrics daily during the first two weeks. Each measure should have an owner and a response playbook; the goal is to repair workflow value, not generate artificial engagement.

| Metric | Healthy direction | Response if weak |
| --- | --- | --- |
| Job link → employer identified | Increasing | Fix evidence-backed employer routing or make a careers-page recovery prompt clearer. Never guess an employer. |
| Identified company → available verified Referrer | Increasing for the launch cohort | Recruit one trusted, real employee per target company; use recipient-benefiting invitations only. |
| Claimed request → approve/decline | Timely, respectful resolutions | Improve candidate-context clarity and Referrer decision guidance; never pressure approvals. |
| Approved request → voluntary progress update | Increasing only where useful | Review whether the private conversation and factual progress actions are clear; do not add compulsive reminders. |
| Resume upload completion | Stable/high | Prioritize gateway, device, MIME, or browser-specific evidence; preserve private encrypted upload handling. |
| Company-email OTP completion | Stable/high | Check deliverability and company-domain rules; do not weaken the work-email-only rule. |
| Checkout → verified entitlement | Exactly once per successful provider event | Investigate webhook, reconciliation, and provider events immediately; never credit from browser-return state. |
| No-coverage follow-up resolution | Improving | Perform manual coverage outreach and update the coverage plan rather than silently accumulating requests. |

## D. Explicit launch decisions to make before opening acquisition

| Decision | Recommended launch position |
| --- | --- |
| **Launch geography** | Begin with the jurisdictions where the founder can support users, provide required disclosures, and operate payments. Do not call the product globally launched solely because the UI supports INR and USD. |
| **Launch supply strategy** | Launch company-by-company or community-by-community, with verified employee supply recruited before paid Job Seeker acquisition. |
| **Launch audience** | Start with a small consented cohort and expand only after the full job-request-to-resolution loop works at the chosen service standard. |
| **Marketing promise** | Promise a private request to a verified matching employee and transparent status—not a job, interview, or guaranteed referral. |
| **Growth rule** | Invite only people who receive a specific benefit; rewards remain conditional on verified, non-self, real downstream participation. No contact scraping, forced sharing, fabricated testimonials, or fake activity. |
| **Referrer economics** | Reviewing, declining, approving, and accepted-request follow-up remain free. Revenue comes from Job Seeker request capacity, not employee participation. |

## E. Stage after launch; do not delay the controlled beta for these alone

| Workstream | First milestone |
| --- | --- |
| Performance | Address the non-blocking JavaScript chunk-size advisory with route-level code splitting after measuring real loading performance. |
| Accessibility | Commission a keyboard, screen-reader, and color-contrast audit with real users; maintain automated regressions for resulting fixes. |
| Localization | Localize only after validating a specific market’s language, support, policy, and payment requirements. Avoid machine-translated hiring-critical content without review. |
| Employer integrations | Add ATS/careers integrations only when they improve verified employer routing and consent; preserve exact-company access boundaries. |
| Lifecycle communications | Add opt-in, factual reminders driven by real referral status. Do not add streaks, public feeds, or notification pressure. |
| Advanced reporting | Expand aggregate flow-health reporting only with privacy review and clear operational actions. |

## F. Launch sequence

1. **Complete the P0 canonical-domain and live-webhook gates.** This is the present technical blocker.
2. **Perform the two controlled live payment checks** and retain only the minimum reconciliation evidence.
3. **Publish or review the legal, support, and incident-operating materials.**
4. **Recruit the first company cohort** and rehearse the end-to-end journey with a consented group.
5. **Open a closed beta**, monitor the dashboard daily, and repair any material workflow failure before expanding acquisition.
6. **Expand company coverage deliberately** based on verified supply and real request outcomes, not vanity sign-up volume.

## References

[1]: https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/gateway_settings "Chargebee: payment gateway settings"
[2]: https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/payments_with_paypal "Chargebee: payments with PayPal"
