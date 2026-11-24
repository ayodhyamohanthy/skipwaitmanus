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
on CI/main/completed, that the decision runs before any deploy (as built: the catch-up workflow
decides, then dispatches Deploy Web, whose `release-gate` runs first; see Build notes), and that the
path list is read from the `push.paths` block. Unit-test the owed-deploy decision (pure function in a small
module under `scripts/`): behind with a matching path deploys; behind with only docs paths skips;
equal SHAs skip; a live SHA that is not an ancestor skips with a notice; a failed or non-push CI run
skips.

## Acceptance

Focused tests, `scripts/requireGreenRelease.test.ts` and `pnpm check` green; required CI green.
After landing, the next green main CI after a web-path merge shows a catch-up run (link it here).

## Build notes (Nov 24 2026, Claude Code · 857e)

Built as a separate workflow rather than a `workflow_run` trigger on `deploy-pages.yml`, for two
reasons found in the code the packet says must stay unchanged:

1. `scripts/require-green-release.mjs` (`contextProblem`) refuses every event but `push` and
   `workflow_dispatch` (`a workflow_run run never releases`), so a `workflow_run`-triggered Deploy
   Web would fail at its release gate on every run.
2. `scripts/requireGreenRelease.test.ts` pins `deploy-pages.yml`: no job-level `if:`, and every job
   needs `release-gate`, so a decision job there could not skip itself or run first.

So `.github/workflows/deploy-web-catch-up.yml` runs on CI completion on `main`, decides with
`scripts/deployWebCatchUp.mjs`, and dispatches `deploy-pages.yml --ref main` when owed: the manual
recovery `docs/DEPLOY.md` already documents. `workflow_dispatch` from `GITHUB_TOKEN` is allowed to
start a run. `deploy-pages.yml` is not edited at all; its gate, queue, superseded refusal, re-check and
canonical verification run unchanged in the dispatched run. The new workflow file is outside the row's
`owns` (allowed for this session by D-359/D-370; `scope-check` reports it as a notice).

Decision additions beyond the packet: skip when main has moved past the CI head (the newer commit's
own CI decides), when a Deploy Web run for the head is already queued or running (a push-triggered
run waiting on this CI), and, with a warning, when the live commit cannot be read.

Verified: 21/21 in `scripts/deployWebCatchUp.test.ts` (red first: module and workflow absent);
the module read the real live commit `16f2a2be` and the nine push paths. Pending: the first real
catch-up run after a web-path merge (link it below).

## Status

- DEPLOY-web-catch-up: in progress — Claude Code · 857e — 2026-11-24 — branch agent/queue/deploy-web-catch-up
