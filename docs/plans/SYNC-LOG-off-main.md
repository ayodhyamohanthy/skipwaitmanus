# Packet SYNC-LOG-off-main: the deploy log lives in the run summary, never in a push to `main` (D-082, D-212 (7), D-263)

Tier 2 (it edits a deploy workflow; DELEGATION §3 "when in doubt, the higher tier", D-263 (4)) · lane `deploy-workflows` · branch `agent/queue/sync-log-off-main` · waits for `REL-rollback-skew` (serialization only: both own `.github/workflows/deploy-pages.yml`, PICKER-owns-scope) · written by Hark · e9cd on 2026-11-01 at `main` `05d0f7de`, checked against the register through D-262.

## 1. Goal
Every Web deploy still leaves a one-line record (workflow, commit, status), but the record is written to the run's own summary, the way `deploy-api.yml` already does, so no workflow ever tries to push to `main` again. The two workflows that cannot fail (`sync-guard.yml`, which only echoes, and `design-gate.yml`, which ends in `|| true`) are retired in the same change, as D-212 (7) and `ENTERPRISE-PIPELINE.md:94` already say.

## 2. Binding rules (quoted)
- D-082 (`docs/DECISIONS.md:115`): "GitHub allows no bypass for the Actions bot on a personal repo, so the deploy workflow's sync-log push to `main` is refused too: deploys are unaffected (that step is non-fatal), `docs/SYNC_LOG.md` stops growing, and the Actions run history is the deploy log."
- D-212 (7): "no hand-written run logs where a commit status exists, no guard that cannot fail".
- `docs/plans/ENTERPRISE-PIPELINE.md:91-94`: "No hand-written run logs where a machine record exists: commit statuses and run summaries are the evidence." · "`sync-guard.yml` (only echoes) and `design-gate.yml` (`|| true`) retire with `SYNC-LOG-off-main`."
- DELEGATION §7.9: "Never edit a deploy workflow unless the packet says so." This packet says so for `deploy-pages.yml` only; `deploy-api.yml` is out of scope.

## 3. Current behaviour (verified on `main` `05d0f7de`)
- `.github/workflows/deploy-pages.yml:31-32` grants the whole workflow `contents: write`. The job-level `release-gate` already narrows itself to `contents: read` (`:46-48`). The only step in the file that writes repository contents is the sync-log push (`:151-171`): `git commit ... [skip ci]` (`:161`) then up to five `git push origin HEAD:main` attempts with a rebase between them (`:164-170`), ending "non-fatal" (`:171`). The D-082 ruleset refuses that push on every run since Oct 20.
- `deploy-pages.yml:147-149` ("Append sync log", `if: always()`) runs `scripts/append-sync-log.sh`, which appends one row to `docs/SYNC_LOG.md` (`scripts/append-sync-log.sh:1-7`). That script has no other caller.
- `docs/SYNC_LOG.md` last grew on Tue Oct 20 (its last row is commit `c573af21`).
- `deploy-api.yml:223-227` already records its result the target way: a step "Record sync status in workflow summary" that `printf`s `### <workflow>`, the commit and `job.status` into `$GITHUB_STEP_SUMMARY`. It never pushes the log.
- `.github/workflows/sync-guard.yml:1-14`: a 6-hourly cron whose only step echoes a sentence. It cannot fail.
- `.github/workflows/design-gate.yml:1-24`: on a push to `main` touching client pages, runs `npx -y impeccable@latest detect ... --quiet || true`, then echoes "findings are advisory". It cannot fail; `ci.yml:89-95` already records that the blocking design check is `scripts/design-token-audit.mjs` in CI.
- `docs/SYNC_SYSTEM.md:17,21` still draw "append docs/SYNC_LOG.md" in the flow; `:37` describes the refused push and names this task.
- `docs/DESIGN_SYSTEM_SPEC.md:286-293` (§11) says five rules are "enforced by CI (`.github/workflows/design-gate.yml`)", which is not true today.
- No test reads `sync-guard.yml` or `design-gate.yml` as files. `scripts/requireGreenRelease.test.ts:85` uses the string `.github/workflows/design-gate.yml` only as a fixture run path ("other workflows" are ignored); it keeps passing with the file gone and is not edited.

