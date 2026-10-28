# Packet D-094-ai-in-ui: a seeker who opens the ask drawer can get coaching questions that make their three reasons sharper, the job link fills in the company and role, and My asks explains each status in plain words

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` row `D-094-ai-in-ui` (architect row, lane `ai`). This packet replaces that row with the subtask rows in §6 (D-223); status lives in those rows, and in this packet's Status section only where rows share it (D-134) |
| Decisions | D-094 (implemented), D-091, D-138, D-139, D-140, D-204 (2)(3)(4), D-153, D-173/D-180 (vocabulary), D-077 (4), D-093 (catalogue shape), D-087/D-088 (fullstack, analytics), D-120/D-150 (goal UI), D-174 (no expiry promises), D-223 (splits), D-225 (roles). Binding text quoted in §2 |
| Risk tier | Row says 2. Split: the provider slice is **Tier 1** (privacy: seeker-written text leaves skipwait.me for a third party); every other slice is 2 or 3 (§6) |
| Size | L, split into eight rows in §6 |
| Implementer | any model for the Tier 2/3 rows; the Tier 1 rows need an independent review by a model other than the builder (D-151). Under D-225 a Claude session revises this packet; other tools build it |
| Branch | each §6 row has its own `agent/<model>/<slug>` from the latest `origin/main` |
| Depends on | per row (§6). The drawer and My asks mounts wait for the rows that own those files today |
| Do not run at the same time as | `D-048-p3-live-review-find` and `D-174-fix-post-binding` (own `client/src/pages/explore/**`, `AskDrawer.tsx`, `useAskComposer.tsx`); `D-099-bonus-line` (owns `client/src/pages/explore/`); `D-174-held-ask-reconfirm` (owns `client/src/pages/MyRequests.tsx`); `D-090-BYOR` (owns `client/src/components/requests/requestsApi.ts`) |
| Verified against | `main` `722651103a560324f8e7a66bfb188ac0123b1487` on 2026-10-28; newest register entry on that base D-229 (`syncedTo: D-229`) |

**Base and drift check (done at write time).** `git fetch origin main` gave `722651103a56`; this branch's HEAD was the same commit, so the packet reads the code exactly as it is on main. The newest register entry on main is D-229. Scanning `docs/` on every branch on origin, D-230 appears only as a provisional ID on another seat's open branch, and no branch uses D-231 or higher. So the entry this packet proposes (§12, P-1) is provisionally **D-231**. The writer of the registration PR must check main and every open branch again at that moment and take the next free ID.

---

## 1. Goal

Today the drawer's "Why me" asks for three reasons, up to 140 characters each, with one fixed help line: "One specific result beats a list of skills." A seeker who writes "I am passionate about data" gets no feedback before a verified employee reads it. D-094 wave 1 adds three aids. None of them ever writes a fact for the seeker:

1. **Reasons coach.** A tap asks the model for up to three targeted questions about the seeker's own reasons, for example "What number shows the result of that migration?". The questions are shown next to the fields. They are never inserted, never "applied" and never sent with the ask. The seeker edits their own words or ignores the questions.
2. **Job-link auto-fill.** When the drawer has no company yet, pasting a link fills a confirm line: company, role title, and whether it matches the careers site. No model is involved. The existing SSRF-safe preview does the work.
3. **Plain-language status help in My asks.** A short "What this means" line per status, looked up from a keyed catalogue of approved strings. There is no generation and no provider call. It is built in the catalogue shape D-093 names, so it can be localised.

How this serves the goal: a sharper request helps the referrer decide with confidence and gets people referred faster (the compass test in AGENTS.md). Auto-fill removes a step. Status help removes "what does Waiting mean?" support load and the anxiety behind it. No money moves in any item.

## 2. Binding rules (quoted, not paraphrased)

- **D-094** (owner steer recorded as "Use intelligence in UI"; pre-approved under D-091): "(1) Reasons coach in the ask drawer: "Sharpen this" asks the seeker targeted questions, never writes facts for them; label "Coach suggests - your words, your facts"; fallback is today's help line. (2) Job-link auto-fill: fetch the posting, prefill company and role, run the careers-site match; manual fallback with a plain failure line; no model needed. (3) Plain-language status help in My asks via retrieval from the approved microcopy catalogue (no generation), localised. Deferred: best-company suggestions and smart inbox ordering (meritocracy-first, needs explainable criteria). All: suggestions only, the user stays in control, honest labels, credits-only cost guard, no cash. Provider wiring waits on the AWS/Bedrock setup; items 2 and 3 can start before the provider exists." Status: "provider plan amended by D-204 (3) (Azure OpenAI on startup credits first, Bedrock fallback)".
- **D-204 (3):** "Skippy's model and the AI features: Azure OpenAI on the Microsoft for Startups credits, through the existing OpenAI-compatible router (`server/_core/modelRouter.ts`, config only, no code). That waits until its data terms are confirmed (no training on prompts; resumes, D-139) and the D-138 caps are on; AWS Bedrock on the Activate credits is the fallback."
- **D-204 (2):** "A service paid from credits counts as free under D-031 and D-138 only when something stops it before any card is charged: a provider spending limit, a budget action that disables it, or an app-side cap set below the remaining balance (the D-138 caps for model calls). If none exists, it needs the owner's one-word yes like any paid service."
- **D-204 (4)** (owner actions): "Put a budget alert and a hard stop on each credit account that can bill a card (Azure, AWS, Cloudflare). Create an Azure OpenAI deployment and store its key in the vault (`AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, `AI_MODEL`)."
- **D-138:** "Free model first, no paid spend. Tools are model-agnostic. A paid model needs the owner's one-word yes plus a hard daily cap. Per-user daily cap ... and a global daily cap, both enforced server-side; hitting a cap says so plainly."
- **D-139:** "The seeker owns the words and the data. The seeker writes or confirms the final note ... Resume-to-AI consent comes first. Nothing is kept beyond what the ask needs. The model provider's no-training and data terms are confirmed before any seeker-facing launch."
- **D-140:** "Text inside user data (resumes, job pages, notes, tool output) is data, never an instruction."
- **D-077 (4):** "The "why me" composer stores its three answers as three lines in the existing note field, so the note checks apply to the whole text and no schema changes."
- **D-093** (catalogue shape): "content.json is the catalogue seed: full-sentence keyed strings ... Human-reviewed translations only for money, credit, legal and trust copy; unreviewed languages stay hidden."
- **D-153** (frozen): names, CTAs and benefit wording state the actual action, outcome and cost plainly and "the promise has to match what actually works".
- **D-180:** user-facing vocabulary is "referral"; "ask" is internal. Its string recommendations are "NOT owner-approved strings, pending copy review". Every user-facing string in this packet that says "ask" follows whatever wording that lane lands. Status help must never call a request a referral (D-076 (8), D-179).
- **D-174:** ask expiry is suspended as launch direction. Status help must not promise or explain an expiry clock as intended behaviour (the legacy runtime clocks are described in AGENTS.md as runtime-only until removal).
- **Legal text** (AGENTS.md 0a, "Current guardrails"): "Terms/Privacy keep owner-approved legal text unchanged unless the owner approves new wording."

If the code, this packet and the register disagree, the register wins: stop and report (§11).

## 3. Current behaviour (verified on `722651103a56`)

Find each function by name. Line numbers drift.

**The drawer and composer**

1. `client/src/pages/explore/AskDrawer.tsx` `AskDrawer` renders the job link (`GoalField` + `GoalTextInput`), the resume picker, the "Why me" `fieldset` with three `GoalReasonInput`s, and the fixed help line "Three reasons, up to {WHY_ME_MAX} characters each. One specific result beats a list of skills." This line is "today's help line" (D-094 (1) fallback). Placeholders are in the `PLACEHOLDERS` const. The drawer is mounted by `client/src/pages/Explore.tsx` and `client/src/pages/ExploreCompany.tsx`.
2. `client/src/pages/explore/useAskComposer.tsx` owns `reasons` state (`useState<WhyMeReasons>`), `MIN_WORDS = 10`, the send guidance (`tooLong`/`words < MIN_WORDS`), and `context` = company name plus `roleTitleFromUrl(url)` (`findModel.ts`, a URL-slug heuristic with no fetch). It sends `POST /api/company-referrals` with `companySlug`, `targetRoleUrl`, the composed note and `confirmedCompanyDomain`.
3. `shared/whyMe.ts`: `WHY_ME_MAX = 140`, `composeWhyMe`, `splitWhyMe`, `overLimitReasons`.
4. `client/src/pages/explore/findModel.ts` `linkHint`: with no company it says "We’ll confirm the employer when you send." It never calls the server.

**Job-link preview (item 2's engine, already built)**

5. `server/jobLinkPreviewRoutes.ts` `registerJobLinkPreviewRoutes` exposes `POST /api/job-link/preview`. It is unauthenticated and rate-limited in process memory to 12 calls a minute per IP. It answers `public, max-age` 120 s or 15 s. Registered in `server/_core/index.ts`.
6. `server/jobLinkPreview.ts` `previewJobLink` returns `JobLinkPreview` = `{ canonicalUrl, status, employerConfidence, companyDomain?, companyName?, reason, recoveryAction }`. There is **no role title**. It fetches the page body only for direct-domain and public Greenhouse links, and only to prove the page is reachable; the body is discarded. `fetchPublicJobLink` is the SSRF-safe fetcher that D-201's S-1 points to: pinned DNS, public-address check, redirect cap, 512 KB cap.
7. The preview is used by `client/src/pages/goal/start/GoalStart.tsx` and `client/src/pages/Onboarding.tsx`, **not** by the ask drawer.

**Model access**

8. `server/_core/modelRouter.ts` `routeChat({ system, user, maxTokens?, fallback })`. When the three `AI_*` env keys are set it POSTs to `${AI_PROVIDER_BASE_URL}/chat/completions` with a 30 s timeout and temperature 0.4. **If that fails or is unconfigured and the legacy Forge env (`BUILT_IN_FORGE_API_URL`/`_KEY`, `server/_core/env.ts`) is set, it sends the same messages to a second provider** through `server/_core/llm.ts` `invokeLLM`. Otherwise it returns `fallback`. On a provider error it `console.warn`s the HTTP status **and the first 160 characters of the provider's response body**.
9. `.env.example` declares `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY` and `AI_MODEL` (blank), and `src/worker.ts` forwards all three to the container. This repo cannot show whether production has them set. D-204 (4) lists creating the deployment as an open owner action, and `docs/SKIPPY.md`'s pre-launch checklist still has "Confirm the model provider's data terms" unticked.

**Logging and Sentry: no blanket scrubbing**

10. `server/sentry.ts` `initServerSentry` calls `Sentry.init({ dsn, release, environment, tracesSampleRate: 0.1 })` with **no `beforeSend`, no `beforeBreadcrumb` and no integration overrides**. `scrubSentryPath` scrubs only the request path that `sentryErrorMiddleware` attaches. So Sentry does **not** scrub everything. With `@sentry/node` 10's default integrations, console output and outgoing HTTP calls can be attached to an error event as breadcrumbs. Any text the coach logs could leave the app a second time, to Sentry. The coach must therefore log no prompt text, no reasons and no provider output (§4 R7).

**Caps and consent precedent**

11. `server/skippieSeekerRoutes.ts` `underCaps` enforces `SKIPPIE_SEEKER_DAILY_CAP = 20` and `SKIPPIE_SEEKER_GLOBAL_DAILY_CAP = 500` (`server/skippieSeeker.ts`) **in process memory**, so they reset on restart and count each container on its own. Those caps do not meet D-204 (2)'s "hard stop" for a credit-funded provider.
12. `server/_core/durableRateLimit.ts` `consumeDurableLimits(limits)` is the durable fixed-window limiter (MySQL `workEmailOtpRateLimits`, hashed namespaced keys, atomic). It returns `DurableLimitResult`; a store failure is reported as `unavailable`. This is the cap the coach reuses. No new table is needed.
13. `server/db.ts` `recordOperationalActivity` writes the activity log (`action`, `outcome`, `metadata` as scalar values). D-204 (3) feeds funnel analytics from this log server-side.

**Privacy notice**

14. `client/src/pages/TrustPrivacy.tsx` (74 lines) names Chargebee, Razorpay and PayPal for payments. It does **not** mention an AI or model provider or say that any seeker text is sent to one. The coordinator reports an unresolved finding, **H6**, about whether the privacy notice covers sending resumes to the AI provider. H6 has no text on main, so this packet cannot quote it. Fact 14 is the repo-verifiable part. This packet grants no authorization around H6 and edits no legal text (§4 R9, §12 Q-2).

**An existing model path this packet does not touch (finding F-1, report only)**

15. `server/privateReferralRoutes.ts` `POST /api/smart-pitch` (signed-in only) passes a **signed URL to the seeker's uploaded resume PDF** to `server/ai.ts` `draftSmartReferralPitch`. That function calls `invokeLLM` directly (the Forge path), not `routeChat`, and returns a drafted first-person pitch. The route has no consent check, and it writes content for the seeker. Its only client caller, `client/src/pages/ReferralRequest.tsx`, is not routed in `client/src/App.tsx`, but the endpoint itself is registered. This is the path D-139's "Resume-to-AI consent comes first" and H6 are about. This packet does **not** fix it and does not use it. It is reported for the CEO and coordinator to queue as its own Tier 1 row (§11, §12 Q-3). The coach sends no resume and never calls `invokeLLM` or `server/ai.ts`.

**My asks (item 3's mount)**

16. `client/src/components/requests/askView.ts` `askView` maps status to label, dot and stepper: Waiting, Under review, Accepted, Referred, Interviewing, Offer, Declined, Withdrawn, Closed, Expired. `requestModel.ts` `requestNote` writes each row's second line, which covers `held_for_credit` and `waiting_for_coverage`. `RequestRow.tsx` renders it. `client/src/pages/MyRequests.tsx` is the page.
17. No microcopy catalogue exists yet. `design/goal-ui/content.json` is a design deck (its `_meta.status`: "Design-review preview only. Sample data, never product data"), and D-093's `shared/i18n` catalogue is not built (row `D-093-language` is still an architect row).

## 4. Target behaviour

**Reasons coach (item 1)**

- **R1 Entry.** Below the three reasons sits a quiet secondary control with the button name the owner picks (`docs/BACKLOG.md` item 9). Until then its label is the register's working name, "Sharpen this". It never uses black, because the drawer's one black commit stays Send (D-150). It is enabled only when the seeker is signed in, online, and at least one reason has 3 or more words.
- **R2 Consent before the first send, every version.** The first tap opens an inline disclosure inside the drawer, not a modal on top of the drawer. It states, in plain words: what is sent (the three reasons, the company name, the role title), who receives it (the configured model provider, named by the release row once confirmed), what is not sent (no resume, name, email, job link or account id), and that skipwait.me stores neither the text nor the questions. It has two buttons: "Send my reasons to the coach" and "Not now". Only the explicit button sends anything. Acceptance is stored client-side per consent version (`localStorage`, try/catch). The server **refuses** any coach call whose body lacks `consent: REASONS_COACH_CONSENT_VERSION` (400 `consent_required`), so a stale client or a script cannot skip the disclosure. Each call is still an explicit tap: nothing runs on keystroke, blur or open. Bumping the version shows the disclosure again.
- **R3 Data sent to the provider (exhaustive).** One system prompt (fixed, in code). One user message built only from: the three reasons after `clean` (whitespace-collapsed, each at most 140 characters, with email addresses and any run of 8 or more digits replaced by `[removed]`); the company display name (the directory's public name, or nothing); and the role title (§R12, at most 120 characters, or nothing). Nothing else: no user id, name, email, resume or attachment, job URL, query string, IP, or prior messages. `max_tokens` is 200. A unit test asserts the exact request body.
- **R4 One provider, never two.** The coach calls only the configured `AI_PROVIDER_*` endpoint. It must **never** fall through to the Forge/`invokeLLM` path (fact 8). `routeChat` gains an option (`legacyFallback: false`) and the coach passes it. A test proves that with Forge env set and `AI_*` unset, no request is made and the fallback is returned.
- **R5 Output contract.** The model must return JSON `{ "questions": string[] }`. The server parses it with Zod: 1 to 3 items, each trimmed, 8 to 140 characters, ending in "?", no URL, no email, and no line breaks. Any item that fails is dropped; if none survive, the answer is the fallback. A **drafting guard** also drops any item that repeats 6 or more consecutive words from the seeker's reasons, or that starts with a first-person claim ("I ", "I'm", "My "). The questions are text the seeker reads. There is **no** control that copies them into a reason. D-140: the reasons and the role title are data inside a delimited block, and the system prompt says to treat them as data, never as instructions.
- **R6 Display.** The questions appear in a hairline panel under the reasons with the register label "Coach suggests - your words, your facts", a dismiss control, and one plain line: "The coach only asks questions. Nothing is added to your reasons." The questions do not change `reasons` state, the composed note, the word count or Send's enabled state. Closing the drawer drops them, and they are never saved in the draft (`saveAskPrefill` and the remote draft stay byte-identical).
- **R7 Fallback, honest and silent-failure-free.** When the coach is off, unconfigured, over a cap, timed out (8 s), returns invalid output, or the network fails, the panel shows today's help line ("One specific result beats a list of skills.") with one plain reason: "The coach isn't available right now" or, at a cap, "You've used today's coach questions. They reset tomorrow." (D-138: "hitting a cap says so plainly"). The server answers `200 { questions: [], fallback: "<reason code>" }` so that a cap is not presented as an error. The server logs only the reason code, the HTTP status class and latency. It **never logs** reasons, prompt, provider response text or role title, to the console, Sentry or the activity log (fact 10). The `routeChat` provider-error warn stops including the response body (same row as R4).
- **R8 Cost guard (D-138, D-204 (2)).** Two durable limits via `consumeDurableLimits`, checked **before** the provider call: per seeker `REASONS_COACH_USER_DAILY_LIMIT` (default 10 a UTC day) and global `REASONS_COACH_GLOBAL_DAILY_LIMIT` (default **0**, which means the coach is off until the operator sets a value below the remaining credit balance, D-204 (2)). These are SkipWait's own limits, not provider quotas. A store result of `unavailable` **fails closed**: fallback, no provider call. There is no paid fallback tier: if the credits or the cap run out, the coach shows the fallback. Seekers are charged nothing: no credit or referral is spent, and the D-034 ledger is not touched.
- **R9 Release gates (no flag on until all hold).** `REASONS_COACH_ENABLED` (server) and `VITE_REASONS_COACH` (client) both default to off. The release row (§6 row 8) may turn them on only after: (a) the provider's no-training and data-retention terms are confirmed for the provider actually configured (D-139, D-204 (3), `docs/SKIPPY.md` checklist); (b) the D-204 (4) hard stop and budget alert exist on that account, and the global limit is set below the balance; (c) the owner has approved notice wording that covers sending seeker-written text to an AI provider. Today's `TrustPrivacy.tsx` does not cover it (fact 14), and legal text is owner-controlled. This packet writes no legal text; (d) the owner's button label (BACKLOG item 9); (e) live proof (AGENTS.md rule 8). Gate (c) is where H6 is decided. This packet does not decide it.
- **R10 Analytics (D-087, consent-respecting, server-side only).** Activity rows with counts and codes only: `reasons_coach.requested` (outcome success or denied, metadata `{ result: "questions" | "fallback", reason?: code, count: n, consentVersion }`). There is no reason text, no company domain beyond the existing column, and no client tracking SDK. The funnel: drawer opened → coach requested → questions shown → ask sent within the same drawer session (a boolean the client passes on send as `coachUsed`; stored only as activity metadata, never on the ask).

**Job-link auto-fill (item 2, no model)**

- **R11 Drawer with no company.** When `company` is null and the link passes `isValidTargetRoleUrl`, the drawer calls `POST /api/job-link/preview` on blur, debounced 450 ms as in `GoalStart.tsx`, and shows a confirm line under the link: the company name with a verified mark when `employerConfidence` is `verified`, the role title when present, and "From the job page - check it's right". `ambiguous` or `unreachable` shows the preview's own `reason` plus "You can still send it; we'll confirm the employer when you send" (today's manual path, unchanged). A network failure shows "We couldn't check this link. You can still send it." When a company is already chosen, `linkHint` behaviour is unchanged.
- **R12 Role title.** `previewJobLink` adds an optional `roleTitle`, taken only from a page body that `fetchPublicJobLink` already fetched. It comes first from JSON-LD `JobPosting.title`, then from `og:title`, then from `<title>`. It is entity-decoded, tag-stripped, whitespace-collapsed and capped at 120 characters, and it is dropped if empty or if it looks like a generic site title (equals the company name, or is shorter than 3 characters). It is third-party text: it is rendered as text only and never parsed as an instruction (D-140). The `JobLinkPreview` type is extended additively, so existing callers are unaffected. The drawer's `context` prefers `roleTitle` over `roleTitleFromUrl`.
- **R13 Prefill is display only.** Auto-fill sends nothing new with the ask. The server still resolves the employer at send exactly as today, and the confirm line is never treated as authority for routing.

**Status help (item 3, retrieval, no model)**

- **R14 Catalogue.** `shared/statusHelp.ts` holds one keyed entry per distinct state the row can show: the `askView` labels plus the `requestNote` pending sub-states (`held_for_credit`, `waiting_for_coverage`, under review, available for review). Each entry is `{ key, en, reviewed: boolean }` with full-sentence strings, in the D-093 catalogue shape. A lookup `statusHelp(request)` returns the entry or `null`, and **never** generates or concatenates text. It exports only entries with `reviewed: true`. An unreviewed entry renders nothing, never a draft string.
- **R15 Content rules.** Each line says what the state means and what, if anything, the seeker can do, in the current vocabulary (D-180 lane). It never calls a request a referral before `intro_made` (D-076 (8)). It never names a time limit that D-174 suspends; the D-038 claim and referred windows may be stated only if the copy review confirms they are live. It never promises an outcome (D-153). Money states (`held_for_credit`) reuse the existing `shared/moneyCopy.ts` phrases byte-for-byte, because money copy needs human review (D-093) and stays frozen pending its audit (D-173).
- **R16 Display.** In each My asks row a quiet "What this means" disclosure (native `<details>`/`<summary>`, keyboard and screen-reader friendly) shows the line. On the conversation header it is not added in wave 1.
- **R17 Localisation.** English ships first. Other languages appear only when D-093's catalogue exists and a human-reviewed translation is present. Until then the line falls back to English, and unreviewed languages stay hidden (D-093).

**Deferred (unchanged from D-094):** best-company suggestions and smart inbox ordering. No row is created for them.

## 5. Files

Each §6 row lists its own `owns`. In summary:

- **In scope (across all rows):** `shared/reasonsCoach.ts` (+ test), `server/reasonsCoachRoutes.ts` (+ test), `server/_core/modelRouter.ts` (+ `modelRouter.test.ts`; R4 option and R7 warn change only), `server/_core/index.ts` (one registration line), `.env.example`, `src/worker.ts` (passthrough list only), `server/configContract.test.ts`, `server/jobLinkPreview.ts` (+ `jobLinkPreview.test.ts`), `client/src/components/ask/ReasonsCoach.tsx` (+ test), `client/src/components/ask/reasonsCoachApi.ts`, `client/src/components/ask/JobLinkConfirm.tsx` (+ test), `client/src/pages/explore/AskDrawer.tsx` and `useAskComposer.tsx` (mount rows only), `shared/statusHelp.ts` (+ test), `client/src/components/requests/RequestRow.tsx` (+ a new `statusHelp` render test), `docs/plans/D-094-ai-in-ui.md` (Status section), and the D-068 doc lines (AGENTS.md living-map row for the new route, `docs/DECISIONS.md` sync cell) in the row that changes them.
- **Read only:** `server/_core/durableRateLimit.ts`, `server/db.ts` (`recordOperationalActivity`), `server/sentry.ts`, `server/skippieSeekerRoutes.ts`, `shared/whyMe.ts`, `shared/moneyCopy.ts`, `client/src/components/requests/askView.ts`, `requestModel.ts`, `client/src/pages/goal/start/GoalStart.tsx`, `client/src/pages/TrustPrivacy.tsx`, `design/goal-ui/content.json`, `DESIGN.md`.
- **Out of scope (never edit here):** `client/src/pages/TrustPrivacy.tsx`, `Terms.tsx` and any legal text (owner-controlled); `server/ai.ts`, `server/privateReferralRoutes.ts` `/api/smart-pitch`, and `server/_core/llm.ts` (F-1 is its own row); `server/sentry.ts` (a global `beforeBreadcrumb`/`beforeSend` scrubber is worth its own row, not a side edit here); `shared/whyMe.ts` and the note format (D-077 (4)); every money, credit and ledger file; `server/skippie*` (D-201 holds Skippy); `drizzle/**` (no migration).

## 6. Steps (one row each, D-223)

Each row lands by itself on green required CI, with behaviour preserved or behind a switch that starts off. Row 8 turns the switches on.

| # | Row id | Tier | Owns | Depends on | Outcome |
|---|---|---|---|---|---|
| 1 | `D-094.coach-contract` | 2 | `shared/reasonsCoach.ts`, `shared/reasonsCoach.test.ts` | none | Zod request/response schemas, `REASONS_COACH_CONSENT_VERSION`, `buildCoachMessage` (R3 redaction and exact shape), `parseCoachQuestions` (R5 incl. drafting guard), fallback reason codes. Pure, no I/O |
| 2 | `D-094.router-single-provider` | 1 | `server/_core/modelRouter.ts`, `server/_core/modelRouter.test.ts` | none | `routeChat` options `legacyFallback?: boolean` (default `true`, so today's callers are unchanged) and `timeoutMs?` (default 30 000). The provider-error warn logs the status only, never body text (R4, R7). Byte-identical behaviour for existing callers apart from the shorter log line |
| 3 | `D-094.coach-server` | 1 | `server/reasonsCoachRoutes.ts`, `server/reasonsCoachRoutes.test.ts`, `server/_core/index.ts`, `.env.example`, `src/worker.ts`, `server/configContract.test.ts` | 1, 2 | `POST /api/ai/reasons-coach`. Order: flag off → 404; signed out → 401; no consent → 400 `consent_required`; then Zod; then the durable caps (R8, fail closed); then `routeChat({ legacyFallback: false, timeoutMs: 8000, maxTokens: 200 })`; then `parseCoachQuestions`. `private, no-store`. Activity row (R10). New keys `REASONS_COACH_ENABLED`, `REASONS_COACH_USER_DAILY_LIMIT`, `REASONS_COACH_GLOBAL_DAILY_LIMIT` declared and forwarded (AGENTS.md "Environment"). The AGENTS.md living-map row lands in this PR (D-068) |
| 4 | `D-094.autofill-server` | 2 | `server/jobLinkPreview.ts`, `server/jobLinkPreview.test.ts` | none | Additive `roleTitle` (R12) from the body already fetched. No new fetch, host or cache key |
| 5 | `D-094.status-help-catalogue` | 3 | `shared/statusHelp.ts`, `shared/statusHelp.test.ts` | none | Keyed entries (R14), English strings drafted for copy review with `reviewed: false`. The lookup returns `null` until a reviewer flips an entry, so landing it changes nothing on screen |
| 6 | `D-094.drawer-ui` | 2 | `client/src/components/ask/ReasonsCoach.tsx`, `client/src/components/ask/reasonsCoach.test.tsx`, `client/src/components/ask/reasonsCoachApi.ts`, `client/src/components/ask/JobLinkConfirm.tsx`, `client/src/components/ask/jobLinkConfirm.test.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/exploreDrawer.test.tsx` | 1, 3, 4, `D-048-p3-live-review-find`, `D-174-fix-post-binding` | R1, R2, R6, R7 client side and R11/R13 behind `VITE_REASONS_COACH` (off) for the coach. Auto-fill uses no new data path and no model; it ships unflagged only if the find row's reviewer agrees, otherwise behind `VITE_JOB_LINK_AUTOFILL` (off). Declare any `VITE_*` key in `.env.example` in the same PR; if it falls outside this row's `owns`, stop (§11). Captures at 1280 and 390 |
| 7 | `D-094.status-help-mount` | 2 | `client/src/components/requests/RequestRow.tsx`, `client/src/components/requests/statusHelp.test.tsx` | 5, `D-174-held-ask-reconfirm` | R16 `<details>` per row when `statusHelp` returns an entry. Renders nothing for unreviewed entries. Captures at 1280 and 390 |
| 8 | `D-094.release` | 1 | `docs/plans/D-094-ai-in-ui.md`, `docs/DECISIONS.md` (sync cell), `docs/SKIPPY.md` (provider checklist tick only, if confirmed) | 3, 6, 7, owner gates R9 (a)-(d) | Records the gate evidence. Operator turns flags and limits on, then live proof. Flags are switched, never deleted (D-042 pattern) |

Each row's packet is this file. Each row adds its line to the Status section below. `syncedTo` for every new row is the newest register entry on main when the row is registered.

**Picker registration (not done by this packet).** Replacing the architect row with rows 1 to 8 is a registry change for the CEO or coordinator under D-200. This packet edits no `assignments.json`.

## 7. Tests to write first (red before the change)

Row 1, `shared/reasonsCoach.test.ts`:
- `buildCoachMessage` returns exactly `{ system, user }`. `user` contains the three cleaned reasons, the company name and the role title, and nothing else. It replaces emails and 8+-digit runs with `[removed]`. It truncates each reason at 140 characters and the role at 120. It **does not** contain a URL even when a reason does: URLs are replaced as well. Red: the module does not exist yet.
- `parseCoachQuestions` keeps only valid questions (R5). It drops an item that copies 6+ consecutive words of a reason, an item starting "I'm" or "My", a non-question, an item over 140 characters, a URL, and non-JSON. It returns at most 3, and returns `[]` on any parse failure.
- The request schema rejects unknown fields, a missing or wrong `consent`, and four reasons.

Row 2, `modelRouter.test.ts`:
- With `legacyFallback: false`, AI env unset and Forge env set, no `fetch` and no `invokeLLM` import happen, and `fallback` is returned. Red today, because the legacy path runs.
- On a provider 500 whose body contains a marker string, the `console.warn` arguments do not contain the marker. Red today, because 160 characters are logged.
- `timeoutMs` reaches `AbortSignal.timeout`.
- **Controls:** existing `modelRouter.test.ts` cases are unchanged and green, and default callers still reach the legacy path.

Row 3, `server/reasonsCoachRoutes.test.ts` (fake deps, no network):
- Flag off → 404 and no provider call. Signed out → 401. Missing consent → 400 `consent_required`, no limiter hit, no provider call.
- Global limit 0 → `{ questions: [], fallback: "off" }`, no provider call. Per-user limit reached → `fallback: "cap"` with the plain line code. Limiter `unavailable` → fallback, no provider call (fail closed).
- Happy path: the provider receives **exactly** the `buildCoachMessage` body (snapshot of the outgoing JSON), with `legacyFallback: false`, timeout 8000 and max_tokens 200. The response is the parsed questions. The header is `private, no-store`.
- Provider throws or times out → fallback, and **no console or Sentry call contains any reason text** (spy on `console.*` and the capture function and assert a planted marker is absent).
- An activity row is written with codes and counts only. Assert the metadata keys equal the allow-list.
- Config contract: the new keys are in `.env.example` and forwarded by `src/worker.ts`. `server/configContract.test.ts` goes red before the declaration.

Row 4, `jobLinkPreview.test.ts`: JSON-LD title wins over og:title and over `<title>`. HTML entities are decoded and tags stripped. A generic title equal to the company name is dropped. A >120-character title is truncated. With no body fetched (the reviewed-listing path) there is no `roleTitle`. **Controls:** every existing preview test is unchanged, including the SSRF cases.

Row 5, `shared/statusHelp.test.ts`: every `askView` label and the pending sub-states have a key. Lookup returns `null` for `reviewed: false`. No entry text contains "referral" for a pre-`intro_made` key unless it is the noun "referral request", and none contains "expire", "days" or "deadline" for a D-174-suspended clock. The `held_for_credit` entry equals the `shared/moneyCopy.ts` phrase.

Row 6, client tests: no network call before the consent button is pressed. "Not now" sends nothing. The questions panel never changes `reasons` or the composed note (assert `composeWhyMe` output and the saved prefill are identical before and after). The fallback shows the help line and the reason. The panel has `aria-live="polite"`. Send stays the one black commit (`assertGoalPage`). Auto-fill: `ambiguous` keeps today's line; a network error shows the plain failure line and Send still works.

Row 7: a reviewed entry renders inside `<details>`, and an unreviewed one renders nothing. **Controls:** existing `myRequests.*.test.tsx` stay green.

Never weaken, skip or delete an existing assertion to make a test pass.

## 8. Edge cases and races

- **Double tap or slow provider:** the client disables the coach control while a call is in flight (`busy`). The server counts the limit once per accepted call. A retry after a timeout counts again. That is deliberate: it costs a call.
- **Multiple containers:** the caps are durable (fact 12), not in memory, so they hold across instances and restarts. This is unlike Skippy's caps (fact 11).
- **Limiter store down:** fail closed (R8). The coach is a nice-to-have; spending credits blind is not.
- **Provider returns the seeker's own text rewritten as statements:** the drafting guard drops it, and if nothing survives the fallback shows (R5).
- **Prompt injection inside a reason or role title:** it is data in a delimited block (D-140). The only output channel is ≤3 validated questions shown to the same seeker. The coach has no tools and no actions. Do not add any to it.
- **Seeker edits the reasons after the questions arrive:** the questions stay until dismissed or until the next tap. They are never re-sent automatically.
- **Signed out:** the coach control explains "Sign in to use the coach" and sends nothing. The drawer's existing sign-in handoff is unchanged.
- **Offline:** the control is disabled with the existing offline wording pattern.
- **Preview rate limit (12 a minute per IP):** a 429 shows the manual fallback line, never an error that blocks Send.
- **Consent version bump:** the stored acknowledgement no longer matches, so the disclosure shows again before the next call.

## 9. Definition of done

- [ ] Every §7 test was red first and is green now; every control is green.
- [ ] Gate on your commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] Tier 1 rows (2, 3, 8): independent review passed (`docs/DELEGATION.md` §6); findings fixed red-first.
- [ ] Docs updated in the same push (D-068): your line in the Status section below (D-134), the `AGENTS.md` living-map row (row 3), and the `docs/DECISIONS.md` D-094 sync cell (row 8).
- [ ] UI rows: captures at 1280 and 390 from a clean browser (AGENTS.md rule 8), `node scripts/design-token-audit.mjs` green.
- [ ] Row 8 only: gate evidence for R9 (a) to (e) recorded here, live proof that the coach answers and falls back on production, and the flags on.

## 10. Review checklist (for the independent reviewer)

1. Show the exact outgoing provider request body from the row 3 test. Does it contain anything beyond R3's list? Any id, email, URL or resume reference fails the review.
2. With Forge env set, can any code path send coach text to a second provider? Show the test.
3. Search the coach code paths for `console.`, `captureServerError`, `Sentry` and `recordOperationalActivity`. Does any call receive reason text, prompt text, role title or provider output?
4. Is any coach output ever written into `reasons`, the note, the draft or the ask? Show the client test.
5. Do the caps fail closed, and is the global default 0?
6. Is the server consent check before every side effect (limiter, provider, activity)?
7. Is there any change to `TrustPrivacy.tsx`, `Terms.tsx`, money copy, `server/ai.ts` or `/api/smart-pitch`? There must be none.
8. Row 4: does `roleTitle` come only from bodies `fetchPublicJobLink` already returned, with no new fetch?

## 11. Stop and ask if

- A cited function no longer matches §3, especially `routeChat`'s fallback chain, `consumeDurableLimits`' result type, or `previewJobLink`'s fetch rule.
- You would need a migration, a new dependency, or an env key not named in §6.
- You need a file outside your row's `owns`. Examples: a `VITE_*` declaration in `.env.example` for row 6, or `server/sentry.ts` for a global scrubber.
- Any step would edit legal text, money copy, `server/ai.ts` or `/api/smart-pitch` (F-1). Report F-1 through the picker as "D-094: F-1 resume-to-model path without consent needs its own Tier 1 row" if no row exists yet.
- The provider actually configured is not the one the release row confirmed terms for. Then R9 (a) is not met: do not turn the flag on.
- A D-180 or D-093 decision lands that changes the vocabulary or the catalogue shape before your row lands: re-sync this packet first (D-202).

Write the question in your status line, push your branch, end the session.

## 12. Owner questions and proposals

**Already open, not re-asked here:** the final button name for the coach is `docs/BACKLOG.md` item 9 ("Owner picks the final button label"). The working name "Sharpen this" is used only until then, and release gate R9 (d) waits for it.

**Settled by the register, not asked:** the provider choice (D-204 (3): Azure OpenAI on credits, Bedrock fallback), paid spend (D-138/D-204 (2): none without the owner's yes plus a hard cap; this packet proposes none), the deferred items (D-094), and pre-approval to build (D-091).

**Questions only the owner can answer** (verbatim, for the weekly review, D-064):

- **Q-1.** "Is the Azure OpenAI deployment on the Microsoft for Startups credits created, with a hard stop and budget alert on that account, and are its no-training and data-retention terms confirmed for prompts that contain seeker-written text?" Default until answered: the coach stays off (R9 (a), (b)). Rating of turning the coach on without this: 1/10, because D-139 and D-204 (2) both forbid it.
- **Q-2.** "Do you approve adding notice wording to the Trust and privacy page that seeker-written reasons, the company name and the role title are sent to our AI provider when the seeker taps the coach and agrees, with no resume, name or email sent, and nothing stored by us? If yes, please give or approve the exact wording." Default: no legal text changes, and the coach stays off (R9 (c)). This is where H6 is decided. The in-drawer consent line (R2) is product copy, but it must not ship ahead of the notice. Rating of shipping on in-drawer consent alone: 3/10. It is consent at the moment of use, but it leaves the privacy notice contradicting what the product does.
- **Q-3.** "Should the existing smart-pitch endpoint, which sends a seeker's resume to a model and writes a draft for them with no consent step, be switched off until it has a consent gate, or kept and fixed?" Default recommendation: switch it off behind a flag in its own Tier 1 row (D-042 pattern: switched off, never deleted), because its client page is not routed. Rating 8/10: it closes a D-139 gap at almost no user cost, and the only argument against is losing a feature no live page offers. Until answered, nothing in this packet touches it.

**Proposed register entry (P-1, provisionally D-231; recheck the ID at registration):** "D-094 wave 1 architecture (decided under D-200 by a Claude session, D-225; changeable). The coach sends only the three reasons, the company name and the role title, after an explicit per-version consent tap. It calls one configured provider and never the legacy fallback, enforces durable per-user and global daily limits that fail closed with the global default off, logs no seeker text anywhere, and shows questions that are never inserted into the seeker's words. Auto-fill adds a role title from the already-fetched job page. Status help is a reviewed, keyed catalogue with no generation. Flags start off; the release row waits on the provider terms, the hard stop, owner-approved notice wording and the button label. Affects tasks: D-094-ai-in-ui (replaced by D-094.coach-contract, D-094.router-single-provider, D-094.coach-server, D-094.autofill-server, D-094.status-help-catalogue, D-094.drawer-ui, D-094.status-help-mount, D-094.release)."

**Recommendation for the CEO (D-032, not built unless accepted):** add a zero-cost, zero-egress pre-check before the model. Simple local rules ("no number in this reason", "this reason names a skill but no result") would show one question without calling the provider, and the model would be used only when the rules find nothing. Rating 7/10: it cuts provider calls and data sent, and works with no provider at all. Against it: D-094 (1) names "today's help line" as the fallback, so the rules would be an addition the register has not recorded, and rule-based questions can feel generic.

## Status

One line per row, `<id>: in progress — <who> — <date> — branch <b>` at start and `<id>: done — <sha>` when live (D-134).

- `D-094-ai-in-ui` (architect): packet written on `main` `722651103a56`, 2026-10-28; rows 1 to 8 await registration.
