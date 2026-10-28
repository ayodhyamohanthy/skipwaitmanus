# SYNC-LOG-off-main: keep the deploy log without pushing to `main`

Register row: `SYNC-LOG-off-main` (plan row D-082, Tier 3, lane `deploy-workflows`, branch `agent/claude/sync-log-off-main`; `docs/plans/assignments.json:3434-3445` at `main` 72265110).
Packet checked against: `docs/DECISIONS.md` through D-229 (the newest entry on `main` 72265110). D-225 to D-229 do not name this row and do not change it.
Author: a Claude Code reasoning session (D-225). This packet decides only. It does not change a workflow, script, test, register or registry row.

## 1. Current state (on `main` 72265110)

- **The writer.** `.github/workflows/deploy-pages.yml:106-108` runs `scripts/append-sync-log.sh` with `if: always()`. That script appends one table row (timestamp, workflow, commit, status) to `docs/SYNC_LOG.md` (`scripts/append-sync-log.sh:6-7`).
- **The push.** `.github/workflows/deploy-pages.yml:110-130` commits the file as `sync-bot` with `[skip ci]` and runs `git push origin HEAD:main` five times with rebase retries. On failure it prints "non-fatal" and exits 0 (`:130`). This is the only reason the Pages workflow asks for `contents: write` (`:32`). The other steps only check out, build, call Cloudflare, `curl` the site, and comment on an issue (`issues: write`, `:33`).
- **The refusal.** Since Oct 20, ruleset `main: green CI only (D-082)` (id 25433342) refuses any push to `main` whose exact commit has not passed the three required checks, for everyone, with no bypass. GitHub offers no Actions-bot bypass on a personal repository, so the sync-log push is refused. Deploys still succeed because the step is non-fatal (`docs/DECISIONS.md:98`, the "Supersedes · affects" cell). A bot commit made inside the job has never run CI, so it can never satisfy the rule. D-082's own exemption for "Workflow bot commits (the `[skip ci]` sync log)" (`docs/DECISIONS.md:98`) is therefore dead letter.
- **The effect.** The last row in `docs/SYNC_LOG.md` is `2026-10-19T19:26:43Z … c573af21 … success` (`docs/SYNC_LOG.md:417`). The last commit to touch the file on `main` is a claim commit (`1c680d7`, Oct 22), not the bot. `docs/SYNC_SYSTEM.md:37` already says the file has stopped growing, that "the GitHub Actions run history is the deploy log", and that this task moves it off `main`. Every Pages run since Oct 20 still burns about 25 s on five refused pushes (`deploy-pages.yml:123-128`) and logs a misleading line.
- **The API already moved.** `deploy-api.yml` has no sync-log push. It writes the same three facts to the run summary: `### <workflow>`, the commit and the status, with `if: always()` on every non-skipped run (`.github/workflows/deploy-api.yml:222-226`). Its durable "what is deployed" fact is the force-moved tag `refs/tags/api-runtime` (`:216-220`). Tags are outside the `main` ruleset, so that push works.
- **Run history is already authoritative.** The release gate reads "what is live on the Web" from the successful `deploy-pages.yml` runs on `main` (`scripts/require-green-release.mjs:135`, `:246-247`). It reads the API's state from `refs/tags/api-runtime` (`:21`, `:240-244`). Nothing reads `docs/SYNC_LOG.md` in code. The only reference is a path string in a classifier fixture (`client/src/pipeline/apiChangeClassification.test.ts:7`), and that test does not depend on the file's contents.
- **Structural pins on the workflow.** `scripts/requireGreenRelease.test.ts:484-522` pins the shape of `deploy-pages.yml`:
  - every job reaches `release-gate`;
  - every production step (`wrangler` …) follows the `--once` re-check with the same `if:`;
  - there is no job-level `if:` or `continue-on-error`;
  - `workflow_dispatch` is kept;
  - the top-level `permissions:` block contains `actions: read`.
  
  `:595-603` forbids one-line `run:` values that YAML would misread. These pins are owned by `P1-release-gate-strict-compare` (in review). This row must keep them green and must not edit them.

## 2. Decisions

**Decision 1. Where the log lives: the Actions run of each deploy, not any git ref. (9/10)**
Each deploy run's job summary carries the log row, and the run list for the two deploy workflows is the deploy log. `docs/SYNC_LOG.md` stays in the repository as a frozen archive of Sep 2 to Oct 19.

Options considered:

