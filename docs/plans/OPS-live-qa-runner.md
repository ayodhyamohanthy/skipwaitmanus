# Packet OPS-live-qa-runner: signed-in live QA without handing passwords around (D-373)

> Read `docs/BRIEF.md` first, then this packet. Two rows share it (D-134): `OPS-reviewer-plaintext-reset` (section 2) and `OPS-live-qa-runner` (section 3). They own different files and can be built at the same time; each lands by itself on green required CI (D-370).

| Field | Value |
|---|---|
| Rows | `OPS-reviewer-plaintext-reset` (Tier 1: deploy pipeline and production secrets), `OPS-live-qa-runner` (Tier 1: reads credentials, signs in to production) |
| Decisions | D-373 (this packet), D-366 (2) (agents run the reviewer reset; its storage clause is replaced by D-373 (3)), D-369 (secrets ride the release), D-346 (4) (agents run live QA with the demo accounts), D-059 (no secret in the repository), D-370 (green required CI lands every pull request) |
| Verified against | `main` `be9d67e8` on 2026-11-21 |
| Unblocks | `LAUNCH-live-qa`, and every release row whose acceptance still lacks signed-in production captures (for example `D-048-R-home-signed-in`, `D-048-K-home`) |

## 1. Why (evidence)

D-366 (2) let an agent session reset the two demo passwords and keep the plaintext only in that session's private storage. In practice the passwords and the browser ended up in different sessions:

- Nov 20, report `7ca427c1a`: the session holding the passwords signed in as both demo accounts and read 16 authenticated endpoints, but browser capture failed in its environment.
- Nov 21, report `cbe63dbc7`: a session with a working browser could not sign in, because "reviewer passwords were rotated by the 17:29 UTC Deploy API dispatch, so only the session holding the new ones can sign in".

So `LAUNCH-live-qa` has had no signed-in 1280/390 captures since Nov 19, and every release row that cites it is held. GitHub Actions has both a browser and a protected secret store, so the signed-in pass moves there. Nobody hands a password to anybody.

The demo usernames are public in `server/_core/reviewerLogin.ts`: `seeker@reviewer.skipwait.me` and `referrer@reviewer.skipwait.me`. The referrer demo account is verified at the company domain `reviewer.skipwait.me`, so its queue holds no real seeker's request; the seeker demo account sees only its own data. The admin demo account exists only where `REVIEWER_ALLOW_ADMIN=true`, never in production, and this packet never uses it.

## 2. Row OPS-reviewer-plaintext-reset: one secret pair for the release and for QA

**Today.** The reset (`Reviewer QA passwords` with `confirm=reset`, or Deploy API with `reset_reviewer_passwords=true`) reads two scrypt hashes from the repository secrets `REVIEWER_SEEKER_PASSWORD_HASH` and `REVIEWER_REFERRER_PASSWORD_HASH`, validates them and uploads them with the Worker version through the release-time secrets file (`scripts/build-deploy-secrets.mjs`, D-369). Whoever provisions those hashes must compute them with a tool, and nothing else in the pipeline can sign in, because only hashes are stored.

**Change.**
1. Two new repository secrets hold the plaintext: `REVIEWER_SEEKER_PASSWORD` and `REVIEWER_REFERRER_PASSWORD`. Declare both in `.env.example` as workflow-only secrets with blank values and a one-line purpose, exactly like `REVIEWER_RESET`, and extend the config-contract test.
2. In the reset path only, Deploy API passes the two plaintext secrets to `scripts/build-deploy-secrets.mjs` next to the existing hash inputs. The builder:
   - with **both** plaintext values set, derives each hash in the runner with the same algorithm as `hashReviewerPassword` (`scrypt$<16 random bytes as hex>$<scryptSync(password, salt, 32) as hex>`, Node defaults) and writes those hashes into the secrets file under the existing Worker names;
   - with **neither** set, keeps today's behaviour (the hash secrets, with their existing format checks);
   - with **one** set, or a plaintext value shorter than 16 characters, exits non-zero before any production step, naming the missing or short input without printing a value.
3. Every job that receives a plaintext value masks it first (`::add-mask::`). No value goes into a command argument, log, step summary or artifact. The secrets file stays mode 0600 in a private temporary directory and is removed on exit. Ordinary deploys (reset off) pass no reviewer material and keep the Worker's current bindings, as today.
4. Update the recovery guidance in `.github/workflows/reviewer-qa-passwords.yml` and `docs/plans/OPS-deploy-secrets-file.md` section 6: the owner sets the two plaintext secrets on GitHub's settings page, then runs the reset.

**Tests** (red first, synthetic values only): derived hash accepted by `verifyReviewerPassword` and a different password rejected; both, neither, one and short cases; the masking and the "no value in arguments, logs or artifacts" checks already used for the hash inputs; ordinary deploy unchanged; per-job rerun validation kept.

**Done means:** green required CI on the pull request; after landing and provisioning (section 4), one real reset on `main` whose exact release reports ready, and both demo sign-ins on that release, proven by the first `OPS-live-qa-runner` run (or a sanitized receipt if the runner has not landed yet). That run also closes `OPS-reviewer-credential-transport`'s pending live check.

## 3. Row OPS-live-qa-runner: a workflow that signs in and captures

**New files:** `.github/workflows/live-qa.yml`, `scripts/live-qa-signed-in.mjs`, `scripts/liveQaSignedIn.test.ts`.

