# Packet ASSIST-approval-cost: an approved assistant ask is charged exactly what the owner saw, or not at all (#644)

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | `ASSIST-approval-cost` in `docs/plans/assignments.json` |
| Decisions | Payments bar (AGENTS.md §0a), D-034, D-110/D-132 (`ASK_LEVEL_COST`), D-151 |
| Risk tier | 1 (money): one independent review by a model other than the builder's |
| Source | Issue #644 (Instinct coordinator); CEO ruling on the contract below |
| Verified against | `main` `1b4d9939` on 2026-10-25 |

## 1. Goal
When the owner approves an assistant-proposed ask, the server charges the cost the owner saw when they tapped Approve, or charges nothing and says the price changed.

## 2. Why it matters now
It doesn't matter in production yet:
- `ASK_LEVEL_COST` is off, so every ask costs 1, and the proposal records 1.
- Only the `land` plan grants `assistants` (`shared/planEntitlements.ts:102`), and passes are not sold (D-146).

It must land before either changes:
- When `ASK_LEVEL_COST` is on, an ask costs its job level (1-10), but `proposeAssistantAsk` still records `creditCount: ASSISTANT_ASK_CREDIT_COST` (1).
- `decideAssistantApproval` never reads that value again. It charges whatever `createCompanyReferralRequest` costs at execution.

So the owner would see 1 credit and pay up to 10.

## 3. Current behaviour (verified)
- `server/db.ts` `proposeAssistantAsk` stores `creditCount: ASSISTANT_ASK_CREDIT_COST` (= 1).
- `createAssistantApproval` stores the body's `creditCount` as display metadata.
- `decideAssistantApproval` on approve + `ask_send` calls `createCompanyReferralRequest` with the approval's fixed idempotency key. If that throws, it rolls the approval back to `pending`.
- `server/assistantRoutes.ts` `POST /api/assistants/approvals/:approvalId/decision` takes `{ decision, kind }`. It maps `OpenAskSlotCapError` to 409 `{ code }`.
- The compose screen's quote (`GET /api/company-referrals/quote`, `server/privateReferralRoutes.ts`) prices an ask as `askLevelCostEnabled() ? creditsForLevel(assignJobLevel({ url: normalizeTargetRoleUrl(url) }).level) : 1`. Its comment says this always matches the charge.
- `client/src/pages/Approve.tsx` sends `{ decision, kind }` only.

## 4. Contract (CEO ruling on #644; amends its proposal)
1. The decision body for an approve of a chargeable kind (`ask_send` today) must carry `expectedCreditCount`: the integer the screen showed.
2. Before calling `decideAssistantApproval`, the route re-derives the current cost with a new pure helper. Then:
   - **Match:** proceed unchanged. The executor charges the same amount, because it uses the same derivation.
   - **Missing or different:** do not call the executor. Answer 409 `{ code: "cost_changed", creditCount: <current> }` and leave the approval `pending`. This follows the slot-cap convention.
3. Comparing against what the screen showed, rather than the stored `creditCount`, lets the owner re-approve at the new price without a stuck loop.
4. A decline needs no cost.
5. Race note: the check runs just before execution, and the cost depends only on the job link and a deploy-time flag. The only remaining window is a flag flip between two lines of one request, which no user can trigger. Say so in a code comment.

### 4a. As built (Oct 27, `Claude Code · d2fb`; the row's D-221 note wins over item 1)
The D-221 row note says the owner approves the quote route's full cost object, not an integer. On `main` that object is the quote's `{ level, cost }`. A D-219 band or spend-source quote does not exist yet. Coordination is on #644 (comment 6447494982).
- **Contract.** `shared/assistantApprovalCost.ts` holds a strict Zod `{ level, cost }`, `sameApprovalCost` (compares every schema field), the 409 body schema and the message. A field added later (a D-219 level band or spend source) is compared too, and a client that does not echo it gets a 409, never a charge.
- **The card shows the real cost.** `GET /api/assistants/approvals` attaches `cost` to each pending `ask_send` that would charge. It comes from one owner-scoped read (`readApprovalCosts`), so the screen shows what the route will hold the owner to.
- **The decision.**
  - On approve, the body carries `expectedCost`. A missing or different value gets 409 `{ code: "cost_changed", cost, error }`, the executor is never called, and `assistant.approval_cost_changed` (denied) is recorded.
  - A decline never reads a cost. A paid-tool marker, a handled or expired approval, or one without a job link charges nothing, so it is decided as before.
  - An unreadable cost fails closed (500, nothing charged).
