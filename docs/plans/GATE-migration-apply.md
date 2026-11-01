# Packet GATE-migration-apply: a pull request's deploy migrations run for real against the schema `main` already has (D-212)

Tier 2 (`scripts/` and the e2e job in `.github/workflows/ci.yml`; nothing under `drizzle/**`, so the computed tier stays 2, GATE-tier-floor) · lane `ci-checks` · branch `agent/queue/gate-migration-apply` · depends on `GATE-e2e-journeys` (done, `629a2167`) · written by Claude Opus 5.5 · b2ad on 2026-11-01 at `main` `f5b9afb9`, checked against the register through D-266. Read [`docs/BRIEF.md`](../BRIEF.md), [`ENTERPRISE-PIPELINE.md`](ENTERPRISE-PIPELINE.md) and [`GATE-delivery.md`](GATE-delivery.md) "Rules for every task here" first; those rules bind this packet.

## 1. Goal
D-212 wants a broken deploy migration caught in the pull request, not in production's `migrate-db`. Today the e2e job applies the deploy migrations twice, but only after `drizzle-kit push` has already built the PR's own `drizzle/schema.ts`. Every table a new deploy migration creates therefore already exists, its `CREATE TABLE IF NOT EXISTS` becomes a no-op, and a migration production would refuse goes green.

After this row, the migration check builds the schema of the PR's **base revision**: the `schema.ts` that `main` had before the change. It then applies the PR's deploy migrations to that base twice. The new DDL executes exactly as it will in production, and the second run must still apply nothing. A drift check then confirms that the migrated database has every table and column the PR's `schema.ts` declares. Code that needs a column no deploy migration creates (the #90 class) fails the job. Everything uses repository files only: no production access and no production dump.

## 2. Binding rules (quoted)
- D-212 (`docs/DECISIONS.md:233`), QA line: "`GATE-e2e-journeys` (six core journeys in a real browser against a MySQL service on every PR, which also applies the deploy migrations twice)".
- D-239 (`docs/DECISIONS.md:256`): "`0017_careful_ricochet.sql` drops `privacy_request_user_kind_active_unique` twice, so `drizzle-kit migrate` fails from an empty database and the job falls back to `drizzle-kit push` — and `GATE-migration-apply` stays open exactly as packet item 1 says."
- `GATE-delivery.md:181-182`: "This row stays open only if that PR finds the migrations cannot apply from an empty database. In that case, any agent writes the packet from that PR's finding (a baseline snapshot of the production schema, D-100)".
- `GATE-delivery.md` rule 3: "Fail closed on a definite breach, open on a broken tool … A check that cannot run warns and passes; a check that finds a breach fails." Rule 4: "Required checks need the owner's word (D-212 (6))". Rule 2: the e2e job "runs in parallel with the others and takes under 10 minutes."
- AGENTS.md "Deployment and runtime rules": "Schema-dependent code stays off `main` until the matching production migration exists and is verified."
- `server/schemaDeployGuard.test.ts:6-9`: the runtime schema check "only READS production. Anything it requires must be created by a drizzle/deploy/*.sql migration, the only SQL the deploy pipeline applies."

## 3. Current behaviour (verified on `main` `f5b9afb9`, reproduced locally on MySQL 8.0.46)
- **The journal half always falls back.** `scripts/e2e-server.mjs:55-70` (`prepare`) runs `drizzle-kit migrate` from an empty database. If that fails, it warns, resets the database and runs `drizzle-kit push --force`. Then (`:72-80`) it runs `scripts/apply-deploy-migrations.sh` twice and requires 0 applied on the second run. On `main`, the migrate step always fails. CI run 41260983242, job 124714018042 (`e36c3d62`, the last code push to `main`) logs `##[warning]Can't DROP 'privacy_request_user_kind_active_unique'; check that column/key exists. Falling back to drizzle-kit push (GATE-migration-apply stays open).`, then 49 applied, then 0. A local run of `node scripts/e2e-server.mjs prepare` against `mysql:8.0.46` prints the same warning and the same 49/0.
- **The journal cannot be repaired into production's history.**
  - A statement-by-statement replay of all 40 journal entries (196 statements) from empty fails 7 statements in 3 files:
    - `drizzle/0017_careful_ricochet.sql` statement 2: the same index is dropped twice, at `:1-2`.
    - `drizzle/0018_equal_professor_monster.sql` statement 2: the same column is added twice, at `:1-2`.
    - `drizzle/0037_b2b_monetization.sql` statements 5 and 13: `ON UPDATE NOW` is a syntax error, at `:24` and `:62`. Statements 6, 7 and 14 then fail because those tables do not exist.
  - The 25 loose `drizzle/*.sql` files outside the journal add 10 more errors. Examples: MariaDB-only `ADD COLUMN IF NOT EXISTS` in `0031_missing_columns.sql`, and tables that 0037 never created.
  - Even with every error skipped, the resulting schema still lacks four tables production had on Sep 24: `employerAccounts`, `employerTalentRefs`, `employerTalentIntroRequests` and `partnerModules` (`schemaDeployGuard.test.ts:13-26`, BASELINE).
  - Production never runs these files (`schemaDeployGuard.test.ts:9`, `:188`). The only `drizzle-kit migrate` caller is the dev script `db:push` (`package.json:16`). The journal is a historical record, not a way to rebuild production.
