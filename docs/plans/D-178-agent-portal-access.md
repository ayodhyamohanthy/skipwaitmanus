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


Answers (Nov 7): question 1 was resolved by the owner in D-181 (the free allowance is agent-spendable too); questions 2, 3 and 4 are answered by R4, R6 and R7 below, recorded as D-290 (decided under D-200, changeable).

## Build packet (contract design), adopted Nov 7, 2026

| Field | Value |
|---|---|
| Queue row | `D-178-agent-portal-access` in `docs/plans/assignments.json`: a packet-only row (its `owns` is this file alone; its work is the rows in section 5), `done` when this packet lands |
| Rows it adds | `D-178.gate`, `D-178.grant`, `D-178.read`, `D-178.screen`, `D-178.release` (epic `D-178`); `SKIPPY-6` gains a dependency on `D-178.grant` and is re-synced to R1 by its own session (D-290 names it) |
| Decisions | D-178, D-181, D-141, D-137, D-140, D-142, D-201, D-219, D-221, D-173/D-180, D-153, D-030/D-049/D-057, D-055, D-006/D-040, D-151, D-223, D-225, and D-290 (this packet's rulings) |
| Risk tier | Every build row is Tier 1 (sign-in, identity, money, privacy). This packet is docs and registry only (Tier 2 row, docs paths). |
| Verified against | `main` `35dcc383`, Nov 7, 2026. Every file cited in section 3 is byte-identical to the Nov 1 draft's base `f5b9afb9` (`git diff --stat f5b9afb9 35dcc383` on them is empty), and each file:line below was re-read on `35dcc383`. |
| History | Drafted by Claude Opus 5.5 · 7bf0 on Nov 1 (commit `dd3e6e7b`, reasoning seat, D-225); taken over, revised and adopted by Hark · 7eeb on Nov 7. Changes from the draft: one flag instead of a new one (R2), the grant row needs no migration (R1, `D-178.grant`), legacy `sw_` tokens keep today's behaviour (R1), SKIPPY-6 stays its own row instead of being renamed, a separate release row, and the Oct 31 "new rows paused" line is dropped because `docs/BUILD_CONTINUITY.md` (provenance correction, Nov 2) shows it was never an owner restriction. |

### 1. Goal
Any AI agent a seeker chooses can connect to skipwait.me, act only inside that seeker's account and grant, and request referrals for the seeker, spending the seeker's included, free or paid referrals only with the seeker's approval. Skippy and outside agents reach the same capabilities through the same server functions as the pages (D-137, D-178 parity). Goal fit (north star, AGENTS.md section 0): a seeker who already works in ChatGPT, Claude or their own agent can get referred without switching tools, which widens the front door without a second rulebook.

### 2. Binding rules (quoted from the register)
- **D-178:** "Any agent can connect to skipwait.me and apply for referrals when the signed-in user it acts for has paid referral entitlement; agent payment is wallet-bearing on the user's behalf and needs that user's approval; ... No agent-scoped purchase, price fork or new payment product is requested or to be manufactured."
- **D-181:** "The same included free + paid allowance is accessible via the website, Skippy and outside agents, within the user's permission and the same limits ... **Bounds:** eligibility only - not authority for any agent's own spending or other accounts, and no activation before the D-178 build and its tests land; money amounts and rules stay frozen (D-132/D-152)."
- **D-141 (scope amended by D-178 and D-181, `docs/plans/DECISION-AUDIT-oct26.md:128`):** granted by the seeker in their own session; scopes look up, draft, send (default draft); limits per ask, per day and per week, asks per day; expiry 7 days by default, 30 at most; instant revoke and pause-all; key shown once and stored hashed; ask-me-every-time by default; agents never buy credits or plans; lower rate limits than people; an audit log the seeker can read.
- **D-137:** one front door: Skippy and agents call the same server functions as the pages; a second copy is a defect.
- **D-201:** no Skippy flag goes on in production until SKIPPY-fix lands with its proof; after that each flag is the owner's word.
- **D-219/D-221:** the banded model; spending order is the plan's included referral, then the free allowance (3 a month with a verified card), then a purchased referral; a referral is spent only when a verified employee can see the request. **D-173/D-180:** the user-facing unit is a referral; no page says "credit(s)".
- **D-030/D-049/D-057 (login rule, frozen, D-059):** seekers sign in with the listed providers or a personal-email code; referrers with a work-email code only. **D-055:** referrers never pay. **D-006/D-040:** nothing sells priority, ranking or visibility; at most 2 open asks per company.
- **D-142:** a referrer sees "Sent via the seeker's assistant" on an agent-sent request.

### 3. Current behaviour (verified on `35dcc383`)
Two agent stacks are on `main`, built separately.

**Stack A, "assistants"** (kit screens 22 to 26; redesigned by D-048-p3-assistants; cost-bound by ASSIST-approval-cost):
- Standard connect: OAuth authorization code with PKCE S256 and dynamic client registration; discovery at `server/oauthRoutes.ts:38-60`, the authorization endpoint is the seeker's own `/connect-assistant` page (`:41`). Advertised scopes are only `read` and `draft` (`:48`, `:52`); the token response says `scope: "read draft"` (`:118`). MCP over HTTP at `POST /api/mcp` (`server/mcpRoutes.ts:44`) with tools `search_jobs`, `list_my_requests`, `list_my_alerts`, `list_my_resumes` and `propose_ask` (`server/mcpServer.ts:31-60`).
- Tokens: `sw_` bearer stored as sha256, revocable, with **no expiry, no per-token scope or limit, and no pause-all** (`drizzle/schema.ts:297-306`; `createAssistantToken` `server/db.ts:574`; `verifyAssistantBearer` `:593`).
- Approval queue: `proposeAssistantAsk` (`server/db.ts:687-708`) writes a pending `assistantApprovals` row (`drizzle/schema.ts:325`) with an idempotency key and an expiry. `decideAssistantApproval` (`server/db.ts:710-737`) sets `approved` (`:719`), then runs `createCompanyReferralRequest` with that key (`:729`) and records `executedRequestId` (`:730`), putting the row back to `pending` if create throws (`:732-735`). The decision route refuses an approve whose shown cost differs: 409 `cost_changed` (`server/assistantRoutes.ts:218-249`).
- **Gate:** every Stack A path needs the `assistants` plan entitlement: `connectAssistant` (`server/db.ts:545`, check at `:551`), `createAssistantToken` (`:578`), an OAuth code (`server/_core/index.ts:283`) and every MCP call (`server/mcpRoutes.ts:57`, wired to `db.hasAssistantAccess` at `server/_core/index.ts:270`; `server/db.ts:602-604`). Only the retired `land` plan grants it (`shared/planEntitlements.ts:102`; `free`, `keep_warm`, `start`, `momentum` are `false`, `:98-101`), so Stack A is closed to every account and the member reads `ASSISTANT_PLAN_REQUIRED_MESSAGE` (`shared/assistant.ts:15`). No plan page shows an assistants line: `grep -rn assistant client/src/components/plans client/src/pages/Plans*.tsx` finds nothing, and the only readers of the entitlement are `server/db.ts:536`, `:603` and `shared/assistant.ts:30`. There is no feature flag: the routes are always mounted (`server/_core/index.ts:264`, `:268-287`).
- The MCP cap is 120 calls per token per minute (`server/mcpRoutes.ts:31`), above a person's rate, which D-141 forbids.
- Recovery gap: approve marks the row `approved` before create runs. A crash between the two leaves an `approved` row with no `executedRequestId` that nothing retries or reports. No money moves twice (the key prevents a double send), but the seeker's approved request never goes out and nobody is told.

**Stack B, "seeker agents"** (Skippy step 5, D-141):
- REST with a seeker-minted `swa_` key (`shared/seekerAgents.ts:11-13`): `/api/agent/v1/me`, `companies`, `prices`, `drafts` (`server/seekerAgentRoutes.ts:162-257`); seeker routes `/api/seeker/agents*` (`:259-350`).
- The grant (`drizzle/schema.ts:1282-1299`) has `canLookup` and `canDraft` only (`shared/seekerAgents.ts:16`), limits in credits (`:27-28`), expiry 7 or 30 days (`:23-24`), pause-all (`seekerAgentControls`), and an audit table; call caps of 20 an hour and 60 a day live in process memory (`server/seekerAgentRoutes.ts:103-120`, constants `shared/seekerAgents.ts:20-21`).
- Draft only: no send and no purchase path (`server/seekerAgentRoutes.ts:1-8`). Off unless `SKIPPIE_AGENT_ENABLED` (`server/_core/index.ts:266`; declared in `.env.example:40` and forwarded by `src/worker.ts:28`). SKIPPY-fix S-4 adds the account allow-list `SKIPPIE_AGENT_USER_IDS` through a shared `server/skippieAllowList.ts` (`docs/plans/SKIPPY-fix.md:32-34`).
- The draft cost still uses the D-132 per-level credit math (`server/seekerAgentDeps.ts:140-142`).

**Queued:** SKIPPY-6 (`docs/plans/SKIPPY-next.md:34-39`) adds `send` to Stack B with its own approval state on `seekerAgentDrafts` (`pending_approval`, `sent`, `declined`), a `canSend` column and a new `askOrigins` table in one additive migration; SKIPPY-7 adds auto-send. Both wait for SKIPPY-fix.

**What follows:** as queued, the product ends with two connect methods, two token types, two seeker screens (`/assistants` and `/agents`) and two approval queues for one act. That is the parallel agent stack the direction record forbids (design constraint 5) and D-137 calls a defect.

**Not on the queue table:** `docs/KIT_V4_BUILD_PLAN.md` section 3b has no `D-178` row; status lives in `docs/plans/assignments.json` and this file's Status section (D-134 (5)).

### 4. Rulings (recorded as D-290, decided under D-200, changeable)
**R1. One agent model, two transports.** The canonical grant is the D-141 grant (`seekerAgentGrants`: scopes, limits, expiry, pause, audit). Both transports authenticate to it: OAuth plus MCP (the standard way ChatGPT, Claude and other MCP clients connect) and plain REST at `/api/agent/v1`. The OAuth token exchange creates a `seekerAgentGrants` row (name = the client's declared name, scopes look up and draft, default limits, expiry 7 days unless the seeker chose up to 30 on the consent page) and returns that grant's `swa_` key as the access token, so the grant needs no new column. There is one approval queue, `assistantApprovals` (already cost-bound, idempotent, expiring and reviewed); the re-synced SKIPPY-6 adds its nullable `grantId` inside SKIPPY-6's own additive migration instead of the draft states. There is one seeker screen for agents. Legacy `sw_` tokens (expected none, because the Land gate blocked minting) keep exactly today's behaviour (look up and propose for approval) under the same flag, allow-list and call cap, and can never send without a grant. **Against:** it re-scopes SKIPPY-6; building SKIPPY-6 as written reaches a demo sooner but leaves two queues to reconcile and every later fix to make twice.

**R2. The gate is the flag, the allow-list and the grant, not a plan.** Agent access needs `SKIPPIE_AGENT_ENABLED` (already declared, off in production), the SKIPPY-fix S-4 allow-list `SKIPPIE_AGENT_USER_IDS`, and a live grant (unrevoked, unexpired, unpaused, with the scope). One switch for both transports: no new env key. It never reads the `assistants` plan entitlement. Whether a request can be sent is decided at approve time by `createCompanyReferralRequest`'s own wallet path, with included, free and paid referrals treated alike (D-181); a shortfall leaves the approval pending with plain words, as today. This applies D-178/D-181's words (agent eligibility follows the referral allowance, not a plan); `shared/planEntitlements.ts` is plan contents and stays byte-identical, and no plan page shows an assistants line (section 3), so nothing a buyer reads changes.

**R3. "Pay" means spending the seeker's referrals on a request the seeker approved.** No agent route reaches checkout, a plan purchase or an extra-referral purchase (D-141: agents never buy; D-178: no agent-scoped purchase). Skippy's in-chat purchase is SKIPPY-3, in the seeker's own session with SKIPPY-stepup, not an agent path. An agent handing the seeker a checkout link is out of scope and would be the owner's call.

**R4. Every send is approved by the seeker.** In this build each request is approved in the seeker's own session at `/approve` (D-141 ask-me-every-time). The approval shows the company, role link, note, resume, the cost in referrals with its source (included, free or paid) and the balance after. A bounded standing approval is SKIPPY-7 only (own flag, the owner's word); D-178 adds none.

**R5. Limits count referral requests.** Grant limits count requests per day and per week, plus a per-request ceiling by level band once D-219's level-to-band mapping is settled (open). Until then the ceiling is one referral, which is what every request costs today (`ASSISTANT_ASK_CREDIT_COST = 1`, `server/db.ts:669`). User-facing words say "referral requests" and "referrals", never credits (D-180). Counts are taken inside the approve transaction with the grant row locked (SKIPPY-6's `FOR UPDATE` rule), so concurrent approvals cannot pass a limit. The column names stay as they are (renaming is a migration with no user value).

