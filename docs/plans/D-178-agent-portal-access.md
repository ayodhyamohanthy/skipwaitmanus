# D-178 - External agents talking to the portal: sign in, pay, apply for referrals

Source: founder message, Oct 24, 2026 12:58 AM IST. Provenance: phonemsg-01M5N3RFHS5V5Y2MS5NBYCPT0M in conversation phoneconv-01M293K2H1ENERN9WSP2W33SPT (iMessage); the observation record shows author=user for that message ID (verified Oct 24 00:58 IST). This packet records the direction; the channel record is the authority, not this file. Verbatim:

> Agents should talk to our portal and they can sign in and pay and apply for referrals

## What this decides (and what it does not)

Product direction: external AI agents acting for a seeker should be able to use skipwait programmatically - authenticate, pay, and apply for referrals on their principal's behalf.

This is DIRECTION, not authority. Nothing here authorizes charging anyone, weakening authentication, or letting an agent act without its principal's verified consent. The protocol/interface is unspecified and must NOT be silently invented: no ad-hoc "agent endpoint" ships without the contract being designed and reviewed first.

## Design constraints before any build

1. **Delegated identity.** An agent acts for a specific user. The existing assistant-grant work (D-048-p3-assistants: /assistants, /approve, /connect-assistant, "approval preserves credits") and D-048-p3-agents (seeker agent grants, D-150) are the identity/grant substrate. Agent access must ride a user-scoped, revocable grant - never a shared agent credential, never the user's password or session cookie.
2. **Payment authority.** "Pay" by an agent is wallet-bearing on the user's behalf. It needs the user's explicit per-action or bounded approval, grounded in an existing grant - the same bar as any agent spending for a user. No agent-initiated charge without that. Founder no-spend rule and all money freezes (D-132/D-152) are untouched.
3. **Safe repeat/retry.** Agents retry. Apply-for-referral and pay must be idempotent (idempotency keys or natural uniqueness) so a retry never double-applies or double-charges. Existing outbox/charge patterns (D-067) are the reference.
4. **Protocol unspecified.** Candidates to evaluate in design, not chosen here: a public REST contract with scoped tokens, OAuth delegated grants, an agent-specific sign-in flow. The choice is a design decision with its own review.
5. **Existing contract work first.** Integrate with the assistant/auth/payment lanes already registered (D-048-p3-assistants, D-048-p3-agents, D-048-P-auth, seeker-passwords) instead of a parallel agent stack.

## Clarification, Oct 24 12:59 AM IST (same conversation)

Founder follow-up (phonemsg-01M5N3T0SZFH12MGASAEZ6MSCX, channel record verified author=user Oct 24 00:59 IST). Verbatim:

> Any  agent can connect to skipwait.me and can apply for referrals if they have paid for referrals

Applied reading (with Main, Oct 24):

1. **Any agent, not a named integration.** The contract is platform-agnostic: no per-provider partnership or allowlist of agent vendors is implied. Safeguards (scoped grant, consent, account isolation) apply to every agent equally.
2. **Payment-gated eligibility.** An agent may apply for referrals when the authenticated user it acts for has paid referral entitlement available (their paid ask balance). "If they have paid" conditions the ELIGIBILITY to apply; it never promises a referral outcome - referrers still decide.
3. **Free human allowance untouched.** The existing free monthly allowance for human seekers is NOT revoked by this directive; agent access is an additional path gated on paid entitlement. Removing or changing the free allowance would need its own explicit owner decision.
4. **Auth/consent/isolation stand.** Every agent still acts only within its authenticated user's account and grant; no shared access, no bypass, no retry-storm double-apply/double-charge.

## Clarification, Oct 24 1:01 AM IST (same conversation): Skippy action parity

Founder follow-up (phonemsg-01M5N3XV03FBKPFXF8DQPEXF50, channel record verified author=user Oct 24 1:02 IST). Verbatim:

> Skippy product assistant should be implemented  humans or bots  just use it  with natural language and get things done including payments, referrals, whatever everyone are bale to get on screen using ui , can be done in product assitant skippy and same should be done by agent bots too.

Applied reading (with Main, Oct 24):

