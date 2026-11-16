# Packet CONV-report-entry: the seeker conversation's "Report or block" link carries the ask only when it is accepted (D-278)

Tier 1 (privacy/safety; declared above the Tier 2 that `scripts/tierClassifyCore.mjs` computes for the three owned paths, which GATE-tier-floor (D-212) allows, see §7.4) · lane `conv-report-entry` · branch `agent/queue/conv-report-entry` · waits for `D-048-p3-live-review-conversation` · builder: a development session other than the Claude Code session through the picker (D-225) · registered by D-278 on 2026-11-02 at `main` `27dac5f9`, checked against the register through D-276 (D-277 is held by open PR #962).

Source and authority:
- Route **R-B-min** and the corrected rule from correction **E** on #831, comment [6568171751](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/831#issuecomment-6568171751) (bound to `origin/main` `27dac5f9`, #831 head `d5c76594`). E is authoritative.
- Original packet **A** on #831, comment [6567957088](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/831#issuecomment-6567957088), is superseded wherever E contradicts it. Only the parts of A that E accepted, and only for the seeker side, are carried here.
- Accepted for docs/registry publication in #811 comment [6568189791](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6568189791) (part 2).

This packet registers the **seeker side (`S`) only**. It adds no #831 edge, owns or status change; the referrer sides (`K`, `G`) are described in §9 only as a future step.

## 1. Goal

On `main`, the seeker conversation's footer link is always bare:

```
client/src/pages/conversation/SeekerConversation.tsx:223
  {REFERRER_MONEY_SENTENCE} Never pay or accept money for a referral. <Link href="/report" className="underline underline-offset-2">Report or block</Link>
```

So every report filed from a seeker conversation is unlinked, and the report page's "Also block this person" toggle (`client/src/pages/Report.tsx:111`, sent only with `?request=` at `Report.tsx:59-68`) is unreachable from the seeker's thread. Make the link carry the ask's own id exactly when the seeker has an accepted counterpart, and stay bare otherwise.

## 2. The rule (binding, from E §1)

```
href = (!passed && isAccepted(request)) ? "/report?request=" + request.id : "/report"
```

- **Seeker side `S` only.** On the seeker page `passed` is always false, so for `S` the rule reduces to `isAccepted(request) ? "/report?request=" + request.id : "/report"`. Write it in the full form above or the reduced form; both are the same for `S`.
- **Where:** the single link at `client/src/pages/conversation/SeekerConversation.tsx:223` (line number at `main` `27dac5f9`). It renders only once a request is loaded, after the early return at `SeekerConversation.tsx:91-92`.
- **Reuse, never re-implement:** `isAccepted` at `client/src/components/thread/threadModel.ts:36-38`:
  ```
  export function isAccepted(request: Pick<ThreadRequest, "status" | "referrerId">): boolean {
    return isPostApprovalReferralStatus(request.status) && request.referrerId !== null;
  }
  ```
  `SeekerConversation.tsx:20` already imports from `@/components/thread/threadModel`; add `isAccepted` to that import. `threadModel.ts` is owned by `D-048-p3-live-review-conversation` and is **not** edited by this row.
- **Id:** `request.id`, the `/mine` row id the server listed for this viewer (`server/db.ts:2588`, `threadApi.ts:152-159`). Never a user id (`referrerId`, `jobSeekerId`, the viewer's id), `referenceId`, the preview `publicRef`, the report reference, or the raw route parameter before load (A §1c, accepted by E).

### 2.1 Rejected: old packet A §1a (`referrerId !== null`) — NOT BUILDABLE

Packet A §1a proposed `href = request.referrerId !== null ? "/report?request=" + request.id : "/report"`. E **rejected it as written**; it must not be built. It is wrong in three states, because the seeker's `/mine` row carries a non-null, **hidden** `referrerId` there (`/mine` passes it through unmasked, `db.ts:2588`, `privateReferralRoutes.ts:1128`):

| State | Writer of the non-null `referrerId` (`server/db.ts`) | What A §1a would do |
|---|---|---|
| allocated (S-b) | `:2743` | `?request=`: offers "Also block this person" for someone the seeker has never seen |
| personal link (S-c) | `:2452-2455` | same |
| claimed, not yet accepted (S-d) | `:3017` | same |

A block placed in those states does not release the ask (`server/blocksRoutes.ts:24-43`), so the seeker's own ask stalls until the 48 h lapse (`db.ts:3070, 3092`). The corrected rule's `isAccepted` gate gives the bare link in all three.

## 3. State matrix for `S` (from E §1 / F03, seeker column)

`request.id` is the ask's own id in every state. R0 = the link today; R1 = the link under §2.

| State | Server `referrerId` (writer, `server/db.ts`) | R0 (today) | R1 (this row) |
|---|---|---|---|
| unassigned / waiting / held | null | `/report` | `/report` |
| allocated | X (`2743`) | `/report` | `/report` |
| personal link | X (`2452-2455`) | `/report` | `/report` |
| claimed, not accepted | X (`3017`) | `/report` | `/report` |
| accepted … closed-after-acceptance (post-approval status) | X (`2141`) | `/report` | **`/report?request=<id>`** |
| pass | null (`2158`) | `/report` | `/report` |
| step-back | null (`3145`, pass row `3149`) | `/report` | `/report` (server-model gap S-g, §8) |
| claim / allocation / referred lapse | null (`3070` / `3092` / `3120`; pass rows `3074` / `3096` / `3124`) | `/report` | `/report` |
| withdrawn / closed by expiry | null (`2303-2304`, `2454-2455`) | `/report` | `/report` |
| stale page (loaded accepted, then lapse or step-back server-side) | null on the server | `/report` | `/report?request=<id>`: the report is filed (the seeker always passes `jobSeekerId === viewer`, `db.ts:950`), but evidence and block are lost (S-m). Residual of any client rule; not adopted here. |

**No link at all** happens only when no request is loaded (signed-out gate, loading, any load failure). That is unchanged by this row (E §2).

## 4. Files

| Path | Change | Ownership |
|---|---|---|
| `client/src/pages/conversation/SeekerConversation.tsx` | the `:223` href, plus `isAccepted` in the `:20` import | owned by this row (shared with `D-048-p3-live-review-conversation`, which this row waits for, so the overlap is legal under `validateAssignments`) |
| `client/src/pages/conversation/reportEntry.test.tsx` | **new**, red-first component test | this row only |
| `e2e/report-from-conversation.e2e.ts` | **new** journey | this row only (`GATE-e2e-journeys`, which owns `e2e/`, is `done`) |

Not edited: `client/src/components/thread/threadModel.ts`, `client/src/pages/ReferralConversation.tsx`, `client/src/pages/referralConversation.test.tsx`, `client/src/lib/threadApi.ts`, `e2e/fixtures.ts` (owned by `D-057-session-gate`), `client/src/pages/Report.tsx` and `client/src/pages/goal/support/**` (#954's row), any `server/` or `shared/` file.

## 5. Acceptance

### 5.1 Red-first component test: `client/src/pages/conversation/reportEntry.test.tsx`

Commit the test first, show its failing count on the unchanged page, then the fix. Use distinct ids so a wrong source cannot pass by coincidence: `/mine` row id **731**, `referrerId` **5502**, viewer **6603**, `referenceId` **"ACME-9917"**.

| # | Case | Expected | On `main` |
|---|---|---|---|
| C1 | Seeker, accepted ask (post-approval status, `referrerId` 5502) | the "Report or block" link's `href` is exactly `/report?request=731`; clicking it navigates to `/report?request=731` | **fails** (bare) |
| C1b | Seeker, a second post-approval status (e.g. intro made or interview) | same `?request=731` | **fails** |
| C2 | Seeker, unassigned / waiting (`referrerId` null) | `/report` | passes (pins no regression) |
| C3 | Seeker, allocated / personal-link / claimed-not-accepted: pre-approval status with `referrerId` 5502 non-null | `/report` (pins the §2.1 rejection) | passes; **fails under old A §1a** |
| C4 | Seeker, pass / step-back / lapse (`referrerId` null after the server cleared it) | `/report` | passes |
| C5 | Every case: href matches `^/report(\?request=731)?$`; no href contains `5502`, `6603` or `ACME-9917` | holds | partial |

Record the red run (failing count, file) and the green run in the PR body.

### 5.2 E2E journey: `e2e/report-from-conversation.e2e.ts`

Runs in the existing `e2e journeys` CI job (`.github/workflows/ci.yml:213-288`: production build, real MySQL, `node scripts/e2e-server.mjs start`), with no CI or config change.

Rules (E §4, binding):
- **Its own ask id.** The database and the seeded referrer are shared across journeys (`e2e/playwright.config.ts`: one worker). Create a fresh seeker with the existing `devSignIn` export (`e2e/fixtures.ts:68-74`, imported, not edited), send one ask, and target only that ask's id everywhere.
- **Reads `seed.json` itself.** The seeded admin's cookie comes from `e2e/.auth/seed.json` (written by `scripts/e2e-server.mjs` from `scripts/seed-test-accounts.ts`; admin `qa.admin@example.com` at `seed-test-accounts.ts:50-55`). The journey reads that file directly. **No `e2e/fixtures.ts` edit** (owned by parked `D-057-session-gate`).
- **The block comes LAST.** Any step that blocks the pair runs after every other assertion: a block before the referrer-side or evidence steps makes them fail (`privateReferralRoutes.ts:1330-1333, 1451`). Fresh seekers make block cleanup unnecessary (`fixtures.ts:68-74`).

Steps:
1. Fresh seeker sends an ask; the seeded referrer accepts it on `/queue` with the attestation (pattern: `e2e/queue-attestation.e2e.ts`). The referrer's accept and one message each way are **setup only**.
2. Seeker navigates My asks → View ask → `/conversation/<id>` (pattern: `e2e/withdraw.e2e.ts:18-20`), clicks "Report or block": URL is `/report?request=<id>` with the same id, and "Also block this person" is visible.
3. **Admin read (§5.3), before any block:** the seeker files the report from that page with the toggle **off**; expect `201`. Then, with the admin cookie from `seed.json`, `GET /api/admin/safety-reports` lists that report with `referralRequestId === <id>`, and its evidence holds exactly the journey's messages labelled reporter/other (`db.ts:968-979`).
4. **LAST:** back on `/report?request=<id>`, the seeker files again with "Also block this person" **on**: the report answers `201` and the block `201` or `200`. Nothing runs after this step.

### 5.3 Admin read proved red-first

The admin route is `GET /api/admin/safety-reports`, gated only by role (`server/safetyRoutes.ts:84-89`, `requireAdmin`: no identity → anonymous; `role !== "admin"` → refused). No journey has used this path before, so the builder proves it red-first in the journey's own commits: the assertion that a **non-admin** cookie (the journey's seeker, or the seeded seeker from `seed.json`) is refused, and the **admin** cookie is allowed, must be shown failing first (for example, the admin assertion committed against the seeker cookie, or before the `seed.json` read is wired) and then green. Record both runs.

A LOCAL-only pre-check of this path was run during registration (§7.3). It is not production proof and does not replace the builder's red-first step.

### 5.4 Not asserted

- The referrer-side hrefs `K` (kit page) and `G` (goal page on #831) are **not asserted** anywhere by this row. The journey drives the referrer only as setup.
- No capture is required: only an href changes (visual impact none), unless the reviewer asks.

### 5.5 Gates and proof (AGENTS rule 8)

Red-first commit with failing counts; green commit; `pnpm check`; the focused files (`reportEntry.test.tsx`, `SeekerConversation.goal.test.tsx`, `referralConversation.test.tsx`) green; scope-check; the CI run for the exact final head with the required checks green and `e2e journeys` green with the new journey in its list. Anything not proven is labelled unverified.

## 6. Privacy and safety (I7)

No URL carries a user id. The page gains no data beyond the id already in its own `/conversation/<id>` URL. Before acceptance nothing about the referrer is exposed by this change (the link stays bare). No server, shared, money, sign-in or privacy code changes.

## 7. Registration facts (measured on `main` `27dac5f9`, 2026-11-02)

### 7.1 Qualification (a): the seeker row the edge points at

- `D-048-p3-live-review-conversation`: `status: "todo"`, `syncedTo: "D-227"`, `branch: "agent/queue/d048-live-review-conversation"`, `dependsOn: ["D-038-reconcile", "D-132-audit", "ROW20-CD", "D-048-F-goal-check", "D-180-conversation-copy"]`, 8 owns including `SeekerConversation.tsx`. Its note and `docs/plans/OCT21-BUILT-PRS.md:87` still say "#786 remains draft" / "not landed".
- **Landed code (repo facts):** PR #786 is **merged** (`merged: true`, 2026-10-29 23:27 IST), merge commit `99f8a1f2a24e88914b396c8e414be3dc93d236fc`, which is an ancestor of `origin/main`. Marker trail: `Verdict D-048-p3-live-review-conversation: pass — Hark · f94e` (`47f71312`, on `agent/review/d048-live-review-conversation`), `Land claim … Claude · 3712` (`dc30c6a6`), and `Report …: landed — Claude · 70f3` (`a9d7663b`, on `agent/reports/log`). The `#786` fix commit `c6c420b4` is the newest commit touching `SeekerConversation.tsx` on `main`, and `main`'s file carries #786's work (imports `seekerTerminalLine`/`withdrawConfirmLine` from `@shared/conversationCopy` at `:15`, the goal shell, the next-step block). The work branch `agent/queue/d048-live-review-conversation` no longer exists on origin.
- **How the picker treats it:** with no work branch, `buildView` computes `landed = mergedHeads.has(task.branch)` (`scripts/nextTaskCore.mjs:453`), and `done` follows for a `todo` row (`:468`). `mergedHeads` is read from only the newest 100 closed PRs by update time (`scripts/next-task.mjs:237`). On 2026-11-02 ~09:00 IST #786 sits at **position 50/100** (oldest in window: #842, updated 2026-10-30 09:45 IST). When #786 leaves that window, the row reads `todo` with no branch, and every dependant waits under D-134.
- **Outcome:** the dependency is grounded in **landed code** (a merged PR whose merge commit is on `main`, plus the landed report), not in a closed PR alone, so the `CONV-report-entry → D-048-p3-live-review-conversation` edge is real (E/F06: dropping it gives 1 validation error) and is met today. **Closing the seeker row's record is not done here** and is an exact architect item (§10 A1): whether its acceptance is complete is not established (BUILD_CONTINUITY: merged is not accepted; its pass marker is by a Hark session whose model family is unverified, against the row's own D-151 note).

### 7.2 Registry validation
`validateAssignments` (`scripts/nextTaskCore.mjs`) on this branch: `[]`. Without the `dependsOn` edge the shared `SeekerConversation.tsx` owns would be an overlap with an unfinished row.

### 7.3 Qualification (b): admin-cookie read, LOCAL ONLY
**LOCAL ONLY, not production.** Run 2026-11-02 ~09:08 IST on `main` `27dac5f9` with the repo's own e2e path: `pnpm build`, `node scripts/e2e-server.mjs prepare` (schema from empty; deploy migrations applied twice, second run "0 applied"), `node scripts/e2e-server.mjs start` (seeder wrote `e2e/.auth/seed.json` with `qa.admin@example.com`, `qa.referrer@acme.example`, `qa.seeker@example.com`), against a local MySQL 8.0.41 on `127.0.0.1` in place of CI's `mysql:8.0` service. A scratch HTTP probe (not committed) read `seed.json` and called `GET /api/admin/safety-reports`:

| Run | Cookie used for the "admin allowed" assertion | anonymous | seeded seeker | "admin" | Result |
|---|---|---|---|---|---|
| red (assertion fed the seeker cookie) | `qa.seeker@example.com` | 401 "Sign in to continue" | 403 "Administrator access is required" | 403 | **1 failed** (as intended) |
| green | `qa.admin@example.com` | 401 | 403 | **200 `{"reports":[]}`** | 0 failed |

So, locally, the seeded admin cookie passes `requireAdmin` and a non-admin is refused. This is not a journey and not production proof; §5.3 stays an acceptance item for the builder, inside `e2e/report-from-conversation.e2e.ts`, on CI.

### 7.4 Tier
`classifyTier` over the three owned paths returns `{ tier: 2, reason: "Tier 2 paths" }`: none is on a Tier 1 path list (the e2e file and the test file never raise the tier; `SeekerConversation.tsx` is a `client/src/` Tier 2 path). That is a floor, not a ceiling: GATE-tier-floor (D-212, `scripts/review-gate.mjs`) refuses a declared tier below the computed one and allows a higher one. **The row is declared Tier 1** (corrected 2026-11-02 on #963, per #963 comment 6568702221) because the AGENTS.md Tier 1 classes (money, sign-in, identity, privacy, migrations) plausibly apply on substance, not by path: (1) the href decides when a safety report carries `referralRequestId`, and with it the server copies up to 50 message bodies of the pair into `moderationEvidence` for admins (`server/db.ts:968-979`), a privacy act; (2) it decides when "Also block this person" (`Report.tsx:59-68,111`) is offered, and blocks are on the Tier 1 privacy list (`server/blockedPairs.ts` in `TIER1_PRIVACY`); the rejected §2.1 rule shows a wrong gate here exposes a block against a referrer the seeker has never seen; (3) packet A proposed Tier 1 for this route (#831 comment 6567957088), and the sibling filing-reliability remedy B2 is Tier 1 for its private evidence (#811 comment 6567956835). So the build needs an independent Tier 1 review (D-151) by a model that neither built nor fixed it, on a draft PR, before `main`. Whether the gap is a D-019 broken basic (A open item (c)) stays Instinct's classification. **A docs landing does not lower the runtime independent-review bar:** this packet's registration or correction landing on docs-only checks changes nothing about the Tier 1 review the build must pass.

## 8. Residuals: named, NOT adopted

Each belongs to another owner or row; this row changes none of them.

- **S-g** — after a step-back or lapse the seeker cannot link a report to the referrer they actually talked to (participant = *current* `referrerId`; server model).
- **R-f** — a referrer on a closed-after-acceptance ask has no page, so no link, although the server would accept one (thread-loading owner).
- **S-l** — a seeker in a blocked pair cannot load the page, so no link, although the server would accept one (thread-loading owner).
- **R-k** — a stale accepted *referrer* page links a report the server then refuses (400); no client rule can fix it (report page / #954 row or server).
- **Block stalls an accepted ask** — a block on an accepted ask does not release it; the ask stalls until its referred lapse (`blocksRoutes.ts:24-43`; server rows / `P0-referral-access-availability`).
- **G pre-acceptance linkage** — under the corrected rule, G no longer links a report about the pitch before accepting; whether G should keep that is the #831 acceptor's call (E §1).

Also out of scope: S-m (seeker stale page, §3), S-k (legacy `declined` rows with non-null `referrerId`, unknown).

## 9. Step 2 for #831 (future, described only)

Nothing in this packet edits #831's row. If and when #831 (`D-048-p3-conversation`, parked at `owner` by D-257) is released by the D-254 (6) route, K and G would be added there with the same rule, and K's journey cases appended to `e2e/report-from-conversation.e2e.ts`. That needs a **future ACK through Instinct by #831's holder of record, `DeepSeek V4.1 Flash Free · 4fb6`** (last Claim on the work branch, `d5c76594`), in the exact text of E §5 ("Exact dependency ACK text", R-B step 2 variant). Until then, no #831 `dependsOn`, `owns` or `status` change is made or implied, and no takeover is proposed.

## 10. Stop and ask (builder) / open architect items

- **A1 (architect, precondition) — done on #963 (2026-11-02):** `D-048-p3-live-review-conversation` is recorded `done` (seeker side, not moved; signed-in live behaviour unverified) per #963 comment 6568695667, so this row no longer depends on #786 staying in the picker's 100-PR closed window.
- **A2 (Instinct):** D-019 classification (§7.4); the tier is now declared Tier 1.
- Builder: if `isAccepted` at `threadModel.ts:36-38` has changed shape, if `:223` is no longer the only Report link on the seeker page, or if any step would need an edit outside §4, stop and report on #811.
- Builder: if the admin read in §5.3 cannot be made green with the seeded admin cookie, stop and report; do not change `server/safetyRoutes.ts` or the seeder.

## Status
- 2026-11-02: registered by D-278 (docs only); tier corrected to Tier 1 on #963. No code written. Not built, not reviewed. A docs landing does not lower the runtime independent-review bar: the build still needs its independent Tier 1 review (D-151).
- 2026-11-07: in progress — Gemini 2.5 · ca0e — branch agent/queue/conv-report-entry
- 2026-11-07: review — Gemini 2.5 · ca0e — branch agent/queue/conv-report-entry — head 278b5a31. Built and gate verified: red-first component test (C1-C5 in reportEntry.test.tsx), seeker report link carries request id when accepted in SeekerConversation.tsx, red-first e2e unprivileged admin probe and full journey in report-from-conversation.e2e.ts. Gates clean: pnpm check 0, design-token-audit 0 errors, lint-deploy-migrations clean, check-deploy-triggers clean, focused vitest 59/59 passed, pnpm build clean, scope-check 3 owned paths clean. Ready for independent Tier 1 review (D-151) on draft PR #1018.
