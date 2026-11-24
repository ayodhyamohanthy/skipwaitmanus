# DEPLOY-web-catch-up: a web deploy refused while main was red ships by itself once main is green (D-388)

Tier 2 · lane `deploy-web-catch-up` · branch `agent/queue/deploy-web-catch-up` · epic D-212

## The defect, observed on Nov 24 2026

Deploy Web run [45363223861](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45363223861)
was refused at `eb0c78cd` (`RELEASE GATE REFUSED (web): ... CI run 45363223909 ... concluded failure`)
because main CI was red. Main turned green again within the hour, but nothing re-ran the web deploy:
`deploy-pages.yml` starts only on a `push` whose paths match, or by hand. The live web stayed on
`651d79c4` with six `client/`/`shared/` commits unshipped, and D-212 light 4 (Deployed) stayed red.
`docs/DEPLOY.md` already names the manual recovery (dispatch on main once CI is green); it was run
by hand on Nov 24 as the one-off recovery. This row makes it automatic.

## The fix

1. `deploy-pages.yml` also triggers on `workflow_run` of the CI workflow, `types: [completed]`,
   `branches: [main]`. That trigger proceeds only when the CI run concluded `success` on a `push`
   to `main` and its head is the current tip of `main`.
2. A new first job decides whether a deploy is owed: read the live web SHA the same way the
   existing canonical verification does, and deploy only when (a) the live SHA is an ancestor of the
   CI run's head and differs from it, and (b) at least one commit in `live..head` touches the
   workflow's own `push.paths` list. Otherwise it ends `skipped` with a one-line notice naming both
   SHAs. Reuse the existing path list; do not copy it into a second place that can drift.
3. Unchanged: `scripts/require-green-release.mjs --target web`, the `deploy-pages` concurrency group,
   the superseded-release refusal, the guarded upload and the canonical `git-commit` verification.
4. `docs/DEPLOY.md`: replace the manual-recovery sentence for this case with the automatic
   catch-up, keeping manual dispatch as the fallback.

## Tests (red first)

`scripts/deployWebCatchUp.test.ts`: reads the workflow YAML and asserts the `workflow_run` trigger
on CI/main/completed, that the decision job runs before `release-gate`, and that the path list is
read from the `push.paths` block. Unit-test the owed-deploy decision (pure function in a small
module under `scripts/`): behind with a matching path deploys; behind with only docs paths skips;
equal SHAs skip; a live SHA that is not an ancestor skips with a notice; a failed or non-push CI run
skips.

## Acceptance

Focused tests, `scripts/requireGreenRelease.test.ts` and `pnpm check` green; required CI green.
After landing, the next green main CI after a web-path merge shows a catch-up run (link it here).

## Status

- DEPLOY-web-catch-up: in progress — Claude Code · 857e — 2026-11-24 — branch agent/queue/deploy-web-catch-up
