# No-Coverage Referral Follow-Up

## Operating behavior

Every valid Job Seeker referral request now reserves **one Job Seeker credit**, including when the target employer has no matching verified employee on skipwait.me. The request, resume attachment references, and employer domain remain private. The request stays pending for future company coverage and for administrator-led outreach; no employee identity or candidate document is exposed through the activity log.

| Event | Job Seeker experience | Administrator activity entry |
| --- | --- | --- |
| Matching verified employee exists | The request is privately delivered to eligible employees. | `company_referral.created` with the company domain and recipient count. |
| No matching verified employee exists | The request is queued, one credit is used, and the Job Seeker can invite a trusted employee. | `company_referral.created` plus `company_referral.manual_follow_up_queued`. |

## Administrator follow-up

The Activity Log at `/admin/activity` is the manual follow-up queue. Search for `manual_follow_up_queued` or the employer domain. Entries include the actor, company domain, request reference, recipient count, and the fact that a credit was reserved. They intentionally exclude candidate messages, target URLs, document names and contents, OTPs, invite codes, payment credentials, and other sensitive content.

Authenticated material actions are also recorded across referral requests, documents, notifications, privacy actions, administrator actions, and billing checkout/cancellation actions. The log is an operational record for support and consent-based outreach; it is not a messaging or surveillance system.