**Triggers.**
- `workflow_dispatch`, with one optional input `roles` (`both`, `seeker` or `referrer`; default `both`).
- `workflow_run` of `Deploy API (Cloudflare Containers)` and `Deploy Web (Cloudflare Pages)`, completed on `main`, running only when the conclusion is `success`. A `workflow_run` workflow always runs the default branch's file.
- Never `pull_request` or `push`.

**Job.** `ubuntu-latest`, `permissions: contents: read`, `concurrency: live-qa` (cancel-in-progress false), timeout 20 minutes. Check out `main`, `pnpm install --frozen-lockfile`, install Chromium the way `ci.yml` does (cached `playwright install --with-deps chromium`), then run the script. The script gets the two plaintext secrets through `env` only, masked first.

**`scripts/live-qa-signed-in.mjs`.**
- The origin is the constant `https://skipwait.me`. No input, variable or environment value can change it: the passwords are sent to that origin and nowhere else.
- First it reads `/api/health/ready` and the web page's release identity, and records the API and web SHAs.
- For each role it creates one browser context and signs in once through the context's own request API (`POST /api/auth/reviewer/sign-in` with the fixed demo email), so the session cookie stays in the context. Any answer but 200 stops that role immediately with a plain message, and is never retried: the endpoint allows 8 tries per email in 15 minutes. A 401 means the repository secrets do not match the live release, and the message says to run the reset in section 2. A 404 means `REVIEWER_LOGIN_ENABLED` is off in production.
- Routes, each checked against `client/src/App.tsx` when the row is built (drop a route that no longer exists, and say so in the pull request):
  - seeker: `/plans`, `/billing`, `/requests`, `/ask`, `/explore`, `/alerts`, `/inbox`, `/messages`, `/profile`, `/settings`, `/invite`, `/support`;
  - referrer: `/referrer-home`, `/queue`, `/referrer/impact`, `/inbox`, `/invite`, `/profile`, `/settings`.
- At 1280×900 and 390×844 for each route: navigate, wait for the network to go quiet (capped), take a full-page screenshot, and record the document title, the HTTP status of the document, uncaught page errors, console errors, failed requests with status 500 or above, and at 390 whether the page scrolls sideways (`scrollWidth > innerWidth`).
- Navigation only: no click, form fill or request beyond the sign-in, so no state changes and no money moves. Never `/admin`.
- Output: `live-qa/<role>/<route>-<width>.png`, `live-qa/summary.json` (release SHAs, per-route results, findings) and a short Markdown table in `$GITHUB_STEP_SUMMARY`. Upload `live-qa/` as the artifact `live-qa-<web sha>` with 14-day retention.
- Exit codes: 1 when a sign-in fails, a document answers 500 or above, or a page throws an uncaught error; 0 otherwise. Console errors and sideways scroll are listed as findings without failing the run.

**Tests** (fixtures, no network): the origin cannot be overridden; a password never appears in any line the script prints, in `summary.json` or in an error message; sign-in failure stops the role with no retry; the route list and the exit-code rules; the workflow file has no `pull_request` or `push` trigger, reads the secrets only through `env`, masks them, and pins the origin.

**Done means:** green required CI on the pull request. After the two secrets exist (section 4), one real run on `main` with both sign-ins passing and the artifact uploaded. Its run link is the evidence `LAUNCH-live-qa` attaches.

## 4. Provisioning, once (the owner, or a session with secret access)

1. In GitHub, open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Add `REVIEWER_SEEKER_PASSWORD` and `REVIEWER_REFERRER_PASSWORD`: two different passwords of at least 16 characters. Keep them in a password manager if you want to sign in yourself; nobody else needs them.
2. After `OPS-reviewer-plaintext-reset` lands: **Actions → Reviewer QA passwords → Run workflow**, type `reset`. Wait for the dispatched Deploy API run to finish green.
3. **Actions → Live QA (signed in) → Run workflow.** From then on the runner also starts by itself after every production release.

A session with secret access may do steps 1 to 3 instead, with `gh secret set` reading each value from standard input, never as a command-line argument. Never write a value into the repository, a log, an artifact, a chat or a pull request.

## 5. Rules

- D-059: no secret value in the repository, logs, step summaries, artifacts, comments or chats. Artifacts hold screenshots of the demo accounts only.
- Login rule unchanged (D-030, D-049, D-057): the reviewer route stays behind `REVIEWER_LOGIN_ENABLED`. Referrer product sign-in stays work-email code only; the demo route is a QA and review tool.
- No real money (D-065): navigation only.
- Every existing deploy gate stays: release gate, migration-first, exact-SHA readiness, the closed `workers.dev`, admin gate.

## Status

One line per row (D-134): `<id>: in progress — <who> — <date> — branch <b>` when it starts, `<id>: done — <sha>` when it is on `main` with its live proof.

- Registered by Claude Code (session `ccr-f3a4e037-1voydq`) on 2026-11-21 under D-373. Nothing built yet.
- D-374 (2), 2026-11-21: the owner adds the two plaintext secrets (section 4, step 1). No session sets them or asks for their values. Steps 2 and 3 are any session's once `OPS-reviewer-plaintext-reset` lands.
- OPS-reviewer-plaintext-reset: in progress — Claude Code · e969 — 2026-11-21 — branch agent/queue/ops-reviewer-plaintext-reset
