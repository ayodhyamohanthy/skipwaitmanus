# D-180-conversation-copy — ownership contract for the seeker conversation's money-copy and capacity wording (proposal)

Status: **proposal only, not registered.** Drafted Oct 28, 2026 by a Claude Code session (reasoning role, D-225) from `main` `e67f7785`. Nothing here changes code, `docs/plans/assignments.json` or any PR. PR #786 stays draft. The registry delta in §3 takes effect only when a session lands it through the protected docs-only path (D-082/D-200, owner merge-policy amendment Oct 23).

## 0. Why this exists (the block, with evidence)

- PR #786 (row `D-048-p3-live-review-conversation`, branch `agent/queue/d048-live-review-conversation`, head `047c7ba0`) reports that it is blocked: "unowned `shared/moneyCopy.ts` has no current-terminology phrase for the withdraw-confirm/withdrawn lines ... no D-180 registration exists; pre-existing declined/withdrawn slot-capacity wording untouched (no verified owner)". Source: `docs/plans/OCT21-BUILT-PRS.md` Status line added at `047c7ba0`, and the picker board (`node scripts/next-task.mjs --status`, entry 49).
- The row's packet requires every money line to come from `shared/moneyCopy.ts` (`docs/plans/OCT21-BUILT-PRS.md:65`, item 1). Its `owns` cover the page, `threadModel.ts`, their tests, fixtures and captures, but not `shared/` (`docs/plans/assignments.json`, row at line 790).
- `shared/moneyCopy.ts` holders on `main` `e67f7785`. Each one is a real `owns` entry (`docs/plans/assignments.json`):

| Row (line) | Status on `main` / board | Entry | Holder evidence |
|---|---|---|---|
| `D-132-audit` (904) | done | `shared/moneyCopy.ts`, `shared/moneyCopy.test.ts` | finished, so it holds nothing |
| `D-174-held-ask-reconfirm` (3307) | todo, "not started · waiting" | `shared/moneyCopy.ts` | no branch `agent/queue/d174-held-ask-reconfirm` on origin (`git ls-remote`), no session holder |
| `D-099-bonus-pages` (2989) | todo | `shared/moneyCopy.ts (switch only)` | no branch `agent/claude/d099-bonus-pages` on origin |
| `D-180-a-free-asks-chip` (3753) | in-review, PR #716, "behind main 356" | `shared/moneyCopy.ts`, `server/moneyCopy.test.ts` | branch tip `12157a9e` (Oct 26, author "Instinct Agent"); the board shows no session holder |

- The D-180 owners are narrow by their own text. D-180-a is the headline only: "Paid-unit credits and the ASK_COST tail stay with D-180-referral-words" (`docs/plans/assignments.json:3783`, `docs/plans/D-180-a-free-asks-chip.md:6-9`). D-174 owns reconfirm (`assignments.json:3322`) and D-099 owns the bonus switch only. **No `D-180-referral-words` row exists.** It is named only in prose (`D-180-a-free-asks-chip.md:6,9`, `docs/plans/D-048-money.md:30`, `assignments.json:3783`). A scan of the registry `tasks[].id` returns only `D-180-terminology-docs-sync` and `D-180-a-free-asks-chip`.
- The `shared/moneyCopy.ts` exports cover the never-paid sentence (`REFERRER_MONEY_SENTENCE`, `shared/moneyCopy.ts:29`), the credit rule (`:61`, `:75`), caveats (`:77`, `:80`) and cost phrases (`:122-131`). None of them is a terminal-state (declined/withdrawn/closed) conversation line or a withdraw-confirm line (`grep -n "^export" shared/moneyCopy.ts`).

## 1. Facts the wording must match (runtime, unchanged by this contract)

