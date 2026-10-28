# Packet D-089: the employee request-inbox link with a screen name (idea 1, loop L4)

> **PROPOSED, NOT ADOPTED. Revision 2** (same task, bounded). It applies the coordinator's eleven contract findings on revision 1 (`728bb44d`); §12 lists each with its disposition.
> - This commit changes only this file: no registry, register, code or other doc edit.
> - §9 and §10 are proposals, effective only if a coordinator adopts them through the protected docs path. Nothing below is built, registered, switched on or owner-approved beyond what §2 quotes. No builder takes a row before adoption.

> Read `docs/BRIEF.md` first, then this packet. Each row in §5 is its own task: claim it with the picker, build only that row, and edit only the paths in its `owns`. Write your status line in the Status section at the end; rows that share plan row D-089 never edit a §3b row (D-134).

| Field | Value |
|---|---|
| Queue rows (registration candidate) | `D-089.link` (Tier 1), `D-089.panel` (Tier 2), `D-089.landing` (Tier 1), `D-089.guard` (Tier 1). The parent `D-089-request-inbox` becomes the release row (Tier 1, D-223 (3)). |
| Decisions | D-089 (3), D-087, D-163 (5), D-017, D-050, D-098, D-106, D-128, D-090/D-162/D-187, D-086/D-227, D-099, D-223, D-225; also D-006, D-019(e), D-030/D-049/D-057, D-034, D-038, D-040, D-055, D-062, D-097, D-147, D-153, D-174, D-176, D-180, D-193, D-194, D-196, D-200, D-202 |
| Verified against | `origin/main` `72265110`, this commit's parent; the register's newest entry is D-229. Code citations were checked on `a4b022a5`, and `git diff --stat a4b022a5 72265110 -- server client shared drizzle src functions` is empty. No production query, API or provider call was made. |
| Migrations, env keys, dependencies | None. One in-code switch, `REQUEST_INBOX_ENABLED = false` in `shared/requestInbox.ts`. Name generation keys an HMAC with the existing `JWT_SECRET`, as `shared/jobsTick.ts` does; no new key. |
| Writer | Claude Opus 5.5, reasoning session (D-225). No claim marker was pushed, and the lock `agent/architect/d089-request-inbox` stays free. |

## 0. Read receipt (D-225)
- **Main and sync.**
  - Main is `72265110`. The highest register ID on main and every fetched origin branch is D-229.
  - The row's `syncedTo` is D-227. D-228 names another task, and D-229 says `Affects tasks: none`.
- **The pick.** The picker was run as dry runs only, never `--claim`. Revision 1 §0 lists its avoid list. The unmodified picker printed `WRITE THE PACKET FOR D-089-request-inbox` on `a4b022a5` and again on `e0c7e3ad`.
- **Read:**
  - Docs: `docs/BRIEF.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md` §§1-8, `docs/PRD.md`, `docs/BACKLOG.md` items 7-10.
  - Packets and plans: `D-090-BYOR.md` §§0-6, `D-086-demand-list.md`, `D-048-public.md`, `D-057-session-gate.md`, `FND-4-token-path-scrubbing.md`, the `D-048-p3-links` split row, `GOAL_UI_COVERAGE.md` §§1-4, the cited parts of `D-193-journey-foundations.md`.
  - PR #382's body and review thread.
  - Every register entry in the table above, plus D-028, D-060, D-088, D-102, D-104, D-173, D-189, D-226, D-228 and D-229.
- **Prior repo-only outcome.**
  - D-163 (5) created the row with `packet: null`. No lock or PR ever existed.
  - Revision 1 is `728bb44d` on this branch, with no adoption.
- **Goal contribution.** Loop L4 (D-087): referrer supply is the bottleneck. An employee who already gets referral requests on Blind, LinkedIn or Fishbowl pastes one link. Every request then arrives structured, private and in one inbox, so each verified employee is easier to reach and quicker to decide.

## 1. Goal
- **A readable, anonymous link.** A verified employee gives their existing personal link (`skipwait.me/refer/<company>/<name>`) a generated pseudonym. The pseudonym is never typed, and never taken from the account. The random `ref-…` alias stays the default.
- **No wasted request.**
  - The landing names the link by pseudonym only.
  - The server (`D-089.guard`) never lets a link request reach a suspended owner. When the owner is paused or at their limit, it routes the request to the company internally, with no public status.
- **An owner who can manage it** on the goal referrer home: see the link, pick a name, copy it, pause it, turn it back on. Today no page offers this (§3.6).

There is no new request shape, inbox, table or money rule.

## 2. Binding rules (quoted)
- **D-089 (3)** (owner): "build all three ideas, order 2 (bring-your-own-referrer one-time link), then 1 (employee request-inbox link with screen name), then 3 (...), after W0/W1 and the demand list; designer places each inside the goal system first." D-162 changed the order "for BYOR only".
- **D-087:** "L4 employee request-inbox link." "Changeable: weekly link cap 5, anonymous referrer identity". It also requires: "no seeker details exposed; referrers never charged; nothing that annoys users."
- **Row note (D-163 (5)):** "its build follows D-090-BYOR, so the packet PR adds D-090-BYOR (and D-086-demand-list, which ideas 1 and 3 still follow) to this row's dependsOn. ... The packet decides what 'with screen name' adds on top, reusing the D-106 screen name if #382 has landed, never the referrer's real name before an accept (D-019(e)) ... Tier 1: referrer identity on a public link."
- **D-017:** `/fast/:code` and `/refer/:company/:alias` keep "the chosen referrer and the job link ... so the ask goes to that referrer, not the whole company."
- **D-050:** "A personal-link ask counts as unclaimed until that referrer acts ... The 7-day expiry is suspended for launch (D-174); the rest of the lifecycle stands."
- **D-098** (draft, "owner go needed"): "Premium extras and privacy controls: designer drafts only, nothing priced, nothing live. Drafts: Referrer Insights, vanity link name, ...".
- **D-106:** the impact card returns "the referrer's fast-track screen name" (`referrerFastTrackLinks.vanityAlias`).
- **D-128:** "the referrer vanity-link feature is 'Your referral link' (current best, changeable)."
- **D-019(e) / BRIEF:** "A referrer sees no seeker name or resume ... until that referrer accepts." "A block hides two people from each other everywhere, including delivery."
- **Login rule (D-030/D-049/D-057):** referrer sign-in is the work-email code through `referrerSignInHref()`. D-057's session gate is unbuilt (`D-057-session-gate`, todo).
- **D-176:** "referrer availability is backend routing, never a browse gate or a visible status."
- **D-174:** "an ask never expires" ("for now I dont require any expiry").
- **D-187 (3):** `/r/:token` is BYOR's.
- **D-223 (1)/(3)/(6):** `dependsOn` names "only the rows whose output it needs"; "The merge is the parent's release row"; keep hot shared files in few rows.
- **D-153** (frozen): "promise only what works today." **D-173/D-180:** no "credit(s)" and no noun "ask" on a page. **D-097:** new behaviour ships behind a switch that is off until QA.

