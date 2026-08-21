# skipwait.me Source-App Growth Loop Audit

**Scope.** This audit treats the current skipwait.me source application—not the deferred VibecodeApp workspace—as the product source of truth. It evaluates the five requested pillars against the platform’s privacy, fairness, and company-routing requirements.

> Product-led growth is strongest when users experience useful product value before a conversion or payment decision, rather than being sold a promise of value.[1]

| Pillar | Current source-app evidence | Assessment | Safe next step |
| --- | --- | --- | --- |
| Self-reinforcing loops | Exact-company coverage invites, qualified personal-invite rewards, Queue Open Alerts, Fast-Track links, and voluntary internal-opening shares already create demand-to-supply paths. | **Present, guarded.** The value loop is valid only where a recipient can genuinely benefit. | Preserve qualified-conversion rewards; explicitly keep queue order independent of invitation activity. |
| Instant time-to-value | A Job Seeker can paste a role URL before authentication; employer resolution and company confirmation happen immediately. A Referrer can see a Fast-Track Link after verified company-email enrollment. | **Strong.** The request journey delays sign-in until private submission is necessary. | Measure link-valid → completed-private-request activation without recording resume or message content. |
| Double-sided value | Job Seekers receive exact-company private routing, request status, and post-approval conversation. Referrers receive free review, complete candidate context, voluntary capacity controls, and a private Fast-Track sharing path. | **Strong, with a return-value gap.** | Add a private Referrer impact summary derived only from their own resolved requests. |
| Shareable proof artifacts | The generated `/refer/{company}/{alias}` Fast-Track URL is a clear, branded, company-scoped share asset. Company-coverage and internal-opening shares are one-tap and recipient-benefiting. | **Strong and truthful.** | Keep artifacts factual: company-only, no employee identity, availability, rank, guarantee, or synthetic “success” claims. |
| Data and network stickiness | Private request history, approved-only conversation, factual milestones, notifications, documents, credit ledger, and account-owned privacy controls accumulate legitimate user value. | **Strong for Job Seekers; incomplete for Referrers.** | Add private aggregate impact history; retain strict ownership and no public leaderboard. |

## Product decision

The source application should **not** target a K-factor through queue advancement. Marketplace research supports focusing early on liquidity, trust, and a tight relevant corridor—not raw volume.[2] In skipwait.me, an invitation’s only legitimate effect is a qualified downstream benefit such as a verified conversion credit. It must never affect candidate ordering, capacity, review access, a hiring result, or Referrer discretion.

The selected source-app improvement is therefore a **private Referrer impact summary**. It gives a verified Referrer a concise account-owned record of meaningful actions: referrals reviewed, approved, introductions recorded, interviews recorded, and offers recorded. It is not public, does not score or rank employees, contains no candidate names or documents, and does not reward a particular outcome. This improves return value and private account continuity without turning a sensitive employment workflow into a social feed.

## Acceptance criteria

1. Only a verified Referrer can retrieve their own aggregate summary.
2. The summary is computed server-side from requests assigned to that Referrer only.
3. The response exposes aggregate counts only—never candidate identity, documents, message content, employee identity, or queue data.
4. The Referrer inbox displays the summary in the existing fixed-viewport mobile flow without creating a public artifact, leaderboard, or reward.
5. Regression coverage rejects cross-user visibility and preserves no-position-jumping Queue Open Alert allocation.

## References

[1]: [Productboard — Product-Led Growth](https://www.productboard.com/glossary/product-led-growth/)

[2]: [Sharetribe — The Proven Two-Sided Marketplace Playbook](https://www.sharetribe.com/how-to-build/two-sided-marketplace/)

[3]: [Product-Led Alliance — What Is Product-Led Growth?](https://www.productledalliance.com/what-is-product-led-growth/)
