# D-180-conversation-copy — ownership contract for the seeker conversation's fact-only lines (proposal, revision 3)

Status: **registration landed on `main` (`4dbf6e97`, Oct 28), so the contract below is effective.** The row owns `shared/conversationCopy.ts` and `shared/conversationCopy.test.ts`, and `D-048-p3-live-review-conversation` now depends on it. The helper and its §4b tests are built on `agent/copy/d180-conversation-copy` (see Status); the §4c adoption, action-link and parity pins remain that row's work, and #786 stays draft.

Historical architect revision: Revision 3, Oct 28, 2026, by a Claude Code session (reasoning role, D-225), rechecked on `main` `e67f7785`. It replaces revision 2 (`a3545a61`) and revision 1 (`c333a724`). It answers revision 1's five review findings (§6) and revision 2's two (§7). No ready or adoption flag is set. The architect revision changed no code, registry, shared packet or PR; this coordinator registration candidate includes only the stated docs/registry amendments, no runtime code. PR #786 stays draft. §3 and §4 take effect only when a session lands them through the protected docs-only path (D-082/D-200, owner merge-policy amendment Oct 23).

## 0. The block

- **What #786 reports.** PR #786 (row `D-048-p3-live-review-conversation`, head `047c7ba0`) says it is blocked. `shared/moneyCopy.ts` is unowned by the row and has "no current-terminology phrase for the withdraw-confirm/withdrawn lines", and the pre-existing declined/withdrawn slot wording has "no verified owner". Sources: the `docs/plans/OCT21-BUILT-PRS.md` Status line added at `047c7ba0`, and `node scripts/next-task.mjs --status` entry 49.
- **The rule that binds the row.** `docs/plans/OCT21-BUILT-PRS.md:65` (item 1) says "every money line comes from `shared/moneyCopy.ts`". It also says "the withdraw confirm says the credit comes back on a withdrawal before pickup, as `CREDIT_RULE` does".
- **What the row owns.** The row's `owns` cover the page, `threadModel.ts`, their tests, the fixtures and the captures. They do not cover `shared/` (`docs/plans/assignments.json:790`, registered by `7cc7af47`).
- **Who holds `shared/moneyCopy.ts`** on `main` `e67f7785`:

| Row | Line in `docs/plans/assignments.json` | Status on the board | Holder |
|---|---|---|---|
| `D-132-audit` | 904 | done | none |
| `D-174-held-ask-reconfirm` | 3307 | todo | no branch on origin, no session |
| `D-099-bonus-pages` (switch only) | 2989 | todo | no branch on origin |
| `D-180-a-free-asks-chip` | 3753 | in-review, PR #716 | branch tip `12157a9e`, Oct 26, author "Instinct Agent"; no session holder on the board |

- **No row exists for the remaining terminology work.** No `D-180-referral-words` row is registered. Searching `tasks[].id` finds only `D-180-terminology-docs-sync` and `D-180-a-free-asks-chip`.

## 1. Settled policy this revision applies (not owner questions)

- **The money-line hold has expired.** D-173 says "Money lines stay byte-identical until that audit lands" (`docs/DECISIONS.md:180`), and that audit, `D-132-audit`, is `done` (`assignments.json:904`). So nothing keeps "credit" in new copy.
- **D-180 is active now.** Public vocabulary is "referral" only. "Referral request" is the reviewed copy proposal for the formal noun, not an owner-approved frozen string (`docs/DECISIONS.md:187`). The same rule appears for goal surfaces in `docs/plans/D-048-money.md:30`: no display string says "credit"; a request is never shown as a completed referral; a balance is stage-qualified.
- **D-219 amounts come later** and are out of scope here (`docs/PRICING.md`, D-219). New lines state no amount.
- **D-176 bars availability status, not navigation.** D-176 bars visible availability status or framing (`docs/DECISIONS.md:183`). A search or navigation action is not barred.

## 2. Facts the wording must match (runtime, unchanged)