**R6. One call cap for both transports, below a person's.** 20 calls an hour and 60 a day per grant (`shared/seekerAgents.ts:20-21`), replacing MCP's 120 a minute. Call caps stay in process memory: they throttle abuse, and a restart or a second instance only loosens them without moving money. Money and request limits are durable (R5).

**R7. Any agent; its name is self-declared.** No vendor allow-list (D-178 clarification 1). The agent's name is what it declares (OAuth `client_name`) or what the seeker types, and the consent page says skipwait.me has not verified it. Developer-console review (`developerApps.status`) is for publishers who want a reviewed listing; nobody needs it to connect.

**R8. A grant is not a sign-in.** "Sign in" in D-178 is met by the seeker approving a grant in their own signed-in session. An agent token never creates or resumes a session, never reaches a session route, and never reaches a referrer route (D-057/D-245: referrer actions need a work-email code in that session). The login rule (D-030/D-049/D-057) is unchanged: no new sign-in method, provider or code path.

**R9. Parity is an inventory, built gap by gap.** Section 10 lists the seeker's on-screen actions against Skippy and agents. Each gap becomes its own row; nothing claims parity until that row's proof shows it.

### 5. Rows, owned files, and what is out of scope
Each row is one agent, one pull request, flag off or behaviour-preserving (D-223). `server/db.ts` and `server/_core/index.ts` are hot files: each row edits only the named functions or lines.