- **Message (D-180, no "ask" or "credit"):** "This referral request now costs N referrals. Approve again to send it at that cost."
- **§8 check, not triggered.** Tests pin `quoteApprovalCost` both to the quote route (through its deps) and to the executor's own call, `askCreditCost({ title, description, url: targetRoleUrl })` of `companyAskJobRow`, across 8 links with the flag on and off.
- **Extra files, registered in #760.** `Approve.tsx` now only switches to the dark goal `GoalApprove.tsx`, which posted `{ decision, kind }` too, so it gets the same change. `shared/assistantApprovalCost.ts` keeps the client from importing `server/`.

## 5. Files
- **New:** `server/assistantApprovalCost.ts`, which exports `currentApprovalCost(approval)` and reuses `assignJobLevel`, `normalizeTargetRoleUrl`, `creditsForLevel` and `askLevelCostEnabled` exactly as the quote route does. Import them; never copy the formula.
- **New:** `server/assistantApprovalCost.test.ts`.
- `server/assistantRoutes.ts`: the decision handler only.
- `server/assistantRoutes.test.ts`.
- `client/src/pages/Approve.tsx`: send `expectedCreditCount` (the cost the card shows). On 409 `cost_changed`, show "This ask now costs N referrals. Approve again to send it at that cost." and update the card's cost.
- `client/src/pages/approve.test.tsx`.
- Added Oct 27 (§4a, #760): `shared/assistantApprovalCost.ts` and its test, `client/src/pages/goal/assistants/GoalApprove.tsx` and `assistantFlows.test.tsx`; the list handler in `server/assistantRoutes.ts` attaches the current cost.
- Out of scope: `server/db.ts` and `server/privateReferralRoutes.ts` (owned by `D-132-audit` and others). Do not edit them.

## 6. Tests first (red on today's code)
- Helper: with the flag off it returns 1. With the flag on, an L3 link costs 3, matching the quote route's answer for the same URL. Call the route through its deps in one test, so the two can never drift.
- Route:
  - approve with a matching `expectedCreditCount` executes;
  - missing or different gives 409 `cost_changed` with the current cost, and the executor is never called (assert on the injected `decideAssistantApproval`);
  - decline needs no cost;
  - a non-chargeable kind is unaffected.
- Client: the body carries `expectedCreditCount`. A 409 `cost_changed` updates the shown cost and keeps the approval on screen.

## 7. Definition of done
- [ ] Red first, then green.
- [ ] `pnpm check`, the focused tests and `pnpm build` pass.
- [ ] One independent PASS from a model other than the builder's on the exact head (D-151).
- [ ] Required CI is green on that head.
- [ ] The row is set to `done`.
- [ ] `ASK_LEVEL_COST` and any sale of `land` stay off until this row is done (recorded in `D-132-audit`'s note).

## 8. Stop and ask if
The quote route and `createCompanyReferralRequest` price the same link differently on `main`. That is a D-132-audit finding: report it with both numbers.

## Status
- ASSIST-approval-cost: done — 7db0bd6b. Code reviewed PASS by Cline · 03b2 on b8b4520d (independent, non-Claude); every commit after that head is a main merge touching no owned path, verified before landing. Landed after a full gate on the merged tree: typecheck, token audit, migration lint, deploy triggers, scope-check (10 owned paths), 60/60 focused money-path tests, production build.
