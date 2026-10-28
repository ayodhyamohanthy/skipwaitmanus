# D-100.authz-referral: authorization and personal data on the referral, document, block and safety routes

> Read-only audit (Tier 3, lane `security-audit-referral`, packet `docs/plans/D-100-security-audit.md`). Written by a Claude Code session in the D-225 reasoning role on Oct 28 2026. No code, registry or test was changed.

**Base read:** `main` at `76a8b5f048f180236106b6fd16eb082474a45d3d` (past `86559ba7`).

**Scope:** `server/privateReferralRoutes.ts`, `server/askDraftRoutes.ts`, `server/blocksRoutes.ts`, `server/safetyRoutes.ts` and `server/referrerDocumentAccess.ts`. Where a route's guard lives in the store, the store function in `server/db.ts` was read too (named in the inventory). The admin routes inside `privateReferralRoutes.ts` were checked only for their role gate. Admin sign-in and the money/admin internals belong to `D-100.authz-admin-money`.

**Rule 1 applies.** The repository is public. Findings that are unfixed and exploitable are listed below by ID and severity only. Their full write-ups went privately to the CEO (the account holder) in the session that produced this file. This file has no route, payload or repro for them.

## Outcome

| Severity | Count | Where |
|---|---|---|
| P0 | 0 | |
| P1 | 0 | |
| P2 | 2 | held privately (AR-1, AR-2) |
| P3 | 7 hygiene (H-1 to H-7) | below |

The core privacy rule holds: before acceptance, a referrer gets no seeker name and no resume file (D-019(e)). The document byte route, the claimed-detail view, the unclaimed preview and the conversation all check ownership or assignment on the server, and checked state comes from the database, not from the session. The two P2 findings are narrow gaps at the edge of that rule. Neither exposes a resume, and neither exposes a name the way the audit could trace it.

## Findings

| ID | file:line | What can go wrong | Who could do it | Severity | Suggested fix |
|---|---|---|---|---|---|
| AR-1 | held privately | An authorization re-check is missing on one referral decision path. Details are with the CEO. | Held | P2 | Held (one Tier 1 fix row, red-first test) |
| AR-2 | held privately | One route returns an internal identifier that the referral views otherwise withhold before acceptance. Details are with the CEO. | Held | P2 | Held (one fix row, red-first test) |
| H-1 | `server/safetyRoutes.ts:48,71,116,145`; `server/privateReferralRoutes.ts:458,891,904,918,942,960,974,1227,1256,1276,1631,1699,1756`; `server/blocksRoutes.ts:170-176` | Many catch blocks send `error.message` to the client, including on 500 and on catch-all 400/409 answers. The `/api` wrapper (`privateReferralRoutes.ts:209-220`) strips only database-driver text, so other internal messages (for example "Database unavailable" or a thrown library error) can still reach the user. This is plain-words hygiene, not a data leak found in practice. | Any signed-in caller who triggers an unexpected error | P3 | Send a fixed message on 500 and log the cause, as `POST /api/admin/payments/review/:paymentId` already does (`:1656-1666`). |
| H-2 | `server/privateReferralRoutes.ts:490-575`, `:1023`; `server/blocksRoutes.ts:146`; `server/askDraftRoutes.ts:35` | There is no per-user rate limit on document upload sessions or their chunks, legacy uploads, share-card creation, block create/remove or ask-draft saves. Each file is capped at 10 MB, but the number of upload sessions is not, so storage can be filled. Rate limits already exist for referral messages (30/hour, `:1352`), safety reports (20/day, `db.ts`), work-email codes and data exports. | Any signed-in account | P3 (availability/cost) | Add a per-user hourly cap on upload sessions and block writes, plus a sweep for staged chunks that never finish. |
| H-3 | `server/blocksRoutes.ts:28-29,174`; `server/db.ts` `createSafetyReport` (`reportedUserId`) | The two member-id inputs answer differently for an id that exists and one that does not, so a signed-in member can learn which user ids exist. Ids are sequential, so this reveals little, but the answer should not differ. | Any signed-in account | P3 | Accept or answer the same way whether the id exists or not. |
| H-4 | `server/privateReferralRoutes.ts:239-254`; `server/blocksRoutes.ts:82-114` | Block enforcement is fail-open by design: if the block lookup fails, threads, previews, documents and claims stay reachable for a blocked pair. This is a recorded choice ("a failed check never hides a thread") and the failure is not reported to Sentry on this path. | Nobody directly; it happens during a database fault | P3 | Keep fail-open if the owner prefers it, but send each swallowed failure to `captureServerError` so it is seen. |
| H-5 | `server/db.ts` `createSafetyReport`; `server/safetyRoutes.ts:37-43` | `reportedUserId` does not have to be the other person in the cited `referralRequestId`, and it can be any member. A false report can name an unrelated member. An admin reviews every report, so the harm is admin time and a possible wrongful action. | Any signed-in account | P3 | When both are given, require the reported user to be the counterpart, and show the admin when a report names someone outside a shared thread. |
| H-7 | `server/privateReferralRoutes.ts:1539-1542`; `server/db.ts:3662` `listReferralLedger` | The admin referral-ledger CSV quotes each cell but does not neutralise a leading `=`, `+`, `-` or `@` (spreadsheet formula injection). No user-controlled path was found today: ask job rows use fixed title and location values (`db.ts:1861` `companyAskJobRow`), the company field is a resolved domain, and the email columns are validated addresses. So this is hygiene for future columns. | Nobody today | P3 | Prefix any cell that starts with `= + - @` (or a tab or CR) with `'`. |
| H-6 | `server/privateReferralRoutes.ts:1013-1017` | Smart-pitch passes a short-lived signed URL of the seeker's own PDF resume to the configured AI provider (`server/_core/modelRouter.ts`). The route is owner-checked (`getOwnedResumeAttachmentForPitch`). Handing resume content to a third party is a privacy disclosure, so the owner should confirm the privacy notice covers it. | Not an attacker; a processing fact | P3 (privacy notice) | Owner item: confirm the notice names AI processing of the resume. Legal text stays owner-controlled. |

