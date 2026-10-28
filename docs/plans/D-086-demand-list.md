# Packet D-086: the demand list (public counts of people asking for a referral, loop L1)

> **PROPOSED, NOT APPLIED.** A reasoning session (D-225) wrote this packet for the coordinator to validate and adopt. Being on this branch changes nothing:
> - `docs/plans/assignments.json` and `docs/DECISIONS.md` are untouched.
> - The registry delta (§9) and the register entry (§10) are text for the coordinator's own reviewed pull request.
> - Nothing below is built or live, and none of it is owner-approved beyond what §2 quotes. No builder takes a row from this file before adoption.
>
> **Revision 2** (same task, bounded, docs only) answers the coordinator's independent review of `5c1a4448` (PR #776). It has four findings. The dispositions and their source proofs are in §12.

> Read `docs/BRIEF.md` first, then this packet. Each row in §5 is its own task: claim it with the picker, build only that row, and edit only the paths in its `owns` (scope-check fails anything else). Write your status line in the Status section at the end; rows that share plan row D-086 never edit the §3b row (D-134).

| Field | Value |
|---|---|
| Queue rows (proposed) | `D-086.count` (Tier 1), `D-086.ui` (Tier 2), `D-086.mount` (Tier 2), `D-086.admit` (Tier 2, admin only); the parent `D-086-demand-list` becomes the release row (Tier 1, D-223 (3)) |
| Decisions | D-086, D-176, D-174, D-193 (3) and (4), D-162 (3), D-223; also D-006, D-019(e), D-028, D-030/D-057 (login rule), D-034, D-040, D-047, D-055, D-059, D-060, D-061, D-062, D-087, D-088, D-097, D-101, D-102, D-153, D-167, D-173/D-180, D-221 |
| Verified against | `origin/main` `6cbee199` (Oct 28 2026). All heads were fetched for the first draft and again for revision 2, when main was still `6cbee199` and the lock was at `5c1a4448`. No production query, API or provider call was made. |
| Migrations, env keys, dependencies | None. The two switches are in-code constants (D-193 pattern, §4.7). |
| Writer | Claude Opus 5.5 · fdae, architect lock `agent/architect/d086-demand-list`. This is a takeover from Claude Code · 4b71 (quiet 119 h), whose lock held only claim and heartbeat markers and no packet. |