| # | Fact | Source |
|---|---|---|
| F1 | Only a `pending` ask with `waitingForCoverage = false` (and inside its visible window, or assigned and not an unclaimed assignment) counts toward open requests. A withdrawn ask never counts. | `server/planGates.ts:14-37`, `shared/openAskSlots.ts:1-8` |
| F2 | The thread's `queueStatus` is server-derived and has three values. `available_for_review` means assigned and pending. `held_for_credit` means `waitingForCoverage` with `coverageHeldAt` set. `waiting_for_coverage` means `waitingForCoverage` without `coverageHeldAt`. Otherwise it is `null`. | `server/db.ts:2604`, client enum `client/src/lib/threadApi.ts:43,114` |
| F3 | Both `waiting_for_coverage` and `held_for_credit` have `waitingForCoverage = true`, and **nothing has been spent** for them: "never delivered free, never billed later". Spending happens only on the move to visible. | `server/coverageDelivery.ts:10-20`, D-034/D-047 |
| F4 | **Assigned-held is a set of flags on an assigned row, not a `queueStatus` of its own.** An assigned row (`referrerId` set, `status = "pending"`) always gets `queueStatus = "available_for_review"`, because that branch is checked first in the ternary, and that includes held rows. On a personal link (`held.personalLink`), `heldForReferrer` and `unclaimedAssignment` are **both** true. On a queue allocation (`held.queueAllocation`), only `unclaimedAssignment` is true. These rows are visible, so they were charged at create or at delivery. `queueStatus = null` is a different case: no `referrerId` and `waitingForCoverage = false`, which is unassigned and visible. | `server/db.ts:2604`, `server/heldAsk.ts:37,114`, `server/coverageDelivery.ts:10-21` |
| F5 | The withdraw confirm opens only through the "Withdraw ask" button, which renders only when `canWithdraw` is true. `canWithdraw` means `status === "pending"` and (`referrerId === null` or `heldForReferrer === true` or `unclaimedAssignment === true`). The confirm shows the "awaiting" sentence only for the two coverage `queueStatus` values (`awaitingCoverage`), so every assigned-held row gets the other branch. A claimed row (`referrerId` set, both flags false) has no withdraw at all. | `client/src/pages/conversation/SeekerConversation.tsx:104-105,133,141,144` (main); `:105-106,146,152,155` at `047c7ba0` |
| F6 | Withdrawing a waiting ask moves no money (`debitTransactionId === null` branch). A withdrawal after an earlier pickup keeps the charge spent, even when the ask was reopened (`referrerId` back to `null`), and refunds are capped by the bucket's period. | `server/db.ts:2290-2335`, `:2310`, `:2319`; test `server/db.coverageDelivery.test.ts:186` |
| F7 | The thread payload carries no refund, pickup or debit field. The page cannot verify a refund outcome, and it cannot tell a reopened ask from one that was never picked up. | `client/src/lib/threadApi.ts:87-114` |
| F8 | No referrer path writes `declined`. A decline is a pass that reopens the ask, so a `declined` status is a legacy row, and its charge stays spent. | `server/db.ts:2133-2139`, D-021 (`docs/DECISIONS.md:39`), D-147 (`:161`) |
| F9 | "Find another referrer" is a link to `/explore` on Declined/Expired/Withdrawn stages. `/explore` mounts `Explore`, whose goal line is "Where do you want a referral?". | `SeekerConversation.tsx:106,135` (main); `:107,133-134` at `047c7ba0`; `client/src/App.tsx:140`; `client/src/pages/Explore.tsx:168` |

## 3. Route chosen: an explicit, narrow contract amendment (not the moneyCopy scope route)

**Why not the moneyCopy route.** Editing `shared/moneyCopy.ts` needs ACKs that do not exist, from the holder of PR #716 (`D-180-a-free-asks-chip`). It also needs a CEO registry change under D-200 for the unheld `D-174-held-ask-reconfirm`, and it would inherit that row's wait chain (`D-132-item3`, `D-090-BYOR`, both todo; `assignments.json:3322`). This packet claims no ACK.

**The amendment.** Revision 1 did not compose from `shared/moneyCopy.ts`, and this revision does not claim it does. It **amends the source rule explicitly**. The registration PR replaces item 1 of `docs/plans/OCT21-BUILT-PRS.md:65` with:

