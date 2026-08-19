# Global Platform Standards Audit

> **Working product and compliance analysis, not formal legal advice.** A qualified privacy, employment, and payments counsel should review the jurisdiction-specific implementation before a global launch.

## External baseline findings

| Domain | Authoritative baseline | Product interpretation for skipwait.me |
| --- | --- | --- |
| Accessibility | W3C identifies WCAG 2.2 as the current web accessibility standard. Its testable criteria are organized under the **perceivable, operable, understandable, and robust** principles, with A, AA, and AAA conformance levels.[1] | Use WCAG 2.2 AA as the engineering target: keyboard-operable controls, visible focus, sufficient contrast, semantic labels, error descriptions, reduced-motion support, and mobile target sizes. Automated checks must be supplemented by manual keyboard and screen-reader QA. |
| Privacy rights | The EDPB identifies rights to be informed, access, rectification, erasure, restriction, portability, objection, and safeguards around solely automated decisions. It also says controllers should make rights easy to exercise, maintain data-flow awareness, be transparent, document requests, and respond within the applicable period.[2] | Make candidate document deletion, account-data export, privacy-policy visibility, and a traceable privacy-request channel first-class platform features. Do not use automated eligibility or referral decisions without transparent, human-controlled safeguards. |
| Application security | OWASP ASVS 5.0 provides a commercially workable, open verification standard for testing web application security controls and establishing confidence in a web application’s security.[3] | Maintain a traceable ASVS-aligned checklist for authentication, authorization, input handling, file upload, error handling, logging, dependency upkeep, and security regression tests. The existing participant-only conversation and exact-company checks are useful evidence, not a substitute for broader verification. |
| Payment-data boundary | PCI DSS defines baseline technical and operational requirements for entities that store, process, transmit, or can impact the security of payment account data.[4] | Keep card and payment-account data outside skipwait.me’s application boundary by using provider-hosted checkout. Maintain webhook verification, idempotent server-side fulfillment, provider access review, and a payment incident/reconciliation procedure. |

## Initial global-readiness direction

The next audit steps must examine product implementation, not only policy: identity and access control, resume/document lifecycle, payment-provider readiness, accessibility conformance, incident handling, reliability, data portability and deletion, anti-abuse controls, internationalization, and operational support. “Global standard” is treated as a staged readiness program, not a claim of legal certification.

## Current-product readiness assessment

| Domain | Verified current state | Readiness gap | Priority |
| --- | --- | --- | --- |
| Role access and privacy | Exact-company routing, exclusive claims, candidate document authorization, and post-approval participant-only conversations are protected server-side. Administrator logs intentionally exclude private content. | Continue adversarial authorization regression coverage as the workflow evolves. | Maintain |
| Document security | Documents are stored outside the public web root, scoped to authenticated owners or assigned Referrers, served through signed URLs, named safely, and capped at 10 MB. | The upload route currently accepts caller-supplied MIME types without a server-side business allowlist or binary signature validation. It has no malware-scanning integration.[5] | **P0** |
| Privacy controls | Work-email visibility is restricted and public UI does not expose Referrer identity. | No user-facing privacy notice, data-export flow, deletion/erasure request flow, retention policy, or privacy-request case record exists. | **P0** |
| Trust and safety | Private routing and minimized administrator activity support a trust-first design. | No public trust/safety surface, abuse-report channel, escalation queue, or transparent moderation/review policy exists. | **P1** |
| Accessibility | Mobile-first layouts, semantic button labels in many flows, visible focus utilities, and reduced-motion-aware success motion exist. | No published WCAG 2.2 AA target, accessibility statement, formal keyboard/screen-reader checklist, or automated accessibility regression gate exists. | **P1** |
| Payments | Regional INR/USD routing, hosted provider checkout, webhook validation, idempotent server-side fulfillment, reconciliation, and account-owned cancellation exist. | The provider activation and end-to-end operating runbook must be maintained per production domain; tax, invoice, refund, and jurisdiction-specific consumer policy remain business/legal decisions. | **P1** |
| International product | English mobile PWA, timezone-safe UTC persistence, India/global pricing, and automatic INR/USD route selection exist. | No translation architecture, locale-aware date/number formatting standard, market-specific policy configuration, or regional support routing exists. | **P2** |
| Reliability and operations | PWA continuity, offline draft messaging, privacy-safe error alerting, administrator activity, token recovery, and flow health exist. | No public status surface, formal incident runbook, service-level indicators, or support-case lifecycle exists. | **P1** |
| Performance and delivery | The production PWA builds successfully and includes a service worker. | The production JavaScript bundle remains larger than the typical initial-load target; route-level code splitting and performance budgets are not yet established. | **P2** |

