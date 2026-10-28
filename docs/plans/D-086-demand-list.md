# Packet D-086: the demand list (public counts of people asking for a referral, loop L1)

> **PROPOSED, NOT APPLIED.** This packet was written by a reasoning session (D-225) for the coordinator to validate and adopt. It changes nothing by being on this branch: `docs/plans/assignments.json` and `docs/DECISIONS.md` are untouched, and the registry delta (§9) and register entry (§10) are text for the coordinator to apply in its own reviewed pull request. Nothing below is built, live, or approved by the owner beyond what §2 quotes. Until adoption, no builder takes a row from this file.

> Read `docs/BRIEF.md` first, then this packet. Each row in §5 is its own task: claim it with the picker, build only that row, and edit only the paths in its `owns` (scope-check fails anything else). Write your status line in the Status section at the end; rows sharing plan row D-086 never edit the §3b row (D-134).

| Field | Value |
|---|---|
| Queue rows (proposed) | `D-086.count` (Tier 1), `D-086.ui` (Tier 2), `D-086.mount` (Tier 2); the parent `D-086-demand-list` becomes the release row (Tier 1, status `owner`) under D-223 (3) |
| Decisions | D-086, D-176, D-174, D-193 (3) and (4), D-162 (3), D-223; also D-006, D-019(e), D-028, D-030/D-057 (login rule), D-034, D-040, D-047, D-055, D-059, D-060, D-061, D-062, D-087, D-088, D-097, D-102, D-153, D-167, D-173/D-180, D-221 |
| Verified against | `origin/main` `6cbee199` (Oct 28 2026), all heads fetched. Code facts in §3 were read on that commit. No production query, API or provider call was made. |
| Migrations, env keys, dependencies | None. The switch is an in-code constant (D-193 pattern, §4.7). |
| Writer | Claude Opus 5.5 · fdae, architect lock `agent/architect/d086-demand-list` (takeover of Claude Code · 4b71, quiet 119 h; that lock held only claim and heartbeat markers, no packet). |