## 0. Read receipt (D-225)
- **Main:** `6cbee199` (merge of #771), confirmed after `git fetch origin "+refs/heads/*:refs/remotes/origin/*"`, once for the draft and again for revision 2. D-225 (#772, `7a264327`) and D-226 (#773, `ee7386f6`) are ancestors of it. The highest register ID on `main` and every fetched head is D-226.
- **Read in full:**
  - `docs/BRIEF.md`, `AGENTS.md` (§0, team rules 0-9, the system map), `docs/BUILD_CONTINUITY.md` and `docs/DELEGATION.md` §§1-8.
  - Register entries D-028, D-034, D-047, D-059, D-061, D-062, D-086, D-087, D-101, D-102, D-154, D-162, D-174, D-176, D-193, D-221, D-223, D-224, D-225 and D-226.
  - `docs/plans/D-193-journey-foundations.md` §§1-7, the header and §0 of `docs/plans/D-090-BYOR.md`, `docs/plans/GOAL_UI_COVERAGE.md` §§0-2, and `docs/PRD.md` "Demand-list copy".
- **Prior repo-only outcome:** the lock held only markers: `2406cedf`, `31c42961` and `10e682cf` (Claude Code · 4932 and · 4b71, Oct 23), with no PR. The last report on the row is Claude Code · e11c's (the dependency edges, handled in §9). Revision 1 is `5c1a4448` on PR #776, reviewed by the coordinator; §12 answers that review.
- **Owner authority:** D-086 entered `main` in `ed8f09e5` (Oct 21), and the register paraphrases the owner ("Owner steers relayed via main agent"). The coordinator's verbatim quote ("people can request referrals for companies not there in the list separately too. We can show the list e.g. 20 job seekers are looking for referrals in xxxx company. If you are an employee plz help them and if they get selected you get your referral bonus from company.") is **not on `main`**. The coordinator verifies it against the original before adoption (§11 gap 1). This revision follows the quote, which is broader than the register title.
- **Goal contribution:** loop L1 (D-087). A real count of the people asking at a company shows its employees that people want referrals there. Each employee who then verifies adds referrer supply, the bottleneck, so more seekers get referred faster. This includes companies the directory does not list yet (§4.5).

## 1. Goal
Three outcomes:
- **Public demand.** On `/explore` and each company page, show how many people are asking for a referral at that company. Use real live rows only, k-anonymous, with no identity. Invite the company's employees to verify and help, and state honestly that any referral bonus is the employer's own.
- **The owner's unlisted-company outcome.** People can already request referrals at companies outside the directory (§3.6). Give that demand a moderated path to public display: admins see unlisted company domains ranked by people asking, verify the company, and list it with the existing admin action. The public pages invite seekers and employees at unlisted companies to act.
- **No new core code.** This packet adds no request, money, expiry or pool code.

## 2. Binding rules (quoted)
- **D-086** (owner-directed, Oct 21): "Public per-company demand counts for companies with no verified referrer; unlisted-company asks (... reverses the D-059 no-business-numbers-in-public principle for this case)." "(1) asks may target companies not in the directory: no credit, no slot until a verified referrer exists, then live oldest-first under D-034/D-047. (2) Counts public on /explore and demand detail, real data only, k-anonymous: from 3 up, "A few people asking" for 1-2, never 0, no seeker names. (3) Any bonus is the employer's own programme; skipwait.me never pays referrers (D-055)." Its "Affects" cell includes "Reverses D-059 for per-company demand counts only".
- **D-176** (owner, Oct 24, verbatim in the register): "The concept of open to requests doesnt map well with users mental model they just search company , see job ids and its descriptions , they ask referrals , if any referrer is there it should go , if not there new ones who join will be able to see". The ruling: "referrer availability is backend routing, never a browse gate or a visible status." "coverage data is not exposed through the directory."
- **D-174** (owner, Oct 23, verbatim in the register): "If any referrer is there it will go if no one is there still it will go to company pool whoever sign-up they will be able to see. ( for now I dont require any expiry)". The ruling: "an ask never expires"; the pool keeps "capacity rules unchanged"; "No new debit, refund or ledger behavior is created by this entry."
- **D-193 (3)**: "a verified employee sees how many requests wait at their company (a count only)". **D-193 (4)**: "an unconfirmed request keeps waiting and never closes, and confirming spends under the same key."
- **D-162 (3)**: "Its build follows BYOR, because both edit the ask path, My asks and `/explore`." "D-086 (2)'s rule (a number only from 3 up, "A few people" for 1-2, never 0) overrides the PRD copy's "(singular for 1)"."
- **D-221** (row note): "the packet writer replaces the 90-day closure with D-174 ... plus D-193 (4) ..., and drops the 'not yet open' availability framing (D-176). Whether public per-company demand counts survive D-176 is checked against D-193 (3) before any owner question."
- **D-101**: "Mapping a domain to a company stays a manual admin edit."
- **D-223 (1)/(3)/(6)**: `dependsOn` names "only the rows whose output it needs"; "The merge is the parent's release row"; "Split by owned files, never by step ... prefer an existing mount point to a new registration line."
- **D-087/D-088**: "real counts only; bonus lines name the employer's own programme and are never guaranteed; no seeker details exposed; referrers never charged". "Every published figure needs a live source." No post in the owner's name.
- **Login rule (D-030/D-057)**: a referrer-facing link uses `referrerSignInHref()` (`client/src/lib/referrerSignIn.ts:7`), never `SignInButton` or `openSignIn`.
- **D-153** (frozen): "promise only what works today." **D-173/D-180**: no "credit(s)" and no noun "ask" on a page.

## 3. Current behaviour (verified on `6cbee199`; find functions by name, line numbers drift)
1. **No public demand count exists.** `/api/companies` (`server/companyDirectoryRoutes.ts:75`) returns the directory with `openToReferrals` and `openCount`. D-176 retires their visible use, and dropping them belongs to the D-189 journey packet (D-193 (6)).
2. **ROW20-B is a vote counter, not demand.** `countCompanyDemand` (`server/db.ts:1059`) counts distinct submitters of `companySuggestions` (`drizzle/schema.ts:149`) per company **name**. The votes come from `/invite` and `/suggest-company`, can be filed by employees, create no request, and are seen only by admins (`server/db.ts:1073`). This packet never reads them.
3. **Admin-only demand views exist, but none is an admission queue.** `getReferralFlowHealth` (`server/db.ts:2889`) builds `coverageGaps` (`:2900-2902`). It counts waiting **requests** (not people) per domain, keeps only domains with zero verified referrers, mixes listed and unlisted domains, and stops at 12. The D-018 baseline's `demand[]` (`shared/flowBaseline.ts:55`) also counts requests per domain. No view lists unlisted request domains by the number of people asking.
4. **The private waiting count is a separate, unbuilt row.** `D-174-pool-nudges` (`docs/plans/D-193-journey-foundations.md` §5.9) adds `waitingCount` to the inbox: requests waiting in the pool at the verified employee's own company, private, behind `POOL_NUDGES_ENABLED = false`. This packet does not touch it.
5. **Aggregate precedent.** The D-104 signal (`server/companyResponseSignal.ts:12`; `MIN_SIGNAL_N = 3` at `shared/companyResponseSignal.ts:4`):
   - It reads `referralRequests` joined to `jobs` with `inArray(jobs.company, ownedDomains)`.
   - It is served at `/api/companies/:slug/response-signal` (`server/companyDirectoryRoutes.ts:107`) and answers 404 while its switch is off.
   - The client renders nothing on a failed read (`client/src/lib/companyResponseSignal.ts:1-2`).
   - Its fixture pins "a name-only job company value counts nothing" (`server/companyResponseSignal.fixture.test.ts:37`).
   - The in-memory test kit supports `count()` with `groupBy`, not `countDistinct` (`server/inMemoryDrizzle.testkit.ts:8`).
6. **Requests at unlisted companies already work.** `POST /api/company-referrals` (`server/privateReferralRoutes.ts:740`) binds a directory company only when `companySlug` is sent (`:766-770`); `server/companyReferralSelectedCompany.test.ts:41` pins "sends no selected company when none was chosen". `createCompanyReferralRequest` (`server/db.ts:1873`) resolves the employer from the link (`:1874`), so the request is keyed by its domain (`jobs.company`). Every request needs a resume (`server/privateReferralRoutes.ts:752`).
7. **No credit and no slot until a referrer can see the request, then oldest first by capacity.**
   - Coverage counts only available referrers (`server/db.ts:1917`).
   - A waiting request skips the slot cap (`:1922`) and spends nothing at create (`:1970`).
   - `openAskCondition` excludes waiting rows (`server/planGates.ts:30`); the per-company cap uses the same predicate (`server/db.ts:1927`).
   - Delivery runs `deliverWaitingAskTx` (`:2700`) through `deliverWaitingAsksToReferrer` (`:2799`). It is pinned in `server/db.coverageDelivery.test.ts` (`:76` spend at first visibility, `:91` oldest first up to capacity, `:113` held).
8. **The 90-day closure and reconfirm belong to other rows.** `D-174-held-ask-reconfirm` builds D-193 (4), reconfirm before spend, with no closure. `D-174-expiry-clock-removal` waits for it and removes the clocks.
9. **The pages are owned elsewhere.** `client/src/pages/Explore.tsx`, `ExploreCompany.tsx` and `explore/**` belong to `D-048-p3-live-review-find`, which waits for `D-174-seeker-journey-build` and `D-174-fix-post-binding`. `D-099-bonus-line` takes them after that. The company page already mounts one optional aggregate section, `<Responsiveness>` (`client/src/pages/ExploreCompany.tsx:166`). The admin companies view is `CompaniesView` (`client/src/components/admin/AdminSectionViews.tsx:21`), rendered by `client/src/pages/AdminOverview.tsx`. `D-048-p3-admin` owns that page, and `D-099-bonus-pages` holds a switch-only claim on it.
10. **Live privacy wording.** None of these lines contradicts an aggregate count with no identity or request content:
    - `client/src/pages/TrustPrivacy.tsx:16`: "A private handoff, not a public marketplace ... We do not publish resumes, Referrer identities, or private request conversations."
    - `client/src/pages/Home.tsx:88`: "Your name is never public."
    - `client/src/pages/GoalLanding.tsx:36`: "Your name stays private until a referrer chooses to open the conversation."
    - `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx:265`: "Never ranked. Never public." This is about the referrer's own private record.
11. **An employee at an unlisted company already receives that company's waiting requests on verifying.** Both enrollment paths call `deliverWaitingAsksToReferrer(userId, domain)` with the verified work-email domain, without consulting the directory: `completeWorkEmailOtpEnrollment` (`server/db.ts:1582`) and `saveVerifiedWorkEmail` (`:1601`). The owner's "if you are an employee plz help them" therefore already works at unlisted companies. What is missing is telling those employees that people are asking.
12. **The admission action exists and refuses unsafe domains.**
    - `POST /api/admin/companies` (`server/companyDirectoryRoutes.ts:135`, admin only) takes `adminCompanyCreateSchema`, a strict object (`shared/companies.ts:72-85`).
    - `companyDomainSchema` (`shared/companies.ts:21-24`) refuses malformed and personal-mail domains (`isCorporateEmailDomain`, `shared/const.ts:18`).
    - D-101's admin list of verified work domains that no company owns is `/api/admin/companies/unmatched-domains` (`server/companyDirectoryRoutes.ts:126-133`): `requireAdmin` first, then 404 while `UNMATCHED_DOMAINS_ENABLED` is not `true`.
13. **Liveness is the runtime's own.** A request is live while `status = "pending"`. The runtime ends requests only through its clocks:
    - **Shelf life:** `isAskExpired` (`shared/referral.ts:193`) and `getAskShelfLifeEndsAtMs` give 7 days after first visibility, or 90 days while waiting (`ASK_TTL_DAYS`, `COVERAGE_WAIT_DAYS`, `:76-80`).
    - **Unclaimed assignments:** `selectStaleHeldAsks` (`server/heldAsk.ts:95`) finds them past their window.
    - **Closing:** `reconcileExpiredPendingReferrals` (`server/db.ts:2548`) closes on read, and the hourly `ask-expiry-sweep` closes the rest.
    - **Inbox:** the referrer inbox hides an expired unassigned request before the sweep closes it, using `isAskExpired` (`server/db.ts:2190`).

    D-174 suspends these clocks as launch direction, and `D-174-expiry-clock-removal` removes them. The predicate has no expiry of its own for an assigned request (`referrerId` set), and it is not a status check: it returns false for a withdrawn row, so a status filter is still needed (proof P2 in §12).

## 4. Rulings this packet proposes (decided under D-200; changeable; register text in §10)
1. **Public demand is not private waiting.**
   - The public count is people asking for a referral at a company, over every live request (waiting, held, delivered or claimed), k-anonymous, shown to everyone.
   - The D-193 (3) count is requests waiting in the pool, exact, shown only to that company's verified employees.
   - D-193 (3) narrowed who sees *waiting requests*; it did not rule on public demand.
   - Public copy never says "waiting" about a company.
2. **Coverage-neutral demand is the owner's own reading, so no owner question remains.**
   - **What the owner said.** The request is to show "20 job seekers are looking for referrals in xxxx company. If you are an employee plz help them". It sets no coverage condition. D-176 and D-174 then say users "just search company ... they ask referrals, if any referrer is there it should go, if not there new ones who join will be able to see": demand exists and is sent whatever the coverage.
   - **Where the narrower clause came from.** The register title's "for companies with no verified referrer" belonged to D-102's open/not-open presentation, which D-176 superseded as a mental-model mismatch.
   - **The ruling.** The count shows at every listed company where people are asking, whatever its coverage, and its read touches no referrer, profile or availability table. Coverage-neutral demand does not cancel demand: covered and uncovered companies both show it.
   - **It stays inside the owner's reversal.** This is still "per-company demand counts", which D-086 reversed D-059 for.
3. **What counts (one server-side definition, F2).** The count is distinct people, deduplicated per company across all its domains. A person is `users.canonicalPersonId`, or the user id when that is null. A row counts when:
   - it is **live**: `referralRequests.status = "pending"` and `!isAskExpired(row, nowMs)`. That is the runtime's own predicate (§3.13), imported, not copied, so it applies no age cutoff of its own. While the legacy clocks exist, the count drops exactly what the runtime ends. Once `D-174-expiry-clock-removal` lands, nothing drops by age, and the count follows with no change;
   - `jobs.company` is a domain of a **listed** directory company (`companies.status = "listed"`, via `companyDomains`), and that company is not the operator company (`OPERATOR_COMPANY_SLUG`, `shared/flowBaseline.ts:19`);
   - the seeker is not suspended (`users.suspended`, `canonicalPeople.suspended`) and is not an admin (`users.role`).

   Further rules:
   - **Reconfirm is not expiry.** A request awaiting reconfirm (`D-174-held-ask-reconfirm`) stays pending and keeps counting: reconfirm gates the spend, not liveness, so there is neither a display expiry nor a frozen count.
   - **Present tense.** The copy "are asking" means the person holds a live, unwithdrawn request. It needs no "recent" qualifier and says no "now" or "this month".
   - **Never counted:** `companySuggestions` votes, approved, declined, withdrawn or closed requests, or anything about plans or credits. The count is plan-blind (D-006).
4. **k-anonymity (D-086 (2), D-028; settled, preserved).** From 3 people the payload is `{ state: "count", people }`. For 1-2 it is `{ state: "few" }` with no number. At 0 the detail answers `{ state: "none" }` and the company is absent from the list. There are no totals. `count` entries sort by people descending then name; all `few` entries follow, sorted by name only, so the order cannot reveal 1 versus 2.
5. **Moderated admission of unlisted companies (F1): the owner's outcome, kept safe.** The public list never prints a seeker-supplied domain. An unlisted company reaches public display through a moderated path:
   - **(a) Request.** A seeker requests with the company's job link (exists, §3.6).
   - **(b) Admin queue.** `GET /api/admin/company-demand/unlisted` (new, in `D-086.count`) is admin only and `private, no-store`, behind `COMPANY_DEMAND_ADMIN_ENABLED`. It lists live-request domains that no company owns, with the number of distinct people. Personal-mail domains are excluded and there are at most 200 rows. It carries no ids, names, emails, URLs or request text.
   - **(c) Admin check and listing.** An admin checks the domain belongs to a real company and lists it with the existing `POST /api/admin/companies` (§3.12, D-101's manual edit).
   - **(d) Public display.** The public count appears with no code change (§4.3).

   The steps that already run today:
   - **Employees can already help.** Employees at an unlisted company receive its waiting requests the moment they verify (§3.11).
   - **The public pages say so.** The list invites seekers and employees at unlisted companies (§4.8). It never says that suggesting or submitting a company creates public demand, and never that the public list is all demand.
   - **The admin display is `D-086.admit`**, which waits for `D-048-p3-admin` (§5.5). Until it lands, the queue is readable only as admin JSON. `/admin/flow-health` `coverageGaps` stays the partial view (§3.3). This gap is named in §11.
6. **The ask-to-any-company path is done.** D-086 (1) is §3.6-§3.7 and §3.11. The 90-day closure is replaced by D-174 plus D-193 (4) in `D-174-held-ask-reconfirm` and `D-174-expiry-clock-removal` (§3.8). The "not yet open" framing is dropped (D-176), and the plan §3b row and the queue title are reworded (§9).
7. **Switches.** `shared/companyDemand.ts` exports `COMPANY_DEMAND_PUBLIC_ENABLED = false` (the two public routes and the client hooks) and `COMPANY_DEMAND_ADMIN_ENABLED = false` (the admin queue). Each is one reviewed line. There is no env key, so `.env.example`, `src/worker.ts` and `client/src/lib/flags.ts` stay untouched.
8. **Copy (proposed; it replaces the PRD's demand-list section at release):**
   - **Count:** "{N} people are asking for a referral at {Company}." (PRD verbatim; N in `GoalNum`.)
   - **Few:** "A few people are asking for a referral at {Company}." (D-086 (2)'s "A few people asking", as the full sentence the PRD asks this packet to propose.)
   - **None:** nothing renders. Both PRD empty lines are dropped. "No one has asked for {Company} yet" asserts the past and could be false. "Nobody at {Company} is waiting right now. We'll tell you if that changes." says "waiting" and promises a notice that nothing sends (D-153).
   - **Employee help** (a plain link, never a black commit): "Work at {Company}? Verify your work email to help." It links to `referrerSignInHref()`. It does not say "see these requests", because D-062 hands a new referrer at most their capacity.
   - **Bonus:** "If {Company} pays employees a referral bonus, {Company} sets and pays it under its own rules. skipwait.me never pays referrers." It has no figure (figures come only from D-099 with a source), no guarantee, and no "if they get selected you get". The PRD's "Most companies pay..." is an unsourced statistic (D-088).
   - **List heading on `/explore`:** "Companies in our directory where people are asking for a referral". Each entry links to `/explore/:slug`.
   - **Under the list, for unlisted companies (F1):**
     - "Your company isn't listed? Request a referral with a job link from its careers site." The link goes to `/ask`, the existing path.
     - "Work at a company that isn't listed? Verify your work email to help people asking there." The link is `referrerSignInHref()`; it is true per §3.11.
9. **Placement.** On the company page the line sits below the hero, outside "Your next step", so the page keeps exactly one black commit (D-150). On `/explore` the list shows only in the browse state (empty search). It never filters, groups or reorders the directory. The Oct 21 mocks are not in the repository. Their availability labels and public credit figures are **superseded** (D-176, D-173/D-180) and are never restored. If found, the mocks inform layout only.
10. **Nothing outbound.** No email, share card, social post, sitemap entry, `JobPosting` or SEO markup carries a demand number (D-087/D-088). The numbers live only in the API responses and the components.

## 5. The rows
Every row: claim through the picker, write red tests first, one commit per step, with `pnpm check` and its focused tests green on each commit, and the full gate on the merged result. Tier 1 rows open a draft PR and get an independent review by a model that neither built nor fixed the work (D-151).

General **Stop if** for every row: a cited function or contract changed on `main`, a test fails for a reason you cannot explain, or the work needs a file outside `owns`. Stopping means: push, run `--report blocked` with the question, and wait.

### 5.1 `D-086.count` (Tier 1: a public aggregate of seeker activity plus an admin queue; M)
- **Waits for:** `D-174-company-search`, which owns `server/companyDirectoryRoutes.ts`, where this row adds its one mount call (D-223 (6): an existing mount point). There is no BYOR edge, because no owned file is shared with BYOR (settled).
- **Do:**
  1. **New `shared/companyDemand.ts`:**
     - The two switches (§4.7) and `DEMAND_PUBLIC_MIN = 3`.
     - Strict Zod schemas:
       - `publicDemandSchema`: none | few | `count { people >= 3 }`;
       - `companyDemandListResponseSchema`: `{ companies: [{ slug, name, demand }] }`;
       - `companyDemandDetailResponseSchema`: `{ demand }`;
       - `unlistedDemandAdminResponseSchema`: `{ domains: [{ domain, people }] }`.
     - Pure functions:
       - `isLiveDemandRow(row, nowMs)`: status pending and `!isAskExpired`, the predicate imported from `shared/referral.ts`;
       - `countDemandPeople(rows, companies, nowMs)` (§4.3), `toPublicDemand`, `orderDemandList` (§4.4);
       - `countUnlistedDemand(rows, ownedDomains, nowMs)` (§4.5 (b)).
     - The §4.8 copy as functions of `{Company}` and `{N}`.
  2. **New `server/companyDemand.ts`:**
     - `loadCompanyDemand(companies, nowMs, db?)` selects plain rows: `{ company: jobs.company, userId, canonicalPersonId, role, userSuspended, personSuspended, status, referrerId, createdAt, coverageVisibleAt, waitingForCoverage }`. It reads from `referralRequests` joined to `jobs` and `users`, with a left join to `canonicalPeople`, where `status = "pending"` and `inArray(jobs.company, listedDomains)`, and counts in the pure function.
     - `loadUnlistedDemand(ownedDomains, nowMs, db?)` uses the same read shape, filters to domains outside `ownedDomains`, and is bounded to 200 output rows.
     - No name, email, pitch, URL or request id leaves the module. It reads no `profiles`, availability, slot, wallet or plan table.
  3. **New `server/companyDemandRoutes.ts`:** `registerCompanyDemandRoutes(app, deps)`.
     - `GET /api/company-demand` (the list) and `GET /api/company-demand/:slug` (the detail). Their prefix differs from `/api/companies/:slug`, so they cannot shadow a slug.
       - Listed companies come from the existing directory (`listCompanyDirectory`, `getCompanyDirectoryEntry`), which is injectable.
       - Public switch off: 404 `no-store`, nothing read.
       - Bad slug: 400. Unknown or hidden company: 404.
       - Success: `public, max-age=300`, with the body parsed by its schema.
       - Database down: 503 `no-store`, reported through the server Sentry path with no query string or personal data.
     - `GET /api/admin/company-demand/unlisted` follows the unmatched-domains order (§3.12):
       - admin check first (401 anonymous, 403 non-admin);
       - then 404 while the admin switch is off;
       - otherwise `private, no-store` with the parsed body.
  4. **`server/companyDirectoryRoutes.ts` (switch only):** inside `registerCompanyDirectoryRoutes`, call `registerCompanyDemandRoutes(app, { resolveIdentity: deps.resolveIdentity, ... })`. At most 12 lines.
- **Tests (red first):**
  - `shared/companyDemand.test.ts`:
    - `toPublicDemand` maps 0/1/2/3/20/NaN/-1 to none/few/few/count 3/count 20/none/none.
    - `countDemandPeople`:
      - one person with two live requests at a company counts 1;
      - two aliases of one canonical person count 1;
      - two domains of one company count 1;
      - one person at two companies counts 1 at each;
      - every non-pending status, a suspended user, a suspended canonical person, an admin, an unlisted domain and the operator company each count 0;
      - a waiting, a held, a delivered and a claimed pending request each count.
    - **Liveness (F2):**
      - a waiting request created 40 days earlier counts;
      - a waiting request past the legacy 90-day shelf life and an unassigned visible one past 7 days count 0, exactly where `isAskExpired` is true;
      - with `isAskExpired` stubbed to never expire (what clock removal does), both count, so no age rule of the count's own remains;
      - a request awaiting reconfirm (its `reconfirm_requested` event in the fixture) counts.
    - `orderDemandList`: a 2-person "A" and a 1-person "B" both come out `few`, in name order.
    - `countUnlistedDemand`: an owned domain (listed or hidden) is excluded, a personal-mail domain is excluded, and the result is capped at 200.
    - Schemas reject unknown keys, a `few` carrying a number, a `count` below 3, and any `total`.
  - `server/companyDemand.fixture.test.ts` (`createInMemoryDrizzle`, as in `server/companyResponseSignal.fixture.test.ts`):
    - a `jobs.company` name value counts nothing;
    - results carry slugs, domains and numbers only;
    - two `nowMs` values give results consistent with `isAskExpired`, using the app clock and never SQL `NOW()`;
    - adding verified referrers at a company changes nothing (coverage-neutral).
  - `server/companyDemandRoutes.test.ts`:
    - public switch off: 404 `no-store`, loader not called;
    - public switch on: list and detail as above; 400, 404 (unknown and hidden) and 503 with no personal data; the cache header;
    - no public response contains a number below 3, `total`, `requests`, `waiting`, `open` or a domain;
    - admin route: 401 and 403 before anything else; 404 while the admin switch is off; with it on, `private, no-store` and only `{ domain, people }`.
- **Owns:** `shared/companyDemand.ts`, `shared/companyDemand.test.ts`, `server/companyDemand.ts`, `server/companyDemand.fixture.test.ts`, `server/companyDemandRoutes.ts`, `server/companyDemandRoutes.test.ts`, `server/companyDirectoryRoutes.ts (switch only)`.
- **Done when:**
  - The tests pass.
  - These stay green: `server/companyDirectoryRoutes.test.ts`, `server/companyResponseSignal*.test.ts`, `server/db.companyDemand.test.ts` (ROW20-B) and `server/db.coverageDelivery.test.ts`.
  - The full gate passes and the independent review passes.
  - Both switches stay false.
- **Stop if:**
  - `jobs.company` can hold a mixed-case or name value for new requests. Count such a value as nothing; never fuzzy-match it.
  - A listed company shares a domain with another.
  - Liveness would need anything other than the imported `isAskExpired` and the status.
  - §4.3 or §4.5 would need `server/db.ts`.

### 5.2 `D-086.ui` (Tier 2: renders the server's public payload; a referrer link, not sign-in logic; S)
- **Waits for:**
  - `D-086.count`, whose contract and copy it imports;
  - `D-090-BYOR`, which owns `docs/plans/GOAL_UI_COVERAGE.md`. Every new `.tsx` under `client/src/components/` needs a line there, or `scripts/goalUiCoverage.test.ts` fails (D-167).
- **Do:**
  - New `client/src/components/demand/useCompanyDemand.ts`: React Query hooks for the list and the detail, with `enabled: COMPANY_DEMAND_PUBLIC_ENABLED && ...`, `retry: false` and `staleTime: 300_000`. A failed, missing or unparsable read resolves to `null` (the D-104 pattern).
  - New `CompanyDemandLine.tsx` (`{ slug, companyName }`): the sentence, the help link and the bonus line.
  - New `CompanyDemandList.tsx`: the heading, entries linking to `/explore/:slug` in server order, then the two unlisted-company lines (§4.8).
  - Both render **nothing** while the switch is off, while loading, on error, offline, or for `none`. They are supplementary, so they show no banner; the server reports its own failures.
  - Goal tokens only. No `components/kit` or `components/ui` import, and no `GoalButton variant="primary"`.
  - Each help link calls `trackClarityEvent("demand_help_clicked")` (`client/src/lib/clarity.ts:34`, imported only).
  - Add both components to `docs/plans/GOAL_UI_COVERAGE.md` §4, with `D-086.mount` as their row.
- **Tests (red first), `client/src/components/demand/companyDemand.test.tsx`:**
  - **Rendering states:** switch off fetches nothing and renders nothing; loading, error, offline and `none` render nothing; count renders the exact sentence with N in `GoalNum`; few renders the exact sentence with no digit.
  - **Links:** every help link's `href` equals `referrerSignInHref()`, and the module source imports neither `SignInButton` nor `openSignIn`. The unlisted seeker line links to `/ask`. No element carries `data-g-primary`.
  - **Copy:** the bonus line contains "skipwait.me never pays referrers" and no digit, currency sign or "guarantee". The list heading names the directory and renders no total. Rendered text never contains "credit", "ask" as a noun, "waiting", "open", "Not open yet", or a claim that suggesting a company adds demand.
  - **Analytics:** one click sends one event.
- **Owns:** `client/src/components/demand/CompanyDemandLine.tsx`, `client/src/components/demand/CompanyDemandList.tsx`, `client/src/components/demand/useCompanyDemand.ts`, `client/src/components/demand/companyDemand.test.tsx`, `docs/plans/GOAL_UI_COVERAGE.md`.
- **Done when:** the tests pass, `scripts/goalUiCoverage.test.ts` and `node scripts/design-token-audit.mjs` pass, and the full gate passes.

### 5.3 `D-086.mount` (Tier 2: two mount points behind the switch; S)
- **Waits for:**
  - `D-086.ui`;
  - `D-048-p3-live-review-find`, which owns and redesigns both pages, and through it `D-174-seeker-journey-build` and `D-174-fix-post-binding`.
- **Do:**
  - On the redesigned company page, render `<CompanyDemandLine slug companyName />` below the hero and outside the next-step block.
  - On `/explore`, render `<CompanyDemandList />` only in the browse state.
  - Both edits are switch-only, at most 12 lines each.
- **Tests (red first), `client/src/pages/explore.demandMount.test.tsx`:**
  - **Switch off:** both pages render as before, the existing explore tests are unchanged and green, and nothing calls `/api/company-demand`.
  - **Switch on (mocked):** the line sits outside the next-step block, and there is still exactly one `data-g-primary` with `assertGoalPage` holding. The list is absent once a query is typed, and the directory's order is unchanged.
- **Proof:** captures at 1280 and 390 from fictional fixtures (team rule 8) of count, few, none, the list with its unlisted lines, and the switch off, under `design/goal-ui/captures/demand/`.
- **Owns:** `client/src/pages/Explore.tsx (switch only)`, `client/src/pages/ExploreCompany.tsx (switch only)`, `client/src/pages/explore.demandMount.test.tsx`, `design/goal-ui/captures/demand/**`.

### 5.4 `D-086-demand-list`: the release row (Tier 1; status `todo`, waiting on its rows)
- **Waits for:** `D-086.count`, `D-086.ui`, `D-086.mount`, `D-090-BYOR` (D-162 (3); BYOR also owns the three docs below) and `D-048-p3-live-review-find`. Not `D-086.admit`: the admin view is not behind the public switch and must not hold the release on `D-048-p3-admin` (§5.5).
- **Do:**
  - Flip both switches, `COMPANY_DEMAND_ADMIN_ENABLED` and `COMPANY_DEMAND_PUBLIC_ENABLED` (switch only).
  - Add the `AGENTS.md` system-map row: `/api/company-demand*` and `/api/admin/company-demand/unlisted`, mapped to `shared/companyDemand.ts`, `server/companyDemand.ts` and `server/companyDemandRoutes.ts`. Describe it as live distinct canonical people, listed companies only in public, coverage-neutral, k-anonymous, with no age cutoff of its own.
  - Replace the PRD demand-list copy with §4.8.
  - Reword plan §3b row D-086 to drop "closed at 90 days under D-061" and "D-102's honest availability" (D-174, D-176).
- **Before flipping:**
  - QA on the preview with both switches on, with captures.
  - The normal privacy review inside the independent Tier 1 review: payload and copy are checked against the live lines in §3.10, and the legal text is left as it is (§7).
  - The CEO's sign-off (D-223 (3)).
- **Done when:** after the deploy, `GET https://skipwait.me/api/company-demand` returns only slugs, names and demand states, with no number below 3, no total and no domain (paste the response). Screens at 1280 and 390.
- **Owns:** `shared/companyDemand.ts (switch only)`, `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`.

### 5.5 `D-086.admit` (Tier 2: admin-only view of the admission queue; S)
- **Waits for:**
  - `D-086.count` (the admin read);
  - `D-086.ui` (both own `docs/plans/GOAL_UI_COVERAGE.md`);
  - `D-048-p3-admin`, which owns `client/src/pages/AdminOverview.tsx`. `D-099-bonus-pages`'s claim there is switch-only, like this one, so the two do not conflict.
- **Do:**
  - New `client/src/components/admin/UnlistedDemandView.tsx`: a table of `{ domain, people }` from `/api/admin/company-demand/unlisted`, each with a link that opens the existing company-create form with the domain prefilled. It gives no automatic listing.
  - It handles its states explicitly: loading; 404 shows "Not switched on yet"; error shows "Couldn't load the queue" and a retry; empty shows "No unlisted companies with requests".
  - Mount it in `AdminOverview.tsx` next to `CompaniesView` (switch only). Add its `GOAL_UI_COVERAGE.md` line.
- **Tests (red first), `client/src/components/admin/unlistedDemandView.test.tsx`:**
  - each state renders as described;
  - domains render as text, never as links to the domain;
  - the create link carries the domain as data only, and nothing is created without the admin submitting the existing form;
  - no id, name or email field is read.
- **Owns:** `client/src/components/admin/UnlistedDemandView.tsx`, `client/src/components/admin/unlistedDemandView.test.tsx`, `client/src/pages/AdminOverview.tsx (switch only)`, `docs/plans/GOAL_UI_COVERAGE.md`.
- **Done when:** the tests pass, the token audit and coverage test pass, and there are captures at 1280 and 390. Until this lands, admins read the queue as JSON at the admin endpoint (§11 gap 9).

## 6. Out of scope (every row)
- **Server:** `server/db.ts`, `server/privateReferralRoutes.ts`, `server/coverageDelivery.ts`.
- **Shared:** `shared/moneyCopy.ts`, `shared/referral.ts` (imported, never edited).
- **Client:** `client/src/App.tsx`, `client/src/lib/flags.ts`, `client/src/components/admin/AdminSectionViews.tsx`.
- **Config and data:** `.env.example`, `src/worker.ts`, `functions/**`, `drizzle/**`.
- **Behaviour:** any expiry, reconfirm, pool, spend or refund code.
- **Neighbouring features:** `companySuggestions` and the ROW20-B code, `/invite`, `/suggest-company`, the D-104 signal, sitemaps and SEO markup.

## 7. Privacy and legal text (F4)
The legal text stays as it is. An aggregate count with no identity or request content contradicts none of the live lines in §3.10, so there is no separate approval gate. The Tier 1 reviews of `D-086.count` and the release row check payload and copy against those lines. A real contradiction goes to the owner under the standing legal-text rule (plan §6).

## 8. Owner questions
None remain. The scope question in revision 1 rested on the register title's narrow clause, not on the owner's broader request. §4.2 records the compatible reading. Choices the coordinator may still change without the owner: placement (§4.9) and copy (§4.8), within D-153.

## 9. Proposed registry delta (for the coordinator; validated on a scratch copy, not applied)
**Validation.**
- With the JSON below applied to a scratch copy of `origin/main`'s `docs/plans/assignments.json` (`6cbee199`), `validateAssignments` (`scripts/nextTaskCore.mjs:194`) returns **217 rows, 0 errors**. The unchanged file returns 213 rows, 0 errors.
- An `ownsOverlap` probe of each proposed `owns` against every open row found overlaps only where a `dependsOn` edge, direct or transitive, already orders them. Nothing overlaps `PRICING-banded-oct25` (#666).

Overlap resolutions:
- `D-086.count` overlaps `D-174-company-search`: resolved directly.
- `D-086.ui` overlaps `D-090-BYOR`: resolved directly.
- `D-086.mount`:
  - overlaps `D-048-p3-live-review-find`: resolved directly;
  - overlaps `D-174-fix-post-binding`: resolved through live-review-find;
  - overlaps `D-099-bonus-line`: resolved because bonus-line waits for bonus-pages, which waits for the parent.
- `D-086.admit` overlaps `D-048-p3-admin` (`AdminOverview.tsx`) and `D-086.ui` (`GOAL_UI_COVERAGE.md`): both resolved directly. It also overlaps `D-090-BYOR` on `GOAL_UI_COVERAGE.md`: resolved through `D-086.ui`.
- The parent:
  - overlaps `D-090-BYOR`: resolved directly;
  - overlaps `D-099-bonus-pages` and `DEPLOY-gate-docs-sync`: both already wait for the parent.

Parent row `D-086-demand-list`, fields to change:
```json
{
  "title": "Demand list (D-086, loop L1): k-anonymous public counts of people asking for a referral at each listed company, with moderated admission of unlisted companies; release row",
  "packet": "docs/plans/D-086-demand-list.md",
  "status": "todo",
  "dependsOn": ["D-086.count", "D-086.ui", "D-086.mount", "D-090-BYOR", "D-048-p3-live-review-find"],
  "owns": ["shared/companyDemand.ts (switch only)", "AGENTS.md", "docs/PRD.md", "docs/KIT_V4_BUILD_PLAN.md"],
  "note": "D-086 packet §5.4 (release row, D-223 (3)): flips COMPANY_DEMAND_ADMIN_ENABLED and COMPANY_DEMAND_PUBLIC_ENABLED after D-086.count, D-086.ui and D-086.mount land, QA with captures, the normal privacy review inside the independent Tier 1 review, and the CEO's sign-off. Public demand counts every live request (the runtime's own isAskExpired, no age cutoff of its own) at every listed company whatever its coverage (D-176/D-174), k-anonymous; it is not D-193 (3)'s private waiting count. Unlisted companies reach public display only through admin admission (packet §4.5); D-086.admit is the admin view and does not hold this row. The ask-to-any-company path already exists (packet §3.6-§3.7, §3.11); the 90-day closure is replaced by D-174 plus D-193 (4) in D-174-held-ask-reconfirm and D-174-expiry-clock-removal. D-099-bonus-pages, D-089-request-inbox (by its note) and DEPLOY-gate-docs-sync keep waiting for this row."
}
```
New rows, inserted directly above the parent:
```json
[
  {"id": "D-086.count", "title": "Demand count (D-086): distinct people with a live referral request at each listed company (public, k-anonymous) and the unlisted-domain admission queue (admin only), behind two switches that start false", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 1, "lane": "demand-count", "branch": "agent/queue/d086-count", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-174-company-search"], "owns": ["shared/companyDemand.ts", "shared/companyDemand.test.ts", "server/companyDemand.ts", "server/companyDemand.fixture.test.ts", "server/companyDemandRoutes.ts", "server/companyDemandRoutes.test.ts", "server/companyDirectoryRoutes.ts (switch only)"], "note": "D-086 packet §5.1. Liveness is status pending plus the imported isAskExpired (no age cutoff of its own; follows D-174-expiry-clock-removal with no change; awaiting-reconfirm requests count). Coverage-neutral (reads no referrer or availability table), listed companies only in public, distinct canonical people, never companySuggestions votes. The admin queue lists unowned corporate domains by people, private, no-store. Mounts inside registerCompanyDirectoryRoutes (D-223 (6)), so it waits for D-174-company-search, which owns that file. Both switches stay false."},
  {"id": "D-086.ui", "title": "Demand line and list components (D-086): a count from 3, 'A few people' for 1-2, nothing at zero; employee help links via referrerSignInHref; unlisted-company lines; employer-bonus line; switch off", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 2, "lane": "demand-ui", "branch": "agent/queue/d086-ui", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-086.count", "D-090-BYOR"], "owns": ["client/src/components/demand/CompanyDemandLine.tsx", "client/src/components/demand/CompanyDemandList.tsx", "client/src/components/demand/useCompanyDemand.ts", "client/src/components/demand/companyDemand.test.tsx", "docs/plans/GOAL_UI_COVERAGE.md"], "note": "D-086 packet §5.2. Waits for D-090-BYOR because both own GOAL_UI_COVERAGE.md (D-167 line per new component). No black commit; login rule pinned by its own test."},
  {"id": "D-086.mount", "title": "Mount the demand line on /explore/:slug and the list on /explore (D-086), behind the switch", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 2, "lane": "demand-mount", "branch": "agent/queue/d086-mount", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-086.ui", "D-048-p3-live-review-find"], "owns": ["client/src/pages/Explore.tsx (switch only)", "client/src/pages/ExploreCompany.tsx (switch only)", "client/src/pages/explore.demandMount.test.tsx", "design/goal-ui/captures/demand/**"], "note": "D-086 packet §5.3. Mounts into the pages D-048-p3-live-review-find redesigns, after it lands; captures at 1280 and 390."},
  {"id": "D-086.admit", "title": "Admin view of the unlisted-company admission queue (D-086): domains by people asking, a prefilled link to the existing company create form", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 2, "lane": "demand-admit", "branch": "agent/queue/d086-admit", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-086.count", "D-086.ui", "D-048-p3-admin"], "owns": ["client/src/components/admin/UnlistedDemandView.tsx", "client/src/components/admin/unlistedDemandView.test.tsx", "client/src/pages/AdminOverview.tsx (switch only)", "docs/plans/GOAL_UI_COVERAGE.md"], "note": "D-086 packet §5.5. Admin only; no automatic listing (D-101: a manual admin edit). Not a dependency of the release row; until it lands admins read the queue as JSON."}
]
```
In the same pull request (D-068): `docs/plans/README.md` and plan §3b row D-086 (status: packet written, rows queued). If the coordinator wants them current, also `docs/plans/D-090-BYOR.md` and `docs/plans/D-099-bonus-pages.md`, which still describe D-086 as "asks at companies not yet open" with a 90-day close.

## 10. Proposed register entry (text only; take the next free ID at adoption: D-227 was free on `main` and every fetched head at `6cbee199`, rechecked for revision 2)
| D-227 | 2026-10-28 | **The D-086 demand list gets its packet: a public, k-anonymous count of people with a live referral request at each listed company, coverage-neutral, kept apart from D-193 (3)'s private waiting count, with a moderated admission path for unlisted companies (decided under D-200 by Claude Opus 5.5 · fdae; revised after the coordinator's review; changeable).** (1) Public demand is distinct canonical people with a live request (status pending and not expired by the runtime's own `isAskExpired`; no age cutoff of its own, so D-174's no-expiry holds and reconfirm never hides a request) at a listed company's domains, excluding suspended and admin accounts and the operator company; never `companySuggestions` votes; it reads no referrer or availability data. (2) A number from 3; "A few people" for 1-2, with no number and an order that cannot reveal 1 versus 2; nothing at 0; no totals. (3) Coverage-neutral demand is the owner's own reading: his request names no coverage condition, and D-176/D-174 send a request whether or not a referrer exists. The register title's "with no verified referrer" followed D-102's open/not-open view, which D-176 superseded, so no owner question remains. (4) Unlisted companies reach public display through admin admission: an admin-only queue of unowned corporate domains by people, then the existing manual listing (D-101). Employees at unlisted companies already receive waiting requests on verifying, and the public list invites them. No seeker-supplied domain is ever published. (5) The ask-to-any-company path already exists; the 90-day closure is replaced by D-174 plus D-193 (4) in their own rows. (6) Rows `D-086.count`, `D-086.ui`, `D-086.mount` and `D-086.admit`; the parent is the release row (D-223); the legal text is unchanged, under normal privacy review. | Packet `docs/plans/D-086-demand-list.md` §§3-4 and §12; `shared/referral.ts:193`; `server/db.ts:1582`, `:1601`, `:1873`, `:1917-1927`, `:2900-2902`; `server/companyDirectoryRoutes.ts:126-135`; `shared/companies.ts:21-24`; `server/planGates.ts:30`; `scripts/nextTaskCore.mjs:194` probe (217 rows, 0 errors). | Applies D-086 within D-176 and D-174; distinguishes D-193 (3); uses D-101's admin edit. Affects tasks: D-086-demand-list, D-086.count, D-086.ui, D-086.mount, D-086.admit. Affects `docs/plans/assignments.json`, plan §3b, `docs/PRD.md` (at release), `AGENTS.md` (at release). | proposed |

## 11. Gaps and risks (stated, not hidden)
1. **The owner's original is not on `main`**; only D-086's paraphrase is (`ed8f09e5`). The coordinator verifies the verbatim Oct 21 message before adoption. If it differs from §0, it wins.
2. **The approved Oct 21 mocks are missing.** If found, they inform layout only. Their availability labels and public credit figures are superseded and never restored (§4.9).
3. **Cheap inflation.** A request at an uncovered company costs no credit, so sock-puppet accounts could raise a count. Mitigations: a resume on every request (§3.6), counting by distinct canonical person, at most 2 open requests per company per person, admin suspension, and the admin views. No anti-sybil code is proposed. If QA sees abuse, a follow-up row can count only card-verified seekers (D-079).
4. **BYOR ordering (settled).** `D-086.count` shares no file with BYOR and takes no BYOR edge. Everything user-visible waits for BYOR through real file overlaps and, at the parent, D-162 (3).
5. **Sweep lag on unclaimed assignments.** An unclaimed assigned request (personal link or queue allocation) is past its window only by `selectStaleHeldAsks` (§3.13), which `isAskExpired` does not cover. It counts until the hourly `ask-expiry-sweep` (cron `0 * * * *`, `wrangler.jsonc:18`; held asks at `server/askExpirySweep.ts:61`, batch-bounded) or a read closes it. The lag disappears when `D-174-expiry-clock-removal` lands. A claim-event join to close it is not worth its code.
6. **Adjacent finding, not this packet's.** The D-104 signal (switch off) shows "referrers inside" on the public company page (`client/src/pages/ExploreCompany.tsx:236`), which is coverage data under D-176. Its own switch-on review should check it.
7. **D-206.** This session rated only the decisions this packet rests on (the appendix). It did not run the full session-start review or append to `docs/plans/DECISION-REVIEW.md`, because the coordinator scoped the session to one packet.
8. **Avoid-list check.** Every excluded row is a non-Claude build, landing or review under D-225 or D-151, or the held #758 landing, with these exceptions:
   - `D-132-audit-item5-correction` is docs-only audit work (misclassified). It ranks below this row, so the next task is unchanged.
   - `REGISTER-D212` and `ASSIST-approval-cost` are excluded correctly, but for review and landing independence (D-151), not a build bar.
   - `BRANCH-HYGIENE-1` is listed twice.
9. **The admission display is not built until `D-086.admit`** (named, F1). It waits for `D-048-p3-admin`. Until then:
   - the unlisted-company queue is admin JSON only;
   - `/admin/flow-health` `coverageGaps` stays a partial view (requests, not people; top 12; zero-coverage domains only);
   - D-101's unmatched-domains list covers verified employees at unowned domains.

   The public list is only directory companies, and says so (§4.8).

## 12. Review dispositions (coordinator review of `5c1a4448`, PR #776)
The coordinator's 22 baseline tests show that the existing sources behave as cited. They do not prove the feature: feature proof comes only from each row's red-first tests in §5. The proofs below are contract proofs, from source citations plus one scratch probe run in a worktree of this branch (`pnpm install --frozen-lockfile`, then `pnpm vitest run`, with the probe file deleted afterwards, as the appendix shows).

**Probe run, revision 2:** 4 files, **43 tests passed**:
- the scratch probe (8);
- `server/companyReferralSelectedCompany.test.ts` (7);
- `server/db.coverageDelivery.test.ts` (16);
- `server/companyDirectoryRoutes.test.ts` (12).

**F1, the original unlisted-company outcome was dropped. Accepted, fixed.**
- **Changed:** §1; §3.3, §3.11 and §3.12; §4.5 (moderated admission: an admin queue, then the existing manual listing, then automatic public display) and §4.8 (heading names the directory; two invitation lines for unlisted companies); §5.1 (admin queue in the count row); §5.5 (new `D-086.admit`); §9 (fourth row, 217 rows valid); gap 9 names the missing display.
- **Rules kept:**
  - No arbitrary domain is ever published.
  - No copy says that submitting or suggesting a company makes public demand.
  - The public list says it covers directory companies only.
- **Source proofs:**
  - Requests at unlisted companies are created by domain: `server/privateReferralRoutes.ts:766-770`, pinned by `server/companyReferralSelectedCompany.test.ts:41` (passed in the run).
  - Employees at any domain receive waiting requests on verifying: `server/db.ts:1582` and `:1601`; delivery by domain is pinned in `server/db.coverageDelivery.test.ts:76/:91/:113` (16 passed).
  - The existing admission action is strict and corporate-only: `server/companyDirectoryRoutes.ts:135`, `shared/companies.ts:21-24` and `:72-85`. Probe P1 shows `gmail.com` refused, `acme.com` accepted, and an unknown key refused.
  - No admission queue exists: `server/db.ts:2900-2902` counts requests, top 12, zero-coverage only.

**F2, the 30-day cutoff conflicted with no-expiry. Accepted, fixed.**
- **Changed:**
  - The cutoff (`DEMAND_WINDOW_DAYS`) is removed.
  - Liveness is the runtime's own: status pending plus the imported `isAskExpired` (§3.13, §4.3).
  - Reconfirm gates spend, not counting: no display expiry, no freeze.
  - The copy has no "now", "this month" or "recent", because "are asking" means a live request.
  - The tests in §5.1 pin all of this, including the clock-removal case.
- **Source proofs:**
  - `shared/referral.ts:76-80` and `:193`.
  - Probe P2:
    - a waiting request created 40 days earlier is live, so the old cutoff would have dropped it;
    - waiting past 90 days and visible past 7 days are exactly what the runtime itself closes;
    - an assigned request is never expired by this predicate;
    - a withdrawn row returns false, so the status filter is required as well.
  - `server/db.ts:2190` shows the referrer inbox applying the same predicate before the sweep catches up.

**F3, the repeated owner question was unsupported. Accepted, removed.**
- **Changed:** §8 has no owner question. §4.2 records the compatible reading: the owner's request names no coverage condition, and D-176 and D-174 send a request whatever the coverage, so coverage-neutral demand follows from his own words and keeps demand visible at every company. The release row status is `todo`, not `owner`; the register entry has no question.
- **Source proofs:**
  - D-176's verbatim text (`docs/DECISIONS.md`, row D-176) and D-174's (row D-174), quoted in §2.
  - D-086's "Reverses D-059 for per-company demand counts only" (row D-086).
- **What remains:** no owner choice. Placement and copy are the coordinator's (§8).

**F4, an invented approval gate. Accepted, removed.**
- **Changed:** §7 has no "no line needed" approval. The legal text is preserved. Privacy is checked in the normal Tier 1 reviews (§5.4) against the live lines, and only a real contradiction goes to the owner.
- **Source proofs:** the live lines quoted in §3.10 (`client/src/pages/TrustPrivacy.tsx:16`, `client/src/pages/Home.tsx:88`, `client/src/pages/GoalLanding.tsx:36`). None says counts of people asking are never published. The count carries no name, resume, identity or request content.

**Also applied from the review:**
- the mocks' superseded availability labels and public credits are never restored (§4.9, gap 2);
- the BYOR alternative for `D-086.count` is removed (gap 4);
- no self-score appears in the packet or the register text.

## Appendix A: the scratch contract probe (reproducible; not committed)
Save it as `shared/zz-d086-contract-probe.test.ts` in a worktree of this branch, run `pnpm install --frozen-lockfile`, then `LANG=en_US.UTF-8 pnpm vitest run shared/zz-d086-contract-probe.test.ts`, and delete the file afterwards.
```ts
import { describe, expect, it } from "vitest";
import { isAskExpired, COVERAGE_WAIT_DAYS, ASK_TTL_DAYS } from "./referral";
import { adminCompanyCreateSchema, companyDomainSchema } from "./companies";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY);

describe("P2 (F2): the runtime's own liveness predicate, not a 30-day createdAt cutoff", () => {
  it("legacy clocks today: 7 days after visibility, 90 days while waiting", () => {
    expect([ASK_TTL_DAYS, COVERAGE_WAIT_DAYS]).toEqual([7, 90]);
  });
  it("a waiting request created 40 days ago is still live", () => {
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: ago(40), coverageVisibleAt: null, waitingForCoverage: true }, NOW)).toBe(false);
  });
  it("a waiting request past the legacy 90-day cap is what the runtime itself closes", () => {
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: ago(91), coverageVisibleAt: null, waitingForCoverage: true }, NOW)).toBe(true);
  });
  it("a visible unassigned request 8 days after first visibility is what the runtime itself closes", () => {
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: ago(9), coverageVisibleAt: ago(8), waitingForCoverage: false }, NOW)).toBe(true);
  });
  it("an assigned pending request is never expired by this predicate", () => {
    expect(isAskExpired({ status: "pending", referrerId: 7, createdAt: ago(200), coverageVisibleAt: ago(199), waitingForCoverage: false }, NOW)).toBe(false);
  });
  it("a withdrawn row returns false, so the count also needs the status filter", () => {
    expect(isAskExpired({ status: "withdrawn", referrerId: null, createdAt: ago(1), coverageVisibleAt: null, waitingForCoverage: true }, NOW)).toBe(false);
  });
});

describe("P1 (F1): the admission action already refuses arbitrary or personal domains", () => {
  it("a company domain must be corporate and well formed", () => {
    expect(companyDomainSchema.safeParse("acme.com").success).toBe(true);
    expect(companyDomainSchema.safeParse("gmail.com").success).toBe(false);
    expect(companyDomainSchema.safeParse("not a domain").success).toBe(false);
  });
  it("the admin create body is strict", () => {
    const ok = { name: "Acme", industry: "Software", location: "Remote", functions: ["Engineering"], blurb: "Builds things.", primaryDomain: "acme.com" };
    expect(adminCompanyCreateSchema.safeParse(ok).success).toBe(true);
    expect(adminCompanyCreateSchema.safeParse({ ...ok, demand: 20 }).success).toBe(false);
  });
});
```

## Appendix B: D-206 ratings of the decisions this packet rests on (scoped; for the coordinator to append)
| ID | Rating | Status | Note |
|---|---|---|---|
| D-086 | 8 | active | Right goal (L1). The title's "with no verified referrer" is narrower than the owner's request; read through D-176/D-174 (§4.2). |
| D-176 | 9 | active | Matches the seeker's mental model; public demand clarified in §4.1-§4.2. |
| D-174 | 8 | active | Right for launch; the count follows the runtime's liveness. |
| D-193 (3) | 8 | active | A sound private count, not public demand (§4.1). |
| D-162 (3) | 6 | active, CEO remit | An ordering written as a dependency; under D-223 (1) it applies only at the parent and the user-visible rows. |
| D-223 | 9 | active | Applied: four file-split rows; the parent releases. |

## Status
D-086-demand-list: revision 2 proposed, not applied (Claude Opus 5.5 · fdae, 2026-10-28, lock `agent/architect/d086-demand-list`). It answers the coordinator's review of `5c1a4448` (§12) and awaits coordinator validation and adoption.