## 3. Current behaviour (verified; find functions by name, line numbers drift)
1. **The link exists (D-017).**
   - Table: `referrerFastTrackLinks` (`drizzle/schema.ts:679-689`), with unique `referrerId`, `linkCode` and `vanityAlias` (global).
   - Routes: `/fast/:linkCode` and `/refer/:companySlug/:vanityAlias` (`client/src/App.tsx:127-128`).
   - Telemetry: both Sentry scrubbers redact the browser paths (`server/sentry.ts:7-14`, `client/src/lib/sentry.ts:13-27`). Clarity lists them as excluded (`client/src/lib/clarity.ts:7`), but checks only once, at startup (`:18`).
2. **The alias is random.** It is `ref-` plus 10 hex characters (`server/db.ts:1371`), and `isSafeFastTrackAlias` validates it (`:1380-1383`). The only writers are `getOrCreateReferrerFastTrackLink` (`:1385-1404`) and `deactivateReferrerFastTrackLink` (`:1448-1452`); neither takes a row lock.
3. **Four resolvers ignore suspension.**
   - Public: `getPublicReferrerFastTrackLink` and `…VanityLink` (`server/db.ts:1406-1425`). Private, used at create: `getActiveReferrerFastTrackLink` and `…VanityLink` (`:1427-1446`).
   - All four check `isActive` and `isVerifiedEmployeeOfCompany` (`server/referrerAvailability.ts:28-30`: account type, verified time, domain) and nothing else.
   - The public ones answer anyone, signed out included, through `GET /api/referrer-fast-track/:linkCode` and `GET /api/referrer-fast-track/vanity/:companySlug/:vanityAlias` (`server/privateReferralRoutes.ts:987-1006`).
4. **Create skips availability.**
   - `createCompanyReferralRequest` (`server/db.ts:1873`) sets `available = fastTrackLink ? eligible : …isOpenReferrer…` (`:1916`), with an empty slot map for links (`:1915`). It inserts `referrerId` = owner (`:1960`) and spends at create (D-034).
   - **No availability slot is inserted** for a link request (`:1873-2001`), so the D-038 allocation lapse (`listReferralTimerCandidates`, `server/db.ts:3232`; `lapseAllocationTx`, `:3081`) never applies to it.
   - The coordinator's **synthetic local reproduction** (not production evidence, no incident claimed): open, paused, full and suspended owners each still got a covered request with a credit spend of −1 (4/4).
   - If the owner fails the in-transaction re-check, the request is inserted as waiting with `referrerId` still set (`:1911-1917,1960`; read from code, not reproduced).
5. **The availability contract** is `isOpenReferrer(candidate, domain, allocatedSlots)` (`server/referrerAvailability.ts:33-37`: verified, not paused, not suspended, under capacity) over `readAllocatedSlotCountsTx` (`server/db.ts:2648`, not exported), which counts unreleased `referralAvailabilitySlots`.
6. **The owner has no surface, and a paused link never returns.**
   - `ReferrerFastTrackCard` is imported only by its test; its mount was removed in #426.
   - `getOrCreateReferrerFastTrackLink` returns an inactive row unchanged (`server/db.ts:1391`).
7. **Old owner endpoints are live, with no switch** (`server/privateReferralRoutes.ts:962-986`):
   - `GET /api/referrer-fast-track/me` creates the link on first read. It returns `linkCode` and a `vanityUrl` built with `split(".")[0]` (`:970`). Signed out it answers 401; unverified, 403. Cache `private, no-store`.
   - `POST /api/referrer-fast-track/me/deactivate` answers 401 signed out. It checks no verification or suspension. It writes `isActive=false` and `deactivatedAt` on the caller's own row without a lock, and returns `{ deactivated }`. Cache `private, no-store`; 500 "We could not pause your link" on failure; activity `referrer_fast_track.link_paused`.
8. **Raw sinks can carry the alias from the old GET resolver path:**
   - client 5xx reports (`client/src/lib/apiResponse.ts:6-10`);
   - the alert email's `req.originalUrl` (`server/errorAlerting.ts:99`);
   - the slow-request log's `req.path` (`server/_core/index.ts:182`);
   - the signed-in workflow audit (`server/privateReferralRoutes.ts:300-309`).

   FND-4 scrubs `/api/referrer-fast-track/vanity/:companySlug/:vanityAlias` for Sentry and alerts ("the alias names one referrer, so it is personal data"). Its packet does not list the console log or the audit.
9. **The landing is a Kit page** (`client/src/pages/VanityFastTrackLink.tsx`). Its CTA goes to `/start?referCompany=&referAlias=`.
   - The goal redesign is `D-048-p3-links`: todo, dependencies done, owns `client/src/pages/goal/links/**`, unreleased.
   - After sending, the seeker's message depends on the server's `created.fastTrack` (`client/src/pages/explore/useAskComposer.tsx:557`).