- **The push base hides real deploy DDL.**
  - Proof: applied to the journal-history base, the 49 deploy files create 37 foreign-key constraints under the names those files give them. On the push base none of those 37 names exist. Matched by column set, the keys are there, but `push` created them under `schema.ts`'s generated names. The deploy files' `CREATE TABLE` statements never executed.
  - Probe (a scratch copy, never committed): a new deploy file `0121_gate_probe.sql` whose foreign key names a missing column on `users`, plus the matching table in `schema.ts`. Today's path: push of the head schema, then deploy → 50 applied, 0 applied, green. Base-revision path: push of `main`'s `schema.ts`, then deploy → `ERROR 3734 (HY000) … Failed to add the foreign key constraint. Missing column 'noSuchColumn' for constraint 'gate_probe_user_fk' in the referenced table 'users'`. That is the error production's `migrate-db` would raise.
- **`drizzle-kit push` can fail with exit 0.** `drizzle-kit` 0.31.5 printed `Error: Identifier name 'companyCoverageInvitations_referralRequestId_referralRequests_id_fk' is too long` (`ER_TOO_LONG_IDENT`) for the `schema.ts` at the deploy ledger's first commit (`35172605`, PR #40) and still exited 0. `e2e-server.mjs:69` checks only the exit status. Today's `main` `schema.ts` pushes cleanly: 92 tables, `[✓] Changes applied`.
- **Drift on `main` is zero once normalized.** Build push(`main`) + deploy ×2 and compare it with push(`main`) alone. Match tables and columns by name, match indexes and foreign keys by column set (so `schema.ts`'s generated names and the deploy files' names agree), treat `now()` and `CURRENT_TIMESTAMP` as equal, and ignore the ledger table `schemaDeployMigrations`. The result has 0 entries in every category. Two more probes:
  - a correct PR (a new table in `schema.ts` plus a matching deploy file) shows no drift;
  - a column added to `users` in `schema.ts` with no deploy file reports exactly `missingColumns: ["users.gateDriftProbe"]`.
- **The wiring already exists.**
  - The e2e job checks out full history (`ci.yml:235`, `fetch-depth: 0`) and computes `BASE_SHA`/`HEAD_SHA` for its docs-only step (`ci.yml:239-240`: the PR base, or `github.event.before` on a push).
  - `drizzle-kit push --dialect mysql --schema <file> --url <url> --force` works without a config file. A schema copy under `e2e/.results/` resolves the repository's `node_modules` and is already git-ignored (`e2e/.gitignore:2`).
  - `apply-deploy-migrations.sh:7` honours `DEPLOY_MIGRATIONS_DIR`. Locally, an extra push takes about 9 s and the comparison under 1 s.

## 4. Rulings (changeable assumptions under D-109; not recorded in the register by this packet)
1. **Base-revision schema, not a production dump.** The original suggestion, a baseline snapshot of the production schema, needs the owner's approval (`D-100-security-audit.md:53`, "Approve saving a production schema dump for the baseline migration") and production access. The base revision's `schema.ts` needs neither, and §3 shows it catches the failure class the row exists for. A production dump stays a possible later upgrade under that owner item. It is not part of this row.
2. **Drop the journal attempt and leave history alone.** `prepare` no longer runs `drizzle-kit migrate`. The historical `drizzle/*.sql` and `drizzle/meta/**` files are not edited: production never runs them, they cannot rebuild production (§3), and editing `drizzle/**` would make this a Tier 1 row for no gate value.
3. **One database for the journeys, one scratch database for the reference.**
   - The journeys run on the migrated base: push(base `schema.ts`) + deploy ×2. That makes their schema closer to production's than today's.
   - The drift reference is a second database, `skipwait_head`, built by push of the HEAD `schema.ts` in the same MySQL service, and dropped after the comparison.