| Option | Rating | Why |
|---|---|---|
| **A. Run summary + run history (chosen)** | 9 | Writes nothing to git, so no ruleset, branch or race to handle. It is the pattern `deploy-api.yml:222-226` already uses, and the store the release gate already trusts (`require-green-release.mjs:246-247`). It records failures too: a run exists even when the job dies early. It lets `contents: write` drop to `read`. Cost: free. |
| B. Orphan `sync-log` branch the bot appends to | 5 | Pushes would be allowed, since the ruleset covers `main` and the bot already force-pushes a tag (`deploy-api.yml:220`). But it keeps a write token in a production workflow, keeps the concurrent-push race between the two deploy workflows (the reason for `:121-129`), adds a third long-lived ref that branch hygiene must learn to protect (`docs/plans/BRANCH-HYGIENE.md:10` lists the protected names; this one is not there), and creates a second record that can disagree with the runs the gate reads. |
| C. GitHub Deployments API (one deployment plus status per run) | 6 | Durable and native, but it needs `deployments: write`, new script code and a new failure path, for no reader that exists today. Revisit only if a reader needs more than the retention window (see Decision 4). |

The strongest argument against A: run logs and summaries expire with the repository's Actions retention setting (90 days by default), while a git file kept forever. That cost is acceptable for three reasons:
- The file has had no code reader and no growth for 9 days, and nobody missed it.
- The facts that matter for safety already live in durable places the gate reads. For the API that is `refs/tags/api-runtime`; for the Web it is the newest successful runs.
- To my knowledge, GitHub keeps the run records themselves (head SHA, conclusion, timestamps) after logs expire. That is **unverified**: the builder confirms it, or records otherwise, from GitHub's current Actions retention documentation in the PR (see §3 step 5). If it turns out to be false, the conclusion does not change, but §5 says what follows.

**Decision 2. Who writes it and when.** The deploy job of each workflow writes it, as its own last bookkeeping step, with `if: always()`, so a failed deploy is recorded too. `deploy-api.yml` is unchanged, since it already does this (`:222-226`). In `deploy-pages.yml` the two log steps (`:106-130`) become one summary step in the same format as the API:
```
### <workflow>
- commit: `<sha>`
- status: `<job.status>`
```
The step interpolates no dispatch input into shell (the same discipline `requireGreenRelease.test.ts:587-591` pins for `rollback.yml`) and is a `run: |` block, never a one-line value (pin at `:596-602`).

**Decision 3. How readers find it.**
- **People:** GitHub, then Actions, then "Deploy Web (Cloudflare Pages)" or "Deploy API (Cloudflare Containers)", filtered to branch `main`. Each run page shows the summary row.
- **Agents and scripts:** the same query the gate uses, `GET /repos/{owner}/{repo}/actions/workflows/deploy-pages.yml/runs?branch=main` (`require-green-release.mjs:247`), or `deploy-api.yml/runs`. With the CLI: `gh run list --workflow deploy-pages.yml --branch main`.
- **The deployed API commit:** `refs/tags/api-runtime`. **The deployed Web commit:** the `git-commit` meta tag on skipwait.me (`deploy-pages.yml:99`).
- `docs/SYNC_SYSTEM.md` states all of this, and the header of `docs/SYNC_LOG.md` points there.

**Decision 4. Least privilege follows the push.** With the push gone, `deploy-pages.yml` drops to top-level `contents: read` (`:32`) and keeps `issues: write` and `actions: read` (`:33-35`). No other step writes repository contents (§1). Keep `actions: read` inside the same top-level `permissions:` block, or the `requireGreenRelease.test.ts` pin fails.

**Decision 5. No new register entry.** The D-082 entry already states the outcome: "the Actions run history is the deploy log" (`docs/DECISIONS.md:98`). This row only makes the workflow match it. The dead "`[skip ci]` sync log" exemption in D-082 becomes harmless once no bot commits exist. Rewording a register entry is a register change and out of scope here. A later decision audit (D-221) may annotate it.

## 3. Executable row

One row, finishable by one agent alone (D-223). It is the registered `SYNC-LOG-off-main` itself; registering this packet against it is the coordinator's job, not this session's.

**`SYNC-LOG-off-main`: Tier 3, lane `deploy-workflows`, `dependsOn: []`, branch `agent/claude/sync-log-off-main`**

`owns` (exact; collision check below):
- `.github/workflows/deploy-pages.yml`: only the top-level `permissions:` block (`:31-35`) and the steps at `:106-130`. No other line moves, `release-gate` and `:38-104` included.
- `scripts/append-sync-log.sh`: delete it. Its only caller is `deploy-pages.yml:108`.
- `scripts/deployPagesSyncLog.test.ts`: new. It is a focused pin, inside the vitest include `scripts/**/*.test.ts`.
- `docs/SYNC_SYSTEM.md`: lines 17, 21 and 37 (flow diagram and audit-trail paragraph).
- `docs/SYNC_LOG.md`: the header text (`:1-3`) only. Rows 5-417 stay byte-identical as the archive.