## 4. Rulings (decided under D-200, recorded as D-263; each is a changeable assumption)
1. **Run summary, not a `sync-log` branch.** A branch would still need `contents: write`, a push that can collide between the two deploy workflows, and a retry loop, to duplicate what the Actions run history and `release/verified` already record. `deploy-api.yml:223-227` is the precedent; `deploy-pages.yml` mirrors it.
2. **`docs/SYNC_LOG.md` stays as a frozen history**, with one line under its title saying it stopped on Oct 20 (D-082) and that each deploy's record is now its run summary. No row is added, removed or rewritten.
3. **The workflow drops `contents: write` to `contents: read`**, because the refused push was its only writer (§3). `issues: write` (the incident notice) and `actions: read` (the release gate) stay exactly as they are. If, when you build, any step in the file still writes repository contents (a tag, a commit, a release), stop and ask (§10) instead of lowering it.
4. **Tier 2, not the row's registered Tier 3**: it edits a deploy workflow. Tier 2 lands on green required CI with no separate review (D-200 (4)).
5. **`scripts/append-sync-log.sh` is deleted** (no caller remains). `scripts/sync-check.sh` (the Mac-side check `sync-guard.yml` mentions) and `scripts/sync-manifest.json` are untouched.
6. **Retiring `design-gate.yml` removes no enforcement**: it never failed. The impeccable detector stays available to run by hand; making it blocking would be a new row, not this one.