10. **The inbox already handles link requests** (`server/db.ts:2193,2239`; `client/src/pages/MyCompanyInbox.tsx:315`).
    - A pass reopens the request to colleagues (`passReferralRequestTx`, `server/db.ts:2156`), and the credit stays spent (D-147).
    - A seeker can withdraw an unclaimed link request and get the credit back (D-050, `withdrawCompanyReferralRequest`).
11. **Abuse and admin tools.**
    - `createSafetyReport` takes a `reportedUserId` (`server/db.ts:940,953`), with reasons `SAFETY_REPORT_REASONS` (`:931-938`) and 20 a day.
    - `blockedCounterpartsFailOpen` (`server/blockedPairs.ts:52`) treats a failed lookup as "nobody blocked".
    - `requireAdmin` returns 401, then 403 (`server/companyDirectoryRoutes.ts:63-72`).
12. **Mount points and ownership.**
    - Mounting: `registerImpactCardRoutes` (`server/_core/index.ts:208`) has no open owner. `GoalReferrerHome.tsx` belongs to a done row.
    - Coverage: `scripts/goalUiCoverage.test.ts` scans only `client/src/components/`.
    - Hot files: open rows own `server/db.ts` and `server/privateReferralRoutes.ts` in one chain, `D-090-BYOR` → `D-132-item3` → `D-174-held-ask-reconfirm` → `D-174-ask-from-job` → `D-174-pool-nudges`.
