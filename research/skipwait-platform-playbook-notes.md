# skipwait.me Global Platform Playbook Research Notes

## Evaluation Framework

The assessment will test each external playbook against five skipwait constraints: liquidity at a specific company and role, employee participation without public identity exposure, Job Seeker speed, credible trust and consent, and sustainable contribution margin.

## Evidence Collected

| Source | Finding | Implication for skipwait.me |
|---|---|---|
| [NBER Working Paper 25920](https://www.nber.org/papers/w25920) | In a randomized employee-referral-program introduction, larger referral bonuses increased referral quantity but reduced quality. The program reduced attrition by 15%, with evidence that employees valued being involved in hiring. | Do not make per-referral cash rewards the primary employee-growth mechanic. Prioritize bounded participation, clear impact, and quality gates; use incentives sparingly and measure quality, not only submission volume. |
| [Harvard Business School Working Knowledge](https://www.library.hbs.edu/working-knowledge/the-network-effect-why-companies-should-care-about-employees-linkedin-connections) | Analysis of more than 9 million employees and 2 billion professional connections found that greater company centrality in professional communities correlated with stronger innovation outcomes. Middle- and lower-level employees materially contribute to connectivity. | Company coverage should not depend only on senior “ambassadors.” Let any verified employee opt into a lightweight, private coverage pool, while keeping employee identities concealed from Job Seekers. |

## Initial Hypotheses to Test in Later Research

1. The best acquisition loop is likely **company-specific liquidity**, not general contact syncing: a real Job Seeker role URL creates a bounded reason for a relevant employee to join.
2. The employee value proposition should emphasise **helping with a real request under their control**, rather than volume, public reputation, or broad recruiting claims.
3. Incentives should reward verified, timely, high-quality participation rather than indiscriminate referral sending.

## Marketplace Liquidity and Trust Evidence

| Source | Finding | Implication for skipwait.me |
|---|---|---|
| [Stripe, Two-Sided Marketplace Strategy](https://stripe.com/resources/more/two-sided-marketplace-strategy) | Marketplace guidance recommends seeding supply, concentrating activity in a narrow high-intent market, measuring interaction quality rather than raw user counts, and balancing verification with low-friction onboarding. | Treat a **company + role family + geography** as skipwait’s local marketplace, rather than launching universally. Measure request-to-eligible-employee coverage, first response time, claim rate, and completed-referral rate. |
| [Indeed 2024 Transparency Report](https://www.indeed.com/legal/transparency-report-hub/h1-2024-indeed-transparency-report) | Indeed combines automated risk signals with manual moderation, lets users report accounts, content, and messages, and requires accurate, open roles to remain visible. | Keep work-email verification as a prerequisite for employee routing; add lightweight report/flag mechanisms, role-link freshness checks, content retention controls, and an operational review queue before scaling the public Opportunity Wall. |

## Updated Working Principles

4. **Density before breadth:** seed company-specific employee coverage and concentrate demand there rather than maximizing generic Job Seeker acquisition.
5. **Quality-adjusted liquidity:** define success as a timely, eligible claim and a completed employee action—not simply URLs pasted, employees enrolled, or requests sent.
6. **Layered integrity:** work-email verification is necessary but insufficient at scale; risky activity needs reportable, reviewable signals and clear enforcement.

## Monetisation and Sharing Evidence

| Source | Finding | Implication for skipwait.me |
|---|---|---|
| [Upwork, Understanding and using Connects](https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects) | Upwork uses virtual proposal credits for job proposals and selected visibility products; its help center makes earning, buying, usage, balance history, and refund rules separate and explicit. | Keep skipwait’s $1 action token tied to one clear, high-intent private request. Before enabling live payments, add a visible token ledger, clear refund/failed-routing policy, and credits for platform-caused failures—not a broad paywall over discovery or document upload. |
| [Dropbox Referral Program](https://www.dropbox.com/refer) | The flow is product-native, has a simple email/copy-link distribution choice, and rewards both parties only after a meaningful activation event: account creation. | Retain contextual company invitations instead of indiscriminate address-book syncing. Reward a verified employee and the inviting Job Seeker only after the employee completes work-email verification and becomes available for that company, not merely after a shared link click. |

## Updated Working Principles

7. **Earned rewards, not raw invites:** use a verified-work-email activation event and later quality action, rather than clicks or generic contact imports, as any eligibility trigger.
8. **Token trust contract:** show where tokens came from, when they are consumed, how a failed platform route is handled, and never charge for browsing or protected sign-in.

## Global Privacy and Future AI Governance Evidence

| Source | Finding | Implication for skipwait.me |
|---|---|---|
| [European Commission, Principles of the GDPR](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en) | Official principles include purpose limitation, data minimisation, storage limitation, accuracy, integrity/confidentiality, transparency, and accountability. | Keep resume visibility strictly scoped to the Job Seeker and the one verified employee who claims the request; publish a retention/deletion policy; explain the purpose of each data field; make correction and deletion flows available before broader international launch. |
| [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) | The voluntary framework is intended to help organisations manage AI risks and incorporate trustworthiness considerations into design, development, use, and evaluation. | If skipwait adds AI role matching, resume summarisation, opportunity ranking, or message drafting, position it as assistive—not determinative—provide human control, avoid automatic referral eligibility decisions, log model behavior without retaining resume content unnecessarily, and evaluate disparate-impact risks before rollout. |

## Updated Working Principles

9. **Privacy is the differentiator:** no public employee directory, no buyer-visible employee identities, one-claim document access, clear deletion, and tight retention are core product advantages—not merely compliance work.
10. **AI assists; people decide:** use AI first for low-risk drafting and routing aids. Do not use it to score people, determine referral worthiness, or make opaque employment decisions.

## Referral Quality and Fairness Evidence

| Source | Finding | Implication for skipwait.me |
|---|---|---|
| [NBER, The Dynamics of Referral Hiring and Racial Inequality](https://www.nber.org/papers/w29246) | The paper finds that segregated referral networks can contribute to racial inequality in firm-level labor demand; it also finds referred candidates can carry better match-quality information. | Skipwait should market itself as a **referral access layer**, not a replacement for fair hiring. Maintain a public, anonymous opportunity surface; avoid contact-graph ranking; measure coverage and completed actions across regions/role families; give Job Seekers a no-network path to eligible company pools. |
| [LinkedIn, How LinkedIn Supercharged Its Employee Referral Program](https://www.linkedin.com/business/talent/blog/talent-acquisition/how-linkedin-supercharged-its-employee-referral-program) | LinkedIn’s program emphasized role-specific referral profiles, quality over quantity, dedicated feedback/response SLAs, and recognition of successful participants. | Give Referrers concise role context, explicit action choices, and a private decision SLA. Build a “coverage health” dashboard and acknowledge dependable participation privately; do not expose individual employees to Job Seekers or reward raw volume. |

## Updated Working Principles

11. **Quality prompts before quantity:** show the exact role link, concise candidate context, required resume, and a simple approve/decline route. Do not gamify bulk referrals.
12. **Fair access guardrail:** prevent the existing network from becoming a closed club by acquiring supply company-by-company, not through friend-network ranking, and by monitoring coverage gaps rather than demographic inference.
