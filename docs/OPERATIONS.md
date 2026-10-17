# SkipWait operating system

Every crew follows this runbook: people, Instinct agents, OpenCode, Codex, and anyone else who writes to this repo or production. It sits above AGENTS.md and COLLABORATION.md. If they disagree, this file wins.

Why it exists: on 2026-09-23 production was down for about 3 hours because schema-dependent code reached main and deployed before its migration existed in production. See `docs/incidents/2026-09-23-promo-schema-outage.md`. Every rule below closes a gap that outage went through.

## 1. Everything lands through a reviewed PR

- No direct pushes to `main`, for any change: code, workflows, migrations, docs. Open a branch and a PR.
- A PR merges only when all of these hold:
  - CI checks are green on its latest head.
  - It has been reviewed by a second party (the founder, the reviewer agent, or a different crew than the author).
  - It is rebased or merged onto current `main` and revalidated.
- Merge with squash. Never force-push `main` or a branch someone else is working on.
- Merge in queue order. A PR that depends on another PR, or on a migration, waits for that dependency to be live.
- Production ops that are not code (data repair, account merges) also go through a PR:
  - Put the SQL on a throwaway `ops/*` branch.
  - Do a read-only or `ROLLBACK` dry run first and post the before/after mapping.
  - Execute only after approval, then close the PR unmerged and delete the branch.
- Enforcement: `main` should be protected (require PR, require the `Workers Builds` and CI checks, block force-push). As of 2026-09-23 it isn't: the GitHub API reports "Branch not protected". Until it's on, this rule depends on discipline, so treat any direct push to `main` as an incident.

## 2. Deploys are gated and halt on red

- Production deploys come only from merges to `main` through `.github/workflows/deploy-api.yml` and the Git-connected Cloudflare build.
- No manual `wrangler deploy`, no dashboard uploads, no out-of-band deploys. On 2026-09-23 a manual wrangler deploy ran alongside the pipeline.
- The pipeline runs `migrate-db` first. Deploy runs only if migrations succeeded.
- After deploy, the workflow verifies:
  - the active Cloudflare release matches the commit;
  - `/api/health/ready` returns 200;
  - `schemaReconciled` is true;
  - the admin sign-in gate works.
- A red step stops the pipeline. Do not re-run it hoping it passes: read the failure first.
- A successful deploy command is not proof. Before calling a deploy done, confirm the live release SHA and readiness.
- Rollback uses `.github/workflows/rollback.yml`. Roll back code alone only if no DDL from that release has run. Otherwise fix forward with an idempotent migration.

## 3. Migrations go only through the gate

- New schema goes in `drizzle/deploy/NNNN_name.sql`. `scripts/apply-deploy-migrations.sh` applies each file once, records its sha256 in the ledger, and fails if an applied file changes. Never edit an applied file: add a new one.
- Every migration is idempotent: `IF NOT EXISTS`, plus `information_schema` guards for column, enum and index changes. Production has drifted from repo assumptions before.
- Additive first, destructive later. Code that needs new schema merges only after the migration that creates it is live and verified.
- Before merge, test the migration against a copy or a fresh database that has the current production schema, and state in the PR how you tested it.
- No hand-run SQL in production except through a reviewed `ops/*` PR. The hand-run 0057 freeze (see incident) is the example of what goes wrong.

## 4. QA re-verifies after every deploy

- The QA integration battery runs after every production deploy and on a cadence. It covers:
  - the signed-out battery;
  - the SSO round-trip;
  - `auth.me` identity;
  - credits summary;
  - credit-pack and subscription checkout reaching the hosted handoff with the wallet unchanged.
- A deploy isn't done until QA is green on it.
- A QA failure jumps every queue ("fix immediately whenever something is wrong"). Diagnose it, ship the fix through the normal pipeline ahead of feature work, and have QA re-run.
- Pre-existing test failures get fixed or explained in writing, never carried silently.

## 5. Incidents get a write-up with a root cause

- Any production-down or data-integrity event gets a file in `docs/incidents/YYYY-MM-DD-slug.md` within a day, containing:
  - an impact and timeline in IST with UTC where useful;
  - the root cause;
  - contributing factors;
  - what fixed it;
  - follow-up actions with owners and PR links.
- Blameless: record the gap in the system, not the person.

## 6. One writer per surface, with explicit handoffs

- Each surface (repo `main`, production DB, Cloudflare, WorkOS config, the portfolio repo) has one active writer at a time.
- Claim a surface before writing: an issue or PR comment naming the writer, scope and expected end. Release it explicitly when done.
- Before editing, reconcile against current remote state. If another writer changed the tree, stop, re-read and re-verify.
- Handoffs name the commit SHA, what's live, what's pending, and what was not verified.
- If you're not the current writer (for example OpenCode on the founder's Mac while an agent holds the lane), you open a PR and wait. You don't merge or deploy.

## Quick checklist before you merge

1. Branch is current with `main`. `pnpm check`, affected tests and `pnpm build` pass.
2. Any migration this PR needs is already live, or ships ahead of it in `drizzle/deploy/`.
3. The PR has been reviewed and CI is green on its latest head.
4. You hold the writer claim for this surface.
5. After merge, watch `migrate-db`, the deploy, the live SHA and ready 200, then get QA green.