| # | Fact | Source |
|---|---|---|
| F1 | A slot is counted only for `status = "pending"` and `waitingForCoverage = false`, and only within the 7-day visible window or while assigned and not held. Waiting and held asks never use a slot. | `server/planGates.ts:14-37`, `server/coverageDelivery.ts:76`, `shared/openAskSlots.ts:1-8` |
| F2 | A withdrawal returns the internal charge only when no pickup happened, and only for what actually came back. `creditRefunded` can be `false` even on the no-pickup path, because a refund is capped by the bucket's month or cycle. | `server/db.ts:2290-2335` (`refundLedgerSpendTx` `returned`, `:2364`), comment `shared/moneyCopy.ts:36-48` |
| F3 | The seeker's thread payload has no refund, pickup or debit field, so the conversation page cannot know whether a withdrawal refunded anything. | `client/src/lib/threadApi.ts:87-112` (`ThreadRequest`) |
| F4 | The server already tells the seeker the true refund outcome in the withdrawal notice, including the case where a pickup keeps the charge spent. | `server/db.ts:2310`, `server/coverageDelivery.ts:74` (`COVERAGE_WITHDRAWN_NOTICE`) |
| F5 | No referrer path writes `declined` any more: a decline is a pass that reopens the ask to the company (`pending`). A `declined` status in the thread is therefore a legacy row. Every employee decline keeps the charge spent. | `server/db.ts:2133-2139`, D-021 (`docs/DECISIONS.md:39`), D-147 (`:161`) |
| F6 | `closed` with `referrerId === null` comes only from the legacy expiry clocks: the 7-day unclaimed expiry returns the charge subject to F2, and the 90-day coverage close never charged. Whether this close refunded anything is not in the thread payload (F3). | `shared/referral.ts:76,79`, `shared/moneyCopy.ts:61`, AGENTS.md system map (`ask-expiry-sweep`), D-174 (`docs/DECISIONS.md:181`) |
| F7 | A waiting or held ask has no debit, so withdrawing it uses nothing. | `server/db.ts:2317-2319` (`debitTransactionId === null` branch), D-034/D-047 |
| F8 | Availability is never framed to users; it only routes the ask. | D-176 (`docs/DECISIONS.md:183`) |
| F9 | Public vocabulary is "referral request" (formal noun). "Ask" as a noun is internal. Money amounts and rules stay frozen, and the unit-word pass belongs to the terminology lane. | D-180 (`docs/DECISIONS.md:187`), `docs/plans/D-048-money.md:30` |

Runtime boundaries this contract **does not touch**: pricing (`docs/PRICING.md`, D-219), charge at first visibility (D-034), D-147 decline-spent, D-038 timers, the legacy 7-day/90-day clocks (`shared/referral.ts:76,79`) and their removal path (D-193 → `D-174-expiry-clock-removal`), `server/db.ts`, `server/planGates.ts` and every flag.

## 2. The proposed contract

### 2a. Shared helper (new row `D-180-conversation-copy`, Tier 1)

This adds one new module. It does not edit `shared/moneyCopy.ts`, so it collides with no current holder (§0 table) and needs no ACK. Its money facts are either imported from `shared/moneyCopy.ts` or pinned by test to the server text that states them. It introduces no new money rule, amount or unit, so it satisfies "every money line comes from `shared/moneyCopy.ts`" (`OCT21-BUILT-PRS.md:65`) by composition, not by retyping.

`shared/conversationCopy.ts` exports:

| Export | Value | Rule it encodes |
|---|---|---|
| `CLOSED_UNCLAIMED_LINE` | `"Nobody accepted it. This referral request is closed."` | F6, F3: fact only, with no clock, refund or slot claim |
| `DECLINED_LINE` | `"It’s not a judgment of you. This referral request was declined and is closed."` | F5, F8: no "slot open again" and no "try another verified referrer at {Company}" availability nudge |
| `WITHDRAWN_LINE` | `"You withdrew this referral request."` | F2-F4: the page cannot verify a refund, so it states none (the notice F4 does) |
| `WITHDRAW_CONFIRM_AWAITING` | `"It never reached a verified employee, so no credit was used."` (byte-identical to today, `SeekerConversation.tsx:144` on `main`) | F7. The unit word stays until the terminology lane renames it (F9) |
| `WITHDRAW_CONFIRM_VISIBLE` | `"It leaves the referrer’s queue and stops counting toward your open referral requests."` | F1. This replaces "frees your slot" with the verified counting fact and no promise of free capacity (plan cap and per-company cap still apply, `shared/openAskSlots.ts:1-8`) |
| `seekerTerminalLine(status, { claimed })` | `declined` → `DECLINED_LINE`; `withdrawn` → `WITHDRAWN_LINE`; `closed` → `claimed ? null : CLOSED_UNCLAIMED_LINE`; any other status → `null` | keeps today's `closed`+claimed → no line (`SeekerConversation.tsx:34` on `main`) |
| `TERMINAL_LINE_FORBIDDEN` | `readonly RegExp[]`: `/slot/i`, `/credit/i`, `/refund\|came back\|comes back\|returned/i`, `/\b\d+\s*days?\b/i`, `/try another\|available\|open to/i`, `/\basks?\b/i` | the testable form of "fact-only" (F2-F9) |