| Row | Tier | Owns (in scope) | Depends on | Delivers |
|---|---|---|---|---|
| `D-178.gate` | 1 | `server/agentPortalAccess.ts` (new), `server/agentPortalAccess.test.ts` (new), `server/mcpRoutes.ts`, `server/mcpRoutes.test.ts`, `server/oauthRoutes.test.ts`, `shared/assistant.ts`, `shared/assistant.test.ts`, `server/db.ts` (`hasAssistantAccess`, `assertAssistantAccess` and its calls in `connectAssistant` and `createAssistantToken` only; `createDeveloperApp` keeps its check), `server/_core/index.ts` (the assistant, MCP and OAuth registration lines only) | SKIPPY-fix | one access check, `agentPortalAllowed(userId)` = `SKIPPIE_AGENT_ENABLED === "true"` and the user on `SKIPPIE_AGENT_USER_IDS` (the SKIPPY-fix helper), replaces the Land check on every Stack A path (R2); flag off answers 404 on `/api/mcp` and the OAuth endpoints, as `/api/agent/v1` does; MCP cap follows R6; refusal copy in plain words |
| `D-178.grant` | 1 | `server/agentGrantAuth.ts` (new: one verifier for `swa_` and legacy `sw_`), `server/agentGrantAuth.test.ts` (new), `server/oauthRoutes.ts`, `server/oauthRoutes.test.ts`, `server/mcpRoutes.ts` (bearer verification only), `server/mcpRoutes.test.ts`, `server/seekerAgentDeps.ts` (store: create a grant for an OAuth client), `server/_core/index.ts` (`verifyBearer` and `mintToken` lines only) | `D-178.gate` | the OAuth exchange creates a D-141 grant and returns its `swa_` key (R1); MCP and REST resolve the same grant, scope, expiry and pause; `sw_` keeps today's behaviour; no migration |
| `SKIPPY-6` (existing row, re-synced) | 1 | its own list in `docs/plans/SKIPPY-next.md`, re-synced to R1 by the session that takes its re-sync: the send request writes an `assistantApprovals` row bound to the grant (no draft approval states), plus `proposeAssistantAsk` and `decideAssistantApproval` in `server/db.ts` and `server/assistantRoutes.ts` | SKIPPY-fix, `D-178.grant` | one queue for REST and MCP; approve counts limits under lock (R5), re-quotes, writes `askOrigins`; an `approved` row without `executedRequestId` is retried once with its own key or shown to the seeker and reported to Sentry |
| `D-178.read` | 1 | `server/seekerAgentRoutes.ts` (one route), `shared/seekerAgents.ts` (one view type), `server/seekerAgentRequests.test.ts` (new) | `SKIPPY-6` | REST parity with MCP `list_my_requests`: the seeker's requests with the fields their own `/requests` page shows, never referrer identity (D-019(e)) |
| `D-178.screen` | 1 | `client/src/pages/goal/assistants/**`, `client/src/pages/SeekerAgents.tsx`, `client/src/pages/seekerAgents.test.tsx`, `client/src/pages/Assistants.tsx`, `client/src/pages/ConnectAssistant.tsx`, `client/src/pages/Approve.tsx`, `design/goal-ui/captures/assistants/**` | `D-178.grant`, `SKIPPY-6` | one goal screen to grant, limit, pause and revoke agents (both routes keep working, D-150); the consent page offers the expiry (7 default, 30 max) and says the agent's name is self-declared (R7); the approval card shows the cost source (R4) |
| `D-178.release` | 1 | this file's Status section and the proof only | every row above, `SKIPPY-redteam` | proof on `skipwait_qa` with an allow-listed test seeker (section 8); production is the owner's word (D-201, D-223 (3)) |

