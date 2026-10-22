# Packet D-048 phase 3: Find a referral with the ask drawer

> Read `docs/BRIEF.md` first, then this packet and `DESIGN.md`. This moves the directory and the ask composer to the approved goal UI (D-048 phase 3), stacked on the pilot packet [D-048-phase-3-my-asks.md](D-048-phase-3-my-asks.md).

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b row 4 (D-048 phase 3). Surface record; the queue stays Claude Code's (D-083). |
| Decisions | D-048 (one surface at a time) · D-070/D-071 (comps in `design/goal-ui/pick/` approved; no compensation row) · D-077(1)(4)(6) (200 ms drawer, three reasons, ten function chips) · D-034/D-047 (no credit until a referrer can see it; a creditless ask waits held) · D-061 (7-day clock from first visibility) · D-063 (money copy) · D-055 (referrers never pay) · D-019 (basics work) |
| Risk tier | 3 (client only; the send path is the live one, reusing its contract and server unchanged) |
| Size | L (page, drawer, model, five test files plus the goal primitive tests, captures) |
| Implementer | Qoder |
| Branch | `agent/qoder/d048-phase-3-explore` from `b74c6bf7` (the pilot branch, PR #360); the PR bases on that branch until it lands |
| Depends on | D-048 phase 2 live (`b6ea65f1`) · pilot `b74c6bf7` for merge order (this branch contains it) |
| Do not run at the same time as | any packet editing `client/src/pages/Explore.tsx`, `client/src/pages/explore/**`, or `client/src/components/goal/**` |
| Verified against | `main` `e383a5d4` on 2026-10-21 |

## 1. Goal

A seeker opening **Find a referral** sees the live directory in the approved goal layout — heading, search, filter chips, the honest summary line and alphabetical company rows — and selecting a company opens the **ask drawer** docked at 480px (a full-height sheet on phones) with the job link, resume, three reasons and the cost line visible from the first moment. Sending uses the live composer's contract, so the drawer adds no second ask path: the same validation, idempotency key, caps, coverage behavior and money copy. Every number and name comes from `GET /api/companies`, `GET /api/credits/summary?role=job_seeker`, `GET /api/profile/setup` and the live send response.

## 2. Binding rules (quoted, not paraphrased)

- `DESIGN.md`: "Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390."
- `DESIGN.md` Do's: "Do take sizes from `design/goal-ui/pick/*.css`" and "One primary action per screen."
- `design/goal-ui/pick/find-a-referral.css`: "Desktop: rail 104 | directory 696 (632 content) | drawer 480 docked flush, no scrim. Phone: directory frame, then the full-height ask sheet (frame 2)."
- `find-a-referral.css:67`: "a passed check is ink, not emerald"; the cost and its condition sit in the footer "from the first moment" (no drip pricing).
- D-077(4): the "why me" composer stores three answers as three lines in the existing note field; the live note checks apply to the whole text.
- D-077(6): production filter chips offer all ten job functions; the comp's four are illustrative.
- D-071: the comps' sample names and numbers never ship; no compensation field.
- `AGENTS.md` product compass: credits and money stay honest. The cost line states what the code does; the drawer never claims a credit came back or was spent unless the response proves it.
- D-055: referrers are never charged or paid; this screen is a seeker surface (the shell adapter shows no credits pill to a verified referrer).

## 3. Current behaviour (verified)

1. `/explore` rendered the Kit `Explore` page inside `AppShell`: a card grid from `GET /api/companies` with a search field, two selects (function, location), an employee band and a trust row. Every card linked to `/explore/:slug`.
2. The ask composer lived only at `/ask` (Kit `Ask` page); the Kit company door `/explore/:slug` had its own four-step request dialog, which handed a draft to `/ask` without sending.
3. `GET /api/companies` returns `{ companies, openCount }`; each row carries `slug`, `name`, `initials`, `industry`, `location`, `functions`, `blurb`, `domains`, `openToReferrals` (`shared/companies.ts`).
4. `POST /api/company-referrals` accepts `{ targetRoleUrl, attachmentIds, candidateMessage, companySlug, jobFunction?, fastTrack? }` with an `Idempotency-Key` header; it returns `requestId`, `companyDomain`, coverage state, `fastTrack` and `slots`. The slot-cap and per-company-cap refusals are 409s with typed payloads (`shared/openAskSlots.ts`).
5. `GET/PUT/DELETE /api/ask-drafts` stores one draft `{ companySlug, targetRoleUrl, note }`; `GET /api/profile/setup` carries the saved resume as `{ id, fileName }` with no date.
6. The live composer blocks a send under 10 words and coaches 30–120 words; it uploads a picked resume before creating the ask.

## 4. Target behaviour

1. **Shell.** `/explore` renders `Explore` directly (no Kit `AppShell`); the page uses `GoalAppShell active="find"` with page title "Find a referral". `/explore/:slug` is unchanged and keeps its Kit shell — moving the company door is its own packet.
2. **Directory.** The comp's heading ("Where do you want a referral?"), subline, `GoalSearchInput`, filter chips (All companies, Open to requests, the ten job functions from `JOB_FUNCTIONS`), the summary line `<n> companies · <m> open to requests` (mono numerals) and alphabetical company rows (`GoalCompanyRow`: mark, name, functions, availability dot + text). No card, no count of referrers, no sample data.
3. **Ask drawer.** Selecting a row opens `AskDrawer` for that company: desktop a 480px docked column with no scrim (the directory stays usable), phone a full-height sheet over a scrim. The drawer head shows the company and, when the pasted link carries a readable slug, the role title; it never invents one.
4. **Cost first.** The footer carries `costLine(...)` from the moment the drawer opens: a company open to requests uses 1 credit when a verified employee can see it (counted against the live balance); a company not open yet waits at no cost (D-034) and the same ask is held, not billed, if the seeker has no credit when it becomes visible (D-047). Balance unknown reads "Uses 1 credit" — never 0.
5. **Link hints.** The job-link field validates against the company's own domains: another employer is an error, the company's careers site is an ink pass hint, a hosted job board is a muted "we'll confirm when you send". The field is untouchable-free until blurred or a send is attempted.
6. **Resume.** The saved profile resume fills the field; picking a file uploads it on send through the live upload path. Only the file name shows (there is no trustworthy "updated" date in the payload); the hint says it is "Shared after a referrer accepts".
7. **Why me.** Three numbered reasons, each at most 140 characters with a live counter; they travel as three lines of the existing `candidateMessage` note (D-077(4)), and the live minimum of 10 words still gates the send. Over-limit reasons turn their own card crimson inside the primitive.
8. **Send.** The drawer posts the same body the composer posts (`buildAskBody`), with one per-drawer idempotency key, then invalidates the credit balance and ask list. Success replaces the body with the sent ask: what happens next (visible now, waiting for coverage, or fast-track), the 7-day/90-day truth from the shared money copy, the slot count when the server sends it, and a link to `/conversation/:id`. Errors are shown in place: slot cap nudge, per-company cap, network copy, server message.
9. **Not open yet.** The drawer offers "Get told when a referrer joins" through the live `POST /api/seeker-alerts` and states "An alert is not a referral."
10. **Drafts.** A signed-in seeker can save the draft to the live drafts API; a saved draft fills only an empty form for the company it was written for. Closing the drawer keeps the in-memory draft.
11. **Signed out.** The drawer labels the button "Sign in and send" and hands the seeker to seeker sign-in with the company, link and reasons kept; no ask is created.
12. **States.** Directory: static skeletons, an honest `GoalErrorState` with Try again, an empty state with Clear filters and a real Request a company link. Offline: the send is blocked with the plain connection line. Every state in plain words; nothing fabricated.
13. **No leaks.** No referrer name, id, count or note; no `Ref-` code; no preview chip, sample company or made-up numeral.

## 5. Files

- **In scope (edit only these):**
  - `client/src/pages/Explore.tsx` (rewritten as the goal directory)
  - `client/src/pages/explore/AskDrawer.tsx` (new)
  - `client/src/pages/explore/findModel.ts` (new: matching, filtering, link hints, role title, cost lines)
  - `client/src/pages/explore/askSend.ts` (new: idempotency key, send body)
  - `client/src/pages/explore/signInHandoff.ts` (new)
  - `client/src/pages/explore.test.tsx` (goal directory block; the company-door blocks stay)
  - `client/src/pages/exploreDrawer.test.tsx` (new)
  - `client/src/pages/explore/findModel.test.ts`, `client/src/pages/explore/askSend.test.ts` (new)
  - `shared/whyMe.ts`, `shared/whyMe.test.ts` (new: the three-line note contract, D-077(4))
  - `client/src/components/goal/GoalReasonInput.tsx` (new primitive), `GoalListRow.tsx` (`GoalCompanyRow`), `GoalAppShell.tsx` (`drawer` pass-through), `index.ts`
  - `client/src/components/goal/goalAtoms.test.tsx`, `goalComposites.test.tsx`, `goalBoundary.test.ts`
  - `client/src/App.tsx` (route renders `Explore` directly)
  - `client/src/lib/companyDirectory.ts` (remove the retired `openDoorsEyebrow`)
  - `client/src/components/explore/CompanyCard.tsx` (deleted: the old grid card, now unused)
  - this packet; `AGENTS.md` D-048 program line
- **Read only:** `DESIGN.md`, `design/goal-ui/pick/find-a-referral.{html,css,png}`, `design/goal-ui/BRIEF.md`, `docs/plans/D-048-phase-2-spec.md`, `client/src/pages/Ask.tsx`, `client/src/components/ask/askApi.ts`, `client/src/hooks/useCreditBalance.ts`, `client/src/lib/useSeekerSetup.ts`, `client/src/lib/resumeUpload.ts`, `shared/companies.ts`, `shared/openAskSlots.ts`, `shared/moneyCopy.ts`, `shared/referral.ts`, `shared/askQuality.ts`, `client/src/pages/ExploreCompany.tsx`.
- **Out of scope (never edit here):** `server/**`, `drizzle/**`, `shared/**` other than `whyMe.ts` and its test, `docs/plans/assignments.json`, `docs/KIT_V4_BUILD_PLAN.md` §3b, `.env*`, payment/auth code, `/ask`, `/explore/:slug`.

## 6. Steps (one commit each)

1. **Model and note contract.** `shared/whyMe.ts`, `explore/findModel.ts`, `explore/askSend.ts`, `explore/signInHandoff.ts` with their tests. Focused: the four new test files.
2. **Primitives.** `GoalReasonInput`, `GoalCompanyRow`, the `drawer` pass-through on `GoalAppShell`, boundary allowlist, primitive tests.
3. **Page and drawer.** Rewrite `Explore.tsx`, add `AskDrawer.tsx`, wire the route, rewrite the directory tests and add the drawer tests; delete the now-unused `CompanyCard` and `openDoorsEyebrow`.
4. **Captures and docs.** 1280×1126 and 390×844 screenshots against the comp; this packet; the `AGENTS.md` line. Commit message names the moved surface.

## 7. Tests (written with the change)

`explore.test.tsx` (8 goal-directory tests plus the four untouched company-door blocks): alphabetical rows with availability marks from `/api/companies` alone and no sample data; the summary counts only open companies; search + ten chips + All companies reset; skeleton → error → Try again; empty state with Clear filters and Request a company; the SEO head; the give-referral entry; `?company=` preselection and Close restoring `/explore`.

`exploreDrawer.test.tsx` (13): drawer open with cost, privacy line, verified mark and saved resume; link hints (another employer, the company's site, a job board); the live send body, idempotency UUID, sent copy, slot count and thread link; missing link/resume/reasons gating; Cmd/Ctrl+Enter; slot-cap 409; per-company-cap 409; network failure keeps the form; zero credits suppresses the send; signed-out hand-off keeps the draft; Save draft; switching companies starts empty while the resume stays; the not-open alert and "An alert is not a referral.".

`explore/findModel.test.ts` (15): case-insensitive matching and alphabetical order, summary counts, each link hint tone, role-title extraction (including the null cases), every cost line (open, not open, unknown, zero, one, many).

`explore/askSend.test.ts` (4): one key per drawer, the body keeps the note's three lines, no compensation key, the job-function/routing fields.

`shared/whyMe.test.ts` (6): compose/split round trip, blank reasons, over-limit detection, the 140 bound.

`goalAtoms`/`goalComposites`: `GoalReasonInput` labels and live counter, over-limit flags without disabling; `GoalCompanyRow` is a 52px selectable row with no href, the availability text, and the selected ink bar. `goalBoundary`: only the moved surfaces import `components/goal`.

**Controls:** the existing company-door suites (`explore.test.tsx` detail/openings/request-dialog blocks) stay green; `client/src/pages/ask*` and `client/src/components/ask/*` are untouched. No existing assertion was weakened.

## 8. Edge cases and races

- Credits loading or failed → "Uses 1 credit", never 0; zero credits → the line says so, Send is `aria-disabled` with the reason, and no request is made.
- Offline → Send is suppressed with the connection line; the directory still reads from cache.
- A company not open to requests → no credit until a verified employee can see the ask; the ask waits (D-034) or is held for credit (D-047); the alert is offered and labelled as not a referral.
- Another employer's job link, an invalid URL, or a job-board link → error / muted confirmation exactly as the composer's rules.
- No resume, fewer than 10 words, or a reason over 140 characters → Send is held with the specific message; over-limit cards stay editable.
- Slot cap or per-company cap → the server's typed refusal is shown; the form and draft stay.
- A dropped connection mid-send → the form stays, copy says nothing was sent twice, and the idempotency key survives a retry.
- A saved draft for another company never leaks into this drawer; a signed-out seeker's draft comes back through sign-in.
- Picking another company starts that company's drawer empty (no carried job link or reasons); the seeker's resume stays available, and reopening the company the draft was written for restores it.
- Zero companies, a directory error, or a slow load → skeleton, error with Try again, or the honest empty state.
- Long company names and function lists truncate on their line; the drawer body scrolls; the footer cost and actions stay visible.
- Phone: the sheet is full height with a grabber; the bottom bar is hidden; 44px targets.

## 9. Verification

- `pnpm check`
- `pnpm vitest run client/src/pages/explore.test.tsx client/src/pages/exploreDrawer.test.tsx client/src/pages/explore/findModel.test.ts client/src/pages/explore/askSend.test.ts shared/whyMe.test.ts client/src/components/goal/goalAtoms.test.tsx client/src/components/goal/goalComposites.test.tsx client/src/components/goal/goalBoundary.test.ts` (98 tests)
- `node scripts/design-token-audit.mjs`
- `pnpm build`
- `pnpm quality:gate` on the branch before pushing
- Captures at 1280×1126 and 390×844 (directory, drawer open with the live cost and verified mark, not-open company with the alert, empty, error) compared with `design/goal-ui/pick/find-a-referral.desktop.png` / `find-a-referral.mobile.png`; the phone sheet keeps the resume name on one line and its footer holds the cost and actions above the fold.
- Production remains unverified until this lands through a PR (D-082), and the pilot PR #360 lands first.

## 10. Deviations from the comp (deliberate)

1. **A row opens the ask drawer in place; it is not a link to `/explore/:slug`.** The comp's `.co-row` is an anchor to the company door. Here the directory's job is the ask, and the comp draws the drawer as the selected company's detail. The company door (with employee-posted roles) stays reachable from Home, the wall, admin and `/explore/:slug` deep links, and moving that surface is its own packet.
2. **No location filter.** The comp draws search plus function chips only; D-077(6) names the ten job functions. The old page's location select and free-text role field are gone; the search covers company, industry and functions.
3. **No "Updated 12 Oct" line under the resume name.** `ResumeDoc` carries `{ id, fileName }` and no date; showing one would invent a fact.
4. **Save draft appears only when signed in.** The drafts API is authenticated; a signed-out seeker gets the sign-in hand-off with the draft kept in the prefill instead.
5. **The role context line is read from the link.** With no readable slug (a numeric job id) the head shows the company alone rather than a guessed title.
6. **The reasons group error is ink, not crimson.** Screens never name status hues (token audit R3); field-level crimson stays inside `GoalField`. The per-reason over-limit state is still crimson inside `GoalReasonInput`.
7. **The not-open alert is offered inside the drawer.** The design ledger says "detail only"; the drawer is this surface's detail, and it states "An alert is not a referral.".
8. **The employee band and trust row are not drawn.** The comp has neither; the shell already carries "Give a referral" for non-referrers and the footer's standing free-asks/never-paid line on unmoved pages.

## 11. Rollback

Revert the PR commits. No schema, migration, server, provider or stored state changes; `/explore` falls back to the previous Kit directory on the next deploy, and `/ask` is untouched throughout.

## 12. Definition of done

All gates green on the exact commit, captures match the comp at both widths, the owner has reviewed the surface, and PR #360 has landed first (this branch contains it). The queue row's status is updated by Claude Code when this lands (D-083).
