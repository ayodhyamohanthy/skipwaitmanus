# D-100.authz-account: authorization and personal data on the account, messaging, employer, agent and public routes

- **Row:** `D-100.authz-account` (Tier 3, lane `security-audit-account`), packet [`docs/plans/D-100-security-audit.md`](../plans/D-100-security-audit.md).
- **Kind:** read-only audit. This file is the row's only change. No code, registry or packet edits.
- **Base audited:** `main` at `465b6126d7945076ba96bf1da894364171ad52c3` (Oct 28 2026). Line numbers below are at that commit.
- **Auditor:** a Claude Code session in the D-225 reasoning role.
- **Packet rule 1 (the repo is public):** findings that are unfixed and exploitable appear here only as a held ID with severity. Their routes, payloads and repro steps are not here. The full write-up went to the CEO through a private channel. Everything written out in full below is either hygiene with no exploit path, or depends on an admin account or a flag that is off.

## Result in one paragraph
Every route in scope resolves the caller from the session (or from a hashed bearer/agent key) and never takes the acting user id from the request. Every owner-scoped read or write checked here carries an ownership predicate in the SQL (`userId = caller`), and the cross-user reads (public profile, employer talent, company directory and openings, job catalog) go out through allow-list projections. No route returns another user's email. **2 findings are held privately (1 × P1, 1 × P2).** There are **4 public P2** findings and **9 public P3** findings. The P2s are a password reset that throws away the new password and reports success, raw internal error text in 4xx/5xx bodies, a hardening gap from a denylist-based SSRF address filter, and async handlers with no error path on Express 4.

## Findings

