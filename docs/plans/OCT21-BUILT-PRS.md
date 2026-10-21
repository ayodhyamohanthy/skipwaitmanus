# Packet OCT21-BUILT-PRS: finish the pull requests that are already built

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085) on Oct 21 2026. The picker (`node scripts/next-task.mjs --claim "<your model name>"`) hands out one task from this packet at a time; do only the task it prints. The register (`docs/DECISIONS.md`) wins any conflict with this file.

These pull requests were built before they had a packet. This packet is their packet: it says, per task, what "done" means. Nothing here adds scope: finish, fix or review what the pull request already does, inside its own files.

## Rules for every task here
1. **Green before `main` (D-082).** Merge the latest `origin/main` into the pull request's branch (never rebase or force-push), run the full gate from `docs/BRIEF.md` "How to ship", and land only when every check on that exact commit is green. GitHub refuses anything else.
2. **Flags stay off (D-097).** Every new behaviour lands behind its flag, off. Turning a flag on is a separate step after QA, never part of these tasks.
3. **Migrations.** A pull request whose migration number is already used on `main` takes the next free number (plan §5 says which; today 0099 or higher) before anything else, and records it in plan §5 in the same pull request. Renumbering never changes the SQL.
4. **Tier 1** (money, sign-in, identity, privacy, migrations): the builder stops at a green draft pull request; a different session reviews it (`docs/DELEGATION.md` §6) and lands it. Tier 2 and 3: the builder lands it.
5. **Never change prices or credit rules (D-056, D-091).** Tasks marked `owner` in the list wait for the owner's yes and are never landed by an agent.
6. In the same pull request that lands a task, set its `status` to `done` in `docs/plans/assignments.json` and update the decision's `Sync` cell and any doc the change makes stale (D-068).

## Tasks, in the list's order

### D-067-review-outbox (#322, `agent/kat/d067-allocated-0098-oct19`, Tier 1)
Billing review recovery outbox from the D-067 lane: a parked payment is never lost between the provider event and the admin review. Its migration was allocated 0098, which the Neutrinos rebrand took on `main`: renumber it first (rule 3). Done: renumbered, merged with `main`, gate green, independent review passed (money: one idempotency key per effect, replay writes nothing twice, a failure mid-way leaves no partial state), landed, live check.

### D-104-company-signal (#373, `agent/instinct/company-response-signal`, Tier 1)
Company responsiveness signal (D-104): a company-level aggregate, shown only at 3 or more referrers and answered asks, behind its flag. Done: merged with `main`, gate green, review passed with privacy checks (no per-referrer number reachable through any route or response, thresholds enforced on the server), landed with the flag off.

### D-107-claim-company (#384, `agent/instinct/claim-company`, Tier 1, after D-104)
Free claim-your-company (D-107): mailbox email link proves access to a work mailbox, then an aggregate-only company dashboard, flags `COMPANY_CLAIM_ENABLED` and `VITE_COMPANY_CLAIM` off. It reuses D-104's calculation, so it lands after D-104. Done: merged with `main`, gate green, review passed with identity checks (token hashed, single-use, 10-minute expiry, bound to the requesting account, never in logs or `returnTo`; no profile or account-type change; rate limits per user, domain and globally), landed with both flags off. Its migration, if any, follows rule 3.

### D-105-win-card (#375, `agent/instinct/share-win-card`, Tier 2)
Seeker win card (D-105): an opt-in copy card on an accepted ask, client-only, flag off. Its CI is red: make it green first. Done: merged with `main`, gate green, landed with the flag off; the card never shows the referrer's name or anything the seeker did not choose to share.

### D-106-impact-card (#382, `agent/instinct/share-impact-card`, Tier 1)
Referrer impact card (D-106): shareable aggregates under the referrer's screen name only, flag off. Tier 1 because it publishes referrer data. Done: merged with `main`, gate green, review passed (screen name only, never the legal name, employer email or any seeker detail; aggregates only), landed with the flag off.

### D-048-F-typescale (#379, `agent/opencode/goal-kit-type-scale`, Tier 2, first in lane `design-core`)
The goal kit's type scale: a shared merge helper dropped the goal type tokens. It is the first foundation step of D-048 phase 3 (docs/plans/D-048-phase-3-split.md). Done: merged with `main`, gate green including the design-token audit, goal component tests unchanged or extended (never weakened), landed.

### D-048-p3-map (#358, `agent/workbuddy/d048-phase3-plan`, Tier 3)
The D-048 phase 3 rollout map (eight waves, one pull request each). Done: merged with `main`, consistent with `DESIGN.md`, D-077 and docs/plans/D-048-phase-3-split.md (D-127 wins where they differ: cluster lanes, dark landing, one-line releases), landed.

### D-048-p3-w0-shell (#361, `agent/instinct/goal-ui-w0-shell`, Tier 2, after the map)
Wave 0: the app shell onto the goal system. Its CI is red: make it green first. Done: merged with `main`, gate green, 1280 and 390 captures attached to the pull request, landed. No surface outside the shell is re-skinned (D-048).

### D-048-p3-explore (#362, `agent/qoder/d048-phase-3-explore`, Tier 2)
Find a referral (`/explore`) moves to the goal directory. Done: merged with `main`, gate green, 1280 and 390 captures, landed.

### D-048-p3-requests (#360, `agent/qoder/d048-phase-3-requests`, Tier 2)
My asks (`/requests`) moves to the goal list. Done: merged with `main`, gate green, 1280 and 390 captures, landed.

### ROW20-A (#310), ROW20-B (#311), ROW20-CD (#314) — queue row 20, in that order
FND-7 left the row-20 set to the CEO: finish it, in order. A (`agent/qoder/row20-referral-lifecycle`, Tier 2) counts the kit Impact metrics from real history; B (`agent/qoder/row20b-company-demand`, Tier 2) counts seeker company demand as one vote per person, the count D-086 makes public; C+D (`agent/qoder/row20cd-thank-you-wall`, Tier 1 because of its migration) delivers the landed thank-you to its referrer exactly once. C+D named migration 0097, which the brand rename took: renumber it (rule 3). Done for each: merged with `main`, gate green, every number from the database and none invented (D-088), landed (C+D after its review).

### TASK13-pinned-work (#308, `agent/qoder/ask-pinned-work`, Tier 1)
Queue task 13 slice A: pinned showcase work rides with the ask as a snapshot. It named migration 0096, which card validation took: renumber it (rule 3). Done: renumbered, merged with `main`, gate green, review passed (ids ownership-checked, count capped by the plan's existing `showcase.pins`, a later edit never rewrites an open ask), landed.
