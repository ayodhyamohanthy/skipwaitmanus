# Packet D-089: the employee request-inbox link with a screen name (idea 1, loop L4)

> **PROPOSED, NOT ADOPTED.** A reasoning session (D-225) wrote this packet for the coordinator to validate and adopt.
> - This commit adds only this file: no registry, register, code or other doc edit.
> - §9 and §10 are proposals, effective only if a coordinator adopts them through the protected docs path.
> - Nothing below is built, registered, switched on or owner-approved beyond what §2 quotes. No builder takes a row before adoption.

> Read `docs/BRIEF.md` first, then this packet. Each row in §5 is its own task: claim it with the picker, build only that row, and edit only the paths in its `owns` (scope-check fails anything else). Write your status line in the Status section at the end. Rows that share plan row D-089 never edit a §3b row (D-134).

| Field | Value |
|---|---|
| Queue rows (registration candidate) | `D-089.link` (Tier 1), `D-089.panel` (Tier 2), `D-089.landing` (Tier 1). The parent `D-089-request-inbox` becomes the release row (Tier 1, D-223 (3)). |
| Decisions | D-089 (3), D-087, D-163 (5), D-017, D-050, D-106, D-090/D-162/D-187, D-086/D-227, D-099, D-223, D-225; also D-006, D-019(e), D-030/D-049/D-057, D-034, D-038, D-040, D-055, D-062, D-097, D-147, D-153, D-174, D-176, D-180, D-193, D-194, D-196, D-200, D-202 |
| Verified against | `origin/main` `72265110` (Oct 28 2026), this commit's parent. Research began on `a4b022a5`. Main then moved through `e0c7e3ad` and `25ebfd2c` in docs, registry and picker scripts only: `git diff --stat a4b022a5 72265110 -- server client shared drizzle src functions` is empty, so every code citation holds. The D-089 row is unchanged (architect, `packet: null`, `syncedTo` D-227). No production query, API or provider call was made. |
| Migrations, env keys, dependencies | **None.** One in-code switch, `REQUEST_INBOX_ENABLED = false` in `shared/requestInbox.ts` (the D-193/D-086 pattern). No new table: the link is the existing `referrerFastTrackLinks` row. |
| Writer | Claude Opus 5.5, reasoning session (D-225). No claim marker was pushed (the coordinator ruled out registration and pushes outside this branch); the lock `agent/architect/d089-request-inbox` stays free. |