**Out of scope for every row:** `shared/planEntitlements.ts`, `/plans`, `/pricing`, checkout, Chargebee, every price, plan or catalog file; legal pages; every sign-in, session and referrer route and component (`referrerSignIn`, work-email code, WorkOS); `drizzle/` and `server/schemaReconcile.ts` outside SKIPPY-6's own migration; `.env.example` and `src/worker.ts` (no new key); SKIPPY-7; any production action.

### 6. Steps per row
Each builder: red-first tests from section 7, then the change, then `pnpm check`, the focused tests and the build, merged with the latest `origin/main`; draft pull request; independent Tier 1 review (D-151) by a model that neither built nor fixed it; landing on green required CI. SKIPPY-6's migration is additive, `information_schema`-guarded, takes the next free number at landing and is mirrored in `server/schemaReconcile.ts`; while the standing "no production changes, migrations" restriction in `docs/BUILD_CONTINUITY.md` holds, a head that carries it stops at a passed review and does not land. No row runs a production migration from a build session.

### 7. Red-first tests
- **gate:** flag off: `/api/mcp`, `/api/oauth/register`, `/api/oauth/token` and `/api/agent/v1/*` answer 404; flag on: an account not on `SKIPPIE_AGENT_USER_IDS` and its token get 404; an allow-listed account on the free plan connects (no Land check); `shared/planEntitlements.ts` is unchanged (a snapshot of the `land` row); the MCP cap refuses call 21 within an hour.
- **grant:** an OAuth exchange creates one grant with scopes look up and draft, the default limits and an expiry of at most 30 days, and returns a key matching `AGENT_KEY_PATTERN`; replaying the same code creates nothing; an expired, revoked or paused grant is refused on both transports; a legacy `sw_` token keeps today's tool list and cannot reach a send; an agent key never authenticates a session route (`/api/credits/*`, `/api/chargebee/*`, `/api/billing/*`, `/api/auth/*` and every referrer route are enumerated and refused).
- **queue (SKIPPY-6):** a send request without `send` gets 403; REST and MCP proposals land in the same queue; two concurrent approves over the daily limit produce one request; a changed cost answers 409 `cost_changed` and spends nothing; a retried approve gives one request and one debit; a seeker with only the free allowance can send (D-181) and one with none sees the shortfall with nothing spent; a crash injected between `approved` and create leaves a row the recovery path sends once with the same key.
- **read:** the agent sees the seeker's own requests and never a referrer's name, email or identity before acceptance; another account's request is never listed.
- **screen:** loading, empty, error and network-failure states; the consent page shows the self-declared name line; no user-facing "credit"; captures at 1280 and 390.