13. **Name proposals on record. None is owner-approved.**
    - **Oct 21 agent proposal.** A generated pseudonym; the D-106 fixture example is `QuietFalcon` (`shared/shareImpactCard.ts:27`, PR #382 captures), with re-roll and a daily batch. The coordinator relayed the re-roll and daily-batch details; this session found no repository text for them.
    - **D-098's "vanity link name"**: a later premium choose-your-own-name designer draft, "nothing priced, nothing live", needing the owner's go.
    - **The backlog stub** (`docs/BACKLOG.md:36`): `skipwait.me/r/theirname`, "anonymous by default", "Needs the designer's spec first".
14. **Live privacy wording:** `client/src/pages/TrustPrivacy.tsx:16` ("We do not publish resumes, Referrer identities, or private request conversations."), and `GoalReferrerHome.tsx:265` ("Never ranked. Never public.").

## 4. Rulings this packet proposes (decided under D-200; changeable)
1. **The link is the existing vanity link.**
   - Path: `/refer/:companySlug/:screenName`. No new table or browser route. `/r/` stays BYOR's.
   - `/fast/:linkCode` keeps working as the code link, under the same guard (§4.4).
   - The structured request is today's composer, and the inbox is today's `/queue`.
2. **The screen name is a generated pseudonym** (§3.13 reconciled).
   - **What this packet adopts.** The Oct 21 *agent* proposal's mechanism, as this packet's changeable proposal. It claims no owner approval for it; the owner sees the captures at release.
   - **What it does not build.** A typed choose-your-own name is D-098's premium draft. Its price and go stay the owner's, so this packet neither builds it nor decides that it is free.
   - **Generation.**
     - Names come from fixed, reviewed word lists in `shared/requestInbox.ts`: at least 128 adjectives and 128 nouns, lowercase ASCII. The lists contain no person names, roles, brands, places or profanity, and no reserved word.
     - A name is `<adjective>-<noun>` (for example `quiet-falcon`), shown as "Quiet Falcon". It passes `isSafeFastTrackAlias`.
     - The name never derives from `users.name`, the email, the handle or any account field.
     - **Honesty line:** a generated name can coincidentally resemble a real person's name. If D-098's typed name is ever approved, a chosen name could deliberately match a real one.
   - **The daily batch.**
     - Each verified owner gets up to 5 candidates per UTC day: `HMAC-SHA256(JWT_SECRET, "request-inbox-name:" + referrerId + ":" + YYYY-MM-DD + ":" + i)` maps to a word pair. Taken names are skipped (at most 8 tries).
     - The owner picks one candidate, or keeps the current name.
     - "Re-roll" is tomorrow's batch. In-day re-rolls are not adopted, because they would allow churn.
   - **One change a day.** A pick is refused when the current alias is already one of today's candidates (`picked_today`), or when the name is not in today's batch (`not_offered`).
   - **Default.** The random `ref-…` alias stays the default, and the landing shows it as "a verified employee".
3. **One atomic verify-and-mutate contract for every new writer** (pick, resume, admin reset). Each runs in one transaction:
   1. **Lock** in this order: `users` row `FOR UPDATE`, then the `canonicalPeople` row (if any) `FOR UPDATE`, then `profiles` `FOR UPDATE`, then the `referrerFastTrackLinks` row `FOR UPDATE`. The order is the same in every new writer.
   2. **Verify under the locks:** the owner is not suspended (user or canonical person); `isVerifiedEmployeeOfCompany(profile, link.companyDomain)` holds; and `link.companyDomain === profile.workEmailDomain`.
   3. **Mutate with compare-and-set:** `UPDATE … WHERE referrerId = ? AND vanityAlias = ? AND isActive = ? AND companyDomain = ?`, using the values read under the lock. If `affectedRows !== 1`, roll back and answer 409 `link_changed`, with no retry inside the request.
   4. **Unique-index race:** duplicate key 1062 on `referrer_fast_track_alias_unique` rolls back and answers 409 `screen_name_taken`. Nothing is partly written.
   5. **Resume** refuses a link whose domain is not the profile's (409 `link_moved`); the owner's next `GET` re-mints it for the new company through `getOrCreate`. **Admin reset** writes a fresh `ref-` alias by compare-and-set on the current alias, and never touches `isActive` or `companyDomain`.
   6. **The unlocked legacy writers** (`getOrCreate`, `deactivate`) are left as they are. Their single `UPDATE` waits on the row lock, so the later commit wins. Compare-and-set catches any change they make between our read and our write. If the reviewer finds an existing path that takes these locks in the opposite order, stop (§5).
   7. **Squatting and churn.**
      - Names cannot be typed, so nobody can target a colleague's or a known name. Each person holds one name and changes it at most once a day.
      - A freed name returns to circulation only through another owner's random batch. It re-points an old URL only if that owner's company slug matches the old one, which is a residual risk (§11).
4. **`D-089.guard` enforces suspension and availability inside the server** (the hard boundary).
   - **Suspension (unconditional; restores "a suspension ... covers every alias").** All four resolvers (§3.3) treat a suspended owner (user or canonical person) as not found. Create refuses with `PERSONAL_LINK_UNAVAILABLE` before any credit, for `/fast` and `/refer` alike. So does an owner who fails the in-transaction verification re-check, which closes the §3.4 race.
   - **Availability (behind `REQUEST_INBOX_ENABLED`).**
     - At create, the owner is tested with the existing contract (§3.5): `readAllocatedSlotCountsTx` plus `isOpenReferrer`. Pending requests are never counted.
     - If the owner is open, today's path runs: the owner receives the request, with the spend at create.
     - If the owner is paused or at capacity, the request is created as an ordinary company request: `referrerId` null, normal D-034/D-047/D-062 routing, and the response says `fastTrack: false`. The seeker's existing post-send message then describes the real path (§3.9).
     - Nothing about the owner's state is published, and the public resolvers answer exactly as for an open owner (D-176).
   - **Unchanged.** The existing contract does not count link requests as capacity (they insert no slot, §3.4). Making them count would change the D-038 lifecycle, which is not proposed.
5. **The public resolve is `POST /api/request-inbox/resolve`, with a strict body.**
   - **Payload:** `{ screenName: string | null, companyDomain, companyName: string | null }`. There is no state field, and nothing about availability.
   - **One neutral 404 body** for an unknown, inactive, slug-mismatched, unverified or suspended owner.
   - **Blocked viewer.** A signed-in viewer blocked either way gets the same 404. If the block lookup fails, the answer is also that 404 (**fail-closed**), and the failure goes to Sentry.
   - **What the packet does not claim.**
     - It does not claim that a block hides a public link's existence: the same link resolves for a signed-out visitor and through the old GET resolvers.
     - It does not claim privacy from the schema alone. The guarantees are that create refuses a blocked pair before any credit (`BlockedPersonalLinkError`), and that delivery and notices skip blocked pairs (existing).
6. **Identity promises, stated exactly.**
   - The new routes carry no name in their own paths (POST bodies).
   - The old `GET …/vanity/:companySlug/:vanityAlias` stays live, so the alias can still reach the raw sinks in §3.8. The release therefore waits for **FND-4**. The console log and the audit, which FND-4 does not list, stay a named gap (§11).
   - A generated pseudonym is still a per-person identifier.
   - Authority to show it is D-089 (3) and D-106. The legal text is not reworded, and its existing phrase (§3.14) authorizes nothing extra. If the release reviewer finds the pseudonym in conflict with that phrase, the line goes to the owner under the standing legal-text rule (plan §6).
7. **Old endpoints stay live; the switch gates only new code.** With `REQUEST_INBOX_ENABLED` on or off, the old endpoints of §3.3 and §3.7, and `POST /api/company-referrals` with link fields, behave as today. The exception is the guard's suspension refusal, which applies whenever `D-089.guard` is on main.
   - **The panel pauses through the old deactivate route,** under its exact contract (§3.7). The panel treats `{ deactivated: false }` as "already paused". It treats 401 as signed out and 500 as a plain error with retry. After every action it re-reads `GET /api/request-inbox/me`.
   - **The panel never calls the old `GET …/me`,** because of its create-on-read side effect and its divergent path.
8. **Owner panel on the goal referrer home**, as a secondary section with no black commit. It shows:
   - the link, with a ghost "Copy link" (clipboard only, no analytics event);
   - today's candidates;
   - the owner's own private state, from `GET me`: "Link on" or "Link paused", plus "You're paused for all requests" when `profiles.paused` is set;
   - "Pause link" or "Turn link back on".

   Signed out or unverified, it shows one link to `referrerSignInHref("/referrer-home")`.
9. **Landing in the goal links surface, vanity links only.** It shows the open or unavailable state and one black commit, and sets `noindex,nofollow` at runtime.
   - Open goes to `/start?referCompany=&referAlias=` (unchanged).
   - Unavailable goes to `/start`.
10. **Abuse.**
    - **Report this link** (signed in): the server resolves the owner and calls `createSafetyReport` with `reportedUserId`; the owner's id is never returned.
    - **Admin reset** of a name.
    - **Suspension** through existing tools.
11. **One link path.** New paths, and `server/impactCard.ts:114`, use `companySlugFromDomain(link.companyDomain)`.
12. **D-057.** This packet classifies none of its routes for the D-057 gate, and no reviewer of this epic may pre-authorize D-057's list. If `D-057-session-gate` lands first and its route-list pin needs these routes classified, `D-089.link` stops and reports (§5).
13. **No analytics event in the client.** Clarity is not consent-gated (the coordinator's H8 finding). A future event needs its own current-consent and sensitive-route guard.
    - Server activity rows carry no name, token or email: `request_inbox.resolved`, `name_picked`, `name_taken`, `link_resumed`, `reported`, `name_reset`, plus `personalLink: "routed"` on rerouted creates.
14. **Money.**
    - No new debit, refund, ledger, price or entitlement.
    - Rerouted requests follow the normal rules.
    - The remedy for an unanswered link request is the existing D-050 withdrawal. The owner's recorded direction is no expiry for now (D-174).
    - This packet adds no retarget, lapse or expiry, and asks the owner nothing.
15. **Dependencies.**
    - `D-089.link` waits for `D-090-BYOR` (idea 2 then idea 1).
    - `.panel` waits for `.link`.
    - `.landing` waits for `.panel` and `D-048-p3-links`.
    - `.guard` waits for `.link` (the switch) and for `D-174-pool-nudges`, the tail of the open `server/db.ts` chain, so no existing holder is bypassed.
    - The release waits for all four, `D-090-BYOR`, `D-086-demand-list` and `FND-4`.
    - `D-099-bonus-pages` keeps its edge to the parent.

### 4.16 Copy (proposed; exact strings pinned)
- **Landing, open:**
  - Heading: "Request a referral from {label} at {Company}." With a default name: "Request a referral from a verified employee at {Company}."
  - Body: "{label} is the generated name a verified employee at {Company} uses for this link. Add the job link, your resume and a short note. Your request goes to them while they're taking requests, and otherwise to other verified employees at {Company}. Your name and resume stay hidden until someone accepts."
  - Disclaimer: "This does not bypass {Company}'s application process or guarantee a referral."
  - Commit: "Start your referral request".
- **Landing, unavailable:** "This referral link isn't available." / "It may have been paused or renamed. Nothing was sent." Commit: "Request a referral another way". Report: "Report this link" → "Thanks. We'll review it."
- **Panel:**
  - Heading: "Your referral link" (D-128).
  - "Share it where people ask you for referrals. Requests through it come to you while you're taking requests, and to your colleagues while you're paused or at your limit. Names and resumes stay hidden until someone accepts."
  - Name label: "Name on your link". Help: "Pick one of today's names. New options tomorrow. Names are generated, not taken from your account, and anyone with your link sees them. Picking a new one turns off your old link."
  - Errors: "That name was just taken. Pick another." / "You've already picked a name today." / "That name isn't one of today's options."
- **Pins test the templates, not the inserted values.**
  - Tests check each template with placeholders unfilled. They forbid positive claims only: "guaranteed", "we guarantee", "will refer", "will be referred", "open to requests", "is waiting", "spots", any digit, "credit", and the noun "ask".
  - The disclaimer's negative "or guarantee a referral" is pinned exactly and allowed.
  - Inserted names and companies are never scanned.

## 5. The rows
Every row: claim it through the picker, write red tests first, make one commit per step with `pnpm check` and the focused tests green on each commit, and run the full gate on the merged result. Tier 1 rows open a draft PR and get an independent review (D-151).

**Stop if (every row):**
- a cited function or contract changed;
- a test fails for a reason you cannot explain;
- the work needs a file outside `owns`;
- an existing path locks the §4.3 tables in another order.

### 5.1 `D-089.link` (Tier 1; M)
- **Waits for:** `D-090-BYOR`.
- **Do:**
  - **`shared/requestInbox.ts`:**
    - the switch;
    - the word lists, `screenNameLabel` and `isDefaultScreenName`;
    - strict Zod schemas for resolve (body and payload §4.5), `me` (`{ path, screenName, label, isDefaultName, isActive, profilePaused, pickedToday, candidates }`), pick `{ name }`, report and admin reset;
    - the §4.16 templates.
  - **`server/requestInbox.ts`:**
    - `todaysCandidates(referrerId, now)`;
    - `loadRequestInboxForOwner`;
    - `pickScreenName`, `resumeRequestInboxLink` and `adminResetScreenName`, all under the §4.3 contract;
    - `resolveRequestInbox` (§4.5);
    - `reportRequestInbox`.

    It imports `getOrCreateReferrerFastTrackLink`, `companySlugFromDomain`, `isSafeFastTrackAlias`, `createSafetyReport` and `selectBlockedCounterparts` without editing them. For the fail-closed rule it calls `selectBlockedCounterparts` (`server/blockedPairs.ts:37`, which throws on failure), never `blockedCounterpartsFailOpen` (which swallows the error). It treats a throw as blocked and reports it.
  - **`server/requestInboxRoutes.ts`:**
    - `GET /api/request-inbox/me`, `PUT …/me/screen-name`, `POST …/me/resume`, `POST /api/request-inbox/resolve`, `POST /api/request-inbox/report`;
    - `POST /api/admin/request-inbox/reset-screen-name`: admin check first, then 404 while the switch is off;
    - every user route answers 404 while the switch is off, before any read;
    - cache: `no-store` everywhere, and `private, no-store` for the owner and admin routes;
    - 503 bodies carry no name or id.
  - **Mount:** inside `registerImpactCardRoutes` (switch only, at most 12 lines).
  - **`server/impactCard.ts`:** `linkPath` per §4.11.
- **Tests (red first):**
  - **`shared/requestInbox.test.ts`:**
    - the lists are lowercase ASCII, disjoint from the reserved set and the deny words, and every pair passes `isSafeFastTrackAlias`;
    - `screenNameLabel("quiet-falcon")` is "Quiet Falcon";
    - the schemas reject unknown keys and any `state` or availability field;
    - the template pins (§4.16).
  - **`server/requestInbox.fixture.test.ts`** (in-memory kit):
    - **Batches:** a batch is deterministic per referrer and UTC day and differs the next day; taken names are skipped.
    - **Pick:** stores the name; refuses `not_offered` and `picked_today`; a racing duplicate gets `screen_name_taken`, with nothing partly written.
    - **Suspension:** a suspended user or canonical person cannot pick, resume or be reset into a usable link.
    - **Compare-and-set:** changes between read and write give `link_changed`. Resume after a domain move gives `link_moved`. Admin reset vs pick, and resume vs legacy deactivate, each end in one consistent row.
    - **Resolve:** the neutral 404 for each §4.5 case; a blocked viewer, and a failing block lookup, both give the 404; a default alias gives `screenName: null`; a deep scan finds no id, name, email, handle or availability key.
    - **Report:** passes `reportedUserId` and never returns it.
  - **`server/requestInboxRoutes.test.ts`:**
    - with the switch off, 404 with no loader call (spies), and the admin route answers 401/403 first;
    - with it on, each status and header;
    - no route path has a `:` parameter.
  - **`server/impactCard.test.ts`:** a directory slug that differs from the domain's first label still gives a `linkPath` that resolves.
- **Owns:** `shared/requestInbox.ts`, `shared/requestInbox.test.ts`, `server/requestInbox.ts`, `server/requestInbox.fixture.test.ts`, `server/requestInboxRoutes.ts`, `server/requestInboxRoutes.test.ts`, `server/impactCardRoutes.ts (switch only)`, `server/impactCard.ts`, `server/impactCard.test.ts`.
- **Stop if:**
  - any step needs `server/db.ts`;
  - the in-memory kit cannot express `FOR UPDATE`. In that case, write the lock order as a source pin, and the coordinator decides whether a real-MySQL test is needed.
  - `D-057-session-gate` landed and its route pin needs these routes classified (§4.12).

### 5.2 `D-089.panel` (Tier 2; S)
- **Waits for:** `D-089.link`.
- **Do:**
  - `client/src/pages/goal/request-inbox/requestInboxApi.ts`: React Query over the new routes, plus the old deactivate route under §4.7. Responses are parsed with the shared schemas.
  - `RequestInboxLinkPanel.tsx` (§4.8, §4.16): explicit loading, error, offline, signed out or unverified, default, named, picked-today, paused and profile-paused states. No `data-g-primary`, and no analytics.
  - Switch-only mount in `GoalReferrerHome.tsx`.
- **Tests (red first), `requestInboxPanel.test.tsx`:**
  - **Switch off:** no change and no fetch.
  - **States:** every state's copy.
  - **Sign-in:** the `referrerSignInHref` href, and no `SignInButton` or `openSignIn` import.
  - **Pause:** goes to the old route; `{ deactivated: false }` and 500 handled.
  - **Copy action:** copies the URL and calls no analytics function.
  - **Page:** exactly one `data-g-primary`.
- **Proof:** captures at 1280 and 390 (fictional fixtures): default, named, picked-today, paused.
- **Owns:** `client/src/pages/goal/request-inbox/RequestInboxLinkPanel.tsx`, `client/src/pages/goal/request-inbox/requestInboxApi.ts`, `client/src/pages/goal/request-inbox/requestInboxPanel.test.tsx`, `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx (switch only)`, `design/goal-ui/captures/request-inbox/panel/**`.

### 5.3 `D-089.landing` (Tier 1; S)
- **Waits for:** `D-089.panel` (the API module) and `D-048-p3-links`.
- **Do:** `RequestInboxLanding.tsx` with the open and unavailable states, loading, error and offline, the report form (seeker sign-in when signed out) and `noindex,nofollow`. Switch-only mount in the goal vanity page.
- **Tests (red first), `requestInboxLanding.test.tsx`:**
  - **Switch off:** no change and no fetch.
  - **Copy:** the exact §4.16 copy; a default alias never shows `ref-`.
  - **No availability:** the page renders no availability wording.
  - **Links:** the two hrefs (§4.9).
  - **Page:** one black commit in every state; the meta tag is set.
  - **Report:** one POST.
- **Proof:** captures at 1280 and 390: open (named and default), unavailable, report.
- **Owns:** `client/src/pages/goal/request-inbox/RequestInboxLanding.tsx`, `client/src/pages/goal/request-inbox/requestInboxLanding.test.tsx`, `client/src/pages/goal/links/** (switch only)`, `design/goal-ui/captures/request-inbox/landing/**`.

### 5.4 `D-089.guard` (Tier 1: identity and money path; M)
- **Waits for:** `D-089.link` (imports the switch) and `D-174-pool-nudges`, the tail of the `server/db.ts` holders (§3.12).
- **Do (§4.4):**
  - Add the suspension join to all four resolvers.
  - At create, in order: suspension, verification, then the existing block refusal, all before any credit. Behind the switch, the `isOpenReferrer` and `readAllocatedSlotCountsTx` test, rerouting when the owner is not open; `fastTrack` in the response is true only when the owner receives the request.
- **Tests (red first), `server/db.personalLinkGuard.test.ts`:** turn the synthetic 4/4 reproduction (§3.4) into pins, for both `/fast` codes and `/refer` aliases.
  - **Open owner:** owner, spend 1.
  - **Suspended user or canonical person:** `PERSONAL_LINK_UNAVAILABLE`, no row and no spend, with the switch on or off; the public resolvers return 404.
  - **Paused, or allocated slots at capacity, with the switch on:** `referrerId` null and `fastTrack: false`. With an open colleague, the request is delivered and spent; with none, it waits with no spend.
  - **The same, with the switch off:** today's behaviour.
  - **Verification race:** refused, with no waiting row that keeps a `referrerId`.
  - **Unchanged:** the blocked pair keeps the inactive-link answer before any credit; idempotent replay is unchanged.
- **Owns:** `server/db.ts`, `server/db.personalLinkGuard.test.ts`.
- **Stop if:** rerouting needs `server/privateReferralRoutes.ts` or client changes, or the D-174 rows changed create semantics.

### 5.5 `D-089-request-inbox`: the release row (Tier 1)
- **Waits for:** `D-089.link`, `.panel`, `.landing`, `.guard`, `D-090-BYOR`, `D-086-demand-list`, `FND-4`.
- **Do:**
  - Flip `REQUEST_INBOX_ENABLED`.
  - Add the `AGENTS.md` map row.
  - Update the PRD roadmap row.
  - Add the plan §3b row "D-089".
- **Before flipping:**
  - QA captures.
  - The Tier 1 privacy review against §3.14 and §4.6.
  - The CEO's sign-off.
  - The goal `referrer-home` and `links` surfaces released by their own rows. If those rows don't exist, stop and ask the coordinator.
- **Done when:** the live `POST /api/request-inbox/resolve` returns only the §4.5 keys (paste the response). A suspended QA owner's link answers 404 on the old and new resolvers. Screens at 1280 and 390.
- **Owns:** `shared/requestInbox.ts (switch only)`, `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`.

## 6. Out of scope
- **Server:** every server file except `.guard`'s `server/db.ts`. That includes `server/privateReferralRoutes.ts`, `server/_core/index.ts`, `server/sentry.ts`, `server/errorAlerting.ts`, `server/blockedPairs.ts` and `server/referrerAvailability.ts`.
- **Client:** `client/src/App.tsx`, `client/src/lib/{flags,clarity,goalSurfaces}.ts`, `MyCompanyInbox.tsx`, the Kit link pages, `ReferrerFastTrackCard.tsx`, the `/start`, `/ask` and sign-in hand-off.
- **Config and data:** `.env.example`, `src/worker.ts`, `functions/**`, `drizzle/**`, `GOAL_UI_COVERAGE.md`.
- **Behaviour:**
  - the old endpoints' code (§4.7);
  - a typed or premium name (D-098);
  - link requests counting as capacity;
  - any expiry, lapse or retarget;
  - BYOR's `/r/:token`;
  - the D-194 `/share` link.

## 7. Privacy, legal text and money
- **Privacy:** what is promised is exactly §4.5-§4.6. The legal text is unchanged, and any conflict goes to the owner under the legal-text rule.
- **Money:** only `.guard` touches the create path. It refuses before any credit, or routes into the existing rules (§4.4, §4.14).

## 8. Owner questions
None. The typed name stays D-098's owner-held draft (no question is raised; its status already says "owner go needed").

## 9. Registry delta (proposed; not applied)
**Probe (scratch copy only).** `validateAssignments` (`scripts/nextTaskCore.mjs:273`) with the parsed register, applied to `72265110`'s `assignments.json`: see §12 item 1 for the counts on this revision. `syncedTo` is D-229 for every new or changed row.

Parent `D-089-request-inbox`:
```json
{"packet": "docs/plans/D-089-request-inbox.md", "status": "todo", "syncedTo": "D-229", "title": "Employee request-inbox link (D-089 (3), loop L4): generated pseudonym on the existing personal link, server guard, owner panel, landing; release row", "dependsOn": ["D-089.link", "D-089.panel", "D-089.landing", "D-089.guard", "D-090-BYOR", "D-086-demand-list", "FND-4"], "owns": ["shared/requestInbox.ts (switch only)", "AGENTS.md", "docs/PRD.md", "docs/KIT_V4_BUILD_PLAN.md"], "note": "D-089 packet §5.5: flips REQUEST_INBOX_ENABLED after its four rows, FND-4, QA, the Tier 1 privacy review and CEO sign-off, once the goal referrer-home and links surfaces are released. Owner order: after D-090-BYOR and D-086-demand-list. D-099-bonus-pages keeps its edge."}
```
New rows, above the parent (common fields: `"row": "D-089"`, `"packet": "docs/plans/D-089-request-inbox.md"`, `"status": "todo"`, `"syncedTo": "D-229"`, `"epic": "D-089-request-inbox"`):
```json
[
  {"id": "D-089.link", "tier": 1, "lane": "request-inbox-link", "branch": "agent/queue/d089-link", "dependsOn": ["D-090-BYOR"], "owns": ["shared/requestInbox.ts", "shared/requestInbox.test.ts", "server/requestInbox.ts", "server/requestInbox.fixture.test.ts", "server/requestInboxRoutes.ts", "server/requestInboxRoutes.test.ts", "server/impactCardRoutes.ts (switch only)", "server/impactCard.ts", "server/impactCard.test.ts"], "title": "Request-inbox link, server (D-089): generated pseudonym daily batch, atomic pick/resume/admin reset, fail-closed POST resolve, report; switch off", "note": "D-089 packet §5.1, §4.2-§4.5. No server/db.ts edit; mounts in registerImpactCardRoutes."},
  {"id": "D-089.panel", "tier": 2, "lane": "request-inbox-panel", "branch": "agent/queue/d089-panel", "dependsOn": ["D-089.link"], "owns": ["client/src/pages/goal/request-inbox/RequestInboxLinkPanel.tsx", "client/src/pages/goal/request-inbox/requestInboxApi.ts", "client/src/pages/goal/request-inbox/requestInboxPanel.test.tsx", "client/src/pages/goal/referrer-home/GoalReferrerHome.tsx (switch only)", "design/goal-ui/captures/request-inbox/panel/**"], "title": "Request-inbox owner panel on the goal referrer home (D-089): link, daily names, private state, pause via the old route; no analytics; switch off", "note": "D-089 packet §5.2, §4.7-§4.8."},
  {"id": "D-089.landing", "tier": 1, "lane": "request-inbox-landing", "branch": "agent/queue/d089-landing", "dependsOn": ["D-089.panel", "D-048-p3-links"], "owns": ["client/src/pages/goal/request-inbox/RequestInboxLanding.tsx", "client/src/pages/goal/request-inbox/requestInboxLanding.test.tsx", "client/src/pages/goal/links/** (switch only)", "design/goal-ui/captures/request-inbox/landing/**"], "title": "Request-inbox landing in the goal vanity link page (D-089): open and unavailable only, no availability status, report, noindex; switch off", "note": "D-089 packet §5.3, §4.9."},
  {"id": "D-089.guard", "tier": 1, "lane": "request-inbox-guard", "branch": "agent/queue/d089-guard", "dependsOn": ["D-089.link", "D-174-pool-nudges"], "owns": ["server/db.ts", "server/db.personalLinkGuard.test.ts"], "title": "Personal-link server guard (D-089): suspended owners refused on all four resolvers and at create; paused or full owners routed to the company via isOpenReferrer (switch)", "note": "D-089 packet §5.4, §4.4. Waits for the tail of the open server/db.ts chain; the release hard-depends on it."}
]
```
In the adoption PR (D-068): `docs/plans/README.md`, the PRD roadmap row, and §10.

## 10. Register entry (provisional ID)
**D-230 is provisional.** At adoption, re-check the next free ID against main and every open branch. This packet is not one of D-229's three carriers, so that expired procedure cannot land it; it needs its own protected adoption.

| D-230 | 2026-10-28 | **The D-089 request-inbox link gets its packet: the existing D-017 vanity link with a generated pseudonym, a server guard that refuses suspended owners and routes paused or full owners to the company internally, an owner panel and a landing, with no public availability status (decided under D-200 by Claude Opus 5.5 as a reasoning session (D-225); changeable).** (1) The name is generated from reviewed word lists, as a daily batch of up to 5 per owner, one change a day. It is never typed and never derived from the account. The typed name stays D-098's owner-held premium draft. (2) Every name, resume or reset write is one locked, compare-and-set transaction that re-verifies domain and suspension; unique-index races answer 409. (3) `D-089.guard` adds suspension to all four resolvers and to create (unconditional), and behind the switch tests availability with `isOpenReferrer` over allocated slots. Paused or full owners' requests become ordinary company requests, and nothing about a person's state is published (D-176). (4) The public resolve is a POST with a strict payload. It fails closed on block lookups, and claims no existence-hiding. The old GET resolvers stay live, so the release waits for FND-4. (5) The remedy for an unanswered link request stays D-050 withdrawal under D-174's no-expiry direction. (6) Rows `D-089.link`, `.panel`, `.landing`, `.guard` (after `D-174-pool-nudges`) and the release row (after its rows, `D-090-BYOR`, `D-086-demand-list` and `FND-4`); `D-099-bonus-pages` keeps its edge. Rating 7/10. For: loop L4 on live code, plus a real fix for a suspended-owner gap. Against: the guard's place behind the `server/db.ts` chain lengthens the D-099 wait, and the generated-name mechanism is an agent proposal the owner has not seen. | `origin/main` `72265110`; `server/db.ts:1371-1452,1873-2001,2648`; `server/referrerAvailability.ts:28-37`; `server/privateReferralRoutes.ts:962-1006`; PR #382; D-098; the coordinator's synthetic 4/4 reproduction. | Extends D-017 and D-106; applies D-089 (3), D-087, D-163 (5), D-176 and D-223. Affects tasks: D-089-request-inbox, D-089.link, D-089.panel, D-089.landing, D-089.guard. | proposed |

## 11. Gaps and risks
1. **No owner-approved design.** The generated-name mechanism is an agent proposal adopted as this packet's changeable proposal (§4.2). The captures go to the owner at release.
2. **The D-099 wait grows.** The release now waits on `.guard`, which waits for `D-174-ask-from-job` and `D-174-pool-nudges`. The order is unchanged.
3. **Raw sinks outside FND-4's list** (the console log and the audit, §3.8) can still carry an old-path alias.
4. **A freed name** can re-point an old URL at a same-company owner who later draws it. This is rare and random; a tombstone table is a follow-up if QA sees it.
5. **Global uniqueness** means a name taken at one company is unavailable everywhere.
6. **Link requests do not consume capacity** under the existing contract (§4.4).
7. **Clarity's startup-only route check** (§3.1) is unchanged here.
8. **Rate limiting.** The resolve has no rate limit (`consumeDurableLimits` is unused).
9. **D-206:** only the decisions this packet rests on were rated (appendix).

## 12. Revision 2 dispositions (the coordinator's findings on `728bb44d`)
1. **The release hard-depends on F1**, now `D-089.guard`. The guard covers all four resolvers, `/fast`, `/refer` and create, and sits after the db.ts chain (§4.4, §5.4). The new resolve fails closed and claims no existence-hiding (§4.5).
   - **Probe:** `validateAssignments` with the register on `72265110` gives 221 baseline rows, 0 errors; the candidate gives 225 rows, 0 errors. Every overlap is ordered: `.guard` waits for the `server/db.ts` chain through `D-174-pool-nudges`.
2. **Capacity** is `isOpenReferrer` over allocated slots. Pending requests are never counted. The synthetic 4/4 reproduction is cited as synthetic (§3.4).
3. **Q1 and its recommendation are removed.** D-050 withdrawal and D-174's no-expiry direction stand. Nothing is asked of the owner (§4.14).
4. **No per-person paused or full status is published** (§4.4, §4.5, §4.9).
5. **The atomic contract** covers the lock order, re-verification, compare-and-set, the 1062 race, resume, reset and the legacy writers; daily generated names bound squatting and churn (§4.3). D-057 is not pre-authorized (§4.12).
6. **The old pause route's contract is explicit,** and old endpoints are not gated by the switch (§3.7, §4.7).
7. **Identity promises are stated exactly.** The release waits for FND-4. Names are never auto-derived, the real-name resemblance is stated honestly, and the legal phrase is not relied on (§4.2, §4.6).
8. **The Clarity event and its test are removed** (§4.13).
9. **The documented proposals are reconciled** (§3.13, §4.2), with no pricing or approval invented.
10. **Pins test templates for positive claims only** (§4.16).
11. **D-230 is provisional** (§10).

## Appendix: ratings (D-206, scoped)
| Decision | Rating | Note |
|---|---|---|
| D-089 (3) order | 6 | Owner-reserved, kept; L4 waits behind long chains. |
| D-087 anonymous by default | 8 | Above 7: protects employees; generated names keep it. |
| D-017/D-050 personal-link lifecycle | 5 | Suspended owners still receive requests today (fixed by `.guard`); no lapse for unanswered requests (D-050 withdrawal stands). |
| D-098 typed vanity name as a premium draft | 6 | Owner-held; a free generated name meets L4 without pre-empting it. |
| D-176 availability is routing only | 8 | Above 7: here it removes a public status that would have leaked a person's state. |

## Status
- D-089-request-inbox: packet revision 2 proposed (not adopted); §9 and §10 not applied.
- D-089.link, D-089.panel, D-089.landing, D-089.guard: not registered.
