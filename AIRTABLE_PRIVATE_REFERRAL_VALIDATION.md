# Isolated Private Referral Lifecycle Validation

**Validation date:** 2026-08-14  
**Isolated ledger:** `skipwait — Disposable Authorization Verification` (`appBAPiTQjcF2qG7K`)  
**Scope:** Test evidence only. No live application rows, applicant documents, payment providers, or production identities were accessed or modified.

## Fresh verification result

`server/privateReferralRoutes.integration.test.ts` completed successfully with two passing HTTP-level tests. The private-referral test verifies the lifecycle through Clerk-compatible test identities and an injectable persistence harness. It confirms that a resume upload is owned by the Job Seeker, is linked to the resulting company request, can be claimed by one verified employee, remains inaccessible to an unrelated signed-in identity, and becomes available to the claiming employee only after the exclusive claim.

| Lifecycle stage | Actor | Result | Ledger record |
| --- | --- | --- | --- |
| Authenticated document upload | Job Seeker test identity | Pass | `rectJ7sG3HrlBpjj1` |
| Attachment linked to company request | Job Seeker test identity | Pass | `rec5SKKTGDeGbqyV6` |
| Exclusive request claim | Verified employee test identity | Pass | `recDQqJFQczmqcc3e` |
| Unrelated-user request and document denial | Unrelated user test identity | Pass; both paths returned `404` | `reckzSS5kku81pbRt` |
| Claimed employee’s authorized private access | Claimed employee test identity | Pass | `recz10GvXe97sVSpq` |

## Boundary of this result

This confirms the HTTP authorization contract and keeps a traceable record in a disposable Airtable base. It does **not** replace the remaining production-middleware exercise or a test-database run against real persistence. Those require a staging database and Clerk-compatible production boundary setup, and remain separately tracked.
