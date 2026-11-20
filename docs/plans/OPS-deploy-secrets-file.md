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

**Protected reset procedure:** the provisioning owner sets both existing `REVIEWER_SEEKER_PASSWORD_HASH` and `REVIEWER_REFERRER_PASSWORD_HASH` repository secrets through the authorized private channel. Plaintext stays in the authorized session's private storage. Dispatch Deploy API on main with only `reset_reviewer_passwords=true`, or run Reviewer QA passwords with `confirm=reset`, which dispatches that same gated release. The default is false; normal deploys omit reviewer material and retain current Worker bindings. `REVIEWER_RESET` is workflow-only and declared in `.env.example`; the Worker/container binding names and forwarding remain unchanged. A dependency preflight and repeated checks inside migration/deploy jobs validate the complete pair, including individual-job reruns. The existing release-time file stays mode 0600 with cleanup on exit. A dispatch succeeds only as a request; its later exact release and two sign-ins provide acceptance.

## Status

OPS-reviewer-credential-transport: implementation verified, live acceptance pending — GPT-6.1 Sol · 0e11 — 2026-11-20 — [PR #1396](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1396), branch `agent/queue/ops-reviewer-credential-transport`, official claim `274fed7bf`. Read BRIEF/PRD, AGENTS, BUILD_CONTINUITY, collaboration, plan/gate, current register through D-370 and the November 20 QA credential-handling ruling. The original implementation is merged in #1382; its pipeline-only run did not verify a reset. This follow-up keeps the release-time mechanism and changes only its protected input/reset boundary, tests, this packet and the required `.env.example` contract declaration. No secret provisioned or live reset requested by this session.

Synthetic red-first evidence: 18 expected failures in the builder/workflow suites; a second focused reproduction found both missing per-job rerun checks. After repair, five focused suites pass **75/75** (builder, container release, partial-route deploy, release smoke and configuration contract), and `git diff --check` passes. No existing test, timeout or gate is removed. Repository-secret names were read without values: neither reviewer input is provisioned, so live reset and same-release seeker/referrer sign-ins remain UNVERIFIED pending authorized provisioning. Composed current main `612640a7a` in `9f5ccc8ef`, pushed; the same **75/75** focused tests, TypeScript, production build, design-token audit, migration lint, deploy-trigger coverage, YAML parsing and whitespace checks pass on that composition. Scope check passes with a notice for the required `.env.example` declaration outside the original owns, under D-370's full-edit policy. The first PR CI `44787329782` reproduced the old exact migration dependency-list pin; correction `c1d5baa24` adds `reviewer-reset-preflight` to the expected list and pins its release-gate dependency while preserving the other edges. This dependent test is the second declared extra path under D-370; no assertion or gate is removed. All six affected release/configuration suites pass **154/154** on composition `f0a1c0cd8`. [CI 44789408700](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44789408700) passed every required check on that head. Final composition `cbfe98709` adds main `50b06d14b`, including migration 0123; [CI 44790702768](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44790702768) passed typecheck, all test shards/aggregate, production build and E2E.

The one-worker local full-suite attempt was stopped after more than 24 minutes: 89 suites had reported, with no final totals. It is **incomplete/red**, not a full local pass. Observed failures were the dependency pin since repaired, the untouched 400-commit classifier fixture (`scripts/classifyCiChange.test.ts:655`) and `server/seekerAgents.test.ts`'s key-not-logged case. Isolation on `cbfe98709`: the agent suite passes unchanged (17/17); the classifier still times out at its existing 20-second limit (70 passed / 1 failed across the two suites). Both source areas are byte-identical to main. No more blind reruns, timeout changes, exclusions or unrelated fixes are attempted; cause remains unestablished. Current-head CI is separately green and does not turn that local run green. Final evidence-head CI and protected landing remain mandatory; live reset and same-release sign-in acceptance remain UNVERIFIED pending authorized secret provisioning. Keep the queue row `todo` until that receipt exists. Private finding details remain in the draft advisory.
