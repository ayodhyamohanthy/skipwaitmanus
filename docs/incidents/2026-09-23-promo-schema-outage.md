# 2026-09-23: API not ready for about 3 hours (promo schema missing)

## Impact

- From about 04:19 to 07:30 IST on 2026-09-23 (22:49 to 02:00 UTC), `/api/health/ready` returned 503.
- The API was up but its schema reconcile had failed, so production was unhealthy.
- Signed-in credit paths were already broken by a separate session bug, fixed later in #39.

## Timeline (IST)

- ~04:19: The API deployed `73ba360e`. That tree added the promo credit grants code and its `promoCreditGrants` schema, the issue #35 work whose PR #36 had been closed, and it landed on `main` out of queue. The runtime schema reconciler found the table and enum values missing, went to `schemaReconcileState=FAILED`, and ready turned 503. This is the same signature as the 2026-09-21 outage.
- 04:20-04:50: A code revert was attempted but blocked by the GitHub 2FA step-up. Rollback options were explored (a Worker rollback, re-running the last good deploy).
- ~04:54: An idempotent, self-contained `0061` migration was prepared for the founder's Azure Cloud Shell, the established manual path.
- ~07:00: A second writer on the founder's side merged #38 (degrade promo to a no-op when the schema is missing), and a manual wrangler deploy ran. Single-writer was violated.
- 07:30: The founder applied `0061`. Ready returned 200, `schemaReconciled=true`, and the API ran `1e17d5b`.

## Root cause

Schema-dependent code merged to `main` and deployed while its migration did not exist in production. Nothing in the pipeline applied or checked migrations before a deploy.

## Contributing factors

- `main` accepted a direct or out-of-queue merge with no protection or required review.
- Migrations were run by hand, outside the pipeline, so the repo and production could drift.
- More than one writer (agent lane, OpenCode, manual wrangler) acted on `main` and production without a handoff.
- Recovery depended on one person's interactive 2FA and Cloud Shell access in the middle of the night.

## Related finding

The hand-run migration `0057_canonical_identity.sql` intentionally suspended every duplicate-email user row, "frozen for an operator". Nobody ran the operator step, so 3 real people (6 rows) were locked out until 2026-09-23 08:17 IST. They were unfrozen, and the duplicates were merged in reviewed ops runs.

## What fixed it and what prevents a repeat

- Immediate: the idempotent `0061` applied in production.
- #40: a `migrate-db` job with a sha256 ledger runs before every API deploy, and deploy waits on it.
- #41: promo grant hooks are off behind `PROMO_GRANTS_ENABLED` until the #35 rebuild meets reviewer contracts 39, 40 and 41.
- `docs/OPERATIONS.md`: reviewed PRs only, gated deploys, migrations only through the gate, QA after every deploy, single writer.
- Open: enable branch protection on `main` (needs a paid GitHub plan for a private repo), and give the pipeline a credential that doesn't depend on interactive 2FA.