## 0. Read receipt (D-225)
- **Main:** fetched `25ebfd2c` (merge of #790) before writing, and `72265110` (merge of #795) before committing. The highest register ID on main and on every fetched origin branch is D-229, and no branch holds D-230.
- **This row is in sync.** Its `syncedTo` is D-227. The two newer entries do not name it: D-228 names `POSTMERGE-oct22-review`, and D-229 says `Affects tasks: none`. The picker's own `outOfSyncOf` returns null for the proposed rows at `syncedTo: D-229`.
- **The pick (dry runs of `node scripts/next-task.mjs --as "Claude Opus 5.5" --avoid <list>`, never `--claim`).**
  - The coordinator approved two avoids: `CI-architect-real-checks` (its #787 review was done and routed) and `POSTMERGE-oct22-review` (another session held its stage).
  - Under the coordinator's rule, implementation, fix and landing picks (D-225) were then excluded one by one:
    - fix: `REGISTER-D212`, `D-090-BYOR`;
    - landing-slot waits, traced to their land rows: `D-048-dark-mode`, `ASSIST-approval-cost`, `D-048-F-shell-parts`, `BRANCH-HYGIENE-1`;
    - builds: `SKIPPY-fix.s1-ssrf`, eleven `D-048-p3-*` rows, `D-057-session-gate`, `FND-4`, `PICKER-review-wording`, `D-180-conversation-copy`.
  - Two reviews were excluded too:
    - `D-048-p3-live-review-conversation`: a Claude session claimed it and planned its build, and the executor's model family is unverified, so D-151 independence cannot be shown.
    - `D-048-p3-agents`: its head `9dd7236e` is unchanged since the 12:11Z checkpoint on #778.
  - The unmodified picker then printed `WRITE THE PACKET FOR D-089-request-inbox` on `a4b022a5` and again on `e0c7e3ad`. The coordinator declared that settled.
- **Read** (full, or the cited ranges): `docs/BRIEF.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md` §§1-8 with its Oct 28 D-202 changes, `docs/PRD.md`, `docs/BACKLOG.md` item 10; the packets `D-090-BYOR.md` §§0-6, `D-086-demand-list.md` §§0-11, `D-048-public.md`, `D-057-session-gate.md`, `FND-4-token-path-scrubbing.md` §§1-3, the `D-048-p3-links` row of `D-048-phase-3-split.md`, `GOAL_UI_COVERAGE.md` §§1-4, the cited parts of `D-193-journey-foundations.md`, `PACKET-registration-three-carriers.md`; and every register entry listed in the table above, plus D-028, D-060, D-088, D-102, D-104, D-173, D-189, D-226, D-228 and D-229.
- **Prior repo-only outcome.**
  - D-163 (5) created the row on Oct 23 with `packet: null`.
  - No architect lock was ever pushed (`git ls-remote origin 'refs/heads/agent/architect/d089*'` is empty), and no PR exists.
  - The only report naming it is Claude Code · e11c's on `D-099-bonus-pages`: "A waits for D-090-BYOR, D-089-request-inbox (new architect row) and D-086-demand-list per the owner's order".
  - There is no earlier packet work to continue.
- **Owner authority.**
  - D-089 (3) is the owner's "All" on the idea-lab order (D-087: Oct 21 02:53 "All"). The idea text in the register is "employee request-inbox link with screen name".
  - The only longer description in the repo is the unapproved spec stub at `docs/BACKLOG.md:36`: "every verified employee gets a personal link (skipwait.me/r/theirname) to paste in Blind/Fishbowl/LinkedIn replies; seekers landing on it submit a structured request (role, resume, one-line fit); the employee gets a clean accept/decline inbox; referrer identity anonymous by default; real counts only. Needs the designer's spec first".
  - No designer mock for idea 1 was found under `design/` or `docs/` on main. §4 places it inside the goal system (D-089 (3): "designer places each inside the goal system first"), and the owner sees the captures at release.
- **Goal contribution.** Loop L4 (D-087): referrer supply is the bottleneck. An employee who already gets referral requests on Blind, LinkedIn or Fishbowl pastes one readable link. Every request then arrives structured (job link, resume, note), privately and in one inbox, instead of as a DM thread. That makes each verified employee easier to reach and quicker to decide, so seekers get referred faster.

## 1. Goal
Three outcomes, all on top of what is already live:
- **A link people can read and trust.** A verified employee chooses the name on their existing personal link (`skipwait.me/refer/<company>/<name>`). The name is a pseudonym. The default stays the random, anonymous `ref-…` alias.
- **A link that never wastes a seeker's request.**
  - The landing says plainly who the link belongs to (by screen name only), what happens, and what stays private.
  - When the owner is paused or full, the landing says so before anything is sent, and offers the company's normal request path instead.
  - An unavailable link shows one neutral state.
- **An owner who can manage it.** On the goal referrer home the owner sees their link, names it, copies it, pauses it and turns it back on. Today they cannot do any of that, because the old card is mounted nowhere (§3.6).

No new request shape, inbox, money rule or table: link requests use today's ask path and referrer inbox, unchanged.

## 2. Binding rules (quoted)
- **D-089 (3)** (owner, Oct 21): "Idea lab: build all three ideas, order 2 (bring-your-own-referrer one-time link), then 1 (employee request-inbox link with screen name), then 3 (public referral-bonus pages with sourced figures), after W0/W1 and the demand list; designer places each inside the goal system first." D-162 changed the order for BYOR only ("for BYOR only, changes the build order of D-087, D-089 (3) and D-090").
- **D-087:** "L4 employee request-inbox link." "Rules: real counts only; bonus lines name the employer's own programme and are never guaranteed; no seeker details exposed; referrers never charged; nothing that annoys users. Changeable: weekly link cap 5, anonymous referrer identity, ...".
- **Row note (D-163 (5))**, which the coordinator wrote for this task: "its build follows D-090-BYOR, so the packet PR adds D-090-BYOR (and D-086-demand-list, which ideas 1 and 3 still follow) to this row's dependsOn. Start from what is live: the referrer fast-track link already routes asks to one employee ... The packet decides what 'with screen name' adds on top, reusing the D-106 screen name if #382 has landed, never the referrer's real name before an accept (D-019(e)), and names its owned paths. Tier 1: referrer identity on a public link."
- **D-017:** "`/fast/:code` and `/refer/:company/:alias` keep the chosen referrer and the job link through `/request` → `/ask` and sign-in, so the ask goes to that referrer, not the whole company."
- **D-050:** "A personal-link ask counts as unclaimed until that referrer acts ... The 7-day expiry is suspended for launch (D-174); the rest of the lifecycle stands."
- **D-106:** the impact card "returns only the referrer's fast-track screen name, their company identity, the public link path and aggregates". Its screen name is `referrerFastTrackLinks.vanityAlias` (§3.5). #382 landed, so this packet reuses it.
- **D-019(e) / BRIEF:** "A referrer sees no seeker name or resume, and no seeker can message a verified referrer, until that referrer accepts." The seeker sees the referrer's name only from `approved` on (`server/db.ts:2584-2604`).
- **Login rule (D-030 as amended by D-049/D-057):**
  - Referrer sign-in is "work email org verification ONLY", through `referrerSignInHref()` (`client/src/lib/referrerSignIn.ts:7`), never `SignInButton` or `openSignIn`.
  - D-057: "reviewing or accepting asks always needs a work-email code in that session". It is not built (`D-057-session-gate`, todo).
- **D-187 (3):** BYOR's `"/r/:token"` joins `KNOWN_ROUTE_PATTERNS`, so `/r/` is BYOR's one-time-link namespace.
- **D-176:** "referrer availability is backend routing, never a browse gate or a visible status", and "coverage data is not exposed through the directory".
- **D-174:** "an ask never expires" (launch direction); the runtime clocks stay until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193).
- **D-055/D-196:** basic referring stays free, and referrers are never paid. Nothing here charges or rewards a referrer, and nothing sells priority (D-006/D-040).
- **D-223 (1)/(3)/(6):** `dependsOn` names "only the rows whose output it needs"; "The merge is the parent's release row"; "Split by owned files ... keep the hot shared files ... in as few rows as possible, and prefer an existing mount point to a new registration line."
- **D-153** (frozen): "promise only what works today." **D-173/D-180:** no "credit(s)" and no noun "ask" on a page; say "referral request".
- **D-097:** "Every new feature ships behind a flag that is off until QA verifies it."

## 3. Current behaviour (verified on `72265110`; find functions by name, line numbers drift)
1. **The link exists end to end today (D-017).**
   - Table `referrerFastTrackLinks` (`drizzle/schema.ts:679-689`, migrations 0023/0024):
     - columns `referrerId`, `companyDomain`, `linkCode` varchar(64), `vanityAlias` varchar(30) nullable, `isActive`, `deactivatedAt`;
     - unique `referrerId` (one link per person), unique `linkCode`, unique `vanityAlias` (global, not per company).
   - Browser routes: `/fast/:linkCode` and `/refer/:companySlug/:vanityAlias` (`client/src/App.tsx:127-128`). Clarity is excluded on both (`client/src/lib/clarity.ts:7`). Both Sentry scrubbers redact them (`server/sentry.ts:7-14`, `client/src/lib/sentry.ts:13-27`).
2. **The alias is random and nobody can choose it.**
   - `createFastTrackAlias` returns `` `ref-${…10 hex}` `` (`server/db.ts:1371`). `isSafeFastTrackAlias` accepts `/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/` minus a reserved set (`server/db.ts:1372,1380-1383`).
   - The only writes are inside `getOrCreateReferrerFastTrackLink` (`server/db.ts:1385-1404`). No route or UI renames it.
3. **Public resolution is minimal and verified.**
   - `GET /api/referrer-fast-track/vanity/:companySlug/:vanityAlias` (`server/privateReferralRoutes.ts:997-1006`) returns only `{ link: { companyDomain, isActive: true } }`, `no-store`. It answers 404 "This private referral link is no longer active" unless the link is active and its owner still passes `isVerifiedEmployeeOfCompany` at the link's domain. The slug must equal `companySlugFromDomain(link.companyDomain)` (`server/db.ts:1374-1378,1416-1425`).
   - `isVerifiedEmployeeOfCompany` checks account type, verified time and domain only (`server/referrerAvailability.ts:28-30`). **It ignores suspension.**
4. **A request through the link goes to the owner alone, skipping availability.**
   - `POST /api/company-referrals` (`server/privateReferralRoutes.ts:740`) passes `fastTrackCompanySlug`/`fastTrackAlias` to `createCompanyReferralRequest` (`server/db.ts:1873`). That function resolves the owner with `getActiveReferrerFastTrackVanityLink` (`server/db.ts:1437-1446`, same checks as §3.3) and refuses an unresolvable link with `PERSONAL_LINK_UNAVAILABLE` (`:1885-1886`).
   - It then sets `available = fastTrackLink ? eligible : …isOpenReferrer…` (`:1916`), which bypasses `isOpenReferrer` (paused, suspended, capacity; `server/referrerAvailability.ts:33-37`). The code comment says why: "A personal link is covered by its owner alone and keeps today's single-step lifecycle" (`:1913-1914`).
   - The request is inserted with `referrerId` set to the owner (`:1960`), visible at once, so the seeker's credit is spent at creation (D-034). A block with the owner throws `BlockedPersonalLinkError` before any credit (`:1951-1952`; message `PERSONAL_LINK_UNAVAILABLE`, `server/blockedPairs.ts:22-27`).
   - The owner gets the in-app notice "A referral request from your link is ready" (`:1995`), and gets a review email only when the account email's domain equals the company domain (`:1996`).
   - **So today a paused, full or suspended owner still receives link requests, and the seeker pays for them.**
5. **The screen name is the alias.** The impact card reads `vanityAlias` as `screenName` (`server/impactCard.ts:113`) and builds `linkPath` from `companies.slug` (`:114`). The resolver matches `companySlugFromDomain`, so the two differ when a directory slug is not the domain's first label. The old `/me` route builds `vanityUrl` from `companyDomain.split(".")[0]` (`server/privateReferralRoutes.ts:970`), a third variant.
6. **The owner has no surface.**
   - `ReferrerFastTrackCard` (`client/src/components/ReferrerFastTrackCard.tsx`) is imported only by its test. Its mount in `MyCompanyInbox.tsx` was removed in the reviewed /queue redesign (#426).
   - The only owner endpoints are `GET /api/referrer-fast-track/me` (`server/privateReferralRoutes.ts:962-975`) and `POST …/me/deactivate` (`:976-986`).
   - **A paused link can never come back.** `getOrCreateReferrerFastTrackLink` returns the existing row whenever the domain matches and an alias exists, even when `isActive` is false (`server/db.ts:1391`).
7. **The landing is a Kit page.** `client/src/pages/VanityFastTrackLink.tsx` shows "Request a referral at {domain}." and "A verified employee at {domain} can choose whether to review. Their identity stays private." Its CTA "Start private request" goes to `/start?referCompany=&referAlias=`. `/start` → `/ask` → sign-in keep the two parameters (`client/src/pages/explore/signInHandoff.ts:8-28`; `client/src/lib/fastTrackHandoff.ts`).
   - The goal redesign of `/fast`, `/refer` and `/share-card` is row `D-048-p3-links`. It is todo, all its dependencies are done, it owns `client/src/pages/goal/links/**` under `goalSurfaceOn('links')`, and it is not released (`client/src/lib/goalSurfaces.ts`: only `home` is in `RELEASED`).
8. **The inbox already handles link requests.** The owner's `/queue` "new" scope includes requests whose `referrerId` is the viewer (`server/db.ts:2193`), marked `isClaimedByYou` (`:2239`).
   - Clicking one opens `/conversation/:id` (`client/src/pages/MyCompanyInbox.tsx:309,315`), where accept and pass work through `POST /api/company-referrals/:id/one-click-review`.
   - A pass reopens the request to colleagues, with `referrerId: null` and the seeker told "Your ask is open again to other verified employees" (`passReferralRequestTx`, `server/db.ts:2156-2157`). The credit stays spent (D-147).
   - Before acceptance, the owner sees the allow-listed preview without `candidateName` (`server/privateReferralRoutes.ts:1437`; `shared/referrerAskView.ts:18-24`).
9. **Abuse tools that exist.** `createSafetyReport` (`server/db.ts:940`) accepts a `reportedUserId` with no request (`:953`), a fixed reason list (`SAFETY_REPORT_REASONS`, `:931-938`, including "Pretending to work at a company") and 20 reports a day (`:962`). Blocks are read with `blockedCounterpartsFailOpen` (`server/blockedPairs.ts:52`; fail-open plus Sentry). No rate limiter is in use (`consumeDurableLimits` has no caller, `server/_core/durableRateLimit.ts:95`). The admin check pattern is `requireAdmin` (`server/companyDirectoryRoutes.ts:63-72`: 401, then 403 unless `identity.account.role === "admin"`).
10. **Mount points.** `registerImpactCardRoutes(app, { resolveIdentity, recordActivity })` is called once (`server/_core/index.ts:208`), and no open row owns `server/impactCardRoutes.ts`. `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx` (goal `/referrer-home`, unreleased) belongs to the done row `D-048-p3-referrer-home`. `scripts/goalUiCoverage.test.ts` scans only `client/src/components/` (`:14,81-83,117-119`), so files under `client/src/pages/goal/request-inbox/` need no line in `GOAL_UI_COVERAGE.md`, which `D-090-BYOR`, `D-086.ui` and `D-086.admit` own.
11. **Hot files are taken.** Open rows own `server/db.ts` and `server/privateReferralRoutes.ts` in one chain: `D-090-BYOR` → `D-132-item3` → `D-174-held-ask-reconfirm` → `D-174-ask-from-job` → `D-174-pool-nudges`. `server/_core/index.ts`, `client/src/App.tsx`, `functions/_middleware.ts` and `client/src/lib/flags.ts` are owned by BYOR (plus switch-only claims). **This epic edits none of them** (§6).
12. **Live privacy wording a reviewer checks against:** `client/src/pages/TrustPrivacy.tsx:16` ("We do not publish resumes, Referrer identities, or private request conversations."), `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx:265` ("Never ranked. Never public.") and the Kit landing's "Their identity stays private."
13. **D-194's `/share` link is the seeker's invite link**; nothing here touches it.

## 4. Rulings this packet proposes (decided under D-200; changeable; register text in §10)
1. **The request-inbox link is the existing vanity link. Nothing new is minted.**
   - Path: `/refer/:companySlug/:screenName`, with no new table, no migration and no new browser route.
   - `/r/` belongs to BYOR's one-time `/r/:token` (D-187 (3)), so the backlog stub's `skipwait.me/r/theirname` is not used.
   - `/fast/:linkCode` stays the opaque code link, unchanged.
   - The "structured request" is today's ask composer (job link, resume, note). The "clean inbox" is today's `/queue`, where link requests already arrive and accept/pass work (§3.8).
2. **"With screen name" means the owner chooses `vanityAlias`, a pseudonym.**
   - **Choosing.** The owner types it. It is never derived from, suggested from or prefilled with `users.name`, the email, the profile handle or display name.
   - **Default.** The random `ref-…` alias stays the default (anonymous by default, D-087's knob). On the landing a default alias shows as "a verified employee", never as the `ref-` string.
   - **Format.** Exactly `isSafeFastTrackAlias`, so it fits `varchar(30)` and the create route's regex (`server/privateReferralRoutes.ts:761`). It is lowercased.
   - **Refused:**
     - the `ref-` prefix (reserved for defaults);
     - the existing reserved set;
     - the exact company slug;
     - any hyphen-separated token in `skipwait, admin, support, official, staff, team, hr, recruiter, recruiting, recruitment, hiring, talent, careers, ceo, founder, moderator, help`.
   - **Uniqueness** comes from the existing global index: first come, first served across companies. A per-company index would need a migration (§11 gap 4).
   - **Renaming** turns the old link off at once (honest unavailable state), with no redirect. A redirect would keep a renamed person findable under the old name. There is no rename limit: one row per person means a person can hold only one name.
3. **The public payload is an allow-list.**
   - Shape: `{ state: "open" | "not_taking", screenName: string | null, companyDomain: string, companyName: string | null }`. `screenName` is null for a default alias. `companyName` comes from the directory, or is null for an unlisted domain.
   - Never sent: `referrerId`, `users.name`, email, profile handle, display name or headline, photo, `workEmailVerifiedAt`, counts, capacity, or which of paused or full applies.
   - **Every unavailable case gets one identical 404 body:** unknown name, inactive link, slug mismatch, owner no longer verified there, owner suspended (user or canonical person), or a signed-in viewer blocked either way (fail-open on a failed block read, as everywhere; the create path still refuses a blocked pair, §3.4).
   - **The name is never in an API URL.** Resolution is `POST /api/request-inbox/resolve` with a strict JSON body, so neither Sentry, the alert email (`server/errorAlerting.ts:99` puts `req.originalUrl` in it) nor the slow-request log ever carries it. That removes the need to wait for FND-4. The browser path is already scrubbed and excluded from Clarity (§3.1).
4. **"Not taking" routes the seeker before anything is spent (a soft guard in this epic).**
   - **When.** The owner is paused (`profiles.paused`), or holds at least `referralCapacity ?? DEFAULT_REFERRAL_CAPACITY` (3, `server/referrerAvailability.ts:13`) requests with `referrerId` = owner and `status = "pending"`.
   - **What the landing does.** It says so and offers the company's normal request path. The link CTA is not rendered.
   - **Not a D-176 status.** This is one person's own link reporting what its owner set or reached. It says nothing about the company's coverage and shows no count.
   - **Scope.** The server create path is not changed by this epic (no `server/db.ts` row, §4.13). A crafted direct POST still reaches a paused or full owner, which is today's behaviour. The hard guard is follow-up F1 (§13).
5. **The link can come back.** `POST /api/request-inbox/me/resume` reactivates the caller's own row while they are still verified at its domain, fixing §3.6 without `server/db.ts`. Pausing reuses `POST /api/referrer-fast-track/me/deactivate`.
6. **The owner panel lives on the goal referrer home, as a secondary section with no black commit.**
   - It goes on `/referrer-home`. It does not go back onto `/queue`, because the reviewed /queue redesign removed the old card (#426) and changing that is the page's own call. It goes on no Kit page (D-120).
   - It shows the full link with a ghost "Copy link", the name editor, dot-and-text status (`GoalStatus`: "Taking requests" / "Paused" / "Full right now"), and "Pause link" or "Turn link back on".
   - Signed out or unverified, it shows one plain link to `referrerSignInHref("/referrer-home")`.
7. **The landing lives inside the goal links surface, and only for vanity links.**
   - With `REQUEST_INBOX_ENABLED` on, the vanity page built by `D-048-p3-links` renders `RequestInboxLanding` in place of its body (switch-only mount). The page keeps exactly one black commit, and it is this component's:
     - **open:** "Start your referral request" → `/start?referCompany=&referAlias=` (today's hand-off, unchanged);
     - **not taking:** "Request a referral at {Company}" → `/start` with no link parameters;
     - **unavailable:** "Request a referral another way" → `/start`.
   - The page sets `noindex,nofollow` at runtime: a person's link is not a search page.
8. **Abuse handling uses what exists.**
   - **Report this link** (plain link, signed in). `POST /api/request-inbox/report` resolves the owner on the server and calls the existing `createSafetyReport(reporterId, { reason, details, reportedUserId: ownerId })`, so the reporter never learns the owner's id. The 20-a-day cap and the reason list are the existing ones.
   - **Admin reset.** `POST /api/admin/request-inbox/reset-screen-name { userId }` (admin check first, then 404 while the switch is off) replaces a chosen name with a fresh random `ref-` alias and logs it.
   - **Suspension** stays the existing admin tool. A suspended owner's link already 404s through §4.3.
   - There is no resolve rate limit in v1 (§11 gap 5).
9. **Money: nothing changes.**
   - Link requests keep today's spend at creation (D-034, the owner is a visible referrer), today's D-050 lifecycle, D-147 (a decline keeps the credit spent) and D-038.
   - A pass reopens the request to colleagues, as the existing notice says (§3.8).
   - The not-taking path sends the seeker into the normal company path, under its normal rules.
   - No row adds a debit, refund, ledger, price, plan or entitlement. What happens to a link request nobody decides on once the 7-day clock is removed is **owner question Q1** (§8), not a ruling here.
10. **One switch.**
    - `shared/requestInbox.ts` exports `REQUEST_INBOX_ENABLED = false`, imported by server and client. No env key, so `.env.example`, `src/worker.ts`, `client/src/lib/flags.ts` and `server/configContract.test.ts` stay untouched.
    - **While off:**
      - every new user route answers 404 `no-store` before any read;
      - the admin route checks admin first, then answers 404;
      - the panel and the landing render nothing and fetch nothing;
      - the Kit and goal pages behave exactly as before.
11. **One link path everywhere.** Every new path is built with `companySlugFromDomain(link.companyDomain)`, the resolver's own function. `server/impactCard.ts:114` changes from `company.slug` to that function, so the D-106 card shares a link that resolves (§3.5). The old `/me` route's `split(".")[0]` (`server/privateReferralRoutes.ts:970`) is left alone, because that file is out of scope; the panel never reads it.
12. **Sign-in, and D-057.** Owner routes need an identity that passes `isVerifiedEmployeeOfCompany` at the link's domain (401 signed out; 403 "Verify your work email to use your referral link"). The screen-name and resume writes are link settings, not "reviewing or accepting asks": whichever of `D-057-session-gate` and `D-089.link` lands second puts both on D-057's explicit allowlist with that reason, or on its enforced list if the D-057 reviewer prefers. Neither choice changes this epic.
13. **Dependencies follow the owner's order without touching hot files.**
    - `D-089.link` waits for `D-090-BYOR` (idea 2, then idea 1: D-089 (3) and the row note).
    - `.panel` waits for `.link`; `.landing` waits for `.panel` (the API module) and `D-048-p3-links` (its page).
    - The release waits for all three, plus `D-090-BYOR` and `D-086-demand-list` ("after ... the demand list"; D-162 waived that for BYOR only).
    - `D-099-bonus-pages` keeps its edge to the parent, so 2, 1, 3 is unchanged.
    - No row owns `server/db.ts`, `server/privateReferralRoutes.ts`, `server/_core/index.ts`, `client/src/App.tsx` or `GOAL_UI_COVERAGE.md`; the server row mounts in `registerImpactCardRoutes` (D-223 (6)).
14. **Measured, without the name.**
    - Activity rows: `request_inbox.resolved {state}`, `name_set {first}`, `name_taken`, `link_resumed`, `reported`, `name_reset`. None carries the screen name, a token or an email.
    - The panel's copy action sends `trackClarityEvent("request_inbox_link_copied")` (`client/src/lib/clarity.ts` is imported, not edited).
    - The release reports weekly counts: owners with a chosen name, resolves by state, and link requests created. For the last, use the create activity row if its metadata marks a personal link (verify at build); otherwise report the gap. `server/privateReferralRoutes.ts` stays out of scope.

### 4.15 Copy (proposed; D-153, D-180; exact strings pinned by tests)
- **Landing, open, chosen name:**
  - Heading: "Request a referral from {screenName} at {Company}."
  - Body: "{screenName} is a verified employee at {Company} and the name they chose for this link. Add the job link, your resume and a short note. They decide whether to refer you. Your name and resume stay hidden until they accept."
  - Disclaimer: "This does not bypass {Company}'s application process or guarantee a referral."
  - Commit: "Start your referral request".
- **Landing, open, default name:** the same, with "a verified employee" in place of {screenName}, and without "and the name they chose for this link".
- **Landing, not taking:**
  - Heading: "{screenName} isn't taking new requests right now." For a default name: "This employee isn't taking new requests right now."
  - Body: "You can still request a referral at {Company}. It goes to other verified employees at {Company}, including people who verify later." This is true under D-174/D-034 and §3.11 of the D-086 packet.
  - Commit: "Request a referral at {Company}".
- **Landing, unavailable:** "This referral link isn't available." / "It may have been paused or renamed. Nothing was sent." Commit: "Request a referral another way".
- **Report:** "Report this link". After sending: "Thanks. We'll review it."
- **Panel:**
  - Heading: "Your referral link".
  - "Share it where people ask you for referrals. Requests through it come only to you, and the person's name and resume stay hidden until you accept."
  - Name label: "Name on your link".
  - Help: "Anyone with your link sees this name. Use a nickname if you want to stay anonymous. Changing it turns off your old link."
  - Errors: "That name is taken." / "Use 3 to 30 lowercase letters, numbers or hyphens." / "Choose a name that doesn't look like a company role or SkipWait."
  - Statuses: "Taking requests" / "Paused" / "Full right now: new people are sent to your company instead."
- **Never on these surfaces:** "credit", the noun "ask", "guaranteed", a count, "open"/"not open", "waiting", or any referrer field beyond the screen name.

## 5. The rows
Every row: claim it through the picker, write red tests first, make one commit per step with `pnpm check` and the row's focused tests green on each commit, and run the full gate on the merged result. Tier 1 rows open a draft PR and get an independent review by a model that neither built nor fixed the work (D-151).

**Stop if (every row):**
- a cited function or contract changed on `main`;
- a test fails for a reason you cannot explain;
- the work needs a file outside `owns`.

Stopping means: push, `--report blocked` with the question, and wait.

### 5.1 `D-089.link` (Tier 1: a public identity surface, an admin action and a write to the owner's link; M)
- **Waits for:** `D-090-BYOR` (the owner's order, §4.13). No owned file is shared with any open row; the scratch probe in §9 shows no overlap.
- **Do:**
  1. **New `shared/requestInbox.ts`:**
     - `REQUEST_INBOX_ENABLED = false`.
     - `SCREEN_NAME_DENY_TOKENS`.
     - `normalizeScreenName`, `screenNameProblem(name, companySlug)` (returns `null` or one of `format | reserved | default_prefix | company | role_word`), `isDefaultScreenName` (`/^ref-[0-9a-f]{10}$/`).
     - Strict Zod schemas:
       - `requestInboxResolveBodySchema` `{ companySlug, screenName }`;
       - `requestInboxPublicSchema` (§4.3; `.strict()`);
       - `requestInboxMeSchema` `{ path, screenName, isDefaultName, isActive, status: "taking" | "paused" | "full", companyName | null }`;
       - `screenNameBodySchema`, `requestInboxReportBodySchema` (reason ∈ `SAFETY_REPORT_REASONS`, details ≤ the existing limit), `adminResetBodySchema` `{ userId }`.
     - The §4.15 copy as pure functions.
  2. **New `server/requestInbox.ts`.** Database reads and writes through drizzle on existing tables (`referrerFastTrackLinks`, `profiles`, `users`, `canonicalPeople`, `referralRequests`, `companies`/`companyDomains` for the name). It imports `getOrCreateReferrerFastTrackLink`, `companySlugFromDomain`, `isSafeFastTrackAlias` and `createSafetyReport` from `server/db.ts` without editing it.
     - `loadRequestInboxForOwner(userId)`.
     - `setScreenName(userId, raw)` maps the unique-index violation to `ScreenNameTakenError`.
     - `resumeRequestInboxLink(userId)`.
     - `resolveRequestInbox({ companySlug, screenName, viewerUserId? })` returns the payload or `undefined` (§4.3, §4.4).
     - `reportRequestInbox(reporterId, body)`.
     - `adminResetScreenName(adminId, userId)`.
     - Timestamps come from the app clock only.
  3. **New `server/requestInboxRoutes.ts`.** `registerRequestInboxRoutes(app, deps)` with injectable loaders:
     - `GET /api/request-inbox/me`;
     - `PUT /api/request-inbox/me/screen-name` (400 for a problem, with the problem code; 409 for taken);
     - `POST /api/request-inbox/me/resume`;
     - `POST /api/request-inbox/resolve` (200 or the one neutral 404);
     - `POST /api/request-inbox/report` (401 signed out, 201 `{ reported: true }`, 404 neutral);
     - `POST /api/admin/request-inbox/reset-screen-name` (401, 403, then 404 while off).

     All answer `Cache-Control: no-store` (owner and admin: `private, no-store`). A database failure answers 503 with no name, alias or id in the body, and reaches server Sentry with no request body.
  4. **`server/impactCardRoutes.ts` (switch only).** Inside `registerImpactCardRoutes`, call `registerRequestInboxRoutes(app, { resolveIdentity: deps.resolveIdentity, recordActivity: deps.recordActivity })`. At most 12 lines. Widen the local `ResolveIdentity` type only to read `account.role`.
  5. **`server/impactCard.ts`:** `linkPath` uses `companySlugFromDomain(link.companyDomain)` (§4.11).
- **Tests (red first):**
  - **`shared/requestInbox.test.ts`:**
    - accepts `alex-k` and `jane2`;
    - `normalizeScreenName("Alex-K")` gives `alex-k`;
    - rejects 2 and 31 characters, a leading or trailing hyphen, spaces, Unicode, `ref-abc`, every reserved word, `google-hr`, `acme-recruiting`, `skipwait`, and the exact company slug;
    - `chris` passes (token match, not substring);
    - `isDefaultScreenName("ref-0123456789")`;
    - the public schema rejects any extra key (`referrerId`, `name`, `email`, `capacity`, `openRequests`, `paused`) and any other `state`;
    - the copy functions return the exact §4.15 strings, which contain no "credit", noun "ask" or "guaranteed".
  - **`server/requestInbox.fixture.test.ts`** (`createInMemoryDrizzle`, as in `server/companyResponseSignal.fixture.test.ts`):
    - **set:** set stores lowercase; a second person taking the same name gets `ScreenNameTakenError`; an unverified or other-company caller is refused; after a rename the old name resolves `undefined` and the new one resolves.
    - **resolve:**
      - open;
      - paused → `not_taking`;
      - pending assigned count equal to capacity → `not_taking`, one fewer → open; null capacity uses 3;
      - suspended user → `undefined`, suspended canonical person → `undefined`, inactive → `undefined`, owner unverified → `undefined`, slug mismatch → `undefined`;
      - viewer blocked either way → `undefined`;
      - a failed block read shows the link and reports;
      - a default alias gives `screenName: null`;
      - a deep key scan of every payload finds no `referrerId`, `userId`, `name`, `email`, `handle` or `verifiedAt`.
    - **resume:** resume reactivates only the caller's row.
    - **report:** report passes the owner's id as `reportedUserId` and never returns it; reporting your own link is refused.
    - **admin reset:** admin reset writes a fresh `ref-` alias, and the old chosen name no longer resolves.
  - **`server/requestInboxRoutes.test.ts`:**
    - **Switch off:** every user route answers 404 `no-store` with no loader called (spies); the admin route gives 401/403 first, then 404.
    - **Switch on:** each status above; one identical 404 body for every unavailable reason; strict bodies (unknown key → 400); the cache headers.
    - **The name never reaches a URL or a log:** a source pin that no route path in `server/requestInboxRoutes.ts` contains a `:` parameter, and that no `recordActivity` call's metadata contains the screen name or a referrer id.
  - **`server/impactCard.test.ts`:** a company whose directory slug differs from its domain's first label gets a `linkPath` that `getPublicReferrerFastTrackVanityLink` resolves.
- **Owns:** `shared/requestInbox.ts`, `shared/requestInbox.test.ts`, `server/requestInbox.ts`, `server/requestInbox.fixture.test.ts`, `server/requestInboxRoutes.ts`, `server/requestInboxRoutes.test.ts`, `server/impactCardRoutes.ts (switch only)`, `server/impactCard.ts`, `server/impactCard.test.ts`.
- **Done when:**
  - The tests pass.
  - These stay green: `server/referrerFastTrackLinks.test.ts`, `server/privateReferralRoutes.integration.test.ts`, `server/impactCard*.test.ts`, `server/db.blockDelivery.test.ts` and `server/blockedPairs.test.ts`.
  - The full gate passes and the independent review passes.
  - The switch stays false.
- **Stop if:**
  - the unique index on `vanityAlias` is not what §3.1 says;
  - `createSafetyReport` cannot take a `reportedUserId` without a request;
  - any step would need `server/db.ts`, `server/privateReferralRoutes.ts` or `server/_core/index.ts`.

### 5.2 `D-089.panel` (Tier 2: renders the owner's own payload; the writes are enforced by the Tier 1 server; S)
- **Waits for:** `D-089.link` (contract and routes).
- **Do:**
  - New `client/src/pages/goal/request-inbox/requestInboxApi.ts`: React Query hooks and mutations for all six routes. Responses are parsed with the shared schemas. A failed, missing or unparsable read resolves to `null`, and the panel then shows its error state.
  - New `RequestInboxLinkPanel.tsx`, per §4.6 and §4.15:
    - explicit loading, error with retry, offline, signed out or unverified, default name, chosen name, paused and full;
    - pause asks for confirmation;
    - goal tokens and `components/goal` primitives only;
    - no `GoalButton variant="primary"` and no `data-g-primary`.
  - Mount it in `GoalReferrerHome.tsx` below the next-step block, behind `REQUEST_INBOX_ENABLED` (switch only, at most 12 lines).
- **Tests (red first), `client/src/pages/goal/request-inbox/requestInboxPanel.test.tsx`:**
  - **Switch off:** `GoalReferrerHome` renders as before (its existing tests untouched and green), and nothing calls `/api/request-inbox`.
  - **States:** every state renders its exact copy.
  - **Sign-in:** the signed-out link's `href` equals `referrerSignInHref("/referrer-home")`, and the module source imports neither `SignInButton` nor `openSignIn`.
  - **Name editor:** each server problem code shows its sentence, 409 shows "That name is taken.", and success shows the new full link.
  - **Actions:** copy copies the full URL and sends one Clarity event; pause confirms first; resume calls the resume route.
  - **One black commit:** the page still has exactly one `data-g-primary` and `assertGoalPage` holds.
  - **Copy:** rendered text has no "credit" or noun "ask".
- **Proof:** captures at 1280 and 390 (fictional fixtures, team rule 8): default name, chosen name, full, paused.
- **Owns:** `client/src/pages/goal/request-inbox/RequestInboxLinkPanel.tsx`, `client/src/pages/goal/request-inbox/requestInboxApi.ts`, `client/src/pages/goal/request-inbox/requestInboxPanel.test.tsx`, `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx (switch only)`, `design/goal-ui/captures/request-inbox/panel/**`.
- **Done when:** the tests pass, `node scripts/design-token-audit.mjs` and `scripts/goalUiCoverage.test.ts` pass, the captures exist and the full gate passes.

### 5.3 `D-089.landing` (Tier 1: shows a referrer's chosen identity publicly and routes a seeker into a paid path; S)
- **Waits for:**
  - `D-089.panel`, for `requestInboxApi.ts`;
  - `D-048-p3-links`, which builds `client/src/pages/goal/links/**`, the goal vanity page this mounts into.
- **Do:**
  - New `client/src/pages/goal/request-inbox/RequestInboxLanding.tsx` (`{ companySlug, screenName }`). It covers:
    - the three states of §4.7 and §4.15;
    - loading, error with retry and offline;
    - the report link with its small form;
    - the runtime `noindex,nofollow` meta.
  - The report form lists `SAFETY_REPORT_REASONS`. Signed out, it sends the visitor to the seeker sign-in with `returnTo` set to the current path. That is the ordinary seeker door, not a referrer surface.
  - In the goal vanity page from `D-048-p3-links`, render `RequestInboxLanding` in place of its body when `REQUEST_INBOX_ENABLED` is true (switch only, at most 12 lines).
- **Tests (red first), `client/src/pages/goal/request-inbox/requestInboxLanding.test.tsx`:**
  - **Switch off:** the goal vanity page is unchanged, and nothing calls `/api/request-inbox/resolve`.
  - **Rendering:** each state renders the exact §4.15 copy; a default alias never shows the `ref-` string; the screen name appears only where §4.15 puts it; no other referrer field is ever rendered.
  - **Link targets:** the open commit `href` is `/start?referCompany=<slug>&referAlias=<name>`; not-taking and unavailable go to `/start` with no link parameters.
  - **One black commit:** exactly one `data-g-primary` in every state.
  - **Meta:** the `noindex,nofollow` meta is present.
  - **Report:** sends one POST and shows the thank-you; signed out, it goes to sign-in and back.
  - **Copy:** no "credit", noun "ask", "guaranteed", count, "open" or "waiting".
- **Proof:** captures at 1280 and 390 of open (chosen and default name), not taking, unavailable and the report form, under `design/goal-ui/captures/request-inbox/landing/`.
- **Owns:** `client/src/pages/goal/request-inbox/RequestInboxLanding.tsx`, `client/src/pages/goal/request-inbox/requestInboxLanding.test.tsx`, `client/src/pages/goal/links/** (switch only)`, `design/goal-ui/captures/request-inbox/landing/**`.
- **Stop if:** `D-048-p3-links` built the vanity page so that one switch-only mount cannot replace its body, or it changed the `/start` hand-off parameters.

### 5.4 `D-089-request-inbox`: the release row (Tier 1; status `todo`, waiting on its rows)
- **Waits for:** `D-089.link`, `D-089.panel`, `D-089.landing`, `D-090-BYOR` and `D-086-demand-list` (the owner's order, §4.13).
- **Do:**
  - Flip `REQUEST_INBOX_ENABLED` (switch only).
  - Add the `AGENTS.md` system-map row: `/api/request-inbox/*` and `/api/admin/request-inbox/reset-screen-name`, mapped to `shared/requestInbox.ts`, `server/requestInbox.ts` and `server/requestInboxRoutes.ts`, described as "the D-017 vanity link with an owner-chosen pseudonym; allow-listed public payload; not-taking routing; no new table".
  - Update the `docs/PRD.md` roadmap row for idea 1.
  - Add the plan §3b row "D-089" (none exists today).
- **Before flipping:**
  - QA on the preview with captures.
  - The privacy review inside the independent Tier 1 review: payload and copy checked against §3.12. If the reviewer reads a self-chosen pseudonym as "publishing Referrer identities", stop and ask the owner under the legal-text rule (§7).
  - The CEO's sign-off (D-223 (3)).
  - **The surfaces are live:** the goal `referrer-home` and `links` surfaces are released by their own release rows (this row never edits `client/src/lib/goalSurfaces.ts`). If no release row for them exists yet, stop and ask the coordinator to register them.
  - **Q1** (§8) is answered, or the D-050 7-day release is still live in the runtime.
- **Done when:** after the deploy, `POST https://skipwait.me/api/request-inbox/resolve` for a QA link returns only the §4.3 keys (paste the response), an unknown name returns the neutral 404, and screens at 1280 and 390 show the panel and the landing.
- **Owns:** `shared/requestInbox.ts (switch only)`, `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`.

## 6. Out of scope (every row)
- **Server:** `server/db.ts`, `server/privateReferralRoutes.ts`, `server/_core/index.ts`, `server/sentry.ts`, `server/errorAlerting.ts`, `server/blockedPairs.ts`, `server/referrerAvailability.ts` (all imported, never edited).
- **Client:** `client/src/App.tsx`, `client/src/lib/flags.ts`, `client/src/lib/clarity.ts`, `client/src/lib/goalSurfaces.ts`, `client/src/pages/MyCompanyInbox.tsx`, `client/src/pages/VanityFastTrackLink.tsx`, `client/src/pages/FastTrackLink.tsx`, `client/src/components/ReferrerFastTrackCard.tsx`, the `/start`, `/ask` and sign-in hand-off.
- **Config, data and docs:** `.env.example`, `src/worker.ts`, `functions/**`, `drizzle/**`, `docs/plans/GOAL_UI_COVERAGE.md`.
- **Behaviour:** any spend, refund, expiry, reconfirm, pool, capacity or decline rule; the `/fast/:linkCode` link; BYOR's `/r/:token`; the D-194 `/share` invite link; a per-company uniqueness migration.

## 7. Privacy, legal text and money
- **Privacy:** the legal text stays as it is. The default link stays anonymous; a chosen name is the owner's own publication, warned in the panel (§4.15); no other referrer field is sent; the seeker side is unchanged (D-019(e)). The Tier 1 reviews check payload and copy against §3.12, and a real contradiction goes to the owner under the legal-text rule (plan §6).
- **Money:** no money path is edited (§4.9, §6). The only new seeker action is a redirect into the existing request path.

## 8. Owner questions
- **Q1 (live money; recommended answer, rated).** After `D-174-expiry-clock-removal` lands, what happens to a link request whose owner never acts?
  - **Why it matters.** Today D-050's 7-day release returns the seeker's credit (`server/heldAsk.ts`, `expireStalePendingReferralRequest`). The removal row's scope is "the 7-day unclaimed expiry", with no replacement for link requests. Without one, a credit spent on a dormant owner stays with that person indefinitely. This epic makes links easier to share, so the case grows.
  - **Recommendation, 8/10.** After 7 days visible with no decision, the request moves to the company's other verified employees in the D-038 manner: `referrerId` cleared, an exclusion row for the owner, no credit move, and one seeker notice. That matches D-174 ("if not there new ones who join will be able to see") and D-076 (1).
  - **Strongest argument against.** The seeker chose one person, and moving the request without asking may surprise them. The fix for that is the notice, plus their existing withdraw.
  - **Effect on the release.** Until Q1 is answered, the release row may flip only while the D-050 release is live. If `D-174-expiry-clock-removal` lands first, the release stops (§5.4).

The coordinator may change §4.2's deny list, §4.4's capacity reading, placement (§4.6-§4.7) and copy (§4.15) without the owner, within D-153.

## 9. Registry delta (proposed; not applied in this commit)
**Probe evidence (scratch copy only).**
- Applied to a copy of `origin/main` `docs/plans/assignments.json` and run through `validateAssignments` (`scripts/nextTaskCore.mjs:273`) with the parsed register (`parseDecisionRegister`). On `25ebfd2c`: baseline 220 rows, 0 errors; candidate 223 rows, 0 errors. On `72265110`: baseline 221 rows, 0 errors; candidate **224 rows, 0 errors**.
- `outOfSyncOf` is null at `syncedTo: D-229`, and `decisionsSince("D-227")` is `["D-228", "D-229"]`; neither names these rows.
- **Ownership overlaps, every one ordered:**
  - `D-089.landing` ~ `D-048-p3-links`: the landing waits;
  - the parent ~ `D-090-BYOR`, `D-086-demand-list` and its own `D-089.link`: the parent waits;
  - the parent ~ `D-099-bonus-pages` and `DEPLOY-gate-docs-sync`: both already wait for the parent.

Parent row `D-089-request-inbox`, fields to change:
```json
{
  "title": "Employee request-inbox link (D-089 (3), loop L4): owner-chosen screen name on the existing personal link, allow-listed landing with not-taking routing, owner panel; release row",
  "packet": "docs/plans/D-089-request-inbox.md",
  "status": "todo",
  "syncedTo": "D-229",
  "dependsOn": ["D-089.link", "D-089.panel", "D-089.landing", "D-090-BYOR", "D-086-demand-list"],
  "owns": ["shared/requestInbox.ts (switch only)", "AGENTS.md", "docs/PRD.md", "docs/KIT_V4_BUILD_PLAN.md"],
  "note": "D-089 packet §5.4 (release row): flips REQUEST_INBOX_ENABLED after its three rows, QA, the Tier 1 privacy review and CEO sign-off; only once the goal referrer-home and links surfaces are released, and while D-050's 7-day release is live unless owner question Q1 is answered. Waits for D-090-BYOR and D-086-demand-list by the owner's order (D-089 (3)). D-099-bonus-pages keeps its edge."
}
```
New rows, inserted directly above the parent:
```json
[
  {"id": "D-089.link", "title": "Request-inbox link, server (D-089): owner-chosen screen name on the existing personal link, resume after pause, POST resolve with an allow-listed payload and a not-taking state, link report and admin reset; switch REQUEST_INBOX_ENABLED starts false", "row": "D-089", "packet": "docs/plans/D-089-request-inbox.md", "tier": 1, "lane": "request-inbox-link", "branch": "agent/queue/d089-link", "status": "todo", "syncedTo": "D-229", "epic": "D-089-request-inbox", "dependsOn": ["D-090-BYOR"], "owns": ["shared/requestInbox.ts", "shared/requestInbox.test.ts", "server/requestInbox.ts", "server/requestInbox.fixture.test.ts", "server/requestInboxRoutes.ts", "server/requestInboxRoutes.test.ts", "server/impactCardRoutes.ts (switch only)", "server/impactCard.ts", "server/impactCard.test.ts"], "note": "D-089 packet §5.1. No migration, no env key, no server/db.ts or privateReferralRoutes.ts edit; mounts inside registerImpactCardRoutes. Waits for D-090-BYOR by the owner's order (idea 2 then idea 1). The screen name never appears in an API URL or a log."},
  {"id": "D-089.panel", "title": "Request-inbox owner panel on the goal referrer home (D-089): link, name editor, status, copy, pause and resume; no black commit; switch off", "row": "D-089", "packet": "docs/plans/D-089-request-inbox.md", "tier": 2, "lane": "request-inbox-panel", "branch": "agent/queue/d089-panel", "status": "todo", "syncedTo": "D-229", "epic": "D-089-request-inbox", "dependsOn": ["D-089.link"], "owns": ["client/src/pages/goal/request-inbox/RequestInboxLinkPanel.tsx", "client/src/pages/goal/request-inbox/requestInboxApi.ts", "client/src/pages/goal/request-inbox/requestInboxPanel.test.tsx", "client/src/pages/goal/referrer-home/GoalReferrerHome.tsx (switch only)", "design/goal-ui/captures/request-inbox/panel/**"], "note": "D-089 packet §5.2. Signed-out link via referrerSignInHref (login rule pinned by its own test). Captures at 1280 and 390."},
  {"id": "D-089.landing", "title": "Request-inbox landing in the goal vanity link page (D-089): open, not taking and unavailable states, one black commit, report link, noindex; switch off", "row": "D-089", "packet": "docs/plans/D-089-request-inbox.md", "tier": 1, "lane": "request-inbox-landing", "branch": "agent/queue/d089-landing", "status": "todo", "syncedTo": "D-229", "epic": "D-089-request-inbox", "dependsOn": ["D-089.panel", "D-048-p3-links"], "owns": ["client/src/pages/goal/request-inbox/RequestInboxLanding.tsx", "client/src/pages/goal/request-inbox/requestInboxLanding.test.tsx", "client/src/pages/goal/links/** (switch only)", "design/goal-ui/captures/request-inbox/landing/**"], "note": "D-089 packet §5.3. Mounts into the page D-048-p3-links builds; the /start?referCompany=&referAlias= hand-off is unchanged. Captures at 1280 and 390."}
]
```
In the same adoption pull request (D-068): `docs/plans/README.md` (this packet in the execution view), the `docs/PRD.md` roadmap row for idea 1 ("packet written; rows queued"), and the register entry in §10. If the coordinator reads the owner's order as a build order for the demand list too, add `D-086-demand-list` to `D-089.link`'s `dependsOn`. That is one line, and the cost is that no D-089 row starts until the demand list releases.

## 10. Register entry (proposed)
D-230 was free on `main` `25ebfd2c` and `72265110` and on every fetched origin branch when this was written. Re-check at adoption; it takes effect only on protected merge.

| D-230 | 2026-10-28 | **The D-089 employee request-inbox link gets its packet: it is the existing D-017 vanity link with an owner-chosen screen name, an allow-listed landing that routes the seeker to the company's normal path when the owner is paused or full, and no row edits a money path or a hot shared file (decided under D-200 by Claude Opus 5.5 as a reasoning session (D-225); changeable).** (1) The link is `/refer/:companySlug/:screenName` on `referrerFastTrackLinks.vanityAlias` (the D-106 screen name); no table, migration or env key; `/r/` stays BYOR's (D-187 (3)). (2) The name is chosen, never derived from the account name, email or handle; the random alias stays the anonymous default; `ref-`, reserved words, the company slug and role or brand tokens are refused; a rename turns the old link off. (3) The public payload is `{ state, screenName or null, companyDomain, companyName or null }`; every unavailable case (including a suspended owner or a blocked viewer) gets one neutral 404; the name never appears in an API URL or a log. (4) A paused owner, or one with pending assigned requests at `referralCapacity` (default 3), shows "isn't taking new requests" and offers the company path before anything is spent: one person's link, not company coverage (D-176). The create path is unchanged; a hard server guard is follow-up F1. (5) Owner panel on the goal referrer home; landing in the goal links surface; reports through the existing safety report; an admin reset. (6) Rows `D-089.link` (waits for `D-090-BYOR`), `D-089.panel`, `D-089.landing` and the release row (waits for its rows, `D-090-BYOR` and `D-086-demand-list`); `D-099-bonus-pages` keeps its edge. (7) Owner question Q1: what replaces D-050's 7-day release once the clock is removed. Rating 8/10: loop L4 on live code. Against: a public chosen name allows impersonation inside a company (deny list, reports and admin reset only), and the release waits behind the demand-list chain. | `origin/main` `72265110`; `server/db.ts:1368-1452,1873-2001`, `server/privateReferralRoutes.ts:962-1006`, `server/referrerAvailability.ts:13,28-37`, `server/impactCard.ts:113-114`, `client/src/lib/goalSurfaces.ts`, `docs/BACKLOG.md:36`; a scratch `validateAssignments` probe with the register (224 rows, 0 errors). | Extends D-017 and D-106; applies D-089 (3), D-087 (L4), D-163 (5) and D-223. Affects tasks: D-089-request-inbox, D-089.link, D-089.panel, D-089.landing. | proposed |

## 11. Gaps and risks (stated, not hidden)
1. **No designer mock or owner-approved copy exists for idea 1.** §4.6-§4.7 and §4.15 place it in the goal system; the owner sees the captures with the release (D-123).
2. **The soft guard (§4.4) is not a hard guard.** A crafted POST still reaches a paused, full or **suspended** owner and spends the sender's own credit, as today. F1 (§13) closes it in `server/db.ts`. It is not a release dependency, because the new landing stops the normal flow in all three cases. Against: a suspended account receiving requests breaks "a suspension ... covers every alias" (BRIEF), so F1 should be ordered as early as the `server/db.ts` chain allows (§3.11).
3. **`/fast/:linkCode` links keep today's behaviour** (no name, no not-taking state). Only F1 covers them.
4. **Global uniqueness:** "alex" at one company blocks "alex" everywhere. A per-company index needs a migration; not proposed.
5. **Enumeration:** anyone can probe whether a name exists at a company and whether it is taking requests. The name is what the owner published, and the 404 hides why a link is unavailable. A resolve rate limit (`consumeDurableLimits`, unused) is a follow-up if QA sees probing.
6. **Impersonation inside a company:** handled by the self-chosen-name line, reports and the admin reset; identity is still only "a verified employee at {Company}".
7. **Sweep lag:** a link request past its D-050 window counts toward "full" until the hourly sweep closes it (`server/askExpirySweep.ts`), at most an hour.
8. **Visibility needs two goal-surface releases** (`referrer-home`, `links`) whose release rows are not registered yet; §5.4 stops until they exist.
9. **D-206:** only the decisions this packet rests on were rated (appendix); the full session-start review was out of this session's scope.

## 12. Review checklist (for the independent reviewer of each Tier 1 row)
1. **Scope:** `git diff --stat origin/main...<branch>` lists only the row's `owns`; nothing in §6 changed.
2. **Payload:** every resolve response parses with the strict schema; no public response carries `name`, `email`, `referrerId`, `handle` or `workEmailVerifiedAt`.
3. **Neutral failure:** the 404 body is byte-identical for unknown, inactive, unverified, suspended (user and canonical person) and blocked-viewer cases; reproduce each.
4. **No leak:** no route path has a parameter (source pin); no activity metadata or error holds the name or a referrer id; `/refer/…` stays scrubbed and Clarity-excluded.
5. **Name rules** are one shared function used by server and client; a rename turns the old link off.
6. **Login rule:** referrer-facing sign-in on the panel uses `referrerSignInHref`; the report form uses the seeker door.
7. **Money:** no money path edited; the not-taking target is `/start` with no link parameters.
8. **One black commit** on both pages in every state (`assertGoalPage`); **switch off** is byte-for-byte the old behaviour.
9. **The §5 tests exist and were red first** (check out the test commit without the fix).

## 13. Follow-up rows this packet proposes, outside D-089 (not registered here)
- **F1 `FIX-personal-link-owner-guard` (Tier 1, `server/db.ts`).**
  - In `getActiveReferrerFastTrackLink`/`…VanityLink` and `createCompanyReferralRequest`, refuse a suspended owner (user or canonical person) with `PERSONAL_LINK_UNAVAILABLE` before any credit. This is unconditional: it restores the identity rule.
  - Behind `REQUEST_INBOX_ENABLED`, refuse a paused or full owner with a not-taking error before any credit.
  - Close the race where the owner fails the in-transaction verification re-check and the request is inserted as waiting with `referrerId` still set (`server/db.ts:1911-1917,1960`; read from code, not reproduced).
  - It waits for the open `server/db.ts` chain (§3.11) or wherever the coordinator orders it.
- **F2 (Tier 2, `server/db.ts` + `MyCompanyInbox.tsx`):** a "From your link" label in `/queue`, opening link requests in the preview pane (§3.8). Polish only.
- **F3:** Q1's answer, built inside `D-174-expiry-clock-removal`.

## Appendix: ratings of the decisions this packet rests on (D-206, scoped)
| Decision | Rating | Note |
|---|---|---|
| D-089 (3) order (2, 1, 3 after the demand list) | 6 | Owner-reserved, kept. Against: L4 reuses live code and adds supply, yet waits behind the D-086 chain. |
| D-087 anonymous referrer by default | 8 | Above 7: protects employees from employer conflict and keeps D-019(e) symmetric. |
| D-017/D-050 personal-link lifecycle | 6 | Pause, capacity and suspension bypass (F1); stranded credit once the clock goes (Q1). |
| D-106 screen name = vanity alias | 7 | One name for card and link; §4.11 fixes the path. |
| D-176 applied to a person's link | 7 | Read as company-level; a person's own "not taking" is routing honesty. Reviewer to confirm. |
| D-223 split by files | 8 | Above 7: keeps this epic off five hot files with no new edges on them. |

## Status
- D-089-request-inbox: packet proposed (this file, reasoning session, not adopted); registry delta §9 and register entry §10 not applied.
- D-089.link: not registered.
- D-089.panel: not registered.
- D-089.landing: not registered.