1. **Skippy is the product assistant's name; it does the work, not just explains where to click.** Action parity rule: whatever a signed-in user can do on screen - finding jobs, requesting referrals, making payments, managing the account - must also be doable in natural language inside Skippy, for humans AND bots, and by outside agent bots through the D-178 contract. Same capabilities on all three paths.
2. **Same safeguards on all three paths.** The existing account permissions, prices, payment approvals and consent apply identically; no parallel permissive backend, no duplicate charges or requests on retries, clear results. Parity is of CAPABILITY, never of privilege.
3. **Not end-to-end yet.** This is the implementation rule, acknowledged as not currently supported end to end. Grounding work: inventory the actual UI actions, map them against the current Skippy/assistant implementation (D-048-p3-skippy redesign, the held assistant work #563 and the paid-tool contract - relevant but NOT assumed complete), and carry the gaps into the build instead of claiming parity.

## Open questions

1. Paid entitlement = the user's EXISTING paid referral balance (the credit ledger wallet: purchased packs sit alongside the free monthly plan_grant allowance; see server/creditCycles.ts and the billing catalog). The founder's words are "if they have paid for referrals" - the grounded reading is the agent spends the signed-in user's existing paid balance with that user's approval. No agent-scoped purchase, price fork, or new payment product is requested or to be manufactured. (Money wording stays frozen under D-132/D-152 either way.) UNRESOLVED: whether the free monthly allowance is agent-spendable. The founder's words settle only the paid path - an agent may apply when the user's paid balance covers it - and do not revoke the free human allowance. Nothing here settles a universal human-only or agent-eligible policy for the free allowance: no default, no activation either way, until the owner decides.
2. What does the user see and approve for each agent action (per-action approval vs standing grant with limits)?
3. Rate limits and abuse controls for agent traffic vs human traffic?
4. How is an agent identified and attested (user-declared API token vs verified agent identity)?


Answers drafted Nov 1 (section 4 below): question 1 was resolved by D-181 (owner, Oct 24: the free allowance is agent-spendable too); question 2 by R4, question 3 by R6, question 4 by R7. R4, R6 and R7 are draft assumptions until recorded (section 11).

## Build packet (contract design), draft of Nov 1, 2026

| Field | Value |
|---|---|
| Queue row | `D-178-agent-portal-access` in `docs/plans/assignments.json`, status `architect`, lock `agent/architect/d178-agent-portal` |
| Decisions | D-178, D-181, D-141, D-137, D-140, D-142, D-201, D-219, D-221, D-173/D-180, D-153, D-030/D-049/D-057, D-055, D-060, D-151, D-223, D-225 |
| Risk tier | Every build slice is Tier 1 (identity, money, privacy). This packet is docs only. |
| Verified against | `main` `f5b9afb9`, Nov 1, 2026 |
| Drafted by | Claude Opus 5.5 · 7bf0, reasoning seat (D-225) |
| State | **Draft. Do not build from it yet.** R1 to R8 are stated, changeable assumptions (D-109), not register entries. Recording them as an entry decided under D-200 is the next step, for a session or the coordinator allowed to allocate a register ID (this session's operator barred it from doing so). No row in section 5 is registered: the owner's Oct 31 "new rows paused" restriction holds. |

### 1. Goal
Any AI agent a seeker chooses can connect to skipwait.me, act only inside that seeker's account and grant, and request referrals for the seeker, spending the seeker's included or paid referrals only with the seeker's approval. Skippy and outside agents reach the same capabilities through the same server functions as the pages (D-137, D-178 parity). Goal fit: a seeker who already works in ChatGPT, Claude or their own agent can get referred without switching tools. That widens the front door without adding a second rulebook.

### 2. Binding rules (quoted from the register)
- **D-178:** "Any agent can connect to skipwait.me and apply for referrals when the signed-in user it acts for has paid referral entitlement; agent payment is wallet-bearing on the user's behalf and needs that user's approval ... No agent-scoped purchase, price fork or new payment product is requested or to be manufactured."
- **D-181:** "The same included free + paid allowance is accessible via the website, Skippy and outside agents, within the user's permission and the same limits ... no activation before the D-178 build and its tests land; money amounts and rules stay frozen."
- **D-141 (amended by D-178/D-181):** granted by the seeker in their own session; scopes look up, draft, send (default draft); limits per ask, per day and per week, asks per day; expiry 7 days by default, 30 at most; instant revoke and pause-all; key shown once and stored hashed; ask-me-every-time by default; agents never buy credits or plans; lower rate limits than people; an audit log the seeker can read.
- **D-137:** one front door: Skippy and agents call the same server functions as the pages; a second copy is a defect.
- **D-201:** no Skippy flag goes on in production until SKIPPY-fix lands with its proof; after that each flag is the owner's word.
- **D-219/D-221:** the banded model; a request costs one referral of its level band; the D-132 credit model is superseded. **D-173/D-180:** the user-facing unit is a referral.
- **D-055:** referrers never pay. **D-057/D-245:** referrer actions need a work-email code in that session, so no agent token can reach them.

### 3. Current behaviour (verified on `f5b9afb9`)
Two agent stacks are on `main`, built separately.

**Stack A, "assistants"** (kit screens 22 to 26; redesigned by D-048-p3-assistants; cost-bound by ASSIST-approval-cost):
- Standard connect: OAuth authorization code with PKCE S256 and dynamic client registration (`server/oauthRoutes.ts:38-60`, `:75-96`; token `:104-118`). Advertised scopes are only `read` and `draft` (`:48`, `:52`, `:118`). MCP over HTTP at `POST /api/mcp` (`server/mcpRoutes.ts:44`) with tools `search_jobs`, `list_my_requests`, `list_my_alerts`, `list_my_resumes` and `propose_ask` (`server/mcpServer.ts:31-60`).
- Tokens: `sw_` bearer, stored as sha256, revocable, with **no expiry, no per-token scope or limit, and no pause-all** (`drizzle/schema.ts:297-306`, `server/db.ts:574-600`).
- Approval queue: `propose_ask` writes a pending `assistantApprovals` row with a fixed idempotency key and an expiry, at most 5 pending per member (`server/db.ts:669-708`). Approve runs `createCompanyReferralRequest` with that key and returns the row to pending if it throws (`server/db.ts:710-737`). The decision route refuses an approve whose shown cost differs: 409 `cost_changed` (`server/assistantRoutes.ts:218-249`).
- **Gate:** every Stack A connect path needs the `assistants` plan entitlement: connecting (`server/db.ts:551`), minting a token (`:578`), an OAuth code (`server/_core/index.ts:283`) and every MCP call (`server/mcpRoutes.ts:57`, via `server/db.ts:602-604`). Only the `land` plan grants it (`shared/planEntitlements.ts:102`), and Land is not sold, so Stack A is closed to every account, and the member reads "Assistants are part of Land and Concierge, which are not on sale yet ..." (`shared/assistant.ts:15`). There is no feature flag: the routes are always mounted (`server/_core/index.ts:264`, `:268-287`).
- The MCP cap is 120 calls per token per minute (`server/mcpRoutes.ts:31`), above a person's rate, which D-141 forbids.
- Recovery gap: approve sets `approved` (`server/db.ts:719`) and only then calls create (`:729`). A crash between the two leaves an `approved` row with no `executedRequestId` that nothing retries or reports. No money moves twice (the key prevents a double send), but the seeker's approved request never goes out and nobody is told.

**Stack B, "seeker agents"** (Skippy step 5, D-141):
- REST with a seeker-minted `swa_` key (`shared/seekerAgents.ts:11-13`): `/api/agent/v1/me`, `companies`, `prices`, `drafts` (`server/seekerAgentRoutes.ts:162-257`); seeker routes `/api/seeker/agents*` (`:259-350`).
- The grant has scopes `lookup` and `draft` only (`shared/seekerAgents.ts:16`), limits in credits (`:27-28`), expiry 7 or 30 days (`:23-24`), pause-all, and an audit table; call caps of 20 an hour and 60 a day live in process memory (`server/seekerAgentRoutes.ts:103-120`).
- Draft only: no send and no purchase path (`server/seekerAgentRoutes.ts:1-8`). Off unless `SKIPPIE_AGENT_ENABLED` (`server/_core/index.ts:266`); SKIPPY-fix S-4 adds the account allow-list.
- The draft cost still uses the D-132 per-level credit math (`server/seekerAgentDeps.ts:140-142`).

**Queued:** SKIPPY-6 (`docs/plans/SKIPPY-next.md`) adds `send` to Stack B with its own approval state on `seekerAgentDrafts` (`pending_approval`, `sent`, `declined`) and a new `askOrigins` table; SKIPPY-7 adds auto-send. Both wait for SKIPPY-fix.

**What follows:** as queued, the product ends with two connect methods, two token types, two seeker screens (`/assistants` and `/agents`) and two approval queues for one act. That is the parallel agent stack the direction record forbids (design constraint 5) and D-137 calls a defect.

### 4. Rulings (stated, changeable assumptions; record before any build)
**R1. One agent model, two transports.** The canonical grant is the D-141 grant (`seekerAgentGrants`: scopes, limits, expiry, pause, audit). Both transports authenticate to it: OAuth plus MCP (the Stack A transport, the standard way ChatGPT, Claude and other MCP clients connect) and plain REST at `/api/agent/v1` for agents without MCP. The OAuth consent screen (`/connect-assistant`) creates a grant with the scopes, limits and expiry the seeker chose, instead of a bare `sw_` token. There is one approval queue, `assistantApprovals` (already cost-bound, idempotent, expiring and reviewed), which gains a `grantId`. There is one seeker screen for agents, built from the two existing goal screens. **Rating 8/10:** it keeps the reviewed cost binding and the standard connect path, keeps every D-141 control, and removes a duplicate queue before it is built. **Against:** it re-scopes SKIPPY-6, whose packet is a CEO ruling, and needs an additive migration on two tables; building SKIPPY-6 as written would reach a demo sooner but leaves two queues to reconcile later and every later fix to make twice. **Alternative rejected:** Stack B alone, retiring OAuth and MCP. Then "any agent can connect" means a seeker pastes a secret into a third-party chat, which is worse for security and closes the connector path ChatGPT and Claude use.

**R2. The gate is the grant, not a plan.** Agent access needs a new flag (off), the account allow-list (SKIPPY-fix S-4 helper) and a live grant (unrevoked, unexpired, unpaused, with the scope). It never reads the `assistants` plan entitlement. Whether a request can be sent is decided at approve time by `createCompanyReferralRequest`'s own wallet path, with included and paid referrals treated alike (D-181); a shortfall leaves the approval pending with plain words, as today (`server/db.ts:732-735`). D-178 and D-181 tie agent eligibility to the referral allowance, not to a plan, so this is settled by the owner's words. `shared/planEntitlements.ts` is plan contents and stays as it is; only the gate stops reading it.

**R3. "Pay" means spending the seeker's referrals on a request the seeker approved.** No agent route reaches checkout, a plan purchase or an extra-referral purchase (D-141: agents never buy; D-178: no agent-scoped purchase). Skippy's in-chat purchase is SKIPPY-3, in the seeker's own session with SKIPPY-stepup, not an agent path. An agent handing the seeker a checkout link is out of scope and would be the owner's call.

**R4. Every send is approved by the seeker.** By default and in this build, each request is approved in the seeker's session at `/approve` (D-141 ask-me-every-time). The approval shows the company, role link, note, resumes, the cost in referrals with its source (included or paid) and the balance after. A bounded standing approval is SKIPPY-7 only (auto-send within the grant's limits, own flag, the owner's word); D-178 adds none.

**R5. Limits count referral requests.** Grant limits count requests per day and per week, plus a per-request ceiling by level band once D-219's level-to-band mapping is settled (it is open). Until then the ceiling is one referral, which is what every request costs today. User-facing words say "referral requests" and "referrals", never credits (D-180). Counts are taken inside the approve transaction with the grant row locked (SKIPPY-6's `FOR UPDATE` rule), so concurrent approvals cannot pass a limit.

**R6. One call cap for both transports, below a person's.** 20 calls an hour and 60 a day per grant (`shared/seekerAgents.ts:20-21`), replacing MCP's 120 a minute. Call caps stay in process memory: they throttle abuse, and a restart or a second instance only loosens them without moving money. Money and request limits are durable (R5).

**R7. Any agent; its name is self-declared.** There is no vendor allow-list (D-178, clarification 1). The agent's name is what it declares (OAuth `client_name`) or what the seeker types, and the consent screen says the name is not verified by skipwait.me. The developer console review (`developerApps.status`) is for publishers who want a reviewed listing; nobody needs it to connect.

**R8. Parity is an inventory, built gap by gap.** Section 10 lists the seeker's on-screen actions against Skippy and agents. Each gap becomes its own row; nothing claims parity until that row's proof shows it.

### 5. Slices (proposed rows, not registered)
Registration waits for the owner's new-rows pause to lift and for R1 to R8 to be recorded. Each row is one agent, one pull request, its own flag or behaviour-preserving (D-223). `server/db.ts` and `server/_core/index.ts` are hot files: each row touches only the named functions or lines.

| Proposed row | Tier | Owns | Depends on | Delivers |
|---|---|---|---|---|
| `D-178.gate` | 1 | `server/db.ts` (`hasAssistantAccess`, and `assertAssistantAccess` at its connect and token callers `:551` and `:578` only; developer-app registration at `:788` keeps its check), `server/mcpRoutes.ts`, `server/oauthRoutes.ts`, `server/_core/index.ts` (the assistant, MCP and OAuth registration lines only), `shared/assistant.ts`, `.env.example`, `src/worker.ts`, `server/configContract.test.ts`, tests beside each | SKIPPY-fix (S-4 allow-list helper) | flag `AGENT_PORTAL_ENABLED` (off) and the allow-list replace the Land gate (R2); the MCP cap follows R6; refusal copy in plain words |
| `D-178.grant` | 1 | `drizzle/schema.ts` and `drizzle/deploy/<next>_agent_grant_oauth.sql` (additive: grant `oauthClientId` nullable; approval `grantId` nullable), `server/schemaReconcile.ts`, `server/agentGrantAuth.ts` (new: one verifier for `sw_` and `swa_`), `server/oauthRoutes.ts` (mint), `server/mcpRoutes.ts` and `server/seekerAgentRoutes.ts` (guards only), tests | `D-178.gate` | OAuth consent creates a D-141 grant (R1); both transports resolve the same grant, scope, expiry and pause; legacy `sw_` tokens, if any exist, read as revoked-on-expiry grants (see stop-and-ask 4) |
| `SKIPPY-6`, re-scoped | 1 | SKIPPY-6's own list (`docs/plans/SKIPPY-next.md`) minus the draft approval states, plus `server/assistantRoutes.ts` and `server/db.ts` (`proposeAssistantAsk`, `decideAssistantApproval` only) | `D-178.grant`, D-132-item3 | REST send-request and MCP `propose_ask` both create an `assistantApprovals` row bound to the grant; approve counts limits under lock (R5), re-quotes through `previewAskCost`, writes `askOrigins`; an `approved` row without `executedRequestId` is retried with its own key or shown to the seeker |
| `D-178.read` | 1 | `server/seekerAgentRoutes.ts` (one route), `shared/seekerAgents.ts` (one view type), tests | re-scoped SKIPPY-6 | REST parity with MCP `list_my_requests`: the seeker's requests with the fields their own `/requests` page shows, never referrer identity (D-019(e)) |
| `D-178.screen` | 1 | `client/src/pages/goal/assistants/**`, `client/src/pages/SeekerAgents.tsx`, `client/src/pages/Assistants.tsx`, tests and captures | `D-178.grant` | one goal screen to grant, limit, pause and revoke agents (both routes keep working, D-150 goal page) |
| `D-178.release` | 1 | the flag defaults and the proof only | every row above and SKIPPY-redteam | allow-listed test seeker end to end; production is the owner's word (D-201, D-223 (3)) |

### 6. Steps per slice
Each builder: red-first tests from section 7, then the change, then `pnpm check`, the focused tests and the build, merged with the latest `origin/main`; draft pull request; independent Tier 1 review (D-151) by a model that neither built nor fixed it; landing on green required CI. Migrations are additive, `information_schema`-guarded, take the next free number at landing and are mirrored in `server/schemaReconcile.ts`. No production migration runs from a build session.

### 7. Red-first tests
- **gate:** with the flag off every agent route answers 404; with it on, a non-allow-listed account and its token get 404 on `/api/mcp`, `/api/oauth/authorize` and `/api/agent/v1/*`; an allow-listed account on the free plan connects (no Land check); the MCP cap refuses call 21 within an hour.
- **grant:** an OAuth exchange creates a grant with the chosen scopes, limits and an expiry of at most 30 days; an expired, revoked or paused grant is refused on both transports; a token never authenticates a session route (`/api/credits/*`, `/api/chargebee/*`, `/api/billing/*` and every referrer route are enumerated and refused).
- **queue:** a send-request without `send` gets 403; REST and MCP proposals land in the same queue; two concurrent approves over the daily limit produce one request; a changed cost answers 409 `cost_changed` and spends nothing; a retried approve gives one request and one debit; a seeker with only included referrals can send (D-181) and one with none sees the shortfall with nothing spent; a crash injected between `approved` and create leaves a row the recovery path sends once with the same key.
- **read:** the agent sees the seeker's own requests and never a referrer's name, email or company identity before acceptance; another account's request is never listed.
- **screen:** loading, empty, error and network-failure states; captures at 1280 and 390.

### 8. Definition of done
Every slice merged through its own pull request with the evidence block (`docs/DELEGATION.md` section 5); flags off; `D-178.release` proof on `skipwait_qa` with the Chargebee test site, never a real payment: an MCP client connects by OAuth, proposes a request, the seeker approves at `/approve`, the request reaches `/queue` with the "Sent via the seeker's assistant" label (D-142), the ledger shows one debit; also a decline, a revoke mid-flight and a shortfall. Captures at 1280 and 390. Production activation is the owner's word.

### 9. Review checklist (in addition to `docs/DELEGATION.md` section 6)
1. No agent path reads the `assistants` plan entitlement after `D-178.gate`.
2. No agent token reaches checkout or any referrer action (the enumerated test in section 7).
3. One approval queue: no second pending-approval state exists for agent sends.
4. Limits count requests inside the approve transaction with the grant row locked.
5. User-facing words say referrals, write "skipwait.me" and use no long dashes (D-153, D-180).
6. The approved-without-request recovery exists, is tested and reports to Sentry.

### 10. Parity inventory (first pass, verify each row before building)
| Seeker action on screen | Page | Skippy today | Agent today (A = MCP, B = REST) | Gap and owner |
|---|---|---|---|---|
| Find a company or role | `/explore`, `/explore/:slug` | step 2 asks for the company (flag off) | A `search_jobs`; B `GET /api/agent/v1/companies` | none for look-up |
| See prices | `/plans` | none | B `GET /api/agent/v1/prices` | B reads the pre-D-219 catalog; follows the banded checkout |
| Request a referral | ask drawer | step 2 (flag off; SKIPPY-fix) | A `propose_ask` to approval; B draft only | one queue (re-scoped SKIPPY-6) |
| Approve the spend | ask drawer confirm | step 2 confirm | A `/approve` | none after R1 |
| See my requests | `/requests` | none | A `list_my_requests`; B none | `D-178.read` |
| Withdraw a request | `/requests` | none | none | not in this build; a later Skippy row (it returns a referral, D-034) |
| Alerts | `/alerts` | none | A `list_my_alerts`; B none | later row |
| Resumes | `/profile` | step 2 picks one | A `list_my_resumes` (read only) | agent upload not in this build (D-139 consent) |
| Buy referrals or a plan | `/plans` (sales paused) | SKIPPY-3, own session with step-up | never (R3) | by design |
| Account, sign-in, deletion | `/settings` | none | never in this build | by design |

### 11. Stop and ask
1. A builder or reviewer who reads Land and Concierge's "assistants" line as live plan contents (against R2) stops `D-178.gate` only and asks Instinct on #811.
2. If SKIPPY-6 is claimed or built as written before R1 is recorded, do not build the re-scoped slice; report the conflict to Instinct.
3. Prices, plan contents, legal text, the login rule (agent connect is not a seeker sign-in method; a reviewer who reads it as one stops) or referrer fairness: the owner, through Instinct.
4. Whether any `assistantTokens` or `assistantConnections` rows exist in production (expected none, since the Land gate blocked minting) is read by an authorized operator, never a build session. `D-178.grant`'s handling of legacy tokens depends on the answer.

## Status
- Oct 24: direction recorded (#606). No code.
- `D-178-agent-portal-access`: packet drafted — Claude Opus 5.5 · 7bf0 — 2026-11-01 — branch `agent/architect/d178-agent-portal`. Not adoptable until (1) R1 to R8 are recorded as one register entry decided under D-200, naming `Affects tasks: D-178-agent-portal-access, SKIPPY-6, SKIPPY-7`; (2) the coordinator confirms the SKIPPY-6 re-scope; (3) the owner's new-rows pause lifts for the rows in section 5. Then the row becomes packet-only `done` with its rows added (D-134, D-223 (4)). The row's status in `docs/plans/assignments.json` is deliberately unchanged in this draft.