> 1. **Money lines** (`client/src/pages/conversation/SeekerConversation.tsx`, `client/src/components/thread/threadModel.ts`): every line that states a charge amount, cost or refund rule comes from `shared/moneyCopy.ts` (after D-132-audit the cost lines do; the never-paid line is `REFERRER_MONEY_SENTENCE`). **Amended Oct 28 (D-180-conversation-copy):** the terminal lines (declined, withdrawn, closed-unclaimed) and the two withdraw-confirm lines come from `shared/conversationCopy.ts` instead. They are fact-only: no amount, no refund promise or outcome, no expiry clock, no slot or capacity promise, no availability status, and no restated `shared/moneyCopy.ts` rule. The page cannot verify a refund (thread payload, `client/src/lib/threadApi.ts`); the server's withdrawal notice states the true outcome (`server/db.ts:2310`, `server/coverageDelivery.ts:74`). This replaces the earlier "the withdraw confirm says the credit comes back on a withdrawal before pickup, as `CREDIT_RULE` does", which the page cannot verify for a reopened ask (`server/db.ts:2310`). The closed-unclaimed line does not say "within 7 days" (D-061); remove the referred-deadline line that can never render.

**Who owns the amendment.**
- The amendment rides the **registration PR**, not the build. It follows the precedent of `7cc7af47` (one registry commit edits `assignments.json` and `OCT21-BUILT-PRS.md`) and #785 (`e67f7785`: registry plus packet docs). Rows may be changed under D-200 by "any capable session ... explaining why in its pull request" (AGENTS.md team rule 6).
- `scripts/scope-check.mjs` cannot guard a registration branch, because it fails open when no task uses the branch (`scope-check.mjs:61,96-99`). So the gate is the docs-only path: focused checks, an independent delta review and required CI (owner merge-policy amendment, Oct 23).
- After registration, `OCT21-BUILT-PRS.md` is still `D-048-p3-live-review-conversation`'s packet, which scope-check lets that row edit (`scope-check.mjs:35`). The new row edits only its own owns and its packet.
- `docs/plans/D-048-money.md:30` is **not amended**. Its rows are `D-048-p3-plans`, `D-048-p3-premium` and `D-048-p3-pricing` (packet field), and nothing in this contract touches those surfaces.

## 4. The contract

### 4a. Helper `shared/conversationCopy.ts` (new row `D-180-conversation-copy`, Tier 1)

