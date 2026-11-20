# Packet OPS-deploy-secrets-file: production secrets ride the release (D-369)

> Read `docs/BRIEF.md` first, then this packet. One queue row: `OPS-deploy-secrets-file` in `docs/plans/assignments.json` (status lives there).

| Field | Value |
|---|---|
| Queue row | `OPS-deploy-secrets-file` (Tier 1: deploy pipeline and production secrets) |
| Decisions | D-369 (this fix), D-182 (Workers Builds uploads a preview version on every branch), D-366 (2) (an agent session may reset the reviewer passwords), D-059 (no secret in the repository), D-082 (green before deploy) |
| Verified against | `main` `f302a49f` on 2026-11-20 |
| Unblocks | `LAUNCH-live-qa` (signed-in live QA needs the reviewer passwords) |

## 1. The defect (evidence)
Cloudflare refuses any secret edit while the newest uploaded Worker version is not the deployed one (API error 10215). Workers Builds runs `wrangler versions upload` on every branch push (D-182 (1)), and the agent sessions push many branches an hour, so a branch preview is almost always the newest version.

- `Reviewer QA passwords` runs 2, 3, 4 (Nov 19) and 5 (Nov 20 07:37 UTC, run 44696345516) all failed on `REVIEWER_SEEKER_PASSWORD_HASH` with 10215. Only run 1 (Nov 17) found a quiet moment. Nothing was changed by the failed runs.
- The production deploy of `e285f13c` (run 44615379181, Nov 19 21:14 UTC) tried `wrangler secret put DATABASE_URL` 12 times over 5 minutes, starting 5 seconds after its own `wrangler deploy`, and every attempt was refused. It fell back to the existing secret with a warning. So today a database password rotation cannot reach production.

## 2. The fix
Upload secrets as part of the version itself, which 10215 does not cover: `wrangler deploy --secrets-file <json>` (Wrangler 4.165.0; additive, an omitted secret is kept, nothing is deleted).

1. `scripts/build-deploy-secrets.mjs` (new): reads `NEWDB_HOST`, `NEWDB_USER`, `NEWDB_PASSWORD`, `REVIEWER_SEEKER_HASH`, `REVIEWER_REFERRER_HASH` from the environment and writes one JSON object to the path it is given, mode 0600. `DATABASE_URL` only when all three database values are present (partial = refuse, exit 4); each reviewer hash only when given, and only in the exact `scrypt$<hex>$<64 hex>` form the server verifies (`server/_core/reviewerLogin.ts`), with no line break (else exit 3). It prints secret names, never values.
2. `scripts/deploy-cloudflare-two-phase.sh`: builds that file in a private temp directory (removed on exit), passes `--secrets-file` to `wrangler deploy` and drops the post-deploy `wrangler secret put DATABASE_URL` retry loop.
3. `.github/workflows/deploy-api.yml`: two optional `workflow_dispatch` inputs, `reviewer_seeker_hash` and `reviewer_referrer_hash`, passed to the deploy step through `env` (never interpolated into a script). A manual dispatch already forces a full runtime release behind the same green-CI gates.
4. `.github/workflows/reviewer-qa-passwords.yml`: on 10215, the error names the working route (dispatch Deploy API with the two hashes).

## 3. Rules
- No secret value in the repository, a log or a step summary (D-059). Inputs are hashes only; the plaintext passwords stay in the session that made them (D-366 (2)).
- Every existing gate stays: release gate, migration-first, exact-SHA readiness, workers.dev closed, admin gate.
- Nothing about sign-in behaviour changes; the reviewer route stays behind `REVIEWER_LOGIN_ENABLED`.

## 4. Done means
Required CI green with the Tier 1 review (D-352); then a manual Deploy API dispatch with fresh hashes releases the current `main`, the readiness gate passes on that SHA, both reviewer accounts sign in on skipwait.me, and `LAUNCH-live-qa` resumes.

## 5. Owner option (faster, and fixes the root cause)
D-182 (3), asked Oct 24 and still open: in the Cloudflare dashboard, disconnect the Git repository from the `skipwaitmanus` Worker's Builds settings (or turn off builds for non-production branches). Then secret edits work again at any time, and this row is still worth landing as defence in depth.
