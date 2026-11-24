# Packet SKIPPY-7: opt-in auto-send within the grant's limits (D-201, D-141, D-290)

> Read [`docs/BRIEF.md`](../BRIEF.md), [`docs/SKIPPY.md`](../SKIPPY.md), [`SKIPPY-next.md`](SKIPPY-next.md) §"SKIPPY-7" and [`SKIPPY-6`'s landed code](SKIPPY-next.md) first. This packet writes the file-level plan for the ruling already recorded in `SKIPPY-next.md`; it may not change that ruling. A builder who finds the ruling contradicts the code stops and reports with evidence (D-032).

| Field | Value |
|---|---|
| Queue row | `SKIPPY-7` (Tier 1: money-adjacent, identity-adjacent, one additive migration) |
| Decisions | D-201 (4), D-141, D-142, D-290 (1)–(3), D-140, D-060, D-180, D-344, D-219/D-367, D-370 |
| Depends on | `SKIPPY-6` — done at `651d79c47` (#1507) |
| Flag | `SKIPPIE_AGENT_AUTOSEND_ENABLED` (declared, off) on top of the D-290 gate (`SKIPPIE_AGENT_ENABLED` + `SKIPPIE_AGENT_USER_IDS` + a live grant). No new gate key. |
| Verified against | `main` `796c33d80` on 2026-11-24 (SKIPPY-6 landed at `651d79c47`) |

## 1. Goal

A seeker who has already granted an agent the `send` scope may turn on **auto-send** for that one grant. From then on the agent's send request is approved by the server on the seeker's behalf, through the exact SKIPPY-6 approve path, inside the same limits, with the actor recorded as `agent_auto`. The seeker can turn it off, revoke the grant or pause all agents at any time, and the very next call stops. Auto-send never buys referrals: a shortfall parks the request for the seeker. One daily digest says what was auto-sent.

This moves the north-star goal (D-010/D-026) by letting a seeker who trusts an agent get more referral requests out per hour without giving up control of their referrals or their money.

## 2. Binding rules (quoted)

- **D-141:** "Seeker agents are granted by the seeker in their own session. Scope: look up, draft, send (default: draft). … Expiry default 7 days, maximum 30. Instant revoke and pause-all. … Default is ask-me-every-time. Agents can never buy credits or plans. Lower rate limits than people. Every action is in an audit log the seeker can read."
- **D-290 (3):** "Every send is approved in the seeker's session (standing approval stays SKIPPY-7, the owner's word). Limits count requests under a locked grant row; the per-request ceiling is one referral until the D-219 band mapping is settled. One call cap, 20 an hour and 60 a day per grant."
- **D-201 (4):** "Step 7 is opt-in per grant and runs through the same approve function."
- **`SKIPPY-next.md` §SKIPPY-7:** "Auto-send is a per-grant setting, `autoSend`, default off. Only the seeker can turn it on, in their session, on a confirmation that restates the grant's limits and expiry. It needs the `send` scope. An auto-send runs the exact SKIPPY-6 approve path with the actor recorded as `agent_auto`: same transaction, same limits …, same cost check, same label. Revoke and pause stop it at the very next call, because both are checked inside the transaction. It never buys credits: a shortfall parks the request for the seeker. The seeker gets one daily digest of what was auto-sent (D-060's one-email-a-day cap), and every send is in the audit log. Expiry stays within 30 days (D-141). The packet adds its own flag (`SKIPPIE_AGENT_AUTOSEND_ENABLED`, off) on top of the D-290 gate (no new gate key) and names the files once SKIPPY-6 has landed."
- **D-142:** the referrer sees "Sent via the seeker's assistant" on an agent ask. Auto-send does not change the label.
- **D-180/D-344:** user-facing text says referrals, never credits. Internal identifiers (`creditCount`, `creditsPerAsk`, `AGENT_ERROR.creditLimit`) stay.
- **D-060:** at most one such email per person per day; preferences respected.
- **D-370:** green required CI lands the pull request; no rule reads a model name. Tier 1 review applies only where the changed paths compute Tier 1 (`scripts/tierClassifyCore.mjs`).

## 3. Current behaviour, verified in code

SKIPPY-6 landed the send *request*; nothing auto-sends today.

- **Grant storage.** `seekerAgentGrants` has `canLookup`, `canDraft`, `canSend` (default false), four limit columns, `expiresAt`, `revokedAt` (`drizzle/schema.ts:1337-1360`). Pause-all is one row per seeker in `seekerAgentControls` (`drizzle/schema.ts:1363-1370`).
- **Approvals queue.** `assistantApprovals` carries `grantId` (nullable, FK `seekerAgentGrants`, `ON DELETE SET NULL`), `status` (`pending|approved|declined|expired`), `creditCount`, `targetRoleUrl`, `idempotencyKey`, `executedRequestId`, `expiresAt`, `decidedAt` (`drizzle/schema.ts:356-380`).
- **Ask origin.** `askOrigins` maps a request to `channel` (`skippy|agent`) and `agentGrantId` (`drizzle/schema.ts:1402-1407`).
- **The send request.** `POST /api/agent/v1/drafts/:id/send-request` refuses without `grant.canSend` (`server/seekerAgentRoutes.ts:271-310`), then writes one `assistantApprovals` row through `createSendRequest` with `idempotencyKey: agent-draft-<draftId>` (`server/seekerAgentDeps.ts:105-130`) and sends one in-app notice plus at most one email a day (`server/seekerAgentDeps.ts:222-253`). Nothing is sent and nothing is spent.
- **The approve path.** `decideAssistantApprovalWithAgentSend` (`server/agentSendApproval.ts:73-87`) sends every row with a `grantId` to `approveAgentSend` (`server/agentSendApproval.ts:89-175`). That function:
  - re-quotes and refuses a changed cost (`:100-102`), refuses above the one-referral ceiling (`:102`);
  - resolves the company from `companyDomain` (`:106-109`);
  - opens one transaction, locks the grant row `FOR UPDATE`, and re-checks owner, `revokedAt`, `expiresAt`, `canSend` and pause-all (`:118-125`);
  - counts this grant's approved sends in the last hour and day and refuses at `AGENT_SEND_HOURLY_CAP`/`AGENT_SEND_DAILY_CAP` (`:129-133`);
  - marks the row approved only if it is still `pending` (`:134-136`);
  - calls `createCompanyReferralRequest` with `idempotencyKey: agent-draft-<draftId>` (`:153-159`), writes `askOrigins` `channel: "agent"` (`:161-162`), records `executedRequestId` and a `seekerAgentEvents` row (`:163-164`);
  - on any failure reverts the row to `pending` so the seeker can fix the cause and approve again (`:166-174`, `:177-180`).
- **The decide route.** `server/assistantRoutes.ts:90` uses `decideAssistantApprovalWithAgentSend` as the default decide function.
- **The grant screen.** `client/src/pages/goal/assistants/GoalSeekerAgents.tsx` has a `scopeSend` toggle (`:36-37`), sends `scopes` on create (`:71`), and lists each grant's scopes and limits (`:117`). `client/src/pages/SeekerAgents.tsx` re-exports it.
- **The contract.** `shared/seekerAgents.ts` holds `AGENT_SCOPES` (`:19`), the caps (`:31-38`), `AGENT_EXPIRY_MAX_DAYS = 30` (`:41`), `createAgentGrantInputSchema` (`:57-63`), `AgentGrantView` (`:75-86`), `AgentSendRequestView` (`:103-108`) and `AGENT_ERROR` (`:119-133`).
- **Storage reconcile.** `server/schemaReconcile.ts` declares `seekerAgentGrants` (`:16`), `askOrigins` (`:20`), `assistantApprovals` (`:70`) and the additive columns `assistantApprovals.grantId` and `seekerAgentGrants.canSend` (`:133-134`).
- **Migration.** `drizzle/deploy/0125_skippy_agent_send.sql` is the SKIPPY-6 additive, information_schema-guarded file. `0126` is free on `main` `796c33d80`.
- **Scheduled jobs.** `server/scheduledJobRegistry.ts` registers each job by name, window and lease; there is no digest job today.
- **Pre-launch checklist.** `docs/SKIPPY.md:36` records step 7 as "limits enforced; revoke stops sends at once; never buys credits".

## 4. Rulings

### 4.1 Storage (one additive migration)

- `seekerAgentGrants.autoSend` — `boolean NOT NULL DEFAULT false`. Off for every existing grant; no backfill.
- `assistantApprovals.decidedBy` — `varchar(16) NULL`, values `seeker` or `agent_auto`. `NULL` means "written before this change" and is treated as a seeker decision. The digest reads `agent_auto`; the audit trail stays in `seekerAgentEvents`.
- Migration `0126_skippy_agent_autosend.sql`, information_schema-guarded, re-runnable, additive only. Allocate the number at build time against `drizzle/deploy/` on current `main` and plan §5; if `0126` is taken, take the next free number, update this packet and the row's `owns` together, and never edit an applied migration.
- Mirror both in `server/schemaReconcile.ts` (table SQL for `seekerAgentGrants`, the additive column list for `assistantApprovals`).

### 4.2 The contract (`shared/seekerAgents.ts`)

- `AgentGrantView` gains `autoSend: boolean`.
- `AgentSendRequestView` becomes `{ approvalId: number; status: "pending" | "approved"; creditCost: number; expiresAt: string; requestId?: number; note?: string }`. Widening `status` is additive; an agent that only reads `pending` keeps working.
- New `setAgentAutoSendInputSchema = z.strictObject({ enabled: z.boolean() })`.
- New error code `autoSendScope: "This agent cannot send on its own"` for a grant without `send`.

### 4.3 Turning it on (seeker session only)

- `POST /api/seeker/agents/:id/auto-send` with `{ enabled }`, behind the same `deps.enabled()` gate and the seeker session guard as the other `/api/seeker/agents*` routes.
- Ownership: `getGrantForUser(userId, id)`; another seeker's grant is 404.
- `enabled: true` requires `grant.canSend`; without it the route answers 400 with `AGENT_ERROR.autoSendScope` and changes nothing.
- `enabled: false` is always allowed, including on a revoked or expired grant.
- The route writes `seekerAgentGrants.autoSend` and one `seekerAgentEvents` row (`action: "grant.auto_send"`, `detail: "on"|"off"`).
- The client shows a confirmation before the request that restates the grant's limits and expiry and says, in referral words: the agent will send without asking, each send spends one of your referrals, it never buys referrals, and revoke or pause stops it. The confirmation is client-side copy over a server-enforced rule; the server never trusts it.

### 4.4 The auto-send itself (one path, no second implementation)

- The trigger is the existing `POST /api/agent/v1/drafts/:id/send-request`. After `createSendRequest` returns, when **all** of these hold, the route calls the SKIPPY-6 approve function in the same request:
  - `deps.autoSendEnabled()` (the new flag) is true;
  - `grant.autoSend` is true;
  - the created row is still `pending`.
- The call is `decideAssistantApprovalWithAgentSend(userId, created.id, "approved", {}, { actor: "agent_auto" })` — the same function the seeker's own approve uses. No second send path, no second transaction, no second cost check.
- `approveAgentSend` gains one optional `actor: "seeker" | "agent_auto"` (default `"seeker"`) and writes it to `assistantApprovals.decidedBy` in the same `UPDATE` that marks the row approved.
- Outcomes, all returned in the send-request response:
  - **sent:** `status: "approved"`, `requestId`, and one `seekerAgentEvents` row `action: "agent.auto_send"`, `outcome: "success"`.
  - **parked** (`AgentSendRefusal` with `needs_referrals`, `limit`, `cost`, `company`, `resume` or `grant`): the row is back to `pending` (the existing `revertToPending`), the response is `status: "pending"` with a plain `note`, and one `seekerAgentEvents` row `action: "agent.auto_send"`, `outcome: "denied"`, `detail` = the refusal code. The seeker sees the row in the approvals queue and can approve it themselves once they fix the cause.
  - **unexpected error:** the row is reverted to `pending` by the existing catch, the response is `status: "pending"`, and the event is `outcome: "failure"`.
- Revoke, expiry and pause-all are re-checked inside the approve transaction (`server/agentSendApproval.ts:118-125`), so they stop the very next call. The route's own `agentGuard` and `grant.canSend` check stay in front.
- Auto-send never reaches checkout, a plan, a pack or any purchase route. The existing test that an agent key reaches no checkout route stays.

### 4.5 The daily digest

- New scheduled job `agent-auto-send-digest` in `server/scheduledJobRegistry.ts` (hourly window, bounded to 100 users per run, oldest first), implemented in a new `server/agentAutoSendDigest.ts`.
- It reads `assistantApprovals` rows with `decidedBy = 'agent_auto'`, `status = 'approved'` and `decidedAt` in the last 24 hours, grouped by `userId`.
- One email per user per UTC day: the idempotency key is a `notifications` row with `kind: "agent_auto_digest"` and `eventKey: agent-auto-digest:<userId>:<YYYY-MM-DD>`, inserted with `onDuplicateKeyUpdate`; the email is sent only when that insert created the row. This is D-060's one-a-day cap expressed as a durable key, not a process-memory check.
- The email lists the count and the companies (names only, no seeker data), links to `/agents`, and says how to turn auto-send off. No referral amounts, no balances, no personal data beyond the seeker's own.
- A user with no auto-sends in the window gets no email.

### 4.6 The flag

- `SKIPPIE_AGENT_AUTOSEND_ENABLED` — declared in `.env.example` (blank, off), forwarded in `src/worker.ts` beside the other `SKIPPIE_*` keys, and read through the same helper shape as `SKIPPIE_AGENT_ENABLED`.
- Off: the auto-send route answers 404, the send-request route never auto-sends, the grant view reports `autoSend: false`, and the client hides the toggle. The grant's stored `autoSend` value is preserved, not cleared.
- On: the D-290 gate still applies (`SKIPPIE_AGENT_ENABLED` + allow-list + live grant). No new gate key.

### 4.7 Copy

- Referral words only (D-180/D-344): "referrals", never "credits". The grant screen's existing "Referrals per send" labels stay.
- Every line states the action, the outcome and the cost (D-153). No dark patterns, no urgency, no claim that auto-send is required.

## 5. Files in scope

- `shared/seekerAgents.ts` — view field, response union, input schema, error code.
- `server/agentSendApproval.ts` — the `actor` parameter and the `decidedBy` write; nothing else changes.
- `server/seekerAgentRoutes.ts` — the auto-send route, the auto-send branch in the send-request route, `grantView`.
- `server/seekerAgentDeps.ts` — `setAutoSend` store method, `autoSendEnabled` dep, `notifySendRequest` unchanged.
- `server/agentAutoSendDigest.ts` (new) — the digest query and send.
- `server/scheduledJobRegistry.ts` — register `agent-auto-send-digest`.
- `drizzle/schema.ts` — `seekerAgentGrants.autoSend`, `assistantApprovals.decidedBy`.
- `drizzle/deploy/0126_skippy_agent_autosend.sql` (new; number confirmed at build time).
- `server/schemaReconcile.ts` — the two additive declarations.
- `client/src/pages/goal/assistants/GoalSeekerAgents.tsx` — the toggle, the confirmation, the view field.
- `.env.example`, `src/worker.ts` — the new flag.
- Tests beside each: `server/seekerAgentAutoSend.test.ts` (new), `server/agentAutoSendDigest.test.ts` (new), plus the existing `server/seekerAgentSend.test.ts`, `server/seekerAgents.test.ts` and the grant-screen test.
- `docs/plans/SKIPPY-7-auto-send.md` (this packet) and `docs/plans/SKIPPY-next.md` (Status line only).

**Out of scope:** any change to the SKIPPY-6 send-request semantics for a grant without `autoSend`; the approvals queue's own expiry, decline or edit behaviour; `createCompanyReferralRequest`, the ledger, the quote, the banded checkout, prices, plans or refunds; the referrer label; the login rule; `SKIPPIE_AGENT_ENABLED`'s meaning; the Skippy seeker chat; any new dependency.

## 6. Steps

1. **Contract first.** Add `autoSend` to `AgentGrantView`, widen `AgentSendRequestView`, add `setAgentAutoSendInputSchema` and `AGENT_ERROR.autoSendScope`. Write the contract tests; they fail.
2. **Storage.** Add the two columns to `drizzle/schema.ts`, write `0126_skippy_agent_autosend.sql` (information_schema-guarded, re-runnable), mirror both in `server/schemaReconcile.ts`, and add the real-MySQL apply-twice check the migration CI expects.
3. **The approve actor.** Add `actor` to `approveAgentSend` and write `decidedBy` in the same `UPDATE`. Existing callers keep the default. Run `server/seekerAgentSend.test.ts` unchanged.
4. **The route.** Add `POST /api/seeker/agents/:id/auto-send` with the ownership, `canSend` and event rules of §4.3.
5. **The auto-send branch.** Wire §4.4 into the send-request route behind the flag. Keep the response contract of §4.2.
6. **The digest.** Add `server/agentAutoSendDigest.ts` and register the job. Prove the one-a-day key with a fixture that runs the job twice.
7. **The screen.** Add the toggle and the confirmation to `GoalSeekerAgents.tsx`, in referral words, with the grant's limits and expiry restated.
8. **The flag.** Declare `SKIPPIE_AGENT_AUTOSEND_ENABLED` in `.env.example`, forward it in `src/worker.ts`, and extend the config-contract test.
9. **Docs.** Update this packet's Status and the `SKIPPY-next.md` Status line. Record the migration number in plan §5.

## 7. Red-first tests

Every test below is written first and must fail for the stated reason.

**Contract and storage**
1. `AgentGrantView` carries `autoSend` and defaults to `false` for a grant created without it.
2. `setAgentAutoSendInputSchema` rejects an unknown field and a non-boolean.
3. The migration applies twice with no error and leaves existing rows unchanged (real MySQL, the migration CI harness).

**Turning it on**
4. A seeker turns auto-send on for their own grant with `send`; the row reads `autoSend: true` and one `grant.auto_send` event exists.
5. A grant without `send` refuses `enabled: true` with `autoSendScope` and changes nothing.
6. Another seeker's grant id is 404 and nothing changes.
7. Turning it off works on a revoked grant.
8. With `SKIPPIE_AGENT_AUTOSEND_ENABLED` off, the route is 404 and the stored value is unchanged.

**The auto-send**
9. With the flag on and `autoSend` on, a send request returns `status: "approved"` with a `requestId`, one ask exists, one debit exists, `askOrigins.channel` is `agent`, and `assistantApprovals.decidedBy` is `agent_auto`.
10. With `autoSend` off, the same request returns `status: "pending"` and nothing is sent or spent.
11. A shortfall (no referral available) parks the row: `status: "pending"`, the row is still `pending`, no debit, and the event is `denied` with `needs_referrals`.
12. A changed cost between the draft and the auto-send refuses with `cost`, the row stays `pending`, and nothing is spent.
13. Revoking the grant between the request and the auto-send refuses with `grant` and sends nothing.
14. Pause-all between the request and the auto-send refuses with `grant` and sends nothing.
15. Two concurrent auto-sends over the daily cap produce one ask and one refusal (the grant row lock).
16. A retried send request with the same draft produces one ask and one debit (the existing idempotency key).
17. An agent key still reaches no checkout, plan or purchase route.
18. The referrer sees "Sent via the seeker's assistant" on an auto-sent ask, exactly as on a seeker-approved agent ask.

**The digest**
19. Two auto-sends in one day produce one digest email; running the job twice sends nothing twice.
20. A user with no auto-sends gets no email.
21. The digest names only companies and a count, and links to `/agents`.

**The screen**
22. The toggle appears only for a grant with `send`, restates the limits and expiry, and says it never buys referrals.
23. Turning it off from the screen calls the route and shows the off state.

## 8. Definition of done

- Every §7 test exists, was red first, and is green.
- `pnpm check`, the focused suites, `pnpm build`, the design-token audit, the migration lint and the deploy-trigger check pass on the branch merged with current `origin/main`.
- The migration is applied and verified before any schema-dependent code is released (migration-first), and plan §5 records its number.
- The flag is off in production; the grant screen shows no toggle while it is off.
- Exact-head required CI is green; the pull request lands through auto-merge (merge commit).
- The packet's Status line and the `SKIPPY-next.md` Status line record the outcome with the evidence block from `docs/DELEGATION.md` §5.

## 9. Review checklist (Tier 1)

1. **Scope:** the diff touches only §5's files.
2. **One path:** the auto-send calls `decideAssistantApprovalWithAgentSend`; there is no second send, cost or limit implementation.
3. **Limits:** the grant row lock, the hourly/daily caps and the one-referral ceiling are the SKIPPY-6 ones, unchanged.
4. **Money:** every debit goes through the existing keyed ledger path; a retried request writes nothing twice; a parked request spends nothing.
5. **Identity and privacy:** every route is scoped to the signed-in seeker; another account's grant is 404; the digest carries no personal data beyond the seeker's own.
6. **Failure paths:** no silent catch; a refusal is plain words and leaves the row `pending`; Sentry carries no tokens or personal data.
7. **Time:** timestamps come from the app clock, never MySQL `NOW()` compared with `Date.now()`.
8. **Contracts:** Zod at every boundary; no `any`, unchecked cast or non-null assertion.
9. **Copy:** referrals, never credits; the confirmation restates the limits and expiry.
10. **Docs:** this packet's Status and the `SKIPPY-next.md` Status line match what was reproduced.

## 10. Stop and ask

- If `0126` is taken at build time, take the next free number and update this packet and the row's `owns` in the same commit; do not edit an applied migration.
- If the approvals queue's own expiry or decline behaviour would need to change to make auto-send work, stop: that is SKIPPY-6's contract, not this row's.
- If a shortfall cannot be parked without spending, stop and report: "never buys" is a ruling, not a preference.
- If the digest cannot be made idempotent with a durable key, stop and report rather than shipping a process-memory guard.
- If any of this would change a price, plan content, legal text, the login rule or referrer fairness, stop and `--report blocked` with the exact question.

## 11. Status

- SKIPPY-7: in progress — Gemini 2.5 Pro · c243 — 2026-11-24 — branch agent/queue/skippy-auto-send