4. **What fails and what warns.**
   - *Fail (definite breach):* a deploy run fails; the second run applies anything; a table or column declared in HEAD `schema.ts` is missing from the migrated base.
   - *Warn, in the step summary only:* a column whose type, nullability or default differs (normalized as in §3); an index or foreign key in HEAD `schema.ts` with no column-set match; objects present only in the migrated base. Production is non-destructive, so extra objects are expected. Promoting a warning to a failure is a later row, after real data.
5. **Fail open on a broken tool** (GATE-delivery rule 3). In each case below, warn with the reason in the summary and keep the run green:
   - the base revision cannot be resolved: an all-zero `before`, a sha missing after the fetch, or `git show <base>:drizzle/schema.ts` failing;
   - the base push fails. Its output is judged by the output check in ruling 6, never by the exit code alone. In this case, fall back to today's path (push of HEAD, then deploy ×2) so the journeys still run;
   - the reference push fails. In this case, skip the drift check.
6. **A push is judged by its output.** It counts as failed if it exits non-zero, if any output line starts with `Error`, or if `sqlMessage` appears. A success also needs the `Changes applied` line or the no-changes message. Any other output counts as failed.

## 5. Files
In scope (the row's `owns`):
- `scripts/migrationGateCore.mjs` (new, pure, no I/O):
  - `baseRevisionOf({ eventName, prBaseSha, before })`: the sha or `null`; `null` for a missing or all-zero value.
  - `pushOutcome(output, exitOk)`: `{ ok, reason }`, per ruling 6.
  - `normalizeSnapshot(rows)` and `compareSchemas(migrated, reference)`, which return `{ missingTables, missingColumns, differingColumns, keysMissing, extraTables, extraColumns, extraKeys }` with the §3 normalization and `schemaDeployMigrations` ignored.
  - `gateVerdict(…)`: `{ status: "pass" | "fail" | "warn", summaryLines }`, per rulings 4 and 5.
- `scripts/migrationGate.test.ts` (new): the §7 tests.
- `scripts/e2e-server.mjs`: `prepare` only.
  - Read `MIGRATION_BASE_SHA` from the environment.
  - Write the base `schema.ts` to `e2e/.results/migration-base/drizzle/schema.ts` with `git show` through `spawnSync` with an argument array (no shell).
  - Push the base, run the deploy migrations twice, push the reference into `skipwait_head`, read the two `information_schema` snapshots with the existing `mysql2` connection, call the core, append its `summaryLines` to `GITHUB_STEP_SUMMARY`, throw on `fail`, and drop `skipwait_head`.
  - The host guard (`database()`, localhost only) applies to both databases. `start` is unchanged.
- `.github/workflows/ci.yml`: the e2e job's prepare step only. Rename it "Base schema, deploy migrations applied twice, drift check". Add `MIGRATION_BASE_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}` to its `env`, and update the job's header comment (`:206-212`) to say what it now proves. No other job, step or trigger changes.
- `docs/plans/GATE-migration-apply.md`: your Status line.

Out of scope: every file under `drizzle/**` (ruling 2); `scripts/apply-deploy-migrations.sh` and `scripts/lint-deploy-migrations.sh` (used as they are); `e2e/*.e2e.ts`, `e2e/playwright.config.ts` and `e2e/.gitignore`; `scripts/ciMarkerSkip.test.ts` (it pins the required jobs and only names `e2e journeys`); `package.json`; `server/schemaReconcile.ts` and `server/schemaDeployGuard.test.ts`; the ruleset; any production database, dump or secret.

## 6. Steps (one commit each)
1. `GATE-migration-apply: red-first tests`: add §7, run it, and see it fail because `scripts/migrationGateCore.mjs` does not exist.
2. `GATE-migration-apply: pure gate core`: write `migrationGateCore.mjs` until §7 passes.
3. `GATE-migration-apply: prepare builds the base revision and checks drift`: the `e2e-server.mjs` and `ci.yml` edits.
4. Local proof, nothing committed: run `node scripts/e2e-server.mjs prepare` against a local `mysql:8.0` three times:
   - (a) on the branch as is: green, summary "no drift";
   - (b) with the §3 FK probe as an uncommitted deploy file plus its `schema.ts` table: red with ERROR 3734;
   - (c) with the §3 `users` column probe in `schema.ts` only: red naming `users.gateDriftProbe`.
   For (b) and (c), point `MIGRATION_BASE_SHA` at `origin/main`, then discard the probe edits. Paste the three summaries into the PR.

After each step, run `pnpm vitest run scripts/migrationGate.test.ts scripts/ciMarkerSkip.test.ts`, then `pnpm check`.

## 7. Red-first tests (`scripts/migrationGate.test.ts`, fixtures only, no database)
1. `baseRevisionOf`: the PR base sha for `pull_request`; `before` for `push`; `null` for `0000000000000000000000000000000000000000`, an empty string or `undefined`.
2. `pushOutcome`:
   - fails on the exact §3 `ER_TOO_LONG_IDENT` output with exit 0;
   - passes on output ending `[✓] Changes applied`;
   - fails on exit non-zero;
   - fails on output with no success line.
3. `compareSchemas`:
   - identical snapshots → every list empty;
   - the same foreign key under two names, and the same index under two names → no `keysMissing`;
   - `now()` and `CURRENT_TIMESTAMP` defaults → no `differingColumns`;
   - `varchar(40)` against `varchar(80)` → one `differingColumns` entry;
   - a column only in the reference → `missingColumns`;
   - a table only in the migrated base → `extraTables`;
   - `schemaDeployMigrations` only in the migrated base → ignored.
4. `gateVerdict`:
   - `fail` for a missing table or column, a failed deploy run, or a second run applying more than 0;
   - `warn` (status not `fail`) for differing columns, missing keys or extras;
   - `warn` with the fallback line for an unresolved base or a failed base push;
   - `pass` with "no drift" for empty results.
5. `ci.yml` (string read, like `scripts/ciMarkerSkip.test.ts`): the `e2e journeys` job's prepare step sets `MIGRATION_BASE_SHA` and still runs `node scripts/e2e-server.mjs prepare`; the job keeps `fetch-depth: 0`.

No existing test is edited, skipped or loosened.

## 8. Definition of done
- §7 is green, and the step-1 commit shows it red.
- The §6 step 4 local proof (a), (b) and (c) is pasted in the PR, with the MySQL version.
- The full gate from `docs/BRIEF.md` "How to ship" passes on the branch merged with the latest `origin/main`, including `node scripts/scope-check.mjs GATE-migration-apply` and the test-integrity check.
- On the PR, the `e2e journeys` job's summary shows the base revision it used, "Deploy migrations, run 1: N applied", "run 2: 0 applied" and "no drift", and the job stays under 10 minutes.
- Pull request, every check green on its exact commit, landed by merge commit (never squash or rebase, D-134 (6)).
- In the landing PR, set this task's `status` to `done` in `docs/plans/assignments.json` and add the DELEGATION §5 evidence block to the Status line below. Add `— map: e2e prepare checks deploy migrations against the base revision's schema and drift against HEAD schema.ts` for the next registry PR to fold into AGENTS.md's Validation commands.
- Once the check has been green on `main` for 3 days, any session asks the owner to make `e2e journeys` required (GATE-delivery rule 4). This row does not change the ruleset.

## 9. Review checklist (Tier 2: recommended, not required)
- `git diff --stat origin/main...<branch>` lists only the §5 files. There is no `drizzle/**` change.
- `start` in `e2e-server.mjs` and every non-e2e job in `ci.yml` are byte-identical.
- No shell interpolation of a sha or of PR text: `git show` and `drizzle-kit` run through `spawnSync` argument arrays.
- Both databases still go through the localhost-only guard.
- A broken tool warns and passes; a breach fails (rulings 4 and 5).

## 10. Stop and ask (write it in your Status line, push, report blocked)
- The base `schema.ts` on `main` stops pushing cleanly. Treat it as a broken tool (ruling 5), never as a reason to edit `drizzle/**`, and say so in your report.
- Run on `main`, the drift check reports a missing table or column. That is real drift between `schema.ts` and the deploy migrations on `main`, so stop and report it with the list instead of baselining it away.
- The job would exceed 10 minutes, or the change would need a new dependency, an env key outside `ci.yml`, a ruleset change, a production database or a dump. Those need the owner (D-212 (6), D-100 owner items).
- An open row comes to own `scripts/e2e-server.mjs` or the e2e job in `ci.yml` before you start. Probe it with `git merge-tree`.

## Status
- GATE-migration-apply: todo — packet by Claude Opus 5.5 · b2ad, 2026-11-01, at `main` `f5b9afb9` (register through D-266). Rulings are unregistered changeable assumptions (D-109).