What it does **not** own: the pending and waiting lines in `client/src/components/thread/threadModel.ts:60-77` (they stay as they are, under the conversation row), `REFERRER_MONEY_SENTENCE` (imported as-is), and the "Find another referrer" CTA. That CTA is not a money or capacity line; whether its label is an availability claim under D-176 is an open question for the conversation row's D-151 reviewer, not decided here.

### 2b. Helper tests (owned by `D-180-conversation-copy`): `shared/conversationCopy.test.ts`

1. Each of the five constants equals its string in §2a exactly.
2. Every terminal line (`CLOSED_UNCLAIMED_LINE`, `DECLINED_LINE`, `WITHDRAWN_LINE`) matches **no** pattern in `TERMINAL_LINE_FORBIDDEN`.
3. `WITHDRAW_CONFIRM_VISIBLE` matches neither `/slot/i` nor `/available|free again|try another/i`.
4. `seekerTerminalLine`: `("closed", {claimed:true})` → `null`, `("closed", {claimed:false})` → `CLOSED_UNCLAIMED_LINE`, `"pending"`/`"approved"` → `null`.
5. Source parity for F7: `COVERAGE_WITHDRAWN_NOTICE.body` contains `"so no credit was used"`, and `WITHDRAW_CONFIRM_AWAITING` ends with the same clause. A shared test may already import a server module this way (`shared/moneyCopy.item7.test.ts:3`).
6. Boundary pin: the module exports no number, and importing it leaves `ASK_TTL_DAYS === 7` and `COVERAGE_WAIT_DAYS === 90` (`shared/referral.ts:76,79`) unchanged.

### 2c. Adoption and capacity tests (owned by `D-048-p3-live-review-conversation`, files already in its `owns`)

These files are registered in that row (`assignments.json:790`). No ownership changes.

| File | Test | Owner |
|---|---|---|
| `client/src/pages/conversation/SeekerConversation.goal.test.tsx` (new at `047c7ba0`) | For `declined`, `withdrawn` and `closed` with `referrerId: null`, the "Your next step" region text equals `seekerTerminalLine(...)`, and none of `TERMINAL_LINE_FORBIDDEN` matches the region. `closed` with a `referrerId` renders no terminal line. The withdraw confirm shows `WITHDRAW_CONFIRM_AWAITING` for `queueStatus` `waiting_for_coverage`/`held_for_credit` and `WITHDRAW_CONFIRM_VISIBLE` otherwise. This replaces the inline string at `047c7ba0`'s "never claims a 7-day clock" case. | D-048-p3-live-review-conversation |
| `client/src/pages/referralConversation.test.tsx` (lines ~295-305 at `047c7ba0`) | The unclaimed-closed case expects `CLOSED_UNCLAIMED_LINE` (imported), keeps the "no `7 days`" and "no `slot`" negatives and keeps the `/explore` link | D-048-p3-live-review-conversation. Co-owner `D-048-p3-conversation` (`assignments.json:1692`) already `dependsOn` the live-review row, so it is serialized and needs no ACK |
| `client/src/components/thread/threadModel.test.ts` | unchanged (pending lines are out of scope) | D-048-p3-live-review-conversation |

Page adoption (same row): `SeekerConversation.tsx` `nextLine` (`case "declined"/"withdrawn"/"closed"`, lines 33-35 at `047c7ba0`) and the confirm paragraph (line 155 at `047c7ba0`) read from `@shared/conversationCopy`, with no retyped string.

