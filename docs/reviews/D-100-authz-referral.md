# D-100.authz-referral: authorization and personal data on the referral, document, block and safety routes

Read-only audit (packet `docs/plans/D-100-security-audit.md`, Tier 3, rule 1 binds). Auditor: Hark · 585f, 2026-10-30.
**`main` read:** `2d72dec7f1609b9e8a3b7e6ec6bc4062bb03aee0`. Line numbers below are on that commit.

**Files in scope:** `server/privateReferralRoutes.ts`, `server/askDraftRoutes.ts`, `server/blocksRoutes.ts`, `server/safetyRoutes.ts`, `server/referrerDocumentAccess.ts`, plus the `server/db.ts` functions those routes call (read by line range only).

## Summary
- **Withheld under rule 1:** 1 finding (H-1). It is not described here. Its details are held for the CEO outside the repository. Its severity is not given here either, so this file says nothing about it.
- **Published:** 8 findings, all P3. They are hygiene or defence in depth: none has a path an attacker can use on their own.
- **Held up under reading:** every referral, document, conversation and progress route checks the signed-in account against the ask (seeker, the assigned referrer, or a verified employee of the ask's company), and refuses a blocked pair with a neutral 404. The seeker's name and files stay out of the unclaimed preview and the pre-acceptance detail, and document bytes open only for the accepting referrer inside the grant window or for the owner. Every `/api/admin/*` route in `privateReferralRoutes.ts` (lines 1534-1773, 21 handlers) checks `role === "admin"` before reading or writing, and the legacy refund route answers 410.

## Findings

| ID | file:line | What can go wrong | Who could do it | Severity | Suggested fix |
|---|---|---|---|---|---|
| A-1 | `server/safetyRoutes.ts:251`, `:274`, `:319`, `:348`; `server/privateReferralRoutes.ts:942`, `:960`, `:974` | When a call fails, the 500 response sends back the raw internal `Error.message`. Database driver text is already removed by the `/api` JSON wrapper (`privateReferralRoutes.ts:209-219`, mounted at `server/_core/index.ts:222`, so it is in place before the safety routes at `:292`). Any other internal message would still reach the client word for word, for example from storage or a library. | Any signed-in user, by causing a server-side failure; the leak is limited to internal error wording | P3 | Keep the specific messages for the known 4xx cases. Answer every other failure with `GENERIC_SERVER_ERROR` and send it to `captureServerError`. |
| A-2 | `server/privateReferralRoutes.ts:258-273`, `:584-590` | The block check fails open: if the lookup itself throws, the request goes ahead as if there were no block. That covers threads, preview, claim, review and document bytes. The code comment records this as deliberate. | Nobody can trigger it directly; it takes a database or schema fault | P3 | Fail closed on the routes that reveal or decide something (document bytes, claim, both review routes, conversation post). List views can stay fail-open. |
| A-3 | `server/blocksRoutes.ts:28-29` with `:174`; `server/db.ts:955-958` (`createSafetyReport`) | Blocking or reporting a numeric account id answers differently when the account does not exist (404 or "Invalid reported account"), so it shows whether an account id exists. | Any signed-in user | P3 | Give the same answer whether or not the account exists. Ids are sequential and no name comes back, so this is low. |
| A-4 | `server/blocksRoutes.ts:165-169` | Blocking by conversation returns the other person's numeric account id, and that includes a referrer who has claimed but not yet accepted. No route was found that turns the id into a name or a way to make contact: direct messages are gated by the referrer gate and mutual follow (`server/dmRoutes.ts:111-114`), and follower lists show only "Member" (`server/followRoutes.ts:80`, `:92`). | A referrer holding a claim | P3 | Leave out `blockedUserId` from the response when the block was made by conversation. |
| A-5 | `server/db.ts:944-958` (`createSafetyReport`) | When a report names both a referral and a `reportedUserId`, nothing checks that the reported account is the other person on that referral, so a participant can attach any account to their thread's report. Reports are capped at 20 a day (`db.ts:962`) and reviewed by an admin. | A participant in any referral | P3 | When both are given, require `reportedUserId` to be the counterpart on that referral. |
| A-6 | `server/db.ts:2268` (`saveCompanyReferralRequest`), `:2245-2250` (`getUnclaimedCompanyReferralPreview`) | Save and preview match the ask's company to the exact work-email domain. Claim and one-click review instead check `isVerifiedEmployeeOfCompany` against the ask's company (`db.ts:2986`, `:2126`). The gates do not match: an employee verified on an alias domain may be able to claim an ask they cannot preview or save, or the other way round. | Not an abuse path | P3 | Use one predicate, `isVerifiedEmployeeOfCompany(profile, askCompany)`, on all four routes. |
| A-7 | `server/privateReferralRoutes.ts:517` | `GET /api/documents/debug/upload-starts` is a debug endpoint that is live in production. It only shows the caller's own uploads from the last 15 minutes, with file names. | The account itself only | P3 | Limit it to admins, or remove it once uploads are stable. |
| A-8 | `server/blocksRoutes.ts:146`; `server/privateReferralRoutes.ts:1216`, `:1245`, `:1426`; `server/askDraftRoutes.ts:35` | These routes have no per-account rate limit: block create, save, review, preview and draft save. Existing limits: safety reports 20 a day (`db.ts:962`), company suggestions 3 a day (`db.ts:1018`), thread messages 30 an hour (`privateReferralRoutes.ts:1353`), claims a cap of 5 open, opportunities a posting allowance (`db.ts:1640-1642`). | Any signed-in user (load only; every write is idempotent or bounded per row) | P3 | Add a per-account limiter on block create and preview first. |

## Route inventory
Every route below resolves the account from the session first and answers 401 without one, unless the "Caller" column says public. "Blocked pair" means the two-way block check answers a neutral 404 (`isRequestBlocked` / `blockedRequestIds`, fail-open per A-2).

### Referral asks (`server/privateReferralRoutes.ts`)
| Route | Line | Caller | Ownership / scope predicate | Personal data in response | Rate limit | Edge input checks |
|---|---|---|---|---|---|---|
| `GET /api/company-referrals/mine` | 1104 | seeker | `listJobSeekerCompanyReferrals(account.id)`; blocked pairs filtered out | own asks | none | none needed |
| `GET /api/company-referrals/inbox` | 1156 | referrer | `listCompanyReferralInboxByState(account.id, scope)`; blocked filtered; HMAC `publicRef` instead of a sequential id | no seeker name | none | `scope` allow-listed |
| `GET /api/referrer/home-bundle` | 1165 | referrer | each section skipped unless `verifiedCompanyAccess` | own data | none | none |
| `POST /api/company-referrals` | 740 | seeker | attachments must be owned and unattached (`db.ts:1929`); personal-link owner blocked → same 400 as an inactive link | own ask | open-ask cap per company | Zod for job function, opportunity and pinned work; link regexes |
| `POST .../availability/open` | 1189 | referrer | verified work email (db) | none | 1-3 slots | integer bound |
| `GET .../:id/preview` | 1426 | referrer | verified employee whose work-email domain equals the ask's company (A-6), pending, not waiting, unclaimed or own claim, not passed, first look respected (`db.ts:2243-2258`) | candidate name removed; attachments shown as type and size only (`toLockedAskAttachment`) | none (A-8) | positive integer |
| `GET .../:id` | 1445 | referrer | `referrerId = account.id` and status pending or accepted (`db.ts:3299`); explicit allow-list view (`buildClaimedAskDetailView`) | name and files only after the actor's own acceptance | none | positive integer |
| `POST .../:id/claim` | 1467 | referrer | verified work email, same company, pending, not waiting, unclaimed or own (`db.ts:2980-2986`) | none | 5 open claims | positive integer |
| `POST .../:id/save` | 1216 | referrer | verified email, exact same domain (A-6), pending, not passed, first look | none | none | positive integer |
| `POST .../:id/withdraw` | 1229 | seeker | row must be the caller's (`db.ts:2290-2293`) | own credit summary | none | positive integer |
| `POST .../:id/review` | 1245 | referrer | claim holder, or a replay of their own decision (`db.ts:3445-3455`) | none | none | decision enum; message ≤ 3,000 |
| `POST .../:id/one-click-review` | 1259 | referrer | same company, unclaimed or own claim, first look (`db.ts:2120-2128`) | none | none | decision and reason enums |
| `GET/POST /api/referrer-review-links/:token[/decision]` | 1276-1297 | referrer | link must belong to the caller, then the block check | none | none | token `[A-Za-z0-9]{32,64}` |
| `POST .../:id/progress` | 1298 | either party | `authorizeApprovedReferralConversation`: participant, accepted state (`db.ts:3466-3470`) | none | none | status enum; reference id normalised |
| `GET/POST .../:id/conversation` | 1321, 1345 | either party | same predicate; messages limited to the pair | thread bodies, own pair only | post 30 an hour (`:1353`) | body ≤ 3,000 |
| `POST /api/landed/journey` | 1377 | seeker | db checks the ask is theirs and hired | none | none | Zod |
| `extend-referred-deadline`, `step-back`, `confirm-referred` | 1486-1533 | either party | switched off: they refuse before identity (`REFERRED_DEADLINE_ENABLED`) | none | n/a | n/a |
| `POST/DELETE /api/referral-share-cards/:id` | 1023, 1034 | either party | participant, accepted (`db.ts:3506-3510`) | none | none | positive integer |
| `GET /api/referral-share-cards/public/:token[/image.png]`, `GET /share-card/:token` | 1044-1074 | public | active card on an accepted ask | company domain and status; sharer's invite code | none | token regex; HTML escaped |
| `GET /api/referrer-fast-track/:code`, `/vanity/:slug/:alias` | 987, 997 | public | active link | company domain and link fields | none | db lookup |

### Documents and privacy (`server/privateReferralRoutes.ts`, `server/referrerDocumentAccess.ts`)
| Route | Line | Caller | Ownership / scope predicate | Personal data | Rate limit | Edge input checks |
|---|---|---|---|---|---|---|
| `POST /api/documents`, `/raw`, `/opaque` | 490-516 | seeker | identity checked before the body is parsed; storage key under the caller's own prefix | own file metadata | size ≤ 10 MB | MIME allow-list; `validatePrivateDocument` |
| `POST /api/documents/uploads[/:sid/chunks\|/complete]` | 518-575 | seeker | upload session read by `(account.id, sessionId)` | own | 48 KB per chunk | integers, MIME, AES-GCM length checks |
| `GET /api/documents/:id` | 580 | owner or referrer | `getAccessibleReferralAttachment` (`db.ts:3354-3367`): owner, or the accepting referrer with no pass and no revoked grant, inside the later of acceptance + 30 days and the grant expiry (`referrerDocumentAccess.ts:57-69`); then the block check | file bytes; `no-store`, `nosniff`, attachment disposition | none | positive integer |
| `GET /api/documents/debug/upload-starts` | 517 | self | own rows, 15 minutes | own file names | none | A-7 |
| `/api/privacy/*` | 606-651 | self | every read and write keyed by `account.id`; export download by `(account.id, id)` | own data | export once every 24 h | positive integer |

### Ask drafts (`server/askDraftRoutes.ts`)
| Route | Line | Caller | Scope | Personal data | Rate limit | Input checks |
|---|---|---|---|---|---|---|
| `GET/PUT/DELETE /api/ask-drafts` | 27, 35, 47 | self | keyed by `account.id`, with no id parameter | own draft | none (A-8) | `askDraftInputSchema` (link ≤ 2,048, note capped) |

### Blocks (`server/blocksRoutes.ts`)
| Route | Line | Caller | Scope | Personal data | Rate limit | Input checks |
|---|---|---|---|---|---|---|
| `POST /api/blocks` | 146 | any | by member id, or by an ask the caller is part of (`:59-67`); self-block refused; unique pair, safe under races | counterpart id (A-4) | none (A-8) | positive integer; reason ≤ 255 |
| `GET /api/blocks/mine` | 179 | self | `blockerUserId = account.id`, at most 100 | own list | none | none |
| `DELETE /api/blocks/:id` | 188 | self | `id` and `blockerUserId` both match (`:48`) | none | none | positive integer |

### Safety and company suggestions (`server/safetyRoutes.ts`)
| Route | Line | Caller | Scope | Personal data | Rate limit | Input checks |
|---|---|---|---|---|---|---|
| `GET /api/safety-report-reasons` | 231 | public | none | none | none | none |
| `POST /api/safety-reports` | 235 | any | the referral must include the caller (`db.ts:950`); the evidence snapshot copies only the pair's messages | none | 20 a day | reason enum; details ≤ 2,000 (A-5) |
| `GET /api/safety-reports/mine`, `/company-suggestions/mine` | 255, 278 | self | keyed by `account.id` | own | none | none |
| `POST /api/company-suggestions` | 264 | any | n/a | none | 3 a day | checked in db |
| `/api/admin/safety-reports*`, `/api/admin/company-suggestions*` | 294-350 | admin | `role === "admin"` (`:287-292`); 401 when signed out, 403 for anyone else | reports, admin only | none | positive integer; status checked in db |

## Not covered here
- The rest of `privateReferralRoutes.ts` (credits, receipts, seeker alerts, notifications, opportunities, work-email codes, personal invites, smart pitch) was read for its scope predicates. Each one is keyed by `account.id` or gated on verified work email, and nothing worth a finding came up beyond A-1 and A-8. The work-email code is `D-100.otp-hmac`'s subject, and the admin money routes are `D-100.authz-admin-money`'s.
- No running service was probed. This is a code reading only.
