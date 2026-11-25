# Skipwait Sync System — How It Works

**One-way, push-driven sync:** every change on the Mac → GitHub → Cloudflare → live skipwait.me. The system self-verifies the deployed commit; after every deploy, D-019 still requires `scripts/verify-live-release.sh` plus the live basics checks.

## Flow

```
Mac (you edit code)
  │  git push origin main
  ▼
GitHub main
  │  (within seconds) Actions triggers
  ▼
Deploy API (server/**) ──► builds container ──► wrangler deploy ──► /api/health reports commitSha
  │                                                                    ▲
  └── Verify: sleep 600s (let warm instance sleep) → wake → compare SHA ┘
        OK → record run summary, notify   FAIL → job fails + rollback.yml available

Deploy Web (client/**) ──► Vite build (VITE_GIT_COMMIT_SHA) ──► Pages deploy
  └── Verify: grep <meta name="git-commit"> on skipwait.me == pushed SHA
        OK → record run summary, notify
```

## Self-verification endpoints

| System | Endpoint | Expected |
|---|---|---|
| API container | `GET https://skipwait.me/api/health` | `{ok:true, service:"skipwait-api", commitSha:"<pushed sha>"}` |
| Web (Pages) | `GET https://skipwait.me/` | `<meta name="git-commit" content="<pushed sha>">` |

## Why the API verify sleeps first

Cloudflare Containers with `sleepAfter=10m` recycle the instance only after 10 min idle. A **warm** instance keeps serving the old image, and polling keeps it warm. The verify step therefore sleeps 600s (letting the instance sleep and be recreated on the new image), then wakes it once and checks the SHA.

## Audit trail

Each deploy records its workflow, commit and job status in its GitHub Actions run summary (`GITHUB_STEP_SUMMARY`). The summary step uses `always()` so failures are recorded too; the API workflow omits pushes classified as skipped. No deploy-log commit or push to `main` is attempted. `docs/SYNC_LOG.md` is frozen history: it stopped growing on October 20, 2026 when the D-082 ruleset refused the bot's push. The run history and summaries are the machine audit trail.

## Rollback

- **Manual:** GitHub → Actions → "Rollback (manual)" → pick target (api/web/all) + optional commit SHA. Rebuilds that commit and redeploys.
- **Auto:** a failed verify step fails the deploy job; the previous deployment remains serving (containers keep the last good version), so a failed sync never takes the site down.

## Notifications

Each deploy posts a ✅/❌ comment to the repo's first issue (non-fatal if none). To add Slack/email, add a step after "Notify sync status" — see `scripts/sync-manifest.json`.

## Extending to another system (e.g. Vercel)

1. Add an entry to `scripts/sync-manifest.json` (`"enabled": true`).
2. Create `deploy-vercel.yml` mirroring deploy-pages.yml (build + deploy + verify SHA + record the run summary).
3. Add the new workflow path to the extension-point banner in deploy-api.yml.

## Secrets used (Cloudflare vault / Actions secrets)

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (Actions secrets); `RAZORPAY_*`, `PAYPAL_*`, `WORKOS_*`, `DATABASE_URL`, `JWT_SECRET`, `ZEPTOMAIL_API_KEY` (Worker secrets).