| ID | Sev | Where (at `465b6126`) | What can go wrong | Who could do it | Suggested fix |
|---|---|---|---|---|---|
| H-1 | P1 | held | Held for the CEO (rule 1). | — | Private write-up; the CEO opens the fix row. |
| H-2 | P2 | held | Held for the CEO (rule 1). | — | Private write-up; the CEO opens the fix row. |
| A-1 | P2 | `server/passwordResetRoutes.ts:153-185`, `client/src/pages/ResetPassword.tsx:54-70` | `POST /api/auth/password/reset/confirm` checks the policy and the token, then only calls `revokeUserSessions`. It never sets the password anywhere (there is no WorkOS call), but it answers `{ ok: true }` and the page shows success. The user's new password is silently dropped, and a later password sign-in fails. This breaks "silent failure is a defect" and D-019 basics. The page is not linked anywhere in the client, but `/forgot-password` and `/reset-password` are live routes. | Any user who finds the page; no attacker gain. | Until the seeker-passwords row (`docs/plans/seeker-passwords.md`) lands, answer 503 `not_available_yet` from `forgot` and `confirm` behind a switch that starts off, or remove the two client routes. Never report success without a provider write. |
| A-2 | P2 | `server/profileRoutes.ts:98-99,157-158,173-174,190-191,203-204`; `server/employerRoutes.ts:92,195-196,260,274,296`; `server/assistantRoutes.ts:55-63`; `server/dmRoutes.ts:125-129` | These handlers send `error.message` back as the response body. The status comes from a regex over that message, and a 500 also carries the raw text. A database or driver error (SQL text, column names, constraint names, sometimes values) can reach the client. `POST /api/employer/opportunities/:id/sponsor` maps *every* unmatched error to **402**, so a database failure tells the employer "payment required" and shows the SQL text. | Any signed-in caller who can make a write fail. | Throw typed domain errors (the pattern `PlanLimitError` and `CompanyClaimError` already use). Map only those to 4xx with their safe copy. Every other error gets a fixed 500 body and a scrubbed Sentry capture. |
| A-3 | P2 | `server/jobLinkPreview.ts:15,20-21` | The public job-link preview fetches seeker-supplied URLs. It blocks private destinations with a **denylist** of `ipaddr.js` range names. Ranges that are not on the list pass, for example IPv6 transition forms (`rfc6145`, `6to4`, `teredo`). Nothing in the body comes back (only "reachable"), DNS is pinned per hop, and every redirect is re-checked, so no exploit path has been shown. But any new non-public range in the library becomes allowed by default. | Anonymous, 12 requests/min/IP. | Invert the check: allow only `unicast` (IPv4) and `unicast` / `ipv4Mapped`→IPv4 `unicast` (IPv6), with tests for each special range. |
| A-4 | P2 | `server/seekerAgentRoutes.ts:241-349` (flag off), `server/oauthRoutes.ts:67-72` (live), `server/jobCatalogRoutes.ts:161-174` (admin) | These async handlers have no `try/catch`, and the app runs Express `^4.21.2`, which does not catch rejected promises. A database error leaves the request hanging until the edge times out, and then becomes an unhandled rejection. Whether that kills the process depends on whether Sentry's handler is installed (no `process.on("unhandledRejection")` in `server/`). `GET /api/oauth/client` is public. | Not attacker-triggerable; any database blip. | Wrap each one, or add one async-error wrapper for route registration. Add a test that a throwing store gets a 500. |
| A-5 | P3 | `server/_core/authPostGuard.ts:36-48` | `isTrustedAuthPost` (JSON-only plus an Origin check, "login-CSRF posture for the public password POSTs") is defined and tested, but no route calls it. `/api/auth/password/forgot` therefore accepts a cross-site urlencoded form through the global parser (`server/_core/index.ts`, `smallForm`). The only effect is sending reset emails to a known address. | Any website a victim visits. | Call it at the top of both password POSTs, as its comment intends. |
| A-6 | P3 | `server/passwordResetRoutes.ts:118-140` | `forgot` rate-limits per (email hash, IP), at 5/hour in process memory, with no per-email or global cap. Rotating IPs can therefore send unlimited paid transactional emails to one inbox, at the owner's cost (D-031). Every account-holding address qualifies, including referrer work emails, which are not meant to have passwords. | Anonymous. | Add a per-email cap (for example 3/day) and a global hourly cap through the durable limiter (`consumeLimits`, already used by company claim). Skip referrer work emails, as the seeker-passwords packet plans. |
| A-7 | P3 | `server/employerRoutes.ts:220-239`, `server/db.ts:5560-5569` | `GET /api/partners` adds one impression per returned module on every request (it sends `public, max-age=60`, but the server count is not cached), and `POST /api/partners/:id/click` is anonymous with no limit. Partner impression and click counts can be inflated at will. That matters as soon as partners are reported to or billed on them. | Anonymous. | Dedupe by session or IP per day, rate-limit, or count from the client beacon only. Report these numbers as unaudited until then. |
| A-8 | P3 | `server/db.ts:5537-5552`, `client/src/components/PartnerModuleCard.tsx:12` | Admin-entered `ctaUrl` is validated with `new URL()` only, so `javascript:` and `data:` pass even though the error copy says "https". It renders as an `href` on seeker feeds (React 18 does not block `javascript:`). | An admin account (insider or compromised). | Require `https:` (as `validateWorkItemInput`, `server/db.ts:360-363`, already does for work links). |
| A-9 | P3 | `server/plansCatalogRoutes.ts:66,81` | The response depends on `CF-IPCountry` (INR vs USD) but is sent `public, max-age=300` with no `Vary`. A shared cache keyed on the URL could serve one region's prices to another. This is a price-display correctness risk, not a charge risk: checkout re-reads the price. | No attacker. | Send `Vary: CF-IPCountry`, or make it `private`. |
| A-10 | P3 | `server/followRoutes.ts:193-227`; `server/_core/index.ts:261` (no `userExists` passed, so `exists` is always true, `followRoutes.ts:31`); `server/db.ts:3691-3711` | Any signed-in member can read any user id's follower and following counts and join month. The followers/following lists are cut to `"Member"` labels, but their length is the count. Follows can also be written to ids that do not exist. This is low-grade sequential enumeration of account ids and activity. | Any signed-in member. | Pass a real `userExists`, and return counts only for ids that have a public profile, or only to mutuals. |
| A-11 | P3 | `server/dmRoutes.ts:97` | Before any gate is checked, `POST /api/dms/threads/:userId` answers 404 "not available" for an unknown id. That is an existence oracle (the retired compose route was removed for a similar reason, `dmRoutes.ts:54-56`). | Any signed-in member. | Run the gates first, and give unknown and refused the same answer. |
| A-12 | P3 | `server/db.ts:3746-3761`, `:5409-5414` | `listDmThreads` reads every DM row of the caller with no limit. `listAnonymizedSeekerProfiles` loads every opted-in seeker and then runs 1-3 queries per row (N+1) on every talent search. These are cost and availability problems as data grows, not leaks. | A heavy user / any approved employer. | Group in SQL with a limit; select only consented rows in one join. |
| A-13 | P3 | `server/oauthRoutes.ts:55-64`, `client/src/pages/goal/assistants/GoalConnectAssistant.tsx:184` | Open dynamic client registration lets anyone register a client with any display name (for example a well-known assistant's name). This is mitigated: the consent screen shows the callback host and an "isn't verified by skipwait.me" warning, PKCE is required, codes are single-use and live 5 minutes, and an exact redirect match is enforced. It is recorded for completeness. | Anyone (phishing). | Optional: reserve well-known client names for pre-registered clients. |

## Route-by-route reading

Columns: **who may call** · **ownership / scope predicate** · **personal data in the response** · **rate limit** · **edge input checks**. "Session" means `resolveIdentity`. That is the WorkOS JWKS bearer or the `app_session_id` JWT, which `verifySession` checks for suspension and `sessionsValidAfter` revocation (`server/_core/sdk.ts:34-47`).

### Profile and work (`server/profileRoutes.ts`)
| Route | Who | Predicate | Personal data out | Limit | Input |
|---|---|---|---|---|---|
| `GET/PUT /api/profile/me`, `GET/PATCH /api/profile/setup` | session | user id from session only | caller's own | none | setup: Zod (`seekerSetupPatchSchema`); `PUT me`: loose casts, validated in `updateMyProfile` (A-2 for its errors) |
| `GET/POST/PATCH/DELETE /api/work-items[/:id]` | session | `ownerId = caller` in `updateWorkItem`/`deleteWorkItem` ("not in your account") | own | plan caps (`PlanLimitError`) | positive int id; `validateWorkItemInput` (http/https only) |
| `GET/PUT /api/referrer-preferences`, `GET /api/referrer/home` | session | caller | own | none | areas/levels: Zod taxonomy |
| `GET /api/p/:handle` | anyone | visibility `private` hidden unless owner; work items filtered to `visibleOnProfile` | display name (withheld beside a verified domain, `server/db.ts:908-910`), headline, location, company, verified domain, public work links; **never email** | none | handle normalized |

### Direct messages and follows (`server/dmRoutes.ts`, `server/followRoutes.ts`)
| Route | Who | Predicate | Personal data out | Limit | Input |
|---|---|---|---|---|---|
| `GET /api/dms/threads`, `GET /api/dms/threads/:userId` | session | messages where caller is sender or recipient | message bodies of the caller's own threads; counterpart shown as `Member` / `Referrer · domain` | none (A-12) | positive int, not self |
| `POST /api/dms/threads/:userId` | session | referrer gate (D-012(3)), then thread or mutual follow, all re-checked inside the send transaction with both users locked; suspended sender/recipient refused | none | 30/hour durable quota in the transaction; 10 refusals/hour then 429 | Idempotency-Key required; 3,000 chars; see H-1 |
| follow / unfollow / follow-state / followers / following | session | caller is the follower | counts and join month of any id (A-10) | none | positive int |

### Employer (`server/employerRoutes.ts`)
| Route | Who | Predicate | Personal data out | Limit | Input |
|---|---|---|---|---|---|
| `POST/GET /api/employer/account` | session | caller's own row; a new or changed application goes back to `pending` and revokes earlier unlocks (`server/db.ts:5272-5276`) | own | none | billing email must equal the verified sign-in email |
| talent list / unlock / view / intro | approved employer (`isEmployer` = `approvalStatus = approved`) | opaque per-employer `tal_` refs bound to the consent id; the seeker's latest consent, policy version, onboarding and suspension are re-checked on every read, unlock and intro | consented, coarsened snapshot only (headline, coarse location, top-5 skills, experience band); unlock is consent-bound and expires after 30 days | credit debit is a conditional `UPDATE` | ref regex `^tal_[A-Za-z0-9_-]{20,60}$` |
| unlock-credit purchase | approved employer | caller's wallet | none | Idempotency-Key, durable intent | pack enum; amount from the server table |
| sponsor | approved employer, owner of the opportunity (`server/db.ts:5429-5430`) | owner wallet only | none | Idempotency-Key | tier enum (A-2 for its 402 mapping) |
| `/api/partners*` | anyone | — | none | none (A-7) | category enum |
| `/api/admin/partners*`, `/api/admin/sponsorships`, end-sponsorship | `users.role = admin` | — | none | none | A-8 |

### Company claim, directory, catalog, sitemap, prices
| Route | Who | Predicate | Personal data out | Limit | Input |
|---|---|---|---|---|---|
| `/api/company-claim/*` (flag `COMPANY_CLAIM_ENABLED`, off; 404 before auth) | session | single-use hashed token bound to the requesting user, 10-min expiry, consumed in a transaction; the dashboard needs that user's verified grant for one of the company's domains | aggregates only | durable: 1/10 min per user, 8/10 min per domain, 100/hour global | strict Zod bodies |
| `GET /api/companies*`, `/:slug/opportunities`, `/:slug/response-signal` (flagged) | anyone | listed companies only | openings are parsed through the shared schema, which drops unknown keys: no poster id or email, first name only if the poster chose it | none (edge cache 60 s) | slug pattern |
| `/api/admin/companies*` | admin | — | domains | none | strict Zod, 16 kb |
| `GET /api/companies/:slug/jobs` (`JOB_CATALOG_ENABLED`, off) | anyone | — | public job board data | background refresh at most 1/min per source | slug cut to 48 |
| `POST /api/admin/job-sources` | admin | — | — | — | Zod (A-4 for errors) |
| `GET /sitemap.xml` | anyone | public jobs and listed companies only | none | edge cache 1 h | origin from `Host`, which the Worker fixes to the zone host (`src/worker.ts:73-89`) |
| `GET /api/plans/catalog` | anyone | — | none | edge cache 300 s (A-9) | region from the Worker-rewritten `CF-IPCountry` |
| `POST /api/job-link/preview` | anyone | — | none (only a reachable flag and the resolved company) | 12/min/IP in process; `req.ip` is safe because the Worker rewrites `X-Forwarded-For` (`server/_core/index.ts:136-144`) | 8 kb body, 4,096-char URL, `isValidTargetRoleUrl`; outbound: DNS pinned per hop, 8 redirects, 5 s, 512 kB (A-3) |
| `GET /api/referrer/impact-card` (`SHARE_IMPACT_CARD_ENABLED`, off) | session | caller's own card | aggregate only | none | — |

### Password reset, OAuth, MCP, assistants, agents, Skippy
| Route | Who | Predicate | Personal data out | Limit | Input |
|---|---|---|---|---|---|
| `/api/auth/password/forgot`, `/reset/verify`, `/reset/confirm` | anyone | the reset JWT has its own audience, so it cannot verify as a session (`server/_core/sdk.ts:37-39` requires issuer, audience, `appId`, `jti`) | neutral answers; `debugToken` only when `NODE_ENV=test` | 5/hour per (email, IP), in process (A-6) | A-1, A-5 |
| `/api/oauth/register`, `/client`, `/authorize`, `/token` | register/token: anyone; authorize: session | code bound to user, client, redirect and PKCE S256; single-use conditional `UPDATE`; 5-min TTL; exact redirect match; https or loopback only | client name only | 20 registrations and 120 token calls per hour per IP | A-13 |
| `POST /api/mcp` | `sw_` bearer (sha256 lookup, not revoked) plus a plan entitlement check on every call | tools read only the token owner's rows, through allow-list shapes (`server/mcpServer.ts:93-121`); `propose_ask` only creates a pending approval with server-fixed cost, max 5 pending, and owned unattached resumes only | own requests, alerts, resume names | 120/min per token, in process | shape regex before the database; 64 kb; see H-2 |
| `/api/assistants/*`, `/api/developer-apps*` | session | every read, update, revoke, decide and submit uses `id AND userId = caller` (`server/db.ts:560-830`); approving an `ask_send` runs the normal ask path with a fixed idempotency key | own | none | positive int ids; validators in `db.ts` (A-2 for errors) |
| `/api/seeker/agents*`, `/api/agent/v1/*` (`SKIPPIE_AGENT_ENABLED`, off) | session / agent key | `getGrantForUser(caller, id)`; drafts and limits per grant; keys hashed, expiring, revocable, pausable | own | per-grant hour/day caps in process; durable credit/ask caps | strict Zod (A-4 for errors) |
| `/api/skippie/state`, `/turn` (`SKIPPIE_SEEKER_ENABLED`, off, plus an allow-list of account ids) | session | caller's in-memory session | own resumes list | per user and global daily caps | Zod; the SSRF and five other defects are already owned by `SKIPPY-fix` (D-201), so they were not re-audited |

## Checked and fine (no finding)
- Suspension: session paths re-read `users.suspended` on every request (`server/_core/sdk.ts:40-41`). The DM send, employer unlock, intro and talent reads also re-check the counterpart's suspension.
- The employer talent surface is consent-versioned end to end: a new consent, a revocation or a changed employer application revokes refs and unlocks in the same transaction (`server/db.ts:5272-5276,5336-5362`).
- Company opportunities never carry poster identity (`shared/companyOpportunities.ts:43-67`, which drops unknown keys).
- Public work links are http(s) only (`server/db.ts:360-363`), so the public profile cannot carry a script link.
- Every per-user response checked sends `private, no-store`, except the 404/401 bodies and the explicitly public catalog reads.
- `trust proxy` is safe only behind the Worker, which deletes client forwarding headers. A direct-to-container path would reopen every in-process IP limit (documented at `server/_core/index.ts:136-144`). Unchanged and correct.

## Not covered by this row
- The admin sign-in, payments and webhooks, and `routers.ts` admin procedures (row `D-100.authz-admin-money`); referral, document and block routes themselves (row `D-100.authz-referral`); logging of secrets (row `D-100.secrets-sweep`).
- Live behaviour. This is a source read. No request was sent to production or preview, and nothing was run against a database (`node_modules` was not installed in this session). Every claim here is **unverified at runtime** under team rule 8 until the fix rows add red-first tests.

## Suggested fix rows (for the CEO, D-223 (4))
1. H-1 fix (held details): Tier 1, small, red-first, behaviour-preserving for unblocked pairs.
2. H-2 fix (held details): Tier 1.
3. A-1: Tier 1 (sign-in): switch the legacy reset off until `seeker-passwords` lands.
4. A-2 + A-4: Tier 2, one row per file group: typed errors and an async wrapper.
5. A-3 + A-6 + A-5: Tier 2 hardening rows.
6. A-7 … A-13: Tier 3 or backlog; A-8 and A-9 are one-liners.
