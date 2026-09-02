# Skipwait Sync System — How It Works

**One-way, push-driven sync:** every change on the Mac → GitHub → Cloudflare → live skipwait.me. The system self-verifies; no human audit needed.

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
        OK → append docs/SYNC_LOG.md, notify   FAIL → job fails + rollback.yml available

Deploy Web (client/**) ──► Vite build (VITE_GIT_COMMIT_SHA) ──► Pages deploy
  └── Verify: grep <meta name="git-commit"> on skipwait.me == pushed SHA
        OK → append docs/SYNC_LOG.md, notify
```

## Self-verification endpoints

| System | Endpoint | Expected |
|---|---|---|
| API container | `GET https://skipwait.me/api/health` | `{ok:true, service:"skipwait-api", commitSha:"<pushed sha>"}` |
| Web (Pages) | `GET https://skipwait.me/` | `<meta name="git-commit" content="<pushed sha>">` |

## Why the API verify sleeps first

Cloudflare Containers with `sleepAfter=10m` recycle the instance only after 10 min idle. A **warm** instance keeps serving the old image, and polling keeps it warm. The verify step therefore sleeps 600s (letting the instance sleep and be recreated on the new image), then wakes it once and checks the SHA.

## Audit trail

`docs/SYNC_LOG.md` — one row per deploy attempt (timestamp, workflow, commit, status). Appended by CI (`if: always()`), so failures are recorded too.

## Rollback

- **Manual:** GitHub → Actions → "Rollback (manual)" → pick target (api/web/all) + optional commit SHA. Rebuilds that commit and redeploys.
- **Auto:** a failed verify step fails the deploy job; the previous deployment remains serving (containers keep the last good version), so a failed sync never takes the site down.

## Notifications

Each deploy posts a ✅/❌ comment to the repo's first issue (non-fatal if none). To add Slack/email, add a step after "Notify sync status" — see `scripts/sync-manifest.json`.

## Extending to another system (e.g. Vercel)

1. Add an entry to `scripts/sync-manifest.json` (`"enabled": true`).
2. Create `deploy-vercel.yml` mirroring deploy-pages.yml (build + deploy + verify SHA + append log).
3. Add the new workflow path to the extension-point banner in deploy-api.yml.

## Secrets used (Cloudflare vault / Actions secrets)

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (Actions secrets); `RAZORPAY_*`, `PAYPAL_*`, `WORKOS_*`, `DATABASE_URL`, `JWT_SECRET`, `ZEPTOMAIL_API_KEY` (Worker secrets).