### 8. Definition of done
Every row merged through its own pull request with the evidence block (`docs/DELEGATION.md` section 5); flags off; `D-178.release` proof on `skipwait_qa` with the Chargebee test site, never a real payment: an MCP client connects by OAuth, proposes a request, the seeker approves at `/approve`, the request reaches `/queue` with the "Sent via the seeker's assistant" label (D-142), the ledger shows one debit; also a decline, a revoke mid-flight and a shortfall. Captures at 1280 and 390. Production activation is the owner's word.

### 9. Review checklist (in addition to `docs/DELEGATION.md` section 6)
1. No agent path reads the `assistants` plan entitlement after `D-178.gate`, and `shared/planEntitlements.ts` is unchanged.
2. No agent token reaches checkout, a session route or any referrer action (the enumerated test in section 7).
3. One approval queue: no second pending-approval state exists for agent sends.
4. Limits count requests inside the approve transaction with the grant row locked.
5. No new env key, sign-in method or provider.
6. User-facing words say referrals, write "skipwait.me" and use no long dashes (D-153, D-180).
7. The approved-without-request recovery exists, is tested and reports to Sentry.

### 10. Parity inventory (first pass, verify each row before building)
| Seeker action on screen | Page | Skippy today | Agent today (A = MCP, B = REST) | Gap and owner |
|---|---|---|---|---|
| Find a company or role | `/explore`, `/explore/:slug` | step 2 asks for the company (flag off) | A `search_jobs`; B `GET /api/agent/v1/companies` | none for look-up |
| See prices | `/plans` | none | B `GET /api/agent/v1/prices` | B reads the pre-D-219 catalog; follows the banded checkout rows, not this build |
| Request a referral | ask drawer | step 2 (flag off; SKIPPY-fix) | A `propose_ask` to approval; B draft only | one queue (SKIPPY-6, re-synced) |
| Approve the spend | ask drawer confirm | step 2 confirm | A `/approve` | none after R1 |
| See my requests | `/requests` | none | A `list_my_requests`; B none | `D-178.read` |
| Withdraw a request | `/requests` | none | none | not in this build; a later row (it returns a referral, D-034) |
| Alerts | `/alerts` | none | A `list_my_alerts`; B none | later row |
| Resumes | `/profile` | step 2 picks one | A `list_my_resumes` (read only) | agent upload not in this build (D-139 consent) |
| Buy referrals or a plan | `/plans` | SKIPPY-3, own session with step-up | never (R3) | by design |
| Account, sign-in, deletion | `/settings` | none | never in this build (R8) | by design |