## 3. Registry delta (proposed; not applied)

**(a) Add one row** to `docs/plans/assignments.json` `tasks`, placed directly above `D-048-p3-live-review-conversation` (line 790) so the picker hands it out first:

```json
{
  "id": "D-180-conversation-copy",
  "title": "Seeker conversation terminal and withdraw-confirm lines from one shared helper, fact-only (D-180 slice)",
  "row": "COPY",
  "packet": "docs/plans/D-180-conversation-copy.md",
  "tier": 1,
  "lane": "terminology",
  "branch": "agent/copy/d180-conversation-copy",
  "status": "todo",
  "dependsOn": [],
  "owns": ["shared/conversationCopy.ts", "shared/conversationCopy.test.ts"],
  "note": "Unblocks D-048-p3-live-review-conversation (#786). New module only; shared/moneyCopy.ts is not edited, so no current holder (D-174-held-ask-reconfirm, D-180-a-free-asks-chip, D-099-bonus-pages switch-only) is touched and no ACK is needed. Fact-only terminal lines: no slot, refund, clock or availability claim (F1-F8 of the packet). No behavior, price, charge, refund, expiry or flag change. The unit word 'credit' in WITHDRAW_CONFIRM_AWAITING stays byte-identical until a registered D-180-referral-words row renames it; that row must own shared/conversationCopy.ts and shared/conversationCopy.test.ts and dependsOn this row. Review: D-151, not the builder's model family."
}
```

`dependsOn: []` is correct because no registered row owns either path. `ownsOverlap` (`scripts/nextTaskCore.mjs:81-87`) finds no overlap with any `shared/` entry on `main`, which are all exact paths. Picker serialization comes from `filesBusy` (`nextTaskCore.mjs:423`). Scope is enforced on the PR by `scripts/scope-check.mjs:33-50`.

**(b) Amend `D-048-p3-live-review-conversation`** (line 790):
- `dependsOn`: append `"D-180-conversation-copy"`. That gives `["D-038-reconcile", "D-132-audit", "ROW20-CD", "D-048-F-goal-check", "D-180-conversation-copy"]`. The first four are already `done`.
- `note`: append "Oct 28: terminal (declined/withdrawn/closed-unclaimed) and withdraw-confirm lines come from shared/conversationCopy.ts (D-180-conversation-copy); adoption pins in SeekerConversation.goal.test.tsx and referralConversation.test.tsx per that packet §2c. #786 stays draft until that row lands."
- `owns`: unchanged.

**(c) No change** to `D-180-a-free-asks-chip`, `D-174-held-ask-reconfirm`, `D-099-bonus-pages`, `D-048-p3-conversation` or `D-132-audit`.

## 4. The rejected alternative and the ACK it would need

Adding these lines inside `shared/moneyCopy.ts` would collide with:
- `D-180-a-free-asks-chip` (in-review, PR #716). This needs an ACK from whichever session holds PR #716. The board shows no session holder, and the branch tip `12157a9e` is by "Instinct Agent", Oct 26. Alternatively, a registry reorder by the CEO under D-200.
- `D-174-held-ask-reconfirm` (todo, unclaimed). With no holder to ACK, only a CEO registry change under D-200 could clear it.

**No such ACK exists today, and this packet does not claim one.** The row would also inherit D-174's wait chain (`D-132-item3`, `D-090-BYOR`, both todo), which would hold #786 indefinitely. Rating: 3/10, against 8/10 for §2. The one point against §2 is a second shared copy module. That cost is bounded, because the future D-180-referral-words row must own both files (§3a note).

## 5. Open questions for the owner or CEO (not decided here)

1. Should `WITHDRAW_CONFIRM_AWAITING` drop the word "credit" now ("so nothing was used")? D-180 keeps money wording frozen until the terminology lane runs (F9), so this packet keeps it byte-identical. Rating for changing it now: 5/10.
2. Is "Find another referrer" (`SeekerConversation.tsx`, closed states) an availability claim under D-176? This is the conversation row's D-151 reviewer's call.

---
Holder snapshot taken Oct 28, 2026 from `main` `e67f7785`, `git ls-remote origin` and `node scripts/next-task.mjs --status`.