| Export | Value | Facts |
|---|---|---|
| `CLOSED_UNCLAIMED_LINE` | `"Nobody could take it. This referral request is closed."` (kept byte-identical to the reviewed #786 line, `SeekerConversation.tsx:35` at `047c7ba0`) | F7: no clock, refund or slot claim |
| `DECLINED_LINE` | `"It’s not a judgment of you. This referral request was declined."` | F8: no slot, availability or refund claim |
| `WITHDRAWN_LINE` | `"You withdrew this referral request."` | F6, F7 |
| `WITHDRAW_CONFIRM_AWAITING` | `"It never reached a verified employee, so nothing was used for this referral request."` | F2, F3, F6. Referral vocabulary (D-180), no amount, no completed-referral claim, no unit word |
| `WITHDRAW_CONFIRM_VISIBLE` | `"It leaves the referrer’s queue and no longer counts toward your open referral requests."` | F1. States the counting fact without promising free capacity: plan and per-company caps still apply (`shared/openAskSlots.ts:1-8`) |
| `seekerTerminalLine(status, { claimed })` | `declined` → `DECLINED_LINE`; `withdrawn` → `WITHDRAWN_LINE`; `closed` → `claimed ? null : CLOSED_UNCLAIMED_LINE`; anything else → `null` | keeps today's closed+claimed → no line (`SeekerConversation.tsx:34`, main) |
| `ConversationQueueStatus` (type) | `"available_for_review" \| "waiting_for_coverage" \| "held_for_credit" \| null \| undefined` | A local structural union (§4e). It is not imported from `client/`. |
| `withdrawConfirmLine(queueStatus: ConversationQueueStatus)` | `"waiting_for_coverage"` or `"held_for_credit"` → `WITHDRAW_CONFIRM_AWAITING`; `"available_for_review"`, `null` or `undefined` → `WITHDRAW_CONFIRM_VISIBLE` | F2-F5. It takes only `queueStatus`, so `heldForReferrer` and `unclaimedAssignment` cannot pick a line, and no amount or refund wording can follow from a flag |
| `SUPPORTING_COPY_FORBIDDEN` | `readonly RegExp[]`: `/slot/i`, `/credits?\b/i`, `/refund\|came back\|comes back\|returned/i`, `/\b\d+\s*days?\b/i`, `/try another\|available\|open to/i`, `/\basks?\b/i` | applies to **supporting copy only** (§4c) |

The helper imports nothing from `shared/moneyCopy.ts` and restates none of its rules (§3). It leaves the pending/waiting lines (`client/src/components/thread/threadModel.ts:60-77`) alone, and `REFERRER_MONEY_SENTENCE` stays imported from `shared/moneyCopy.ts` as #786 already does.

### 4b. Helper tests: `shared/conversationCopy.test.ts` (owned by `D-180-conversation-copy`)

1. Each of the five line constants equals its §4a string exactly.
2. No line constant matches any `SUPPORTING_COPY_FORBIDDEN` pattern.
3. `WITHDRAW_CONFIRM_AWAITING` matches neither `/\d/` nor `/\breferral\b(?! request)/i`, so it states no amount and never names a completed referral.
4. `seekerTerminalLine` maps each case as in §4a: closed+claimed → `null`; `pending`, `approved`, `intro_made`, `interview` and `offer` → `null`.
5. `withdrawConfirmLine` returns AWAITING for exactly `waiting_for_coverage` and `held_for_credit`, and VISIBLE for `available_for_review`, `null` and `undefined`. Its parameter is the helper's own `ConversationQueueStatus`, so a fourth value is a compile error. Parity with the client type is pinned in §4e.

The helper tests pin no runtime constant. `ASK_TTL_DAYS` and `COVERAGE_WAIT_DAYS` are not asserted, because a legitimate expiry removal (D-174 → `D-174-expiry-clock-removal`) must stay free to change them.

### 4c. Adoption tests (owned by `D-048-p3-live-review-conversation`, files already in its `owns`, `assignments.json:790`)

**Supporting-copy assertions.** These apply the forbidden patterns to the reason paragraph only: the `<p>` that `GoalNextStep` renders from `reason` (`client/src/components/goal/GoalNextStep.tsx:11-16`). They never apply to the whole region, because the region also holds the action buttons.

| File | Assertion |
|---|---|
| `client/src/pages/conversation/SeekerConversation.goal.test.tsx` | For `declined`, `withdrawn` and `closed` with `referrerId: null`, the reason paragraph text equals `seekerTerminalLine(...)` and matches no `SUPPORTING_COPY_FORBIDDEN` pattern. `closed` with a `referrerId` renders no terminal line. |
| same file | **Withdraw confirm, by fixture.** Every case below has `status: "pending"`. Each case clicks "Withdraw ask" first, so the confirm is really open (F5), then compares the confirm text with `withdrawConfirmLine(queueStatus)` and checks it against `SUPPORTING_COPY_FORBIDDEN`: no amount, refund or slot wording follows from a flag. The fixtures are listed in the table after this one. |
| `client/src/pages/referralConversation.test.tsx` (unclaimed-closed case, ~lines 295-305 at `047c7ba0`) | Expects `CLOSED_UNCLAIMED_LINE` (imported; the same string #786 already pins). Keeps the "no `7 days`" and "no `slot`" negatives. Co-owner `D-048-p3-conversation` (`assignments.json:1692`) already `dependsOn` this row, so no ACK is needed. |

**Withdraw-confirm fixtures.** All of these go in `SeekerConversation.goal.test.tsx` and have `status: "pending"`. Each one is shaped as `server/db.ts:2604` emits it.

| # | Case | `referrerId` | `queueStatus` | `heldForReferrer` | `unclaimedAssignment` | Expected |
|---|---|---|---|---|---|---|
| W1 | Waiting for coverage | `null` | `"waiting_for_coverage"` | false | false | AWAITING |
| W2 | Held for credit (D-047) | `null` | `"held_for_credit"` | false | false | AWAITING |
| W3 | Assigned-held, personal link (F4: both flags, as the server emits them) | `77` | `"available_for_review"` | **true** | **true** | VISIBLE |
| W4 | Assigned-held, queue allocation (F4) | `77` | `"available_for_review"` | false | **true** | VISIBLE |
| W5 | Branch-only case for `heldForReferrer` alone. The server never emits this shape (F4); it exists only to show the `canWithdraw` branch on its own (F5). | `77` | `"available_for_review"` | **true** | false | VISIBLE |
| W6 | Unassigned, visible: a fallback case, not proof of assigned-held | `null` | `null` | false | false | VISIBLE |
| W7 | Claimed (negative) | `77` | `"available_for_review"` | false | false | no "Withdraw ask" button, so no confirm |

The W3-W5 assertions check only that the confirm uses the visible branch. They say nothing about a refund outcome, because the page cannot know it (F7).

**Action-link assertions.** These are a separate test, with no forbidden-pattern check.

| File | Assertion |
|---|---|
| `SeekerConversation.goal.test.tsx` | On Declined, Expired and Withdrawn stages, a link named "Find another referrer" with `href="/explore"` exists (F9), and it is the stage's single `data-g-primary`. On every other stage it is absent. |

**Unchanged:** `client/src/components/thread/threadModel.test.ts`.

The page adopts the helper: `nextLine`'s declined/withdrawn/closed cases and the confirm paragraph call `seekerTerminalLine` and `withdrawConfirmLine`, with no retyped string.

### 4d. Proof that runtime is unchanged (baseline comparison, not invariant pins)

The build PR's evidence includes the commands below, run on the PR head with `BASE=$(git merge-base origin/main HEAD)`. Each prints nothing:

```bash
git diff --name-only "$BASE" HEAD -- server/ drizzle/ shared/moneyCopy.ts shared/referral.ts shared/openAskSlots.ts client/src/lib/threadApi.ts
```

```bash
git diff --name-only "$BASE" HEAD | grep -v -e '^shared/conversationCopy\.ts$' -e '^shared/conversationCopy\.test\.ts$' -e '^docs/plans/D-180-conversation-copy\.md$' -e '^docs/plans/assignments\.json$'
```

It also includes a green `node scripts/scope-check.mjs D-180-conversation-copy`, which enforces owns plus the packet (`scope-check.mjs:33-50`). This proves no pricing, charge, refund, expiry or flag code moved, against the actual base, and it never fails a later legitimate change.

### 4e. Type layering: the helper owns its own union, and an owned client test pins parity

- **The direction is client → shared, never shared → client.** No `shared/*.ts` file imports from `@/` or `client/` (`grep -rn "^import.*from \"@/\|^import.*from \"\.\./client" shared/` returns nothing). AGENTS.md says to "Import client contracts from `shared/`" (Styling and dependency boundary). No shared type for `queueStatus` exists: `grep -rn queueStatus shared/` returns nothing. The only declarations are the client's Zod enum and type (`client/src/lib/threadApi.ts:43,114`) and the server literal (`server/db.ts:2604`).
- So `shared/conversationCopy.ts` declares `ConversationQueueStatus` as a local structural union (§4a), and imports nothing from `client/`.
- **Parity pin.** `SeekerConversation.goal.test.tsx` adds a bidirectional compile-time check. That file is already owned by `D-048-p3-live-review-conversation` (`assignments.json:790`), and it already imports `ThreadRequest` from `@/lib/threadApi`. The check:

  ```ts
  type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
  const queueStatusParity: Equal<ConversationQueueStatus, ThreadRequest["queueStatus"]> = true;
  ```

  `Equal` is true only when each type is assignable to the other. If either union gains or loses a member, `pnpm check` fails, because `tsc --noEmit` (`package.json:11`) includes `client/src/**/*` (`tsconfig.json:2-6`). The helper row owns no client file, the conversation row's owns are unchanged, and no type-only boundary waiver is used.

## 5. Registry delta (historical proposal; included in this registration candidate, not effective before protected merge)

**(a) New row**, placed directly above `D-048-p3-live-review-conversation` (`assignments.json:790`):

```json
{
  "id": "D-180-conversation-copy",
  "title": "Seeker conversation terminal and withdraw-confirm lines from one shared helper, fact-only, referral vocabulary (D-180 slice)",
  "row": "COPY",
  "packet": "docs/plans/D-180-conversation-copy.md",
  "tier": 1,
  "lane": "terminology",
  "branch": "agent/copy/d180-conversation-copy",
  "status": "todo",
  "epic": "D-048-p3",
  "dependsOn": [],
  "owns": ["shared/conversationCopy.ts", "shared/conversationCopy.test.ts"],
  "note": "Unblocks D-048-p3-live-review-conversation (#786) under the explicit Oct 28 amendment of OCT21-BUILT-PRS.md item 1 (packet section 3), which this registration PR carries. New module only; shared/moneyCopy.ts is not edited, so no holder of it (D-174-held-ask-reconfirm, D-180-a-free-asks-chip, D-099-bonus-pages switch-only) is touched and no ACK is needed. Fact-only lines in D-180 referral vocabulary: no amount, refund, clock, slot or availability claim; the withdraw confirm is keyed on queueStatus only (held_for_credit/waiting_for_coverage vs the rest). No behavior, price, charge, refund, expiry or flag change; proof is a baseline diff (packet 4d), not constant pins. Review: D-151, not the builder's model family."
}
```

`dependsOn: []` is correct because no row owns either path. `ownsOverlap` finds no overlap with the exact-path `shared/` entries on `main` (`scripts/nextTaskCore.mjs:81-87`), and `filesBusy` serializes any later claimant of the same files (`nextTaskCore.mjs:423`).

**(b) Amend `D-048-p3-live-review-conversation`** (`assignments.json:790`):
- `dependsOn`: add `"D-180-conversation-copy"`. The four existing entries are already `done`.
- `note`: append "Oct 28: item 1 of the packet amended (OCT21-BUILT-PRS.md:65): terminal and withdraw-confirm lines come from shared/conversationCopy.ts (D-180-conversation-copy); adoption and action-link pins per that packet section 4c. #786 stays draft until that row lands."
- `owns`: unchanged.

**(c) Packet edit in the same registration PR:** `docs/plans/OCT21-BUILT-PRS.md:65`, replaced with the §3 text.

**(d) No change** to `D-180-a-free-asks-chip`, `D-174-held-ask-reconfirm`, `D-099-bonus-pages`, `D-048-p3-conversation`, `D-132-audit` or `docs/plans/D-048-money.md`.

## 6. What changed from revision 1 (`c333a724`)

| Finding | Resolution |
|---|---|
| 1. Not composition; the source rule was never amended | Revision 2 drops the composition claim and explicitly amends `OCT21-BUILT-PRS.md:65` in the registration PR (§3, §5c), with the ownership basis cited. The moneyCopy route is rejected for missing ACKs. |
| 2. "credit" hardcoded on the back of a nonexistent row | The D-173 hold ended with D-132-audit (`DECISIONS.md:180`, `assignments.json:904`), and D-180 applies now. `WITHDRAW_CONFIRM_AWAITING` is in referral vocabulary with no amount; "credit" is banned by test (§4b.2). |
| 3. "Nobody accepted it" churn | Kept #786's reviewed line byte-identical (§4a). |
| 4. Forbidden regex hit the CTA | Supporting copy is checked on the reason `<p>` only. The CTA gets its own link-contract test (name, `/explore`, stages, single primary; F9). The D-176 question is withdrawn. |
| 5. "Held = no debit" and constant pins | The confirm is keyed on the `queueStatus` contract (F2-F5), with assigned-held tested separately. The constant pins are replaced by a baseline diff (§4d). |

## 7. What changed from revision 2 (`a3545a61`)

| Finding | Resolution |
|---|---|
| 1. The assigned-held fixture used `queueStatus: null`, which the source never emits for a held row | The fixtures now follow `server/db.ts:2604`. An assigned pending row is always `available_for_review`. A personal link sets both flags; a queue allocation sets `unclaimedAssignment` only (W3, W4). `heldForReferrer` alone is kept as a labelled branch-only case (W5). `null` is a separate unassigned fallback (W6), and the claimed row is a negative (W7). Every case opens the confirm through `canWithdraw` (`SeekerConversation.tsx:104,133,141` on main; `:105,146,152` at `047c7ba0`). The confirm makes no amount or refund claim (F7, §4c). |
| 2. The shared helper imported a client type | The import is reversed: the helper declares its own `ConversationQueueStatus`. No shared `queueStatus` type exists and no shared file imports from `client/`. A bidirectional `Equal` check in the already-owned `SeekerConversation.goal.test.tsx` pins parity under `pnpm check` (§4e). No new client ownership and no boundary waiver. |

Note on the anchor given in review: `canWithdraw` is at `SeekerConversation.tsx:104` on `main` (`:105` is `awaitingCoverage`). It is at `:105` at #786's head `047c7ba0`.

---
Rechecked (revision 3) Oct 28, 2026 on `main` `e67f7785`; holder snapshot from `git ls-remote origin` and `node scripts/next-task.mjs --status`.


Coordinator registration candidate: source424c4bc3 reviewed against maina4b022a5. Registration/amendment only, not yet protected-merged; helper and conversation adoption remain unbuilt, #786 draft. No runtime, charge/refund, expiry or feature flag changes.

Built Oct 29: `shared/conversationCopy.ts` and `shared/conversationCopy.test.ts` on `agent/copy/d180-conversation-copy`; §4c adoption stays with `D-048-p3-live-review-conversation`.

## Status

One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is on `main` (D-134).

D-180-conversation-copy: review — agent/copy/d180-conversation-copy — 7d4b9091