### 11. Stop and ask
1. A builder or reviewer who finds a plan page, plan copy or legal text that names assistants as a plan feature (against section 3) stops `D-178.gate` and reports blocked: that is plan contents, the owner's.
2. A builder who finds SKIPPY-6 claimed or built as written (draft approval states) before its re-sync stops the dependent row and reports the conflict.
3. Prices, plan contents, legal text, live money, the login rule (a reviewer who reads agent connect as a seeker sign-in method stops) or referrer fairness: the owner, through `--report blocked`.
4. Whether any `assistantTokens` or `assistantConnections` rows exist in production (expected none) is read by an authorized operator, never a build session. R1 keeps legacy tokens working either way, so no row waits on the answer.
5. A function or line this packet cites that no longer matches on `main`: stop and report (DELEGATION.md section 4, step 8).

### Assumptions (D-109, each changeable by a newer register entry)
- A1. The row is packet-only: its `owns` is this file alone and D-223 (4) says a packet that lists rows adds them, so it becomes `done` and the work moves to the rows in section 5.
- A2. One switch (`SKIPPIE_AGENT_ENABLED` plus `SKIPPIE_AGENT_USER_IDS`) gates both transports (R2).
- A3. The default limits for an OAuth-created grant are `AGENT_LIMIT_DEFAULTS` (`shared/seekerAgents.ts:27`), and every request costs one referral until the D-219 band mapping is settled (R5).
- A4. Legacy `sw_` tokens keep today's behaviour and never send (R1).
- A5. MCP `propose_ask` stays on the `draft` scope until the re-synced SKIPPY-6 moves sends under `send`; every send is still approved by the seeker (R4).

## Status
- Oct 24: direction recorded (#606). No code.
- Nov 1: contract-design draft by Claude Opus 5.5 · 7bf0 on `agent/architect/d178-agent-portal` (`dd3e6e7b`), not adoptable at the time.
- `D-178-agent-portal-access`: packet adopted — Hark · 7eeb — 2026-11-07 — branch `agent/architect/d178-agent-portal`; rulings recorded as D-290; rows `D-178.gate`, `D-178.grant`, `D-178.read`, `D-178.screen`, `D-178.release` registered; `SKIPPY-6` now depends on `D-178.grant` and waits for its re-sync to R1.
