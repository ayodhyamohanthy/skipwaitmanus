# Packet D-094-ai-in-ui: a seeker who opens the ask drawer can get coaching questions that make their three reasons sharper, the job link fills in the company and role, and My asks explains each status in plain words

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` row `D-094-ai-in-ui` (architect row, lane `ai`). This packet proposes subtask rows in §6 (D-223). Registering them is a separate registry change for the CEO or coordinator; this packet changes no registry. Status lives in those rows once registered, and in this packet's Status section only where rows share it (D-134) |
| Decisions | D-094 (implemented), D-091, D-138, D-139, D-140, D-204 (2)(3)(4), D-153, D-173/D-180 (vocabulary), D-077 (4), D-093 (catalogue, proposed and unbuilt), D-088 (fullstack), D-120/D-150 (goal UI), D-174 (no expiry promises), D-223 (splits), D-225 (roles). Binding text quoted in §2 |
| Risk tier | Row says 2. Split: the router, coach-server, status-help review and release rows are **Tier 1** (privacy: seeker-written text leaves skipwait.me for a third party; or money/trust copy), and the others are Tier 2 or 3 (§6) |
| Size | L, split into ten rows in §6 |
| Implementer | any model for the Tier 2/3 rows; the Tier 1 rows need an independent review by a model other than the builder (D-151). Under D-225 a Claude session revises this packet; other tools build it |
| Branch | each §6 row has its own `agent/<model>/<slug>` from the latest `origin/main` |
| Depends on | per row (§6), including the current owners of shared paths, named there |
| Do not run at the same time as | `D-048-p3-live-review-find` and `D-174-fix-post-binding` (own `client/src/pages/explore/**`, `AskDrawer.tsx`, `useAskComposer.tsx`); `D-099-bonus-line` (owns `client/src/pages/explore/`); `D-174-held-ask-reconfirm` (owns `client/src/pages/MyRequests.tsx` and `shared/moneyCopy.ts`); `D-180-a-free-asks-chip` (owns `shared/moneyCopy.ts`); `D-090-BYOR` (owns `.env.example`, `server/_core/index.ts`, `src/worker.ts`, `client/src/components/requests/requestsApi.ts`); `D-132-item3` and `D-099-bonus-pages` (own `server/_core/index.ts`, switch only) |
| Verified against | `main` `722651103a560324f8e7a66bfb188ac0123b1487` on 2026-10-28 (rechecked for round 2: main unchanged); newest register entry on that base D-229 (`syncedTo: D-229`) |

**Base and drift check.** For round 1, `git fetch origin main` gave `722651103a56`, and this branch's HEAD was the same commit. For round 2 the fetch gave the same commit again and the register's newest entry is still D-229. The newest register entry on main is D-229. D-230 appears only as a provisional ID on another seat's open branch, and no branch uses D-231 or higher. So the entry this packet proposes (§12, P-1) is provisionally **D-231**. Whoever writes the registration change must check main and every open branch again at that moment and take the next free ID.

**What this packet is.** Source findings and proposed tests only. It changes no runtime. **No test in this packet has been run for D-094.** The only executed checks it cites are the coordinator's two synthetic tests of the existing limiter (§3 fact 12). Those ran against unchanged source and touched no database, provider or billing, so they are not tests of the unbuilt coach.

---

## 1. Goal

Today the drawer's "Why me" asks for three reasons, up to 140 characters each, with one fixed help line: "One specific result beats a list of skills." A seeker who writes "I am passionate about data" gets no feedback before a verified employee reads it. D-094 wave 1 adds three aids, and none of them ever writes a fact for the seeker:

1. **Reasons coach.** A tap asks the model for up to three targeted questions about the seeker's own reasons ("What number shows the result of that migration?"). The questions are shown beside the fields. They are never inserted, never "applied" and never sent with the ask.
2. **Job-link auto-fill.** When the drawer has no company yet, pasting a link shows a confirm line with the company, the role title and whether the link matches the careers site. No model is involved; the existing SSRF-safe preview does the work.
3. **Plain-language status help in My asks.** A short "What this means" line per status, looked up from a keyed set of reviewed strings. There is no generation and no provider call.

How this serves the goal: a sharper request helps the referrer decide with confidence and gets people referred faster (the AGENTS.md compass test). Auto-fill removes a step. Status help removes "what does Waiting mean?" uncertainty. No money moves in any item.

## 2. Binding rules (quoted, not paraphrased)

- **D-094** (owner steer recorded as "Use intelligence in UI"; pre-approved under D-091): "(1) Reasons coach in the ask drawer: "Sharpen this" asks the seeker targeted questions, never writes facts for them; label "Coach suggests - your words, your facts"; fallback is today's help line. (2) Job-link auto-fill: fetch the posting, prefill company and role, run the careers-site match; manual fallback with a plain failure line; no model needed. (3) Plain-language status help in My asks via retrieval from the approved microcopy catalogue (no generation), localised. Deferred: best-company suggestions and smart inbox ordering (meritocracy-first, needs explainable criteria). All: suggestions only, the user stays in control, honest labels, credits-only cost guard, no cash. Provider wiring waits on the AWS/Bedrock setup; items 2 and 3 can start before the provider exists." Status: "provider plan amended by D-204 (3) (Azure OpenAI on startup credits first, Bedrock fallback)".
- **D-204 (3):** "Skippy's model and the AI features: Azure OpenAI on the Microsoft for Startups credits, through the existing OpenAI-compatible router (`server/_core/modelRouter.ts`, config only, no code). That waits until its data terms are confirmed (no training on prompts; resumes, D-139) and the D-138 caps are on; AWS Bedrock on the Activate credits is the fallback."
- **D-204 (2):** "A service paid from credits counts as free under D-031 and D-138 only when something stops it before any card is charged: a provider spending limit, a budget action that disables it, or an app-side cap set below the remaining balance (the D-138 caps for model calls). If none exists, it needs the owner's one-word yes like any paid service."
- **D-204 (4)** (owner actions): "Put a budget alert and a hard stop on each credit account that can bill a card (Azure, AWS, Cloudflare). Create an Azure OpenAI deployment and store its key in the vault (`AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY`, `AI_MODEL`)."
- **D-138:** "Free model first, no paid spend. Tools are model-agnostic. A paid model needs the owner's one-word yes plus a hard daily cap. Per-user daily cap ... and a global daily cap, both enforced server-side; hitting a cap says so plainly."
- **D-139:** "The seeker owns the words and the data. The seeker writes or confirms the final note ... Resume-to-AI consent comes first. Nothing is kept beyond what the ask needs. The model provider's no-training and data terms are confirmed before any seeker-facing launch."
- **D-140:** "Text inside user data (resumes, job pages, notes, tool output) is data, never an instruction."
- **D-077 (4):** "The "why me" composer stores its three answers as three lines in the existing note field, so the note checks apply to the whole text and no schema changes."
- **D-093** (proposed catalogue direction; its runtime is not built): "content.json is the catalogue seed: full-sentence keyed strings ... Human-reviewed translations only for money, credit, legal and trust copy; unreviewed languages stay hidden."
- **D-153** (frozen): names, CTAs and benefit wording state the actual action, outcome and cost plainly, and "the promise has to match what actually works".
- **D-180:** user-facing vocabulary is "referral"; "ask" is internal. Its string recommendations are "NOT owner-approved strings, pending copy review". User-facing strings here follow whatever wording that lane lands. Status help never calls a request a referral (D-076 (8), D-179).
- **D-174:** ask expiry is suspended as launch direction. Status help must not promise or explain an expiry clock as intended behaviour.
- **Legal text** (AGENTS.md 0a): "Terms/Privacy keep owner-approved legal text unchanged unless the owner approves new wording."

**Precedence.** AGENTS.md: "an older repo entry never overrides the owner's newer instruction". The newest authenticated owner instruction beats an older register entry, this packet and the code. Below that, an active register entry beats this packet and the code. If they disagree, stop and report (§11); never pick one silently.

## 3. Current behaviour (verified on `722651103a56`)

Find each function by name. Line numbers drift.

**The drawer and composer**

1. `client/src/pages/explore/AskDrawer.tsx` `AskDrawer` renders the job link, the resume picker, the "Why me" `fieldset` with three `GoalReasonInput`s, and the fixed help line "Three reasons, up to {WHY_ME_MAX} characters each. One specific result beats a list of skills." That line is "today's help line" (D-094 (1) fallback). The drawer is mounted by `client/src/pages/Explore.tsx` and `client/src/pages/ExploreCompany.tsx`.
2. `client/src/pages/explore/useAskComposer.tsx` owns `reasons` state, `MIN_WORDS = 10`, the send guidance, and `context` = company name plus `roleTitleFromUrl(url)` (`findModel.ts`, a URL-slug heuristic with no fetch). It sends `POST /api/company-referrals`.
3. `shared/whyMe.ts`: `WHY_ME_MAX = 140`, `composeWhyMe`, `splitWhyMe`, `overLimitReasons`.
4. `client/src/pages/explore/findModel.ts` `linkHint`: with no company it says "We’ll confirm the employer when you send." It does not call the server.

**Job-link preview (item 2's engine, already built): actual limits**

5. `server/jobLinkPreviewRoutes.ts` `registerJobLinkPreviewRoutes` exposes `POST /api/job-link/preview` with these limits, read from source:
   - **No authentication.** Signed-out callers are served.
   - Body at most 8 KB (413 otherwise). The URL must be at most 4096 characters and pass `isValidTargetRoleUrl` (400 otherwise).
   - **12 calls per 60 s per `req.ip`**, held in a process-memory `Map`. Each container counts on its own, and the count resets on restart. The map is pruned at 5000 entries. Over the limit it answers 429 with `Retry-After`.
   - The answer is `Cache-Control: public, max-age=120` when `fresh`, `max-age=15` otherwise; a thrown error answers `no-store` 400.
   - Registered in `server/_core/index.ts`.
6. `server/jobLinkPreview.ts`:
   - `previewJobLink` returns `JobLinkPreview` = `{ canonicalUrl, status, employerConfidence, companyDomain?, companyName?, reason, recoveryAction }`. There is **no role title**.
   - It fetches the page only for direct-domain and public Greenhouse links, and only to prove the page is reachable; the body is discarded.
   - Results are cached in process memory by canonical URL: 120 s when fresh, 15 s otherwise.
   - `fetchPublicJobLink` is the safe fetcher: pinned DNS with a public-address check, `redirect: "manual"`, at most 8 redirects, a 5 s timeout per hop, a body cap of 512,000 bytes (an empty body beyond that), and a hosted-platform redirect rule.
7. The preview is used by `client/src/pages/goal/start/GoalStart.tsx` and `client/src/pages/Onboarding.tsx`, not by the ask drawer. Both guard against stale answers: a `requestId` ref, plus a check that `payload.canonicalUrl` equals the expected canonical URL.

**Model access**

8. `server/_core/modelRouter.ts` `routeChat({ system, user, maxTokens?, fallback })`:
   - **Configured path.** When the three `AI_*` env keys are set, it POSTs to `${AI_PROVIDER_BASE_URL}/chat/completions` (30 s timeout, temperature 0.4, `max_tokens` default 700).
   - **Logging.** On a non-OK answer it `console.warn`s the status **and the first 160 characters of the response body**. Its `catch` `console.warn`s **`error.message` (first 160 characters)**. A response that is OK but malformed (no string content) falls through with no log.
   - **Legacy path.** If the configured path fails or is not configured and the legacy Forge env (`BUILT_IN_FORGE_API_URL`/`_KEY`, `server/_core/env.ts`) is set, it sends the same messages to a second provider through `server/_core/llm.ts` `invokeLLM`. That path's `catch` also `console.warn`s `error.message`.
   - Otherwise it returns `fallback`.
9. `.env.example` declares `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY` and `AI_MODEL` (blank), and `src/worker.ts` forwards them. This repo cannot show whether production sets them, or which endpoint, model or prices apply. D-204 (4) lists the deployment as an open owner action, and `docs/SKIPPY.md` still has "Confirm the model provider's data terms" unticked.

**Logging and Sentry: no blanket scrubbing, and the sink analysis is open**

10. `server/sentry.ts` `initServerSentry` calls `Sentry.init({ dsn, release, environment, tracesSampleRate: 0.1 })`. It sets **no `beforeSend`, no `beforeBreadcrumb` and no integration overrides**. `scrubSentryPath` covers only the request path that `sentryErrorMiddleware` attaches. So "Sentry scrubs everything" is false.
    - With `@sentry/node` 10's default integrations, console output and outgoing HTTP activity can be attached to error events and traces.
    - Whether the default outgoing-HTTP instrumentation can carry request bodies, headers or URLs to Sentry is part of the coordinator's open **H2** sink analysis. This packet does not settle it.
    - A spy on the coach's own logging cannot prove what that instrumentation sends. No active incident is inferred from this.

**The existing durable limiter**

11. `server/skippieSeekerRoutes.ts` `underCaps` enforces Skippy's caps in process memory. They reset on restart and count per container, so they do not meet D-204 (2).
12. `server/_core/durableRateLimit.ts` `consumeDurableLimits(limits, { store?, now? })` is the durable fixed-window limiter (MySQL `workEmailOtpRateLimits`, transactional; tests use `createMemoryDurableLimitStore` from `server/_core/memoryDurableLimitStore.ts`). Behaviour, from source and confirmed by the coordinator's two synthetic tests:
    - **The first hit in a window is always allowed, whatever the limit.** `insertWindow` succeeding means `continue`, and `limit.limit` is never compared on that path. With `limit` 0, -1 or NaN, the first call returns `allowed: true`.
    - **A thrown store or transaction error propagates.** Only `DurableLimitExceeded` is caught.
    - **No store** (no DB) returns `{ allowed: false, reason: "unavailable" }`.
    - A full bucket throws inside the transaction, so the other buckets' hits roll back (all or nothing).
    - A fixed window resets at its boundary.

    The limiter is shared with the auth surface. This packet does not change it (§5 out of scope). The coach must guard around it (R8).
13. `server/db.ts` `recordOperationalActivity` writes the operational activity log, which existing routes use for audit (for example `smart_pitch.drafted`).

**Privacy notice**

14. `client/src/pages/TrustPrivacy.tsx` names Chargebee, Razorpay and PayPal for payments. It does **not** mention an AI or model provider, or any seeker text sent to one. The coordinator reports an unresolved finding, **H6**, on whether the notice covers sending resumes to the AI provider. H6 has no text on main, so this packet does not quote it. It grants no authorization around H6 and edits no legal text (§4 R9).

**An existing model path this packet does not touch (finding F-1, report only)**

15. `server/privateReferralRoutes.ts` registers `POST /api/smart-pitch` (signed-in only).
    - It passes a signed URL to the seeker's uploaded resume PDF to `server/ai.ts` `draftSmartReferralPitch`. That function calls `invokeLLM` directly and returns a drafted pitch. The source has no consent check.
    - Its only client caller in source, `client/src/pages/ReferralRequest.tsx`, is not routed in `client/src/App.tsx`.
    - **The route being registered in source is not proof that it is invoked in production**, and this packet infers no authority to switch it off. It is reported so that the CEO or coordinator can scope it. The coach sends no resume and never calls `invokeLLM` or `server/ai.ts`.

**My asks (item 3's mount)**

16. `client/src/components/requests/askView.ts` `askView` maps status to label, dot and stepper. `requestModel.ts` `requestNote` writes each row's second line, including `held_for_credit` and `waiting_for_coverage`. `RequestRow.tsx` renders it.
17. No microcopy catalogue exists. `design/goal-ui/content.json` is a design deck ("Design-review preview only. Sample data, never product data"). D-093's catalogue is proposed and unbuilt: `D-093-language` is still an architect row, and no source-hash or catalogue runtime exists on main. So nothing here can claim to be compatible with it.

## 4. Target behaviour

**Reasons coach (item 1)**

- **R1 Entry.** Below the three reasons sits a quiet secondary control. Its label is the owner's pick (`docs/BACKLOG.md` item 9); until then it uses the register's working name, "Sharpen this". It is never black, because Send stays the drawer's one black commit (D-150). It is enabled only when the seeker is signed in, online, and at least one reason has 3 or more words.
- **R2 Consent: explicit acknowledgement, not proof of reading.**
  - **Client.** The first tap shows an inline disclosure in the drawer with the exact text below and two buttons, "Send to the coach" and "Not now". Only the explicit button sends anything. "Not now" makes no network call. The client remembers the acknowledged version in `localStorage` (try/catch). That memory only decides whether to show the disclosure again; a different stored version means it shows again. No server state is inferred from `localStorage`.
  - **Server.** Every call must carry `ack: { scope: "reasons_coach", version: REASONS_COACH_CONSENT_VERSION }` from a signed-in account. A missing ack, the wrong scope or a stale version gets 400 `consent_required`, before any limiter, provider or activity side effect. The ack is bound to the request's resolved account, the current version and this one scope; it authorises nothing else.
  - **What the server check can and cannot prove.** It enforces that the caller explicitly acknowledged the current version. It does **not** prove that a person saw the disclosure: a script can forge the field.
  - **Proposed disclosure text** (draft for copy and privacy review; not approved; must not ship before the notice in R9 (c)): "The coach reads your three reasons, the company name and the role title, and sends them to our AI provider to suggest questions. Email addresses, phone numbers, web links and @handles are removed first. Anything else you wrote, including names, is sent as you wrote it. Your resume, your account details and the job link are not sent. skipwait.me doesn't save the text or the questions. The coach only asks questions; it never changes your reasons."
- **R3 Data sent to the provider (exhaustive) and the exact redaction set.**
  - **Message.** One fixed system prompt (in code) and one user message built only from three fields: the three reasons after `clean` (each at most 140 characters), the company display name (the directory's public name, or the preview's `companyName`, or nothing), and the role title (R12, at most 120 characters, or nothing). `max_tokens` is 200.
  - **Redaction**, applied to **all three fields** before the length cap. Each match becomes `[removed]`:
    - (a) email-like `local@domain` tokens;
    - (b) URL-like tokens: a scheme (`http://`, `https://`), a `www.` prefix, or `label.tld/…` with a path;
    - (c) `@handle` tokens;
    - (d) phone-like runs: 8 or more digits, allowing separators (spaces, `-`, `.`, `(`, `)`, `+`).
  - **What redaction does not do.** It is a bounded set. It does **not** remove personal names, employer names, places or any other free text, and the coach does not claim anonymity.
  - **Never sent:** user id, account name or email, resume or attachment, the job URL or query string, IP, and prior messages.
  - A unit test asserts the exact request body and each redaction class.
- **R4 One provider, never two.** The coach calls only the configured `AI_PROVIDER_*` endpoint and never the Forge/`invokeLLM` path. `routeChat` gains `legacyFallback?: boolean` (default `true`, so existing callers are unchanged), and the coach passes `false`. The coach makes **no retries**.
- **R5 Output contract.**
  - The model must return JSON `{ "questions": string[] }`, parsed by Zod: 1 to 3 items, each trimmed, 8 to 140 characters, ending "?", with no URL, email or line break.
  - A drafting guard drops any item that repeats 6 or more consecutive words from the reasons, or that starts with a first-person claim ("I ", "I'm", "My ").
  - Invalid items are dropped. If none survive, the answer is the fallback.
  - The reasons and role title sit in a delimited data block, and the system prompt treats them as data (D-140).
  - No control copies a question into a reason.
- **R6 Display.** The questions appear in a hairline panel under the reasons, with the register label "Coach suggests - your words, your facts", a dismiss control, and "The coach only asks questions. Nothing is added to your reasons." They do not change `reasons`, the composed note, the word count, Send's state, `saveAskPrefill` or the remote draft. Closing the drawer drops them.
- **R7 Fallback, and no raw data in any log.**
  - **What the seeker sees.** On flag off, unconfigured, invalid limit config, cap reached, limiter error, timeout (8 s), invalid output or network failure, the panel shows today's help line plus one plain reason: "The coach isn't available right now", or at a cap "You've used today's coach questions. They reset tomorrow." (D-138).
  - **What the server answers.** `200 { questions: [], fallback: "<code>" }`.
  - **What may be logged.** On the coach path, nothing sent to the console, Sentry or the activity log may contain reasons, prompt text, role title, company text, provider response text or `error.message`. That covers four branches:
    - (i) the provider non-OK branch: status code only;
    - (ii) the exception branch: `error.name` and a fixed code only, never `message`;
    - (iii) the HTTP-OK-but-unparseable branch: a fixed code only;
    - (iv) the legacy path, which the coach disables (R4). Its existing `message` log stays as it is for other callers; the router row changes only (i) and (ii) for every caller.
  - **What this does not cover.** This rule governs explicit logging only. Whether Sentry's default outgoing-HTTP instrumentation carries request content is the open H2 question, and release gate R9 (f) waits on it.
- **R8 Cost guard: a currency bound, not a call count.**
  - **(a) Config validation before the limiter.** The limit values are parsed as integers. A missing, non-numeric, non-finite, zero, negative or fractional value turns the coach **off** (`fallback: "off"`) **before** `consumeDurableLimits` is called, because that limiter allows the first hit at any limit (fact 12).
  - **(b) Fail closed on any limiter error.** The `consumeDurableLimits` call is wrapped, so a thrown error or `unavailable` means fallback and no provider call.
  - **(c) Limits.** Durable per-account daily (`REASONS_COACH_USER_DAILY_LIMIT`), global daily (`REASONS_COACH_GLOBAL_DAILY_LIMIT`) and global 30-day (`REASONS_COACH_GLOBAL_PERIOD_LIMIT`), consumed in one all-or-nothing call before the provider call. No defaults ship. Unset or invalid means off, which is safe **only while off**.
  - **(d) A call count is not a spend bound.** The release row (row 10) may set values only after it records, with evidence:
    - the approved endpoint's and model's actual input and output unit prices;
    - the worst-case cost of one call: max input tokens (system prompt plus three 140-character reasons, company and role at their caps) at the input price, plus 200 output tokens at the output price, with zero retries;
    - concurrency: the atomic limiter bounds total calls, not calls in flight, so in-flight calls can never exceed the remaining count;
    - every other workload that bills the same credit account (Skippy, the legacy smart-pitch path if it reaches that account, anything else on it);
    - the credit expiry date and the remaining balance.

    Daily and 30-day windows reset, so the values must keep the coach's worst-case cost for every remaining window until credit expiry, plus every other workload's worst case, below the remaining balance.
  - **(e) No card bill.** Activation further requires an **independently evidenced** mechanism, under the account's current terms, that stops the provider before any card is charged (D-204 (2)). An app-side cap alone does not satisfy that while other workloads share the account.
  - **(f) Nothing is approved here.** This packet approves no spend and infers no approval. No paid tier or paid fallback exists. Seekers are charged nothing, and no credit, referral or ledger row moves.
- **R9 Release gates (no flag on until all hold).** `REASONS_COACH_ENABLED` and `VITE_REASONS_COACH` default to off. The release row may switch them on only after:
  - (a) the actually configured provider's no-training and retention terms are confirmed by research into the account, config and terms (D-139, D-204 (3));
  - (b) R8 (d) and (e) are evidenced;
  - (c) the owner has decided on notice wording that covers seeker-written text sent to an AI provider. Today's notice does not cover it (fact 14); H6 is decided there, and this packet writes no legal text;
  - (d) the owner's button label (BACKLOG item 9);
  - (e) live proof (AGENTS.md rule 8);
  - (f) the H2 sink analysis shows the coach's outgoing request content does not reach Sentry, or the fix it names has landed.
- **R10 Audit only; no new analytics.** The coach route writes one operational activity row per call (`reasons_coach.requested`, outcome, metadata `{ result, code?, count, ackVersion }`), with no text, matching existing route audit. **Funnel analytics, including any "coach used then sent" signal on the ask, is out of scope.** It would change the ask request body and the activity sink outside these rows, and D-087 grants no new analytics permission. Any funnel needs its own decision and row.

**Job-link auto-fill (item 2, no model)**

- **R11 Drawer with no company.**
  - **When it runs.** When `company` is null and the link passes `isValidTargetRoleUrl`, the drawer calls `POST /api/job-link/preview` on blur, debounced 450 ms.
  - **Stale-answer guard.** It uses a `requestId` ref and an `AbortController` per request, as `GoalStart.tsx` does. An answer is applied only if its `requestId` is current **and** `payload.canonicalUrl` equals the canonical form of the field's value at that moment. Editing the URL aborts the request in flight and clears the shown preview.
  - **What it shows.** A confirm line with the company name (a verified mark only when `employerConfidence` is `verified`), the role title when present, and "From the job page - check it's right".
  - **Failures.**
    - `ambiguous` or `unreachable`: the preview's `reason` plus "You can still send it; we'll confirm the employer when you send".
    - 429: the same manual line.
    - Network error: "We couldn't check this link. You can still send it."
  - **Unchanged.** With a company chosen, `linkHint` is unchanged.
- **R12 Role title (untrusted third-party text).** `previewJobLink` adds an optional `roleTitle`, taken only from a body `fetchPublicJobLink` already fetched. No new fetch, host or cache key.
  - **Source order:** JSON-LD `JobPosting.title` (top-level, array or `@graph`; malformed JSON ignored), then `og:title`, then `<title>`.
  - **Sanitising:** entity-decode; strip tags; remove control and bidi-override characters; collapse whitespace; cap at 120 characters.
  - **Dropped when:** empty, under 3 characters, or equal to the company name.
  - **Use:** rendered as text only and treated as data (D-140). The `JobLinkPreview` extension is additive. The drawer's `context` prefers `roleTitle` over `roleTitleFromUrl`.
- **R13 Prefill is display only.** Auto-fill adds nothing to the ask. The server resolves the employer at send exactly as today.
- **R14 Signed-out privacy boundary.**
  - **What is sent.** The preview is already unauthenticated (fact 5). Signed out, the drawer sends only the pasted URL to skipwait.me. The employer's server sees skipwait.me's fetch, not the seeker's. Nothing is tied to an account.
  - **What is kept.** The server keeps only its existing in-memory cache by canonical URL (120 s or 15 s) and its per-IP counter.
  - **What never happens signed out.** No coach call; the coach is signed-in only. No reasons are sent anywhere.
  - **Query strings.** The URL, including any query string the seeker pasted, reaches skipwait.me as today. Auto-fill must not add it to any log or activity row.

**Status help (item 3, retrieval, no model)**

- **R15 Shape, independent of D-093.**
  - **Shape.** `shared/statusHelp.ts` exports `STATUS_HELP: Readonly<Record<StatusHelpKey, { en: string }>>`, containing **only entries that have passed review** (R16), and `statusHelp(request): string | null` (an exact lookup, never generated or concatenated). Keys cover the `askView` labels and the pending sub-states `requestNote` shows. A key with no reviewed entry renders nothing.
  - **No compatibility claim.** This shape needs nothing from D-093. When a D-093 catalogue lands, a later reviewed adapter row maps these keys into it. No compatibility is claimed now, and nothing here builds, forces or adopts D-093.
  - **Languages.** English only until that adapter exists. Unreviewed languages stay hidden (D-093).
- **R16 Content rules and review.**
  - **Content.** Each line says what the state means and what the seeker can do, in the current vocabulary (D-180 lane). It never calls a request a referral before `intro_made` (D-076 (8)). It never names a time limit D-174 suspends; the D-038 windows appear only if review confirms they are live. It never promises an outcome (D-153).
  - **Review.** Money or credit states (`held_for_credit`) reuse `shared/moneyCopy.ts` phrases byte-for-byte and need human and money-domain review. Trust or privacy lines need human review. Draft strings live in a docs file (row 5), never in shipped code. Only reviewed strings, with recorded reviewer evidence, enter `shared/statusHelp.ts` (row 6, Tier 1).
- **R17 Display.** In each My asks row, a quiet "What this means" native `<details>`/`<summary>` shows the line. It is not added to the conversation header in wave 1.

**Deferred (unchanged from D-094):** best-company suggestions and smart inbox ordering. No row is proposed for them.

## 5. Files

Each §6 row lists its own `owns`. Read only: `server/_core/durableRateLimit.ts`, `server/_core/memoryDurableLimitStore.ts`, `server/db.ts` (`recordOperationalActivity`), `server/sentry.ts`, `server/skippieSeekerRoutes.ts`, `shared/whyMe.ts`, `shared/moneyCopy.ts`, `client/src/components/requests/askView.ts`, `requestModel.ts`, `client/src/pages/goal/start/GoalStart.tsx`, `client/src/pages/TrustPrivacy.tsx`, `design/goal-ui/content.json`, `DESIGN.md`.

**Out of scope (never edit here):**
- `server/_core/durableRateLimit.ts`: the coach guards around it. A limiter-hardening change would be its own row affecting the auth surface; the CEO or coordinator decides that.
- `TrustPrivacy.tsx`, `Terms.tsx` and all legal text.
- `server/ai.ts`, `/api/smart-pitch` and `server/_core/llm.ts` (F-1).
- `server/sentry.ts` (H2 is its own analysis).
- `shared/whyMe.ts` and the note format.
- `shared/moneyCopy.ts` and every money, credit or ledger file.
- The ask request body and `POST /api/company-referrals` (R10).
- `server/skippie*`.
- `drizzle/**`: no migration.

## 6. Steps (one row each, D-223)

Each row lands by itself on green required CI, with behaviour preserved or behind a switch that starts off. These are proposals; registration is not done here.

| # | Row id | Tier | Owns | Depends on | Outcome |
|---|---|---|---|---|---|
| 1 | `D-094.coach-contract` | 2 | `shared/reasonsCoach.ts`, `shared/reasonsCoach.test.ts` | none | Zod request schema incl. `ack`; `REASONS_COACH_CONSENT_VERSION`; `buildCoachMessage` (R3 incl. all four redaction classes on all three fields); `parseCoachQuestions` (R5); `parseCoachLimits` (R8 (a)); fallback codes. Pure, no I/O |
| 2 | `D-094.router-single-provider` | 1 | `server/_core/modelRouter.ts`, `server/_core/modelRouter.test.ts` | none | `legacyFallback?` (default `true`) and `timeoutMs?` (default 30 000). The non-OK branch logs the status only; the configured-path exception branch logs `error.name` only. Existing callers behave the same apart from the shorter log lines |
| 3 | `D-094.coach-wiring` | 2 | `.env.example`, `src/worker.ts`, `server/_core/index.ts`, `server/configContract.test.ts` | `D-090-BYOR` (current owner of all three runtime files), `D-132-item3` and `D-099-bonus-pages` (own `index.ts`, switch only); `filesBusy` serialises them, and this row waits rather than editing beside them | Declares `REASONS_COACH_ENABLED`, `REASONS_COACH_USER_DAILY_LIMIT`, `REASONS_COACH_GLOBAL_DAILY_LIMIT`, `REASONS_COACH_GLOBAL_PERIOD_LIMIT`, `VITE_REASONS_COACH=false` and `VITE_JOB_LINK_AUTOFILL=false`, all blank or off. Forwards the server keys in `src/worker.ts`. Adds one registration line in `index.ts` for row 4's route, guarded so it 404s when off. The config-contract test is red before the declarations |
| 4 | `D-094.coach-server` | 1 | `server/reasonsCoachRoutes.ts`, `server/reasonsCoachRoutes.test.ts`, `AGENTS.md` (living-map row only) | 1, 2 | `POST /api/ai/reasons-coach`. Order: flag off → 404; signed out → 401; Zod plus `ack` → 400 `consent_required`; `parseCoachLimits` invalid → `off`; wrapped `consumeDurableLimits` (fail closed); `routeChat({ legacyFallback: false, timeoutMs: 8000, maxTokens: 200 })`; `parseCoachQuestions`. `private, no-store`. R7 logging, R10 audit row. Registered by row 3 |
| 5 | `D-094.status-help-draft` | 3 | `docs/plans/D-094-status-help-copy.md` | none | Draft English lines per key, marked draft, for review. Docs only; ships nothing |
| 6 | `D-094.status-help-catalogue` | 1 | `shared/statusHelp.ts`, `shared/statusHelp.test.ts` | 5, and human plus money-domain review of row 5's lines | Encodes only reviewed lines with reviewer evidence in the PR (R15, R16). Money lines byte-equal to `shared/moneyCopy.ts`, read only |
| 7 | `D-094.autofill-server` | 2 | `server/jobLinkPreview.ts`, `server/jobLinkPreview.test.ts` | none | Additive `roleTitle` (R12) |
| 8 | `D-094.drawer-ui` | 2 | `client/src/components/ask/ReasonsCoach.tsx`, `client/src/components/ask/reasonsCoach.test.tsx`, `client/src/components/ask/reasonsCoachApi.ts`, `client/src/components/ask/JobLinkConfirm.tsx`, `client/src/components/ask/jobLinkConfirm.test.tsx`, `client/src/pages/explore/AskDrawer.tsx`, `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/exploreDrawer.test.tsx` | 1, 3 (its `VITE_*` declarations), 4, 7, `D-048-p3-live-review-find`, `D-174-fix-post-binding` | R1, R2 client, R6, R7 client behind `VITE_REASONS_COACH`; R11, R13, R14 behind `VITE_JOB_LINK_AUTOFILL`. No env or config edits (row 3 owns them). Captures at 1280 and 390 |
| 9 | `D-094.status-help-mount` | 2 | `client/src/components/requests/RequestRow.tsx`, `client/src/components/requests/statusHelp.test.tsx` | 6, `D-174-held-ask-reconfirm` | R17. Captures at 1280 and 390 |
| 10 | `D-094.release` | 1 | `docs/plans/D-094-ai-in-ui.md` (gate evidence), `docs/DECISIONS.md` (D-094 sync cell) | 3, 4, 8, 9, and R9 (a) to (f) | Records the gate evidence (R8 (d) and (e) cost bound; terms research; H2 outcome; owner decisions). The operator sets the limits and flags, then live proof. Flags are switched, never deleted |

## 7. Tests to write first (proposed; none run for D-094)

**Row 1, `shared/reasonsCoach.test.ts`:**
- `buildCoachMessage` output equals the exact expected `{ system, user }`. Each redaction class (email, URL in all three forms, `@handle`, phone with separators) is removed from **each** of the three fields. A personal name is **kept**; the test documents that no anonymity is claimed. The length caps apply after redaction.
- `parseCoachQuestions` cases (R5): a copy of 6 or more words, a first-person start, a non-question, over length, a URL, non-JSON, more than 3 items.
- `parseCoachLimits` turns these into "off": `"0"`, `"-1"`, `"NaN"`, `"1.5"`, `""`, `"abc"`, `"Infinity"`, unset.
- The schema rejects unknown fields, a missing or wrong `ack.scope`, and a stale `ack.version`.

**Row 2, `modelRouter.test.ts`:**
- `legacyFallback: false` with Forge env set and `AI_*` unset makes no request and returns the fallback.
- A planted marker in a non-OK response body is absent from every `console.*` argument.
- A planted marker in a thrown `error.message` on the configured path is absent from every `console.*` argument.
- An OK response with malformed JSON returns the fallback and logs no body.
- **Controls:** existing cases stay green, and default callers still reach the legacy path.

**Row 3:** `configContract.test.ts` is red until the six keys are declared and the server keys forwarded.

**Row 4, `server/reasonsCoachRoutes.test.ts`, against the real seam.** These tests call the real `consumeDurableLimits` with `createMemoryDurableLimitStore()`, not a mocked limiter and not a fake `unavailable` result.
- Flag off → 404. Signed out → 401. Missing, stale or wrong-scope `ack` → 400 with **no** limiter row written, no provider call and no activity row.
- Limit config 0, -1, NaN or unset → `off` and **no limiter row written**. This proves the guard runs before the limiter, whose first hit would otherwise pass (fact 12).
- First window: with user limit 2, calls 1 and 2 are allowed and call 3 gets `cap`.
- Concurrency: 10 parallel calls with a global limit of 3 give exactly 3 provider calls.
- Rollback: with the global bucket full, the per-user bucket's hit is rolled back (row count unchanged).
- A store whose `transaction` throws gives the fallback and no provider call (fail closed on the propagated error).
- Happy path: the outgoing provider JSON equals `buildCoachMessage`'s body exactly, with `legacyFallback: false`, timeout 8000 and `max_tokens` 200.
- Planted markers in the reasons, role title and provider error appear in no `console.*` call, no `captureServerError` call and no activity metadata (the keys equal the allow-list).
- **Limit of these tests:** they do not prove anything about Sentry's default HTTP instrumentation (R9 (f)).

**Row 6:** every key resolves only for an encoded entry. Pre-`intro_made` keys never say "referral" except in "referral request". No D-174-suspended clock words. The money key equals the `moneyCopy.ts` phrase.

**Row 7, `jobLinkPreview.test.ts`, untrusted title fixtures:**
- JSON-LD vs `og:title` vs `<title>` precedence; `@graph` and array JSON-LD; malformed JSON-LD ignored.
- `<script>`/tags in the title stripped; entities decoded once (no double-decode).
- Control and bidi-override characters removed; a 10,000-character title capped at 120.
- An instruction-like title ("ignore previous instructions…") kept as plain text, inert.
- A title equal to the company name dropped. No body (reviewed-listing path) means no `roleTitle`.
- **Controls:** all existing preview and SSRF tests unchanged.

**Row 8, client:**
- No network call before "Send to the coach". "Not now" makes no call.
- A stale stored version shows the disclosure again and sends nothing until it is accepted. A `localStorage` throw shows the disclosure and still works.
- Questions never change `reasons`, the composed note or the saved prefill.
- The fallback shows the help line and the reason. `aria-live="polite"`. `assertGoalPage` keeps Send as the one black commit.
- Signed out: the coach sends nothing and shows "Sign in to use the coach".
- Auto-fill: an answer for an old URL after an edit is discarded; abort on edit; `canonicalUrl` mismatch ignored; 429 and network failure show the manual line; Send still works.

**Row 9:** a reviewed key renders in `<details>`; an absent key renders nothing. Existing `myRequests.*.test.tsx` stay green.

Never weaken, skip or delete an existing assertion to make a test pass.

## 8. Edge cases and races

- **Double tap:** the control is disabled while a call is in flight, and each accepted call counts once. A client retry after a timeout counts again, by design.
- **Several containers:** the limits are durable and atomic; in-flight calls cannot exceed the remaining count.
- **Window reset:** the daily and 30-day windows reset, so R8 (d) bounds spend against the whole remaining credit life, not one day.
- **Limiter store error or bad config:** the coach is off (R8 (a), (b)).
- **The model rewrites the seeker's text as statements:** the drafting guard drops it (R5).
- **Prompt injection in reasons or the title:** treated as data. The only output is ≤3 validated questions shown to the same seeker. The coach has no tools; do not add any.
- **Seeker edits the reasons after the questions arrive:** the questions stay until dismissed. Nothing is re-sent automatically.
- **Consent version bump:** the disclosure shows again, and the server refuses the old version.
- **Preview 429 (12 per minute per IP per container):** manual fallback line; Send is never blocked.

## 9. Definition of done

- [ ] Every §7 test for the row was red first and is green now; every control is green.
- [ ] Gate on your commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] Tier 1 rows (2, 4, 6, 10): independent review passed (`docs/DELEGATION.md` §6); findings fixed red-first.
- [ ] Docs in the same push (D-068): your Status line below, the `AGENTS.md` living-map row (row 4), the `docs/DECISIONS.md` sync cell (row 10).
- [ ] UI rows: captures at 1280 and 390 from a clean browser, `node scripts/design-token-audit.mjs` green.
- [ ] Row 10 only: R9 (a) to (f) evidence recorded here, live proof of answer and fallback, then the flags on.

## 10. Review checklist (for the independent reviewer)

1. Show the exact outgoing provider body from the row 4 test. Is there anything beyond R3's fields? Is each of the four redaction classes applied to each field? Does any copy claim anonymity?
2. With Forge env set, can coach text reach a second provider?
3. In the coach path, does any `console.*`, `captureServerError` or activity call receive reasons, prompt, role, company text, provider body or `error.message`, across all four R7 branches?
4. Are bad limit configs rejected before `consumeDurableLimits` runs, and does a thrown limiter error give no provider call? Were these tested against the real limiter with the memory store, not a mock?
5. Is the server `ack` check before every side effect, and does any doc or copy claim it proves the disclosure was seen?
6. Is any coach output written into `reasons`, the note, the draft or the ask? Is the ask body unchanged?
7. Was any of these edited: legal text, `moneyCopy.ts`, `durableRateLimit.ts`, `server/ai.ts`, `/api/smart-pitch`, `sentry.ts`? (None should be.)
8. Row 7: does `roleTitle` come only from bodies already fetched, and do the hostile-title fixtures pass?
9. Row 10: do the recorded unit prices, worst case, shared workloads, expiry and balance justify the values set, and is the no-card-bill mechanism independently evidenced?

## 11. Stop and ask if

- A cited function no longer matches §3, especially `routeChat`'s branches, `consumeDurableLimits`' first-hit and throw behaviour, or the preview's fetch rule and limits.
- You need a migration, a dependency, an env key not named in row 3, or a file outside your row's `owns`.
- Any step would edit legal text, money copy, the shared limiter, `server/ai.ts`, `/api/smart-pitch`, `sentry.ts` or the ask request body.
- The configured provider differs from the one whose terms row 10 confirmed.
- Another workload shares the credit account and its worst case is unknown.
- A newer owner instruction, or a D-180, D-093 or D-174 decision, changes vocabulary, the catalogue or the clocks: re-sync first (D-202).

Write the question in your status line, push your branch, end the session.

## 12. Open items (no owner questions yet)

**No owner questions are raised by this packet now.**
- **Settled by the register, not asked:** the provider choice (D-204 (3)), no paid spend without the owner's yes and a hard stop (D-138, D-204 (2)), the deferred items (D-094) and pre-approval to build (D-091).
- **Already open in the owner backlog:** the coach button label (`docs/BACKLOG.md` item 9). It is not re-asked here.

**Research to do before anything goes to the owner** (for a session with access to the account and config; the repo cannot answer these):
- **RS-1, provider technical checklist.** Which endpoint and model are configured. Their unit prices. The no-training and retention terms for prompts. The credit balance and expiry. Which other workloads bill the same account. Whether an independently evidenced no-card-bill stop exists under the current account terms. Answered from account, config and terms research, not asked of the owner.
- **RS-2, notice scope.** Once RS-1 and the H2 sink analysis are done, set out exactly what the coach sends and where it goes, compared with today's Trust and privacy page. Only then does notice wording become an owner decision (R9 (c), H6).
- **RS-3, smart-pitch (F-1).** Establish whether `/api/smart-pitch` is actually invoked in production (logs or activity rows `smart_pitch.drafted`) and which provider it reaches. Only after that scope does its behaviour become an owner or CEO decision. Nothing here authorises a switch-off.

**Proposed register entry (P-1, provisionally D-231; recheck the ID at registration; not self-adopted):** "D-094 wave 1 architecture (proposed by a Claude session under D-225; changeable). The coach sends only the three reasons, the company name and the role title, after a bounded redaction (emails, URLs, @handles, phone-like digit runs; names are not removed and no anonymity is claimed) and an explicit, versioned, account-bound acknowledgement that the server enforces but that does not prove the disclosure was read. It calls one configured provider, never the legacy fallback, with no retries. It rejects invalid limit config before the shared limiter and fails closed on any limiter error. It logs no seeker text or provider error text. Activation requires a currency bound recorded from actual unit prices, worst-case tokens, all workloads sharing the account, credit expiry and balance, plus an independently evidenced no-card-bill stop, provider terms research, the H2 sink outcome and an owner decision on notice wording. Auto-fill adds a sanitised role title from the already-fetched page, guarded against stale answers. Status help ships only reviewed strings, in a shape independent of D-093. No funnel analytics. Affects tasks: D-094-ai-in-ui (replaced by D-094.coach-contract, D-094.router-single-provider, D-094.coach-wiring, D-094.coach-server, D-094.status-help-draft, D-094.status-help-catalogue, D-094.autofill-server, D-094.drawer-ui, D-094.status-help-mount, D-094.release)."

**Recommendation for the CEO (D-032; not built unless accepted):** a zero-cost, zero-egress pre-check before the model. Local rules such as "no number in this reason" would show one question without a provider call. Rating 7/10: fewer calls and less data sent. Against it: D-094 (1) names today's help line as the fallback, so the rules would be an unrecorded addition, and rule-based questions can feel generic.

## Status

One line per row, `<id>: in progress — <who> — <date> — branch <b>` at start and `<id>: done — <sha>` when live (D-134).

- `D-094-ai-in-ui` (architect): packet revised (round 2) on `main` `722651103a56`, 2026-10-28; rows 1 to 10 proposed, not registered.
