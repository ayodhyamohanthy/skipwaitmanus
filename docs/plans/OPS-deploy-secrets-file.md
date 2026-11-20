# Packet OPS-deploy-secrets-file: production secrets ride the release (D-369)

> Read `docs/BRIEF.md` first, then this packet. `OPS-deploy-secrets-file` is the original deployment row. §6 specifies the separate `OPS-reviewer-credential-transport` follow-up. The queue registry records both rows.

| Field | Value |
|---|---|
| Queue row | `OPS-deploy-secrets-file` (Tier 1: deploy pipeline and production secrets) |
| Decisions | D-369 (this fix), D-182 (Workers Builds uploads a preview version on every branch), D-366 (2) (an agent session may reset the reviewer passwords), D-059 (no secret in the repository), D-082 (green before deploy) |
| Verified against | `main` `f302a49f` on 2026-11-20 |
| Unblocks | `LAUNCH-live-qa` (signed-in live QA needs the reviewer passwords) |

## 1. The defect (evidence)
Cloudflare refuses any secret edit while the newest uploaded Worker version is not the deployed one (API error 10215). Workers Builds runs `wrangler versions upload` on every branch push (D-182 (1)), and the agent sessions push many branches an hour, so a branch preview is almost always the newest version.

- `Reviewer QA passwords` runs 2–5 failed with 10215 on November 19–20. [Run 44709862016](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44709862016) later succeeded through the original workflow.
- The production deploy of `e285f13c` (run 44615379181, Nov 19 21:14 UTC) tried `wrangler secret put DATABASE_URL` 12 times over 5 minutes, starting 5 seconds after its own `wrangler deploy`, and every attempt was refused. It fell back to the existing secret with a warning. So today a database password rotation cannot reach production.

## 2. Original implementation (merged in #1382)

`wrangler deploy --secrets-file` uploads database and reviewer credential material as part of the Worker version. The builder validates the inputs and writes a mode-0600 file in a private temporary directory. The deploy removes the file when it exits. See §6 for the current reviewer reset path.

## 3. Rules
- Keep secret values out of the repository, logs and step summaries (D-059). Keep plaintext reviewer passwords only in the authorized session's private storage (D-366 (2)).
- Every existing gate stays: release gate, migration-first, exact-SHA readiness, workers.dev closed, admin gate.
- Nothing about sign-in behaviour changes; the reviewer route stays behind `REVIEWER_LOGIN_ENABLED`.

## 4. Release evidence

[PR #1382](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1382) merged at `38b9a44e6`. [CI passed on that SHA](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44758926742). The [push workflow](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44758926866) validated the pipeline. It skipped the rollout and readiness gates for this pipeline-only change. The two demo sign-ins reported on API `73be7b313` used an earlier release. Live acceptance of the release-time reset remains open in §6.

## 5. Owner option (faster, and fixes the root cause)
D-182 (3), asked Oct 24 and still open: in the Cloudflare dashboard, disconnect the Git repository from the `skipwaitmanus` Worker's Builds settings (or turn off builds for non-production branches). Then secret edits work again at any time, and this row is still worth landing as defence in depth.

## 6. Follow-up: `OPS-reviewer-credential-transport`

Use the workflow runner's protected secret channel for the two reviewer inputs. Expose only an explicit, non-sensitive choice to run the reset, off by default. Validate the complete pair before any production mutation, including the existing hash-format checks. Ordinary deploys keep their current reviewer bindings. Keep the release-time secrets file, its private mode and cleanup, and the database secret handling from §2. Update the original reset workflow's recovery guidance to point to the protected path.

**Owns:** `.github/workflows/deploy-api.yml`, `.github/workflows/reviewer-qa-passwords.yml`, `scripts/build-deploy-secrets.mjs`, `scripts/buildDeploySecrets.test.ts`, `server/cloudflareContainerRelease.test.ts` and this packet. Reuse the two existing Worker binding names. The owners of repository settings and secrets retain provisioning authority.

**Verification:** test the workflow boundary and the valid-pair, missing-pair, partial, malformed and ordinary-deploy cases with synthetic values. Check that command arguments, logs and artifacts omit secret material. Keep admin access, migration-first, required CI, exact release identity and readiness gates. After protected CI and the authorized reset, record release identity and both demo sign-in outcomes in a sanitized receipt. A skipped rollout or a sign-in on an earlier release cannot close that check. Keep private finding details in the advisory. Existing approved demo sessions can continue QA independently of a new reset.
