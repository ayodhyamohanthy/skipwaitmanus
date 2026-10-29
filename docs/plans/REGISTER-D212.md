# Packet REGISTER-D212: land the enterprise-pipeline ruling (D-212) after an independent review

> Read `docs/BRIEF.md` first, then this packet. The pull request is already written: this packet is its build (merge-up), review and landing brief, not a fresh build. The REGISTER-520 pattern (`docs/plans/STRANDED-OCT23.md`) is the precedent.

| Field | Value |
|---|---|
| Decisions | D-212 (on the branch), D-151, D-163 (4), D-199, D-200, the Oct 23 merge-policy amendment |
| Row | `REGISTER-D212` (Tier 1, lane `register`) |
| Pull request | draft PR from `agent/queue/register-d212` (cut from #623's head `a1303cd8`); #623 (`claude/enterprise-pipeline`) stays open and unmerged until this one lands |
| Verified against | `main` `65674501` on 2026-10-26 |

## What it holds
Docs, decisions and the queue only, no product code:
- **The ruling.** D-212 (enterprise discipline at startup speed: every role a picker stage or a machine check, the seven lights, a red live release holds every landing but its fix).
- **The operating model.** `docs/plans/ENTERPRISE-PIPELINE.md`.
- **Two packets.** `docs/plans/REL-production-watch.md` and `docs/plans/GATE-delivery.md`.
- **18 queue rows.** REL-*, GATE-*, PICKER-fullstack-lights, PICKER-qa-stage and OPS-github-settings.
- **Registry hygiene (D-212 (8)).**
  - Six landed rows set to done: #530, #603, #619, #599, #586, #578.
  - D-179-ats-validation moved to its own lane.
  - Dependency edits on D-099-bonus-pages, D-174-pool-nudges and REL-client-capture.
  - **Oct 28 refresh.** `main` gained three picker rows after this branch's last merge-up (`PICKER-heartbeat-slot-safety`, `PICKER-landed-marker-continuity`, `PICKER-landing-wait-fallthrough`), each owning `scripts/next-task.mjs` or `scripts/nextTaskCore.mjs`. Merging them in made `validateAssignments` report six `owns` overlaps against `PICKER-fullstack-lights` and `PICKER-qa-stage`. Resolved in the direction the coordinator set — new rows wait for the older queued owning stage — by adding the three rows to `PICKER-fullstack-lights.dependsOn`; `PICKER-qa-stage` follows through it, and `waitsFor` is transitive, so six overlaps become none. No cycle: all three reach `PROCESS-review-gate` and none reaches either new row. D-212 (8)'s sentence about `PICKER-decision-sync` and `BRANCH-HYGIENE-2` `owns` was corrected in the same commit, because the action it described was never performed and performing it needs its own ordering ruling.
- **Doc updates.** Additions to the BRANCH-HYGIENE-2 packet, the first D-205 backlog-pass record, one sentence in `AGENTS.md` rule 5, a §3b row and a `docs/plans/README.md` section.
- **Scope-check acceptance.** `REGISTER-D212` declares no `owns` so `scripts/scope-check.mjs` skips the row. Adding `owns` for its touched files (`docs/DECISIONS.md`, `assignments.json`, `docs/plans/README.md`, `docs/plans/BRANCH-HYGIENE.md`) triggers `assignments.json`'s unsequenced-overlap rule against `D-099-bonus-pages`. Per the independent review finding 2 recommendation (option c), the scope-check skip is accepted for this docs-only row; teaching `scope-check` shared registry ownership is deferred to a separate row.

## Who
A Claude Code session wrote it, so the review goes to a model other than Claude and other than the builder of the merge-up (D-151, D-200 (4)). A Claude Code session handed this row's review posts no verdict and reports it blocked.

## Build stage (merge-up only; nothing else)
1. `git fetch origin`, check out `agent/queue/register-d212` in a worktree, `pnpm install`, then `git merge origin/main`. Never rebase or force-push.
2. **`docs/DECISIONS.md`.** Keep every row `main` has, unchanged. If `main` now holds a D-212, give this branch's entry the next free ID across `main` and every open branch. Then replace every reference to D-212 in this branch's diff:
   - the entry itself, `AGENTS.md` and the §3b row;
   - `docs/plans/README.md`, the three packets and `docs/plans/BRANCH-HYGIENE.md`;
   - the `row`, `epic`, `title` and `note` fields of this branch's rows in `docs/plans/assignments.json`.
   Never change a reference that belongs to `main`'s own entry with that number.
3. **`docs/plans/assignments.json`.** Keep `main`'s rows and edits. Re-apply this branch's rows and field edits where `main` did not change the same field; if `main` changed the same field, keep `main`'s value and say so in the PR. Keep `main`'s JSON formatting. Then run `validateAssignments` (it must print `[]`) and `node_modules/.bin/vitest run scripts/` (all pass).
4. **`docs/BRIEF.md`.** It is untouched here; if the merge fails its size test, the fault is `main`'s, so report it.
5. Push, make sure the draft pull request's required checks are green on the new head, and report `review`.

## Review stage
A model other than Claude and other than the merge-up builder reviews the pull request's exact head against current `main`. Packets are built exactly as written, so a wrong fact becomes wrong code. Check:
1. **The resolved merge** on its own (the merge-policy amendment): nothing of `main` lost, no ID collision, `main`'s formatting kept.
2. **Every factual claim** in D-212 and the three new docs, against the code, with file:line or command output. In particular:
   - the workflow names and the expected-SHA rule in REL-release-verify (the web's newest successful deploy and `refs/tags/api-runtime`);
   - the e2e server setup (a MySQL service, `NODE_ENV=test`, `scripts/seed-test-accounts.ts`, `scripts/apply-deploy-migrations.sh`);
   - the watchdog probes (a malformed email answers 400 before any provider call);
   - the 5xx capture wiring (`markErrorReported`, the tRPC `onError` flag, the `/api/health/*` skip);
   - `isJobOverdue`, the review-email due rows (`pending`, `leased`, `failed` or `unknown`) and the link reuse;
   - the Tier 1 path list.
3. **Consistency with every newer decision**, D-200 to the newest. No second pre-landing approval. A red light holds only landings. Free tools only (D-204). Nothing waits for one session.
4. **The queue.**
   - `validateAssignments` prints `[]`.
   - Each new row's `owns` covers every file its packet tells the builder to edit.
   - No row waits for one that cannot finish.
   - The six rows set to done really landed (`gh pr view <n>`).
5. **Proof.** The numbers quoted carry their source.

A finding is a claim the code or `main` does not support, or a rule a builder could not follow as written. Post findings on the pull request and push `--verdict findings`. The fix stage goes to any session other than the reviewer, and fixes carry their evidence. A pass is `--verdict pass` on the exact head.

## Landing
Docs only. The independent pass is on the exact head, the branch is up to date with `main`, and every required check is green on that exact commit. Land with the merge-commit button (`gh pr merge <number> --merge`; never `--admin`, `--squash` or `--rebase`). If `main` moved after the pass, merge `main` again: a clean merge of `main` keeps the pass (D-166 (2)), and any hand edit needs a new review. Set this row's `status` to `done` in the landing PR. After landing, comment on #623 that it was superseded by this pull request and leave closing it to the owner.

## Stop and ask
If a decision on the branch contradicts a newer one on `main`, report it blocked with both IDs; do not pick one. If the review finds that a packet's design needs an owner-reserved choice (D-200 (6): settings, tokens, accounts, the ruleset), report it blocked, naming the choice.

## Status
`REGISTER-D212: review — fix round c3817ab3 — Deepseek-V4.1-Flash · 4408 — 2026-10-29` — merged `main` `622d1b0f` (clean). **F1 is resolved upstream and re-verified, not re-fixed:** `main`'s `6865f88d` (Oct 28) serialized `PICKER-heartbeat-slot-safety`, `PICKER-landed-marker-continuity` and `PICKER-landing-wait-fallthrough`, and this branch's `PICKER-fullstack-lights` carries the matching edges (`PICKER-qa-stage` reaches them through it), so `validateAssignments` returns `[]` on the merge — 239 rows, 0 errors. **F2 (P2) corrected properly:** the previous round said the two rows "do not get" `owns` but justified it with "PICKER-decision-sync's packet lists none", which is false — that packet lists five paths at `docs/plans/PICKER-decision-sync.md:28`. D-212 (8) now says both packets **do** list paths, names them, gives the real reason the `owns` were not registered (either would overlap the three picker rows with no ordering edge, and `validateAssignments` refuses that), and records that nothing is owed today: `PICKER-decision-sync` landed (`86559ba7`) and is `done`, and `BRANCH-HYGIENE-2` is held for the owner under D-232. **F3 (P1) rewritten against the workflow that exists:** `REL-rollback-skew`'s Why bullet described a blank-commit path `#751` (`d550ffd7`, `69dc58bc`) had already replaced; it now records the deliberate recovery as built (`target`/`commit`/`confirm`/`reason`, the `--recovery` gate, `commit-sha.txt` at `:107`, `API_RELEASE` at `:129`, `api-runtime` moved at `:149`) and names what is actually missing — the web leg, since `target` offers only `api`. The What bullets drop the automatic SHA default (it would replace a typed-twice, green-gated, recorded decision with an automatic choice) and add `rollback-web` with the same four inputs, the same green-CI gate, a verification that the deployed web commit is the target, and `concurrency: deploy-pages`; no `web-runtime` tag is added, and the leg verifies the deployed commit itself because `REL-release-verify` triggers only on the two deploy workflows and cannot see a recovery. `REL-self-heal` now dispatches all four required inputs, with a test pin, because a two-input dispatch is refused at validation. **F4 (P2) labelled:** every shared-file edge states its kind where it is read (`docs/plans/README.md`, the `REL-5xx-capture`, `REL-heartbeats` and `PICKER-fullstack-lights` headings) — serialization forced by `owns` overlap under PICKER-owns-scope and D-223 (1), not an output need — and gives the honest reason the BYOR edges stand: BYOR's packet owns `server/errorAlerting.ts` outright and `server/_core/index.ts` in full, so the two REL rows are not independent edits of those files, and the bounded handoff the reviewer preferred needs BYOR to narrow those paths first. `REL-heartbeats` → `REL-watchdog` is labelled an output edge. **F5 (P3) re-measured:** `D-212 (2)` still said 35 files and 3 importers; on `main` `622d1b0f` there are **239** literal `status(500|502|503)` matches in **36** non-test server files, **4** of those 36 import `captureServerError` directly (`jobCatalogRoutes`, `privateReferralRoutes`, `scheduledJobsRoutes`, `workosWebhooks`) and **11** non-test files import it in all — `ENTERPRISE-PIPELINE.md` and `REL-production-watch.md:116` already carried this and agree with the re-measurement. Verified locally: `validateAssignments` 239 rows `[]`; 8 registry/docs suites 266/266 (`nextTask`, `registerShape`, `register520Packets`, `queueGate`, `scopeCheck`, `briefContract`, `goalUiCoverage`, `d048Split`). Docs and registry only — no code, workflow or product change. Needs a fresh exact-head review by a model other than Claude (writer), Gemini (earlier fixer), Qoder (reviewer) and DeepSeek (this fixer).