## Route inventory (what was checked)

Columns: who may call it, the ownership or scope predicate and where it lives, the personal data in the response, rate limit, and edge input checks. "Block" means the two-way block check (`isRequestBlocked`, fail-open, neutral 404).

### Documents and uploads
| Route | Caller | Predicate | Personal data out | Limit | Edge checks |
|---|---|---|---|---|---|
| `POST /api/documents`, `/raw`, `/opaque` | signed in (checked before body parse) | the caller is the owner of the new file | own file metadata | 10/14 MB body | MIME allow-list, `validatePrivateDocument` (magic bytes), AES-GCM shape |
| `POST /api/documents/uploads`, `/:sessionId/chunks`, `/:sessionId/complete` | signed in | session `ownerId = caller` (`db.getResumeUploadSession`); in-order chunks, total ≤ declared size (`appendResumeUploadChunk`) | own | 48 KB chunk, 10 MB total; no session count cap (H-2) | sanitised name, id regex, finalization lease |
| `DELETE /api/documents/draft`, `GET /api/documents/debug/upload-starts` | signed in | own rows only | own file names | none | none needed |
| `GET /api/documents/:attachmentId` | signed in | `db.getAccessibleReferralAttachment`: the owner, or the assigned referrer who accepted it themselves, has not passed, has no revoked grant, inside the 30-day window (`referrerDocumentAccess.ts:57-69`); then block | file bytes | none | integer id; `nosniff`, `attachment` disposition, `no-store` |

`referrerDocumentAccess.ts`: a claim writes no grant; only the referrer's own acceptance event counts; a revoked grant is never reopened; terminal transitions revoke in the same transaction (`db.ts` `transitionReferralRequestTx`). Verified against the code.

### Seeker side
| Route | Caller | Predicate | Personal data out | Limit | Edge checks |
|---|---|---|---|---|---|
| `POST /api/company-referrals` | signed in | attachments must be the caller's own and unbound, locked `FOR UPDATE` and bound in the same transaction; pinned work must be the caller's own (`db.createCompanyReferralRequest`) | own ask | plan caps, company cap, Idempotency-Key | URL validator, note schema, slug/alias/code regexes, zod for function and work ids |
| `GET /api/company-referrals/mine`, `/quote`, `/api/credits/*`, `/api/billing/receipts` | signed in | caller's own id only | own | none | zod on ledger query |
| `POST .../:id/withdraw` | signed in | `jobSeekerId = caller` under row lock | own | none | integer id |
| `POST /api/landed/journey` | signed in | `jobSeekerId = caller`, closed with a referrer; block | own | none | zod schema |
| `POST /api/referral-share-cards/:requestId` (and DELETE) | signed in | a participant, after acceptance (`authorizeApprovedReferralConversation`) | company domain only | none (H-2) | integer id |
| `GET /api/referral-share-cards/public/:token`, `/image.png`, `/share-card/:token` | public | unguessable active token, post-approval status | company domain and the sharer's invite code only | none | token regex, HTML-escaped domain |
| `/api/seeker-alerts*`, `/api/saved-roles*`, `/api/notifications*`, `/api/ask-drafts` | signed in | caller's own rows (`userId`/`ownerId` predicates) | own | none | integer ids; ask-draft zod |
| `/api/privacy/*` | signed in | own export/erasure only | own data export | export 1/24 h | integer id |