## 0. Read receipt (D-225)
- **Main:** `6cbee199` (merge of #771), confirmed after `git fetch origin "+refs/heads/*:refs/remotes/origin/*"`. D-225 (#772, `7a264327`) and D-226 (#773, `ee7386f6`) are ancestors of it. The coordinator's last verified head was also `6cbee199`, so nothing cited by the coordinator was stale at writing.
- **Read in full:** `docs/BRIEF.md`, `AGENTS.md` (§0, team rules 0-9, system map), `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md` §§1-8. Register entries D-028, D-034, D-047, D-059, D-061, D-062, D-086, D-087, D-102, D-154, D-162, D-174, D-176, D-193, D-221, D-223, D-224, D-225 and D-226. Packets `docs/plans/D-193-journey-foundations.md` (§§1-7), the header and §0 of `docs/plans/D-090-BYOR.md`, `docs/plans/GOAL_UI_COVERAGE.md` §§0-2, and `docs/PRD.md` (the "Demand-list copy" section).
- **Prior repo-only outcome:** the lock branch held three marker commits and no file change: `2406cedf` (claim by Claude Code · 4932, Oct 23 01:19Z), `31c42961` (takeover by Claude Code · 4b71) and `10e682cf` (its heartbeat, Oct 23 11:51Z). There was no PR. The last report on the row is Claude Code · e11c's: add `D-090-BYOR`, and `D-048-p3-live-review-find` unless owned paths avoid its files. Both are handled in §9.
- **Owner authority:** D-086 entered `main` in `ed8f09e5` (Oct 21, "Owner steers relayed via main agent"), and the register paraphrases the owner. The coordinator's verbatim quote ("...20 job seekers are looking for referrals in xxxx company. If you are an employee plz help them and if they get selected you get your referral bonus from company.") is **not on `main`**. It agrees with the paraphrase, but the coordinator must verify it against the owner's original before adoption (§11 gap 1).
- **Goal contribution:** loop L1 (D-087). A real, public count of people asking at a company tells its employees that colleagues-to-be want referrals there. Each employee who verifies adds referrer supply, which is the bottleneck (D-087), so more seekers get referred faster.

## 1. Goal
Show, on `/explore` and on each company page, how many people are asking for a referral at that company. Use real rows only, k-anonymous, with no identity. Invite that company's employees to verify and help, and state honestly that any referral bonus is the employer's own. The ask-to-any-company path (D-086 (1)) already exists and is owned elsewhere (§3.6-§3.8). This packet adds no request, money, expiry or pool code.

## 2. Binding rules (quoted)
- **D-086** (owner-directed, Oct 21): "Public per-company demand counts for companies with no verified referrer; unlisted-company asks (... reverses the D-059 no-business-numbers-in-public principle for this case)." "(1) asks may target companies not in the directory: no credit, no slot until a verified referrer exists, then live oldest-first under D-034/D-047. (2) Counts public on /explore and demand detail, real data only, k-anonymous: from 3 up, "A few people asking" for 1-2, never 0, no seeker names. (3) Any bonus is the employer's own programme; skipwait.me never pays referrers (D-055)."
- **D-176** (owner, Oct 24, newer): "referrer availability is backend routing, never a browse gate or a visible status." "coverage data is not exposed through the directory."
- **D-174** (owner, Oct 23): "an ask never expires"; the company pool is "the existing waiting-for-coverage queue (D-061/D-062) ... (capacity rules unchanged)"; "No new debit, refund or ledger behavior is created by this entry."
- **D-193 (3)**: "a verified employee sees how many requests wait at their company (a count only)". **D-193 (4)**: "an unconfirmed request keeps waiting and never closes, and confirming spends under the same key."
- **D-162 (3)**: "Its build follows BYOR, because both edit the ask path, My asks and `/explore`." "D-086 (2)'s rule (a number only from 3 up, "A few people" for 1-2, never 0) overrides the PRD copy's "(singular for 1)"."
- **D-221** (row note): "the packet writer replaces the 90-day closure with D-174 ... plus D-193 (4) ..., and drops the 'not yet open' availability framing (D-176). Whether public per-company demand counts survive D-176 is checked against D-193 (3) before any owner question."
- **D-223 (1)/(3)/(6)**: `dependsOn` names "only the rows whose output it needs"; "The merge is the parent's release row"; "Split by owned files, never by step ... prefer an existing mount point to a new registration line."
- **D-087/D-088**: "real counts only; bonus lines name the employer's own programme and are never guaranteed; no seeker details exposed; referrers never charged". "Every published figure needs a live source." No post in the owner's name.
- **Login rule (D-030/D-057)**: a referrer-facing link uses `referrerSignInHref()` (`client/src/lib/referrerSignIn.ts:7`), never `SignInButton` or `openSignIn`.
- **D-153** (frozen writing rule): "promise only what works today." **D-173/D-180**: no "credit(s)" and no noun "ask" on a page.

## 3. Current behaviour (verified on `6cbee199`; find functions by name, line numbers drift)
1. **No public demand count exists.** Nothing on `main` or on any fetched head serves a per-company count of people asking. `/api/companies` (`server/companyDirectoryRoutes.ts:75`) returns the directory with `openToReferrals` and `openCount`. D-176 retires their visible use, and dropping them is the D-189 journey packet's row (D-193 (6)).
2. **ROW20-B is a vote counter, not demand.** `countCompanyDemand` (`server/db.ts:1059`) counts distinct submitters of `companySuggestions` rows (`drizzle/schema.ts:149`) per lower-cased company **name**, from `/invite` and `/suggest-company`. Employees can file them too (`role` enum), they create no request, and only admins see them (`listCompanySuggestionsAdmin`, `server/db.ts:1073`). **It is not the D-086 count**, and this packet never reads it.
3. **Admins already see waiting demand by domain.** `getReferralFlowHealth` (`server/db.ts:2889`) builds `coverageGaps` (waiting requests per domain with zero verified referrers, top 12). The D-018 baseline (`shared/flowBaseline.ts:55`) has `demand[]` per `companyDomain`. Both count requests, not people, and both are admin-only.
4. **Private waiting count is a separate, unbuilt row.** `D-174-pool-nudges` (`docs/plans/D-193-journey-foundations.md` §5.9) adds `waitingCount` to `/api/company-referrals/inbox`. That is requests waiting in the pool at the verified employee's own company, private and behind `POOL_NUDGES_ENABLED = false`. This packet does not touch it.
5. **Aggregate precedent.** The D-104 signal (`server/companyResponseSignal.ts:12`, `shared/companyResponseSignal.ts:4` `MIN_SIGNAL_N = 3`) reads `referralRequests` ⨝ `jobs` with `inArray(jobs.company, ownedDomains)`. It is served at `/api/companies/:slug/response-signal` (`server/companyDirectoryRoutes.ts:107`), with 404 while its switch is off, and the client renders nothing on a failed read (`client/src/lib/companyResponseSignal.ts:1-2`). Its fixture test pins "a name-only job company value counts nothing" (`server/companyResponseSignal.fixture.test.ts:37`). The in-memory test kit supports `count()` with `groupBy`, but not `countDistinct` (`server/inMemoryDrizzle.testkit.ts:8`).
6. **Unlisted companies already work.** `POST /api/company-referrals` (`server/privateReferralRoutes.ts:740`) binds a directory company only when `companySlug` is sent (`:766-770`). Otherwise `createCompanyReferralRequest` (`server/db.ts:1873`) resolves the employer from the link (`:1874`), so a careers-page link at a company outside the directory creates a request keyed by its domain (`jobs.company`). A resume is required for every request (`server/privateReferralRoutes.ts:752`).
7. **No credit and no slot until visible, then oldest first by capacity.** Coverage counts only available referrers (`server/db.ts:1917`). A waiting request skips the open-slot cap (`:1922`) and spends nothing at create (`:1970`). `openAskCondition` excludes `waitingForCoverage` rows (`server/planGates.ts:30`), and the per-company cap of 2 uses the same predicate (`server/db.ts:1927`). Delivery is `deliverWaitingAskTx` (`:2700`) through `deliverWaitingAsksToReferrer` (`:2799`). Tests pin the hand-off oldest first up to capacity (`server/db.coverageDelivery.test.ts:91`), the spend at first visibility (`:76`) and the held state (`:113`).
8. **The 90-day closure and reconfirm belong to other rows.** `D-174-held-ask-reconfirm` builds D-193 (4) reconfirm-before-spend with no closure. `D-174-expiry-clock-removal` waits for it and removes the clocks. Neither is in this packet.
9. **The pages this feature lands on are owned.** `client/src/pages/Explore.tsx`, `ExploreCompany.tsx` and `explore/**` are owned by `D-048-p3-live-review-find`, which waits for `D-174-seeker-journey-build` (no packet yet) and `D-174-fix-post-binding`. `D-099-bonus-line` owns them after that. The company page already mounts one optional aggregate section (`<Responsiveness>`, `client/src/pages/ExploreCompany.tsx:166`).
10. **Privacy page wording.** `client/src/pages/TrustPrivacy.tsx:16` says "A private handoff, not a public marketplace ... We do not publish resumes, Referrer identities, or private request conversations." It neither covers nor forbids published aggregate counts. Legal text is the owner's (§7).

## 4. Rulings this packet proposes (decided under D-200; changeable; the register text is §10)
1. **Public demand is not private waiting.** The public count is *people asking for a referral* at a company. It covers every live request (waiting, held, delivered or claimed) and is shown k-anonymously to everyone. The D-193 (3) count is *requests waiting in the pool*, exact, and shown only to that company's verified employees. They are different numbers for different audiences. D-193 (3) narrowed who sees **waiting requests**; it did not rule on public demand, so it does not override D-086 (2). Copy for the public count never says "waiting" (that word means "no available referrer yet" under D-176's post-save line).
2. **Coverage-neutral.** D-176 forbids exposing coverage. A count shown only at companies "with no verified referrer" (D-086's title) would tell everyone which companies have nobody to refer. So the count shows at **every listed company where people are asking, whatever its coverage**, and its read touches no referrer, profile or availability table. This changes where an owner-directed public number appears, so the **release** waits for the owner's answer to §8 Q1. The builds proceed on this default with the switch off.
3. **What counts (one definition, server-side).** Count distinct **people**, deduplicated per company across all its domains. A person is `users.canonicalPersonId`, or the user id when that is null, so a person with two login aliases counts once. A row counts when all of these hold:
   - `referralRequests.status = "pending"`;
   - `jobs.company` is a domain of a **listed** directory company (`companies.status = "listed"` via `companyDomains`), excluding the operator company (`OPERATOR_COMPANY_SLUG`, `shared/flowBaseline.ts:19`);
   - the request was created within `DEMAND_WINDOW_DAYS = 30` of `nowMs`, computed in the app (AGENTS invariant 5);
   - the seeker is not suspended (`users.suspended`, `canonicalPeople.suspended`) and is not an admin (`users.role`).

   Never counted: `companySuggestions` votes (ROW20-B), approved, declined, withdrawn or closed requests, or anything about plans or credits. The count is plan-blind (D-006: visibility is never sold).
4. **k-anonymity (D-086 (2), D-028; preserved, not changed).** `people >= 3` gives `{ state: "count", people }`. 1-2 gives `{ state: "few" }`, with no number. 0 gives `{ state: "none" }` on the detail endpoint, and the company is absent from the list. Two leaks are closed:
   - **No totals.** Neither payload carries a sum, so subtraction cannot reveal a "few" value.
   - **Order cannot reveal 1 versus 2.** The list sorts `count` entries by people descending, then name. All `few` entries follow, sorted by name only.
5. **Listed companies only, publicly.** A domain outside the directory is user-supplied text: a public list of them would publish whatever domains seekers paste, and at a tiny company could point at one applicant. Unlisted demand stays admin-only, in `coverageGaps` and the baseline `demand[]` (§3.3). Once an admin lists the company (the existing D-101 manual step), its count goes public with no code change. This keeps D-086 (1)'s "asks may target companies not in the directory" intact, because that is the request path (§3.6), not the display.
6. **The ask-to-any-company path is done; this packet adds nothing to it.** D-086 (1) maps to §3.6-§3.7. The 90-day closure is replaced by D-174 plus D-193 (4), owned by `D-174-held-ask-reconfirm` and `D-174-expiry-clock-removal` (§3.8). The "not yet open" framing is dropped (D-176). The plan §3b row and the queue title are reworded at release (§9).
7. **Switch.** `export const COMPANY_DEMAND_PUBLIC_ENABLED = false` in `shared/companyDemand.ts`, read by the server routes (404 while off, nothing read) and the client hook (no fetch while off). This is one reviewed line to flip, with no env key, so `.env.example`, `src/worker.ts` and `client/src/lib/flags.ts` (owned by BYOR) stay untouched.
8. **Copy (proposed; it replaces the PRD's demand-list section at release):**
   - **Count:** "{N} people are asking for a referral at {Company}." (PRD verbatim; N in `GoalNum`.)
   - **Few:** "A few people are asking for a referral at {Company}." (D-086 (2)'s "A few people asking", as the full sentence the PRD asks this packet to propose.)
   - **None:** nothing renders. Both PRD empty lines are dropped. "No one has asked for {Company} yet" is false with a 30-day window, and "Nobody at {Company} is waiting right now. We'll tell you if that changes." says "waiting" (§4.1) and promises a notice nothing sends (D-153).
   - **Employee help (plain link, never a black commit):** "Work at {Company}? Verify your work email to help." It links to `referrerSignInHref()`. It does not say "see these requests": D-062 hands a new referrer at most their capacity (default 3).
   - **Bonus:** "If {Company} pays employees a referral bonus, {Company} sets and pays it under its own rules. skipwait.me never pays referrers." It carries no figure (figures come only from D-099 with a source), no guarantee, and no "if they get selected you get" promise. The PRD's "Most companies pay their own referral bonus" is an unsourced statistical claim (D-088), so it is replaced.
   - **List heading on `/explore`:** "Where people are asking for a referral." Each entry links to `/explore/:slug`.
9. **Placement (D-086 (2): "/explore and demand detail").** On the company page the line sits below the hero, outside the "Your next step" block, so the page keeps exactly one black commit (D-150). On `/explore` the list shows only in the browse state (empty search). It never filters, groups or reorders the directory, so it is not D-169's retired open-first grouping. The owner-approved mocks (D-086, Oct 21 ~03:02 IST) are not in the repository. If the coordinator recovers them, they win over this placement (§8 Q1 note).
10. **No outbound anything.** No email, share card, social post, sitemap entry, `JobPosting` or SEO markup carries a demand number (D-087/D-088: nothing posted in the owner's name). The numbers live only in the two API responses and the two components.

## 5. The rows
Every row: claim through the picker, red tests first, one commit per step, `pnpm check` plus its focused tests green on each commit, the full gate on the merged result. Tier 1 rows open a draft PR and get an independent review by a model that neither built nor fixed the work (D-151). The general **Stop if** conditions apply to every row: a cited function or contract changed on `main`, a test fails for a reason you cannot explain, or the work needs a file outside `owns`. Stopping means: push, `--report blocked` with the question, wait.

### 5.1 `D-086.count` (Tier 1: a public aggregate of seeker activity; M)
- **Waits for:** `D-174-company-search`, which owns `server/companyDirectoryRoutes.ts`, where this row adds its one mount call (D-223 (6): an existing mount point, not a line in `server/_core/index.ts`). There is no BYOR edge: no owned file is shared with `D-090-BYOR` (§9 and §11 gap 4).
- **Do:**
  1. **New `shared/companyDemand.ts`:**
     - The constants `COMPANY_DEMAND_PUBLIC_ENABLED = false`, `DEMAND_PUBLIC_MIN = 3` and `DEMAND_WINDOW_DAYS = 30`.
     - Strict Zod schemas: `publicDemandSchema` (a discriminated union `none` | `few` | `count { people >= 3 }`), `companyDemandListResponseSchema` (`{ companies: [{ slug, name, demand: few|count }] }`) and `companyDemandDetailResponseSchema` (`{ demand }`).
     - Pure `countDemandPeople(rows, companies, nowMs)` implementing §4.3, plus `toPublicDemand(people)` and `orderDemandList(entries)` implementing §4.4.
     - The §4.8 copy as exported functions of `{Company}` (and `{N}`).
  2. **New `server/companyDemand.ts`:** `loadCompanyDemand(companies, nowMs, db?)`. It selects plain rows `{ company: jobs.company, userId: users.id, canonicalPersonId, role, userSuspended, personSuspended, status, createdAt }` from `referralRequests` ⨝ `jobs` ⨝ `users`, left-joining `canonicalPeople`, where `inArray(jobs.company, listedDomains)`, the status is pending and `createdAt >= new Date(nowMs - window)`. Counting is done by the pure function. No name, email, pitch, URL or request id leaves the module. It reads no `profiles`, availability, slot, wallet or plan table.
  3. **New `server/companyDemandRoutes.ts`:** `registerCompanyDemandRoutes(app, deps)` with `GET /api/company-demand` (the list) and `GET /api/company-demand/:slug` (the detail). Behaviour:
     - The prefix is distinct from `/api/companies/:slug`, so registration order cannot shadow a slug (unlike `/api/companies/search`, §5.4 of the D-193 packet).
     - Listed companies come from the existing directory (`listCompanyDirectory`, `getCompanyDirectoryEntry`), injectable.
     - Switch off: 404 with `no-store`, nothing read.
     - Bad slug: 400. Unknown or hidden company: 404.
     - Success: `Cache-Control: public, max-age=300`, and the body is parsed by its schema before sending.
     - Database unavailable: 503 `no-store`, with the error reported through the existing server Sentry path, carrying no query string or personal data.
  4. **`server/companyDirectoryRoutes.ts` (switch only):** import and call `registerCompanyDemandRoutes(app, { ... })` inside `registerCompanyDirectoryRoutes`, at most the switch-only line limit (12).
- **Tests (red first):**
  - `shared/companyDemand.test.ts`:
    - `toPublicDemand`: 0/1/2/3/20/NaN/-1 map to none/few/few/count 3/count 20/none/none.
    - `countDemandPeople`:
      - one person with two live requests at one company counts 1;
      - two aliases of one canonical person count 1;
      - one person at two domains of one company counts 1;
      - one person at two companies counts 1 at each;
      - each excluded status, a request created 30 days + 1 ms before `nowMs`, a suspended user, a suspended canonical person, an admin, an unlisted domain and the operator company count 0;
      - a waiting request and a delivered pending request count the same.
    - `orderDemandList`: a 2-person company named "A" and a 1-person company named "B" both come out `few`, in name order, whatever their hidden counts.
    - The schemas reject unknown keys, a `few` that carries a number, a `count` below 3, and any `total` field.
  - `server/companyDemand.fixture.test.ts` (`createInMemoryDrizzle`, as `server/companyResponseSignal.fixture.test.ts`): a `jobs.company` name value counts nothing, a domain value counts; the result carries slugs and numbers only; reading with two different `nowMs` values moves the window (app clock, never SQL `NOW()`); seeding verified referrers at a company changes nothing (coverage-neutral).
  - `server/companyDemandRoutes.test.ts`:
    - switch off: both routes 404 `no-store` and the loader is never called;
    - switch on (injected): the list holds only companies with 1+ people, and the body parses against the schema;
    - the detail answers none, few and count;
    - 400, 404 (unknown and hidden) and 503 behave as above, the 503 is reported without the slug's query or any personal data, and the success cache header is set;
    - no response anywhere contains a number below 3, `total`, `requests`, `waiting` or `open`.
- **Owns:** `shared/companyDemand.ts`, `shared/companyDemand.test.ts`, `server/companyDemand.ts`, `server/companyDemand.fixture.test.ts`, `server/companyDemandRoutes.ts`, `server/companyDemandRoutes.test.ts`, `server/companyDirectoryRoutes.ts (switch only)`.
- **Done when:** the tests pass; the D-104 signal, the directory route tests and `server/db.companyDemand.test.ts` (ROW20-B) stay green; the full gate passes; the independent review passes. The switch stays false.
- **Stop if:** `jobs.company` can hold a mixed-case or name value for new requests (§3.5's fixture suggests a name value is possible on legacy rows: count it as nothing, never fuzzy-match it); a listed company shares a domain with another; or meeting §4.3 needs `server/db.ts`.

### 5.2 `D-086.ui` (Tier 2: renders the server's public payload; a referrer link, not sign-in logic; S)
- **Waits for:** `D-086.count` (it imports the contract and copy) and `D-090-BYOR`, which owns `docs/plans/GOAL_UI_COVERAGE.md`. Every new `.tsx` under `client/src/components/` needs a line there or `scripts/goalUiCoverage.test.ts` fails (D-167).
- **Do:**
  - New `client/src/components/demand/useCompanyDemand.ts`: React Query hooks for the list and the detail, `enabled: COMPANY_DEMAND_PUBLIC_ENABLED && Boolean(slug)`, `retry: false`, `staleTime: 300_000`. A failed, missing or unparsable read resolves to `null` (the D-104 pattern).
  - New `CompanyDemandLine.tsx` (props `{ slug, companyName }`): the count or few sentence, the help link and the bonus line.
  - New `CompanyDemandList.tsx`: the heading and the entries, each a link to `/explore/:slug` with its sentence, in server order.
  - Both render **nothing** while off, loading, on error or offline, or for `none`. They are supplementary information, so no banner; the server reports failures (§5.1).
  - Goal tokens only, no `components/kit` or `components/ui` import, no `GoalButton variant="primary"`.
  - The help link calls `trackClarityEvent("demand_help_clicked")` (`client/src/lib/clarity.ts:34`, imported only, not edited).
  - Add both components to `docs/plans/GOAL_UI_COVERAGE.md` §4 under the owning pages, with `D-086.mount` as their row.
- **Tests (red first), `client/src/components/demand/companyDemand.test.tsx`:**
  - switch off: no fetch and an empty render;
  - loading, error, offline and `none`: empty render;
  - count: the exact sentence with N in `GoalNum`;
  - few: the exact sentence with no digit;
  - the help link's `href` equals `referrerSignInHref()`, and the module source imports neither `SignInButton` nor `openSignIn` (login rule);
  - no element carries `data-g-primary`;
  - the bonus line contains "skipwait.me never pays referrers" and no digit, currency sign or "guarantee";
  - rendered text never contains "credit", "ask " as a noun, "waiting", "open" or "Not open yet";
  - the list keeps server order and renders no total;
  - one click on the help link sends one analytics event.
- **Owns:** `client/src/components/demand/CompanyDemandLine.tsx`, `client/src/components/demand/CompanyDemandList.tsx`, `client/src/components/demand/useCompanyDemand.ts`, `client/src/components/demand/companyDemand.test.tsx`, `docs/plans/GOAL_UI_COVERAGE.md`.
- **Done when:** the tests and `scripts/goalUiCoverage.test.ts` pass, `node scripts/design-token-audit.mjs` passes, and the full gate passes.

### 5.3 `D-086.mount` (Tier 2: two mount points behind the switch; S)
- **Waits for:** `D-086.ui` and `D-048-p3-live-review-find`, which owns and redesigns both pages, and through it `D-174-seeker-journey-build` and `D-174-fix-post-binding`. Mounting into a page that is about to be rebuilt would only conflict.
- **Do:** on the redesigned company page, render `<CompanyDemandLine slug companyName />` below the hero and outside the next-step block. On `/explore`, render `<CompanyDemandList />` only when the search box is empty. Both edits are switch-only (12 lines each at most).
- **Tests (red first), `client/src/pages/explore.demandMount.test.tsx`:**
  - switch off: both pages render as before, the existing explore tests are unchanged and green, and nothing calls `/api/company-demand`;
  - switch on (mocked): the line is outside the next-step block, the page still has exactly one `data-g-primary`, and its `assertGoalPage` holds;
  - the list is absent once a search query is typed, and the directory's own order is unchanged.
- **Proof:** captures at 1280 and 390 from fictional fixtures (team rule 8) for count, few, none, the list, and the switch off, under `design/goal-ui/captures/demand/`.
- **Owns:** `client/src/pages/Explore.tsx (switch only)`, `client/src/pages/ExploreCompany.tsx (switch only)`, `client/src/pages/explore.demandMount.test.tsx`, `design/goal-ui/captures/demand/**`.

### 5.4 `D-086-demand-list`: the release row (Tier 1; status `owner` until §8 Q1 is answered)
- **Waits for:** `D-086.count`, `D-086.ui`, `D-086.mount`, `D-090-BYOR` (D-162 (3); it also owns the three docs below) and `D-048-p3-live-review-find`, plus the owner's answers in §7 and §8.
- **Do:**
  - Flip `COMPANY_DEMAND_PUBLIC_ENABLED` to `true` (switch only).
  - Add the system-map row to `AGENTS.md`: `/api/company-demand*` → `shared/companyDemand.ts`, `server/companyDemand.ts`, `server/companyDemandRoutes.ts`; distinct canonical people, listed companies only, coverage-neutral, k-anonymous, 30-day window.
  - Replace the PRD "Demand-list copy" section with §4.8, and reword plan §3b row D-086 to drop "closed at 90 days under D-061" and "D-102's honest availability" (D-174, D-176).
- **Before flipping:** QA on the preview with the switch on, with captures; an independent Tier 1 review of the flip; and the CEO's sign-off (D-223 (3)).
- **Done when:** after the deploy, `GET https://skipwait.me/api/company-demand` returns only slugs, names and demand states, with no number below 3 and no total. Paste the response. Screens at 1280 and 390.
- **Owns:** `shared/companyDemand.ts (switch only)`, `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`.
- **Stop if:** the owner answers §8 Q1 with "uncovered companies only". That brings back the D-176 coverage exposure, so stop and report; a coverage-conditional count needs the owner to accept that exposure in so many words.

## 6. Out of scope (every row)
`server/db.ts`, `server/privateReferralRoutes.ts`, `server/coverageDelivery.ts`, `shared/moneyCopy.ts`, `client/src/App.tsx`, `client/src/lib/flags.ts`, `.env.example`, `src/worker.ts`, `functions/**`, `drizzle/**`, any expiry, reconfirm, pool, spend or refund code, `companySuggestions` and the ROW20-B code, `/invite`, `/suggest-company`, the D-104 signal, sitemaps and SEO markup.

## 7. Owner actions before release (not questions to stall on)
- **Legal text:** whether `client/src/pages/TrustPrivacy.tsx` should mention published aggregate counts. Agents never reword it. If the owner wants a line, it is listed in plan §6 for his wording. The release row waits for his "no line needed" or his new line.

## 8. Owner question (one; the builds follow the default until he answers)
**Q1. Show the demand count at every listed company, or only where nobody can refer yet? Default: every listed company (8/10).**
- **Why the default:** D-086's title says "for companies with no verified referrer", but your newer D-176 says coverage is never shown. A count that appears only at uncovered companies tells every visitor which companies have no referrer. Showing it wherever people are asking reveals nothing about coverage, still tells employees "colleagues-to-be want referrals here", and uses only real rows (§4.3).
- **Strongest argument against:** it publishes demand volume at well-covered companies too, which goes beyond the case you reversed D-059 for, and a big number at a popular company may discourage a seeker ("20 people ahead of me") rather than reassure. The k-anonymous rule and the 30-day window limit what is shown, but not that effect.
- **The other way:** hide counts entirely until you choose, which delays loop L1.
- **What waits:** only the release row (§5.4). If the approved Oct 21 mocks are recovered, they settle placement but not this question.

## 9. Proposed registry delta (for the coordinator; validated on a scratch copy, not applied)
Applied to a scratch copy of `origin/main`'s `docs/plans/assignments.json` (`6cbee199`), `validateAssignments` (`scripts/nextTaskCore.mjs:194`) returns **216 rows, 0 errors**; the unchanged file returns 213 rows, 0 errors. An `ownsOverlap` probe of each proposed `owns` against every open row found the overlaps below, each resolved by a `dependsOn` edge, direct or transitive:
- `D-086.count`: `D-174-company-search` (`companyDirectoryRoutes.ts`; direct edge).
- `D-086.ui`: `D-090-BYOR` (`GOAL_UI_COVERAGE.md`; direct edge).
- `D-086.mount`:
  - `D-048-p3-live-review-find`: direct edge.
  - `D-174-fix-post-binding`: through live-review-find.
  - `D-099-bonus-line`: it waits for `D-099-bonus-pages`, which waits for the parent.
- Parent:
  - `D-090-BYOR` (`AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`): direct edge.
  - `D-099-bonus-pages` and `DEPLOY-gate-docs-sync` (via bonus-pages): they already wait for the parent.

No proposed path overlaps `PRICING-banded-oct25` (#666).

Parent row `D-086-demand-list`, fields to change:
```json
{
  "title": "Demand list (D-086, loop L1): k-anonymous public counts of people asking for a referral at each listed company; release row",
  "packet": "docs/plans/D-086-demand-list.md",
  "status": "owner",
  "dependsOn": ["D-086.count", "D-086.ui", "D-086.mount", "D-090-BYOR", "D-048-p3-live-review-find"],
  "owns": ["shared/companyDemand.ts (switch only)", "AGENTS.md", "docs/PRD.md", "docs/KIT_V4_BUILD_PLAN.md"],
  "note": "D-086 packet §5.4 (release row, D-223 (3)): flips COMPANY_DEMAND_PUBLIC_ENABLED after D-086.count, D-086.ui and D-086.mount land, QA with captures, an independent Tier 1 review and the CEO's sign-off; waits for the owner's answer to packet §8 Q1 (every listed company, default, versus uncovered only, which D-176 forbids exposing) and the §7 legal-text check. Public demand (people asking, all live requests, k-anonymous) is not D-193 (3)'s private waiting count. The ask-to-any-company path already exists (packet §3.6-§3.7); the 90-day closure is replaced by D-174 plus D-193 (4) in D-174-held-ask-reconfirm and D-174-expiry-clock-removal. D-099-bonus-pages, D-089-request-inbox (by its note) and DEPLOY-gate-docs-sync keep waiting for this row."
}
```
New rows, inserted directly above the parent:
```json
[
  {"id": "D-086.count", "title": "Demand count (D-086): distinct people with a live referral request at each listed company, k-anonymous public read behind COMPANY_DEMAND_PUBLIC_ENABLED = false", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 1, "lane": "demand-count", "branch": "agent/queue/d086-count", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-174-company-search"], "owns": ["shared/companyDemand.ts", "shared/companyDemand.test.ts", "server/companyDemand.ts", "server/companyDemand.fixture.test.ts", "server/companyDemandRoutes.ts", "server/companyDemandRoutes.test.ts", "server/companyDirectoryRoutes.ts (switch only)"], "note": "D-086 packet §5.1. Coverage-neutral (reads no referrer or availability table), listed companies only, distinct canonical people, 30-day window on the app clock, never companySuggestions votes. Mounts inside registerCompanyDirectoryRoutes (existing mount point, D-223 (6)), so it waits for D-174-company-search, which owns that file. Switch stays false."},
  {"id": "D-086.ui", "title": "Demand line and list components (D-086): a count from 3, 'A few people' for 1-2, nothing at zero; employee help link via referrerSignInHref; employer-bonus line; switch off", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 2, "lane": "demand-ui", "branch": "agent/queue/d086-ui", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-086.count", "D-090-BYOR"], "owns": ["client/src/components/demand/CompanyDemandLine.tsx", "client/src/components/demand/CompanyDemandList.tsx", "client/src/components/demand/useCompanyDemand.ts", "client/src/components/demand/companyDemand.test.tsx", "docs/plans/GOAL_UI_COVERAGE.md"], "note": "D-086 packet §5.2. Waits for D-090-BYOR because both own GOAL_UI_COVERAGE.md (D-167 catalogue line for each new component). No black commit; login rule pinned by its own test."},
  {"id": "D-086.mount", "title": "Mount the demand line on /explore/:slug and the list on /explore (D-086), behind the switch", "row": "D-086", "packet": "docs/plans/D-086-demand-list.md", "tier": 2, "lane": "demand-mount", "branch": "agent/queue/d086-mount", "status": "todo", "epic": "D-086-demand-list", "dependsOn": ["D-086.ui", "D-048-p3-live-review-find"], "owns": ["client/src/pages/Explore.tsx (switch only)", "client/src/pages/ExploreCompany.tsx (switch only)", "client/src/pages/explore.demandMount.test.tsx", "design/goal-ui/captures/demand/**"], "note": "D-086 packet §5.3. Mounts into the pages D-048-p3-live-review-find redesigns, after it lands; captures at 1280 and 390."}
]
```
Same pull request, under D-068: `docs/plans/README.md` and plan §3b row D-086 (status: packet written, rows queued), and `docs/plans/D-090-BYOR.md` and `docs/plans/D-099-bonus-pages.md`, which describe D-086 as "asks at companies not yet open" with a 90-day close, if the coordinator wants them current.

## 10. Proposed register entry (text only; take the next free ID at adoption: D-227 was free on `main` and every fetched head at `6cbee199`)
| D-227 | 2026-10-28 | **The D-086 demand list gets its packet: a public, k-anonymous count of people asking for a referral at each listed company, coverage-neutral, kept apart from D-193 (3)'s private waiting count; the release waits for the owner's answer on scope (decided under D-200 by Claude Opus 5.5 · fdae, reasoning session; changeable; adopted by the coordinator).** (1) Public demand is distinct canonical people with a pending request created in the last 30 days at a listed company's domains, excluding suspended and admin accounts and the operator company. It never uses `companySuggestions` votes and reads no referrer or availability data. (2) From 3 the number shows; 1-2 shows "A few people", with no number and an order that cannot reveal 1 versus 2; 0 shows nothing; no totals. (3) D-176 forbids exposing coverage, so the count is not limited to uncovered companies. Whether it shows at every listed company (default) is put to the owner, and only the release row waits. (4) Unlisted-company demand stays admin-only until an admin lists the company. (5) The ask-to-any-company path already exists; the 90-day closure is replaced by D-174 plus D-193 (4) in their own rows. (6) Rows `D-086.count`, `D-086.ui`, `D-086.mount`, with the parent as the release row (D-223). Rating 8/10: it turns the owner's L1 loop into three small rows with no migration, money or expiry code. Against: a public number at popular companies may discourage seekers, and the listed-only rule delays demand display for companies outside the directory. | Packet `docs/plans/D-086-demand-list.md` §§3-4; `server/db.ts:1059`, `:1873`, `:1917-1927`; `server/planGates.ts:30`; `server/companyResponseSignal.ts:12`; `scripts/nextTaskCore.mjs:194` probe (216 rows, 0 errors). | Applies D-086 within D-176 and D-174; distinguishes D-193 (3). Affects tasks: D-086-demand-list, D-086.count, D-086.ui, D-086.mount. Affects `docs/plans/assignments.json`, plan §3b, `docs/PRD.md` (at release), `AGENTS.md` (at release). | proposed; Q1 waits for the owner |

## 11. Gaps and risks (stated, not hidden)
1. **Owner original not on `main`.** Only the D-086 paraphrase is (`ed8f09e5`). The coordinator verifies the verbatim Oct 21 message before adoption; if it differs from §2, that version wins.
2. **The approved mocks are missing** (Oct 21 ~03:02 IST, "Lovely satisfied"). Placement (§4.9) and the list heading are assumptions until they are found.
3. **Cheap inflation.** A request at an uncovered company costs no credit, so sock-puppet accounts could raise a count. Mitigations: a resume per request (§3.6), distinct canonical person, at most 2 open requests per company per person, admin suspension, and admin visibility in flow-health. No anti-sybil code is proposed; if QA sees abuse, a follow-up row can require a verified card (D-079) for counting.
4. **BYOR ordering.** `D-086.count` shares no file with BYOR, so under D-223 (1) it takes no BYOR edge and can start once `D-174-company-search` lands. Everything user-visible (ui, mount, release) waits for BYOR, through real file overlaps and D-162 (3) at the parent. If the coordinator reads D-162 (3) as "every row after BYOR", add `D-090-BYOR` to `D-086.count`'s `dependsOn`; the probe stays valid.
5. **30-day window.** It undercounts people whose older request still waits (D-174: no expiry). Once `D-174-held-ask-reconfirm` lands, a follow-up may also count a request with a `reconfirmed` event inside the window. It is not done here, so no dependency on that row exists.
6. **Adjacent finding, not this packet's:** the D-104 signal (flag off) shows "referrers inside" on the public company page (`client/src/pages/ExploreCompany.tsx:233-236`), which is coverage data under D-176. Its switch-on review should check it against D-176.
7. **D-206.** This session rated only the decisions this packet rests on (appendix). It did not run the full session-start review or append to `docs/plans/DECISION-REVIEW.md`: the coordinator scoped this session to one packet. The cursor there is unchanged.
8. **Avoid-list check (coordinator request).** Every excluded row is a non-Claude build, landing or review under D-225 or D-151, or the held #758 landing, except the cases below:
   - **Misclassified:** `D-132-audit-item5-correction` (owns only `docs/plans/D-132-audit-findings.md`) is docs-only audit work, which a reasoning session may take. It ranks below this row, so the next task did not change.
   - **Correctly excluded, but for independence, not a build bar:** `REGISTER-D212` (its note bars Claude from review and landing, D-151) and `ASSIST-approval-cost` (built by Claude Code · d2fb; next step is landing).
   - **Duplicate:** `BRANCH-HYGIENE-1` is listed twice.
   - Without the list, the picker's next task was `BUILD D-048-p3-post` (implementation), so the list did its job.

## Appendix: D-206 ratings for the decisions this packet rests on (scoped; for the coordinator to append)
| ID | Rating | Status | Note |
|---|---|---|---|
| D-086 | 7 | active | The goal is right (L1 supply). It is held below 8 by wording written before D-176: "for companies with no verified referrer" now exposes coverage. §8 Q1 fixes it (owner-reserved). |
| D-176 | 9 | active | It matches the seeker's mental model. Its reach into public demand is clarified by §4.1-§4.2, with no change. |
| D-174 | 8 | active | No expiry is right for launch. Without D-193 (4) it would let stale requests inflate any count, so the window in §4.3 is needed. |
| D-193 (3) | 8 | active | A sound private count. Clarified as not public demand (§4.1). |
| D-162 (3) | 6 | active, CEO remit | An ordering written as a dependency. Under D-223 (1) only file overlaps should be edges; §11 gap 4 proposes applying it at the parent only. |
| D-223 | 9 | active | Applied: three file-split rows, with the parent as the release row. |

## Status
D-086-demand-list: packet proposed, not applied (Claude Opus 5.5 · fdae, 2026-10-28, lock `agent/architect/d086-demand-list`). Awaiting coordinator validation and adoption.
