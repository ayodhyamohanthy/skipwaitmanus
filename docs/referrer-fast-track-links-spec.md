# Referrer Fast-Track Links

## Purpose

**Referrer Fast-Track Links** give a verified employee one branded, shareable entry point for referrals at their exact company. The link is intended for a LinkedIn bio or a one-to-one message. It is an invitation to begin a **private referral request**, not a promise of an interview, priority, acceptance, or a public “queue.”

## User-facing promise

The recipient-facing page uses factual copy: **“Request a private referral at Stripe.”** It identifies the company only. It does not name, profile, count, rate, or otherwise reveal the Referrer. The Referrer’s suggested LinkedIn-bio copy is similarly factual: **“Private referral requests at Stripe via Skipwait.me.”** Product UI must not claim that a candidate skips other applicants, bypasses an employer’s application process, or is guaranteed a review.

## Contract

| Concern | Rule |
|---|---|
| Eligibility | Only a Referrer with a verified company-email domain can create or retrieve a Fast-Track Link. |
| Link identity | Each link has an opaque, unguessable code. The public route exposes only its active company domain and never the Referrer account or name. |
| Company binding | A submitted Target Role URL must resolve to the link’s exact verified company domain. Job-board hostnames alone are never treated as an employer match. |
| Request destination | A valid request made through an active link is assigned directly to that verified link owner. It is visible only in their private company inbox. |
| Referrer autonomy | The link owner may review, approve, decline, or ignore a request for free. A link does not create a referral obligation. |
| Candidate privacy | Resumes and notes remain private. The Referrer sees them only through the established private-preview and claim authorization path. |
| Candidate messaging | Conversation remains unavailable until the Referrer approves the request. |
| Abuse protection | Only one active link exists per verified Referrer; inactive links do not route requests. Link retrieval and creation are idempotent. A candidate never receives a public position, capacity number, ranking, or scarcity signal. |
| Credits | A Fast-Track request follows the established server-side Job Seeker credit policy. No browser callback can grant or deduct credit. |
| Auditability | Creation, deactivation, public resolution, and request routing log privacy-safe operational metadata without copying resumes, candidate messages, or Referrer identity into public responses. |

## Routes

| Route | Access | Behaviour |
|---|---|---|
| `GET /api/referrer-fast-track/me` | Verified Referrer | Retrieves or creates the account-owned opaque link and branded sharing copy. |
| `POST /api/referrer-fast-track/me/deactivate` | Link owner | Deactivates the current link without altering any existing private requests. |
| `GET /api/referrer-fast-track/:code` | Public | Resolves only `{ companyDomain, isActive }`; applies no identity-bearing cache. |
| `POST /api/company-referrals` with `fastTrackCode` | Signed-in Job Seeker | Validates the code and exact employer domain, then creates a private request assigned to the verified link owner. |
| `/fast/:code` | Public | Offers the private company request path, shows no employee identity, and carries the opaque code into the existing onboarding/request flow. |

## Vanity URL contract

Every active Fast-Track Link also receives one **generated pseudonymous alias**. Its public form is `skipwait.me/refer/{company-slug}/{alias}`. The company slug is a presentation-only, normalized form of the verified company domain; the server always rechecks it against the stored exact company domain before resolving the path.

| Concern | Rule |
|---|---|
| Alias format | Generated aliases use lowercase letters, numbers, and hyphens only. They are 3–30 characters, non-identifying, and reserved route words are rejected. |
| Identity protection | An alias is never generated from a Referrer name, email local-part, employee ID, or job title. The public API returns only the company label and active state. |
| Stability | A Referrer has one account-owned active alias. It survives ordinary link retrieval; a company re-verification can rotate it server-side if company binding changes. |
| Public resolution | `/refer/{company-slug}/{alias}` proves that the requested slug and alias refer to the same active verified company corridor. It never returns the opaque link code, Referrer account ID, or identity. |
| Routing | The recipient’s resume submission carries the alias and company slug back to the server. The server resolves the active link again and independently validates the Target Role URL against that exact company. |
| Prohibited use | Vanity aliases do not grant priority, alter Queue Open Alert order, disclose capacity, reveal a Referrer, or imply a bypass, review, interview, or employment guarantee. |

## Mobile interaction model

The Referrer controls the feature from a single card in the verified company inbox: **“Your Fast-Track Link”**, a company-labelled opaque URL, one **Copy link** action, and an optional **Pause link** control. The link card is available even when there are no inbound requests. The recipient page uses one primary action: **“Start private request.”**

No public candidate list, queue rank, request counter, social proof, streak, leaderboard, bulk contact import, or automatic posting is part of this feature.