Steps:
1. **Red first.** Add `scripts/deployPagesSyncLog.test.ts`, reading the workflow text the way `requireGreenRelease.test.ts:458` does. It asserts that `deploy-pages.yml`:
   - contains no `git push`, no `append-sync-log` and no `git commit`;
   - has a step that appends to `"$GITHUB_STEP_SUMMARY"` with `if: always()` in the `deploy` job, after the verify step;
   - grants no `contents: write`;
   - still declares `actions: read` and `issues: write`.
   
   It also asserts that `scripts/append-sync-log.sh` does not exist. Run it and capture the red output.
2. Replace `deploy-pages.yml:106-130` with the one summary step (Decision 2). Change `:32` to `contents: read`. Delete `scripts/append-sync-log.sh`.
3. Update the docs:
   - `docs/SYNC_SYSTEM.md:17,21` now read "write the run summary".
   - `docs/SYNC_SYSTEM.md:37` now describes the run history, the reader paths from Decision 3 and the frozen archive.
   - `docs/SYNC_LOG.md` header: "Archive, Sep 2 to Oct 19, 2026. CI stopped writing this file when the D-082 ruleset began refusing bot pushes to `main`. The deploy log is now the Actions run history; see `docs/SYNC_SYSTEM.md`."
   
   This is D-068: same push.
4. **Checks before the PR:**
   - `pnpm vitest run scripts/deployPagesSyncLog.test.ts scripts/requireGreenRelease.test.ts client/src/pipeline/apiChangeClassification.test.ts`, all green;
   - `pnpm check`;
   - `git diff --check`;
   - `node scripts/scope-check.mjs` passes against the `owns` above.
   
   No runtime code changes, so no `pnpm build` delta is required beyond what required CI runs.
5. **PR and landing.** Open the PR and land it on green required CI (Tier 3: no separate review, AGENTS team rule 5). In the PR, quote the current GitHub documentation line on whether run records survive log expiry (Decision 1).
6. **Proof after landing (rule 8).** The workflow file is in the Pages path filter (`deploy-pages.yml:18`), so the landing merge itself runs a Pages deploy. Attach links to that run as proof:
   - the summary row with the merge SHA;
   - no "Commit sync log back to main" step;
   - deploy and verify still green.
   
   `docs/SYNC_LOG.md` must not change on `main` after the landing.

**Must not:** touch `deploy-api.yml`, `rollback.yml`, `ci.yml`, `scripts/require-green-release.mjs` or `scripts/requireGreenRelease.test.ts` (the last two are owned by `P1-release-gate-strict-compare`, in review). Must not change the release gate, the re-check, the deploy or verify steps, or the issue notification. Must not create a branch or tag, add a dependency, or change a repository setting or ruleset. Stop and `--report blocked` if any pin in `requireGreenRelease.test.ts` needs editing to go green.

**Collision check (at 72265110).**
- Registered `owns` that name `deploy-pages.yml` belong only to done rows: `P1-deploy-green-gate` and `D-048-F-flags` (`docs/plans/assignments.json`).
- The in-review `P1-release-gate-strict-compare` owns only `scripts/require-green-release.mjs` and its test.
- No registered row owns `scripts/append-sync-log.sh`, `docs/SYNC_SYSTEM.md`, `docs/SYNC_LOG.md` or the new test file.
- The open-PR branches most likely to overlap have no diff to any of these paths against `main`: #787 CI-architect, #766 dark mode, #767 shell parts, #758 branch hygiene, #689 drift watch, #623 pipeline, #611 pre-push guard, #607 Workers commit SHA, and the landing slot.

## 4. Owner questions

None. This is Tier 3 workflow bookkeeping inside D-082's stated outcome. It spends nothing, touches no money, sign-in, identity or legal text, and narrows a token's permission.

## 5. Risks and what would change this packet

- **If run records do not survive log expiry** (Decision 1 is unverified on this point), the deploy history older than the retention window is lost. Mitigation without a new store: `refs/tags/api-runtime` and the live meta tag still prove what runs now, and the gate never needed more. If a reader later needs longer history, open a separate row for option C (Deployments API). Do not reopen option B.
- **A future workflow needs `contents: write` again.** It must justify that in its own row. This row only removes the grant that existed solely for the refused push.
- **Not done in this session:** the D-206 decision re-rating and its `docs/plans/DECISION-REVIEW.md` append. This assignment allows exactly one file.