### Referrer side
| Route | Caller | Predicate | Personal data out | Limit | Edge checks |
|---|---|---|---|---|---|
| `GET /api/company-referrals/inbox`, `/api/referrer/home-bundle` | signed in | verified employee of the profile's company; own passes and saves; first look; held/waiting asks hidden; block-filtered | job link, pitch, attachment count; no seeker name or id | none | scope enum |
| `GET .../:id/preview` | signed in | verified, same company, pending, unassigned or assigned to the caller, not passed, first-look rule (`db.getUnclaimedCompanyReferralPreview`); block | pitch, job; seeker name stripped; files locked to metadata | none | integer id |
| `GET /api/company-referrals/:id` | signed in | `referrerId = caller`, not passed, pending or accepted by the caller (`db.getClaimedCompanyReferralDetail`); block; allow-list view (`buildClaimedAskDetailView`) | name and file links only after the caller's own acceptance | none | integer id |
| `POST .../:id/claim` | signed in | verified employee of the ask's company, pending, not waiting, not first-look-excluded, not passed, 5-claim cap, under row lock | none (response view drops the seeker id) | 5 open claims | integer id |
| `POST .../:id/one-click-review`, `/api/referrer-review-links/:token/decision` | signed in | verified employee of the ask's company, unassigned or assigned to the caller, first look, own link token (expiry, consumed, not passed); block | none | none | decision and reason enums, ethics confirmation |
| `POST .../:id/review` | signed in | see AR-1 (held) | none | none | decision enum |
| `POST .../:id/save` | signed in | verified, same company, pending, not passed, per-referrer row; block | none | none | integer id |
| `POST .../:id/progress`, `GET/POST .../:id/conversation` | signed in | a participant and post-acceptance (`authorizeApprovedReferralConversation`); block | message bodies of that thread only | 30 messages/hour | 3,000 chars, status enum, reference-id normaliser |
| `POST .../:id/extend-referred-deadline`, `/step-back`, `/confirm-referred` | signed in | refuse with 409 before identity while `REFERRED_DEADLINE_ENABLED` is off (`:224-225`) | none | none | integer id |
| `POST /api/company-referrals/availability/open` | signed in | verified (store), alerts only to asks allocated to the caller (`db.getSlotOpenedAlertRecipients` filters `referrerId = caller`) | none returned; seekers emailed | 1-3 slots | integer bound |
| `POST /api/opportunities` and renew/close | signed in | server work-email verdict (D-022); owner-only renew/close (404 otherwise) | poster first name only when exactly `true` | none | kind enum, dates; compensation length |
| `/api/work-email/otp/*`, `/api/company-referrals/verify-work-email` | signed in | single-use receipt bound to account and email; code send/verify are rate-limited and locked (`otpPolicy`) | domain only | yes (OTP policy) | lowercase email |
| `/api/referrer-fast-track/*` | `me`: signed in; resolve: public | own link; public answer is domain and active flag only | company domain | none | code/alias regex at ask creation |

### Blocks and safety
| Route | Caller | Predicate | Personal data out | Limit | Edge checks |
|---|---|---|---|---|---|
| `POST /api/blocks` | signed in | by member id: any existing member; by request: a participant only (`defaultFindCounterpart`) | see AR-2 (held) | none (H-2) | positive int, reason ≤ 255, one key only |
| `GET /api/blocks/mine`, `DELETE /api/blocks/:id` | signed in | `blockerUserId = caller` | own list (blocked user ids) | none | integer id |
| `POST /api/safety-reports` | signed in | a cited request must include the caller; the reported user only has to exist (H-5) | report reference | 20/day | reason enum, details ≤ 2,000 |
| `GET /api/safety-reports/mine`, `/api/company-suggestions*` | signed in | own rows | own | suggestion daily cap | name/website checks |
| `/api/admin/safety-reports*`, `/api/admin/company-suggestions*` | `role = admin` (401/403 otherwise) | admin only | reports and evidence | none | integer id, status enum in store |

### Admin routes inside `privateReferralRoutes.ts`
Every `/api/admin/*` handler in the file (`:1534-1782`) checks `identity.account.role === "admin"` before any read or write, and GETs get `private, no-store` (`:221`). How the admin role is granted is out of scope here (`D-100.authz-admin-money`). H-7 is the one admin-path item.

## Verified controls (no finding)
- Before acceptance, the seeker name and the files stay hidden in every referrer view: preview strips `candidateName` and locks files; detail is an allow-list; claim and one-click responses carry no seeker id; documents need the actor's own acceptance event.
- Ask creation cannot attach another person's file or a file already bound to another ask (owner + unbound check, `FOR UPDATE`, bound count re-checked).
- Passing ends the caller's access everywhere: inbox, preview, save, review link, documents (`referralRequestPasses` joins).
- The 48 h first look excludes other employees on preview, save, claim and decision.
- The referred-deadline actions refuse first while switched off.
- Block checks run on every per-ask route that reads or changes an ask, after identity and before the store; denials are a neutral 404 and are logged.
- Database-driver text is withheld from every `/api` JSON error (`isDriverErrorMessage`).

## Not covered
- Route behaviour was read, not run; no live or preview request was made (read-only row).
- `server/routers.ts` tRPC procedures that touch referrals are outside this row's file list.
- Client code that renders these responses was not reviewed.

## Next step for the CEO
Turn AR-1 and AR-2 into fix rows (AR-1 is Tier 1: it touches document access and identity; land it dark or behaviour-preserving with red-first tests, D-223 (3)). H-1 to H-5 and H-7 can share one Tier 2 hygiene row. H-6 is an owner item.
