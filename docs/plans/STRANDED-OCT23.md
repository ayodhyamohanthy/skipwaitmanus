# Packet STRANDED-OCT23: open pull requests that carry decisions or work no agent could see (D-163, D-165)

> Read `docs/BRIEF.md` first, then this packet. Each section is one queue row. Every pull request here is already written: this packet is its review, fix-stage and landing brief, not a fresh build.

| Field | Value |
|---|---|
| Decisions | D-163 (4), D-074, D-151, the Oct 23 merge-policy amendment (`docs/DECISIONS.md`) |
| Rows | `REGISTER-520` (Tier 1, lane `register`), `D-155-share-paid-gate` (Tier 1, lane `share-link`), and the D-132 chain (D-165): `D-132-catalog-record` (Tier 2, docs), `D-132-item3` and `D-132-v2-checkout` (Tier 1, lane `money-core`) |
| Verified against | `main` `06323e5c`, PR heads `fe1790bf` (#520) and `af6dd9cc` (#527) |

Why they are queued: a decision on an open pull request with no queue row is never handed to anyone, so it never lands, and agents keep building from the older entry on `main` (D-163 (4)). Decision IDs and migration numbers are fixed **at landing**: take the highest ID on `main` and every open branch + 1, renumbering every reference in the diff (`docs/DECISIONS.md` ID rule).

## REGISTER-520: land PR #520 (CEO rulings D-201 to D-206 on its branch)

- **What it holds.** Docs, decisions and the queue only, no product code: Skippy's missing Tier 1 reviews with six findings (S-1, an SSRF in Skippy's job-page reader, is high), the packets `SKIPPY-fix.md` and `SKIPPY-next.md`, newest-decision sync (`PICKER-decision-sync.md`), the CEO mandate, the startup-credits toolbox, branch hygiene (`BRANCH-HYGIENE.md`) and decision re-rating (`DECISION-REVIEW.md`). It adds nine queue rows: `PICKER-decision-sync`, `SKIPPY-fix`, `BRANCH-HYGIENE-1`, `BRANCH-HYGIENE-2`, `SKIPPY-redteam`, `SKIPPY-3`, `SKIPPY-stepup`, `SKIPPY-6` and `SKIPPY-7`.
- **Who.** A Claude Code session wrote it, so the review and the landing go to a model other than Claude (D-151). Its Tier 1 here buys exactly that. A Claude Code session handed this row's review or landing posts no verdict and reports it blocked (the D-151 interim rule).
- **Branch.** The queue needs `agent/<owner>/<slug>` names, so the row's branch is `agent/queue/register-520`, cut from #520's head; #520's own branch `claude/zealous-mendel-qvqdu0` stays untouched.
- **Build stage (the builder carries the merge and the renumbering; nothing else).**
  1. `git fetch origin && git push origin origin/claude/zealous-mendel-qvqdu0:refs/heads/agent/queue/register-520` (once; if it already exists, use it), check it out in a worktree, then `git merge origin/main` (never rebase or force-push).
  - Setup: in a fresh worktree run `pnpm install` before the first `pnpm check`; missing local dependencies fail as TS2688/TS5101 (this row's own October 24 block).
  2. `docs/DECISIONS.md` conflicts. `main` already holds a different D-156 (referrer-side candidate plans), and by the time you merge it may hold D-162 (#518) and D-163 (this ruling). Keep every row `main` has, unchanged. Give this branch's entries the next free IDs in their order (156→first free, 157→next, and so on), and replace every reference to the old IDs in this branch's diff: the entries, `AGENTS.md`, `CLAUDE.md`, `docs/BRIEF.md`, the agent entry docs, `docs/SKIPPY.md`, the new packets and `docs/plans/assignments.json`.
  3. `docs/plans/assignments.json`: keep `main`'s rows, unchanged, and add this branch's nine rows where the branch puts them. Then run `validateAssignments` (it must print `[]`) and `node_modules/.bin/vitest run scripts/` (all pass).
  4. `docs/BRIEF.md` must stay under its size test. If the merge pushes it over, keep `main`'s lines and shorten this branch's new line, never `main`'s.
  5. Push, open a draft pull request from `agent/queue/register-520` titled "REGISTER-520: land #520's rulings, renumbered", link #520 in it, and comment on #520 that it is superseded by the new one (leave closing it to the lander). Report `review`.
- **Review stage.** A model other than Claude and other than the builder reviews the new pull request against current `main`: the resolved merge on its own (the merge-policy amendment), then every claim with file:line, especially the six Skippy findings and the line numbers in `SKIPPY-fix.md`. A finding is a claim that `main` does not support.
- **Landing.** Docs only: focused checks plus the required CI on the exact head, then the normal landing (D-082, D-134 (6)). Close #520 after the landing.
- **Stop and ask.** If a decision on the branch contradicts a newer one on `main` (for example D-146, D-147, D-152, D-162 or D-163), report it blocked with both IDs; do not pick one.
- **D-183 (Oct 24): inherited text is not a conflict.** The stop rule covers decisions the branch makes. Lines #520 never changed take `main`'s version in the merge (the D-035 row stays deleted, `D-090-BYOR` keeps `dependsOn: []`); in `docs/plans/README.md` line 8, which both sides rewrote, keep `main`'s paragraph and add only #520's clauses (PICKER-decision-sync, the Skippy rows, branch hygiene). Renumber after every open branch, #620 included.

## D-155-share-paid-gate: review and land PR #527 (the /share link unlocks after the first paid invoice)

- **The owner's word (verbatim, D-155 on the branch):** "Referrals should show unavailable and this line / Referrals unlock after your first paid invoice. Once you've made a payment, come back here to get your referral link."
- **What it changes.** `GET /api/personal-invites/me` answers `{ invite: null, locked: true }` and creates no invite row until the account has provider-verified payment evidence (a one-time fulfillment at status `credited`, or a webhook-activated subscription); `/share` shows the locked line; the claim route is unchanged. It adds `drizzle/deploy/0114_referral_paid_evidence.sql` and touches `server/chargebee.ts`, `server/chargebeeRoutes.ts`, `server/db.ts` and `server/privateReferralRoutes.ts`. So it is Tier 1 (money evidence and a migration), not docs.
- **Who.** Instinct built it, so the review goes to a model other than Instinct (D-151).
- **Review checklist** (on top of `docs/DELEGATION.md` §6):
  1. Only provider-verified payment counts: pending, `requires_review`, rejected and refunded rows, checkout or hosted-page creation and promo grants never unlock. A refund after unlock: say in the review whether the link stays (the owner's line says "after your first paid invoice"; keeping it is the reading the code should implement).
  2. A locked call writes nothing (no invite row, no activity spam).
  3. A friend's claim of a link issued before the gate still works.
  4. No referrer surface changes, and no seeker sees the referrer's data (D-019(e)).
  5. Money copy comes from `shared/moneyCopy.ts` or is the owner's verbatim line.
  6. The migration is additive and idempotent, and `server/schemaReconcile.ts` carries the same column.
- **Fix stage at landing.** Merge `main` (the branch conflicts). Renumber the decision to the next free ID across `main` and every open branch, and the migration to the next free number on `main` and in plan §5 (on Oct 23 `main` ends at `0108`, and #523 holds `0108`-`0109`, so check again at landing). Update every reference.
- **Flag.** None today. The owner asked for the behaviour itself, and it only withholds a link, never charges. If the reviewer finds a path where a paid seeker stays locked, that is blocking.

## The D-132 chain (D-165): pricing pull requests built outside the queue

Instinct built these, so every review and landing goes to a model other than Instinct (D-151). Flags stay off throughout (`PLAN_FAMILY_V2`, `ASK_LEVEL_COST` and their `VITE_*` twins). No real payment, no hosted page and no catalog change (`docs/PAYMENTS_TEST_RUNBOOK.md`). The enable is a separate row the CEO writes after the owner's enable word (D-123).

### D-132-catalog-record: land PR #528 (docs only)
- It adds `docs/qa/v2-live-catalog-apply.md` and one line in `docs/PRICING.md`: the v2 plan and credit items were created on the LIVE Chargebee site on Oct 23, create-only, with zero subscriptions, invoices and payments, on the founder's instruction quoted in the file.
- Reviewer: check the file names no secret, no customer data and no account id (D-059: the repo is public), and that the `docs/PRICING.md` line matches the file. If a site id or customer count is a problem under D-059, remove that detail and keep the fact.
- Merge `main` (it conflicts), focused checks, required CI, land.

### D-132-item3: the held item-3 follow-ups, after D-132-audit
- **Branch:** `agent/queue/d132-item3`, cut once from #550's head (`git push origin origin/agent/d132-item3-main-integration:refs/heads/agent/queue/d132-item3`). Then `git merge origin/agent/d132-bridge-quote-gate` (#542, the `/request` bridge page's quote gate, the only piece #550 lacks), then `git merge origin/main` after D-132-audit (#547) has landed. Never rebase or force-push.
- **What it holds:** the Skippy coverage-aware credit gate (#543); the bridge page adopting the shared quote gate (#542); the accepted-price precondition (#544: `expectedCost` on the send, `AskPriceChangedError` / `CoverageOpenedUpError`, a two-click 409 re-quote). #547 already holds #541's composer quote, so where #547 and this branch both change a file, keep #547's version of #541's part and this branch's additions.
- **Review checklist:**
  1. With both flags off, every send behaves byte for byte as on `main`: prove it with the flags-off tests, not by reading code.
  2. With the flags on in tests, a send whose cost changed since the quote is refused with the 409 and spends nothing, and the second click after a re-quote spends exactly the quoted cost once.
  3. Skippy's credit gate uses the same quote math as `/ask` (D-144, D-132), and an uncovered company stays waiting at no cost (D-034, D-047).
  4. Money copy comes only from `shared/moneyCopy.ts`.
  5. Nothing changes the refund rules (D-147: a decline keeps the credit spent).
- **Landing:** then close #541, #543, #544 and #550 with a link to the landing commit, and #542 too.

### D-132-v2-checkout: the v2 checkout and crediting port (#523), after D-132-item3
- **What it holds:** `server/v2Checkout.ts`, `server/v2Crediting.ts`, `shared/planFamilyBilling.ts`, webhook, activation and catalog-sync deltas, and two additive migrations. It routes failed payments through the D-067 durable outbox.
- **Fix stage before review.**
  1. Merge `main`.
  2. Renumber `0108_v2_plan_family_intents.sql` and `0109_v2_plan_family_wallets.sql` to the next free numbers on `main` and in plan §5 (on Oct 23 `main` ends at `0108_landed_thank_you.sql`), with every reference.
  3. Implement D-165 (3), red first: a Free wallet with unused free credits is no longer refused at checkout. On the webhook-confirmed upgrade, its unused free monthly credits move into a `planCreditGrants` carry-over grant that expires when their free month would have ended. They are spent soonest-expiring first, as today, and never become paid credits. The checkout copy line comes from `shared/moneyCopy.ts`: "Your {N} free credits stay until {date}."
     Tests: the upgrade with 0 and with 3 unused credits; a replayed webhook grants nothing twice; the carried credits expire on their date with an expiry row; the money check's `getCreditLedgerAudit` reconciles.
  4. D-132 item 4's grant half (D-185), red first: the crediting grants paid rung credits where they never expire (`PAID_CREDITS_NEVER_EXPIRE` in `shared/planFamily.ts`), keyed once per term, so with the flags on no paid credit expires at a cycle roll, spent or unspent. D-132-audit (#547) does the refund half behind `ASK_LEVEL_COST`.
     Tests: a rung grant survives a cycle roll; a replayed grant writes nothing twice; a refund after the roll returns the credit.
- **Review checklist:**
  1. The line-by-line deletion review of the three-way port that #523's own description lists as open: no function or test on `main` was lost.
  2. Every money move is idempotent and keyed; a lost webhook has a reconcile path.
  3. Flags off means no new route answers anything but its current refusal.
  4. The migrations are additive and idempotent, with the reconcile arrays in step.
  5. D-165 (3) is implemented as written.
  6. D-132 item 4's grant half is implemented as written (D-185).
- **Before any enable,** QA attaches the TEST-site cart proof in INR and USD on this exact wiring. #416's proof was on other wiring.
- **#416** is superseded by this row: close it with a link when this lands.

## Status
These rows share the §3b row D-163 (D-132 rows: D-165), so their status lines go here (D-134).
- REGISTER-520: done — 691c871b (landed on `main`; docs only, no deploy due. Independent review PASS by Qoder · bbc5 at 891c2756; merge-up and row-done delta reviewed; required CI green on 691c871b; closes #520).
- D-155-share-paid-gate: done — 4dfeb6ba (merged `main`, renumbered to D-194 with migration 0114; delta review pass by DeepSeek V4.1 Flash Free · 3ecf, owner's go Oct 24).
- D-132-catalog-record: done — 166fe5ff (docs only; landed on `main` by the status commit). Independent delta review passed: the audit names no secret, customer data or account/site id (D-059), and the `docs/PRICING.md` line matches the audit and `shared/planFamily.ts`. Focused checks 219/219 and `pnpm check` green; exact-head CI required before landing.
- D-132-item3: todo; waits for D-132-audit.
- D-132-v2-checkout: review findings fixed on `agent/instinct/v2-checkout-port` — F1 `81311412`, F2 `b1071690`, F3 `54b34637` (migrations 0112/0113), F4 `0188a447`; merged with latest `main` and re-checked after each move. Full gate on the merged head: typecheck and build green, 4,610 of 4,631 tests passed with 3 load flakes (`adminSmokeFixture` 2, `b2bMonetization` 1) green on isolated re-run, 18 skipped. Re-review and landing are a different session's call.