## Foundation release — implemented and verified

The following controls are now implemented in the platform. Resume uploads use an explicit business allowlist for PDF, Word, PNG, and JPEG documents; the server checks filename and declared MIME agreement, verifies binary signatures before storage, retains the 10 MB cap, and rejects mismatched or unsupported payloads. The client mirrors the allowlist so a Job Seeker receives immediate recovery guidance rather than waiting for an upload failure.[5]

A public **Privacy & Trust** hub explains the exact-company, document, conversation, and hosted-checkout boundaries in plain language. Signed-in users can download a private JSON export of their account data and initiate an account-deletion review. Requests are recorded in a restricted administrator queue, are idempotent while active, and must be deliberately resolved; the flow does not falsely promise instant destruction of information that may require security, payment, or legal review.[2]

The service now emits baseline browser security headers, removes the Express fingerprint header, and blocks browser access to unneeded camera, microphone, geolocation, payment, and USB capabilities. The production dependency graph was upgraded and re-audited with **zero reported critical, high, moderate, or low production vulnerabilities** at the time of verification. The security upgrade included current AWS SDK, tRPC, ORM, HTTP-client, markdown-rendering, charting, and Express parsing dependency fixes.[3]

Automated verification for this release covers document signature rejection, protective HTTP headers, privacy export authentication, erasure-request initiation, administrator-only request review, public trust-page navigation, privacy controls, and unsupported-file recovery. The full suite passed with **159 tests across 55 files** (two external credential checks intentionally skipped), TypeScript passed, and the production PWA build completed successfully.

## Staged roadmap

### Foundation release — completed in this version

1. Completed: server-side document allowlist and binary signature verification now reject unsupported and mismatched uploads before storage.
2. Completed: a public trust and privacy hub describes the private referral model and links directly to account controls.
3. Completed: authenticated account-data export and deletion-review initiation are recorded for administrator handling without silently deleting payment or audit data.
4. Deferred to the next release: add a user-facing report-safety channel for a private request, message, or opportunity, with administrator-only metadata review and no public exposure of reported content.

### Global operating release — next

1. Publish reviewed privacy, terms, refund, and cancellation notices for each launch jurisdiction; complete provider production activation and webhooks on the canonical domain.
2. Establish a documented incident response, data-retention, vulnerability disclosure, and support-response process.
3. Add WCAG 2.2 AA manual and automated QA gates, accessibility statement, and an accessible support path.
4. Add translation/localization infrastructure, locale formatting, and regional product-policy configuration before non-English market expansion.

### Scale release — after operating evidence

1. Add status monitoring, service-level indicators, operational dashboards, and route-level performance budgets/code splitting.
2. Add a human-reviewed trust and safety queue, anti-abuse signals, and transparent resolution workflows.
3. Complete formal penetration testing, dependency/supply-chain scanning, provider review, data-processing agreements, and jurisdiction-specific legal review.

## References

[1]: https://www.w3.org/WAI/standards-guidelines/wcag/ "W3C Web Content Accessibility Guidelines overview"
[2]: https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en "European Data Protection Board — Respect individuals’ rights"
[3]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"
[4]: https://www.pcisecuritystandards.org/merchants/ "PCI Security Standards Council merchant resources"
[5]: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html "OWASP File Upload Cheat Sheet"