## 5. Files
In scope (the row's `owns`):
- `.github/workflows/deploy-pages.yml` — remove "Append sync log" and "Commit sync log back to main"; add "Record sync status in workflow summary" (`if: always()`, the same three lines as `deploy-api.yml:224-227`) where "Append sync log" was, before "Notify sync status"; top-level `contents: write` → `contents: read`. Nothing else in the file moves.
- `.github/workflows/sync-guard.yml` — delete.
- `.github/workflows/design-gate.yml` — delete.
- `scripts/append-sync-log.sh` — delete.
- `scripts/syncLogOffMain.test.ts` — new (§7).
- `docs/SYNC_LOG.md` — the one note line of ruling 2 only.
- `docs/SYNC_SYSTEM.md` — the flow (`:17`, `:21`) and "Audit trail" (`:35-37`) say the record is the run summary; step 2 of "Extending" (`:51`) says "record the run summary" instead of "append log".
- `docs/DESIGN_SYSTEM_SPEC.md` — §11 only: the five rules are review rules; CI enforces design tokens through `scripts/design-token-audit.mjs` (`ci.yml`).

Out of scope: `deploy-api.yml`, `ci.yml` (its comment at `:89-91` stays as history), `rollback.yml`, `release-verify.yml`, `drift-watch.yml`, every script the deploys run, `scripts/sync-check.sh`, `scripts/sync-manifest.json`, `docs/DECISIONS.md` (D-082 is not reworded), historical handoff docs that mention "Design Gate", any GitHub setting or ruleset, and any secret.

## 6. Steps (one commit each)
1. `SYNC-LOG-off-main: red-first tests` — add §7; run it; every case marked red fails for the reason given.
2. `SYNC-LOG-off-main: deploy record goes to the run summary` — `deploy-pages.yml` edits and the deletion of `append-sync-log.sh`.
3. `SYNC-LOG-off-main: retire the two guards that cannot fail` — delete `sync-guard.yml` and `design-gate.yml`.
4. `SYNC-LOG-off-main: docs say where the deploy record lives` — the three docs.
After each step: `pnpm vitest run scripts/syncLogOffMain.test.ts scripts/releaseSmoke.test.ts scripts/requireGreenRelease.test.ts scripts/rollbackTarget.test.ts`, `node scripts/check-deploy-triggers.mjs`, `pnpm check`.

## 7. Red-first tests (`scripts/syncLogOffMain.test.ts`)
Read files with `readFileSync`/`existsSync` only (no YAML dependency), like `scripts/releaseSmoke.test.ts:300`.
1. (red) `deploy-pages.yml` contains no `git push` and no `git commit`, and no step named "Commit sync log back to main" or "Append sync log".
2. (red) `deploy-pages.yml` has a step "Record sync status in workflow summary" whose block has `if: always()`, writes to `"$GITHUB_STEP_SUMMARY"` and names `${{ github.workflow }}`, `${{ github.sha }}` and `${{ job.status }}`; it comes after "Verify live site carries the pushed commit" and before "Notify sync status".
3. (red) `deploy-pages.yml` contains no `contents: write`; its top-level `permissions:` block reads `contents: read`, `issues: write`, `actions: read`.
4. (red) `.github/workflows/sync-guard.yml` and `.github/workflows/design-gate.yml` do not exist.
5. (red) `scripts/append-sync-log.sh` does not exist, and no file under `.github/workflows/` mentions `append-sync-log` or `docs/SYNC_LOG.md`.
6. (red) `docs/SYNC_SYSTEM.md` does not contain "append docs/SYNC_LOG.md" and does mention `GITHUB_STEP_SUMMARY` or "run summary".
7. (green today, kept green) `deploy-pages.yml` still has "Require green CI on this exact commit", "Deploy to Cloudflare Pages", "Verify live site carries the pushed commit" and "Notify sync status" — the change removes the log push and nothing else.
No existing test is edited, skipped or loosened.

## 8. Definition of done
- §7 all green; the step-1 commit shows cases 1-6 failing.
- Full gate from `docs/BRIEF.md` "How to ship" on the branch merged with the latest `origin/main`: `pnpm check`, token audit, `node scripts/check-deploy-triggers.mjs`, `node scripts/scope-check.mjs SYNC-LOG-off-main`, test-integrity, full vitest, build.
- Pull request; every check green on its exact commit; landed by merge commit (never squash or rebase, D-134 (6)).
- After landing (D-082 (5)): the merge touches `deploy-pages.yml`, which is in its own `paths`, so a "Deploy Web (Cloudflare Pages)" run starts. Watch it to the end: its summary shows the new record, its log shows no push to `main`, and `release/verified` follows as usual. This is the ordinary deploy every web landing causes, not a drill; trigger nothing by hand.
- Set this task's `status` to `done` in `docs/plans/assignments.json` and its line in the Status section below to `done — <sha>` with the DELEGATION §5 evidence block.

## 9. Review checklist (Tier 2: recommended, not required)
- `git diff --stat origin/main...<branch>` lists only §5 files.
- `deploy-pages.yml` diff: two steps out, one step in, one permission line changed; the release gate, wait-api, deploy, verify and notify steps byte-identical.
- No change to `deploy-api.yml`, `ci.yml` or any script the deploys run.
- The step-1 commit fails §7 cases 1-6 when checked out alone.

## 10. Stop and ask (write it in your Status line, push, report blocked)
- Any step in `deploy-pages.yml` still writes repository contents when you build (ruling 3).
- `REL-rollback-skew`'s branch or an open pull request changes the same lines of `deploy-pages.yml` (probe with `git merge-tree` as the picker prints).
- Any test outside §7 fails because a workflow file is gone.
- Anything that would need a GitHub setting, ruleset, secret or production action: those are the owner's (D-200 (6)).

## Status
- SYNC-LOG-off-main: todo — packet by Hark · e9cd, 2026-11-01; waits for REL-rollback-skew (shared `deploy-pages.yml`).
