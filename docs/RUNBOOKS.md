# Runbooks

Short and kept honest; each runbook names its check and its exit.

## Health gate (every deploy)
1. Actions: the three required checks (typecheck, tests, build; D-082), Deploy API and Deploy Web green on the exact commit. A red `Workers Builds: skipwaitmanus` check holds nothing (D-182).
2. Live commit: `curl -s https://skipwait.me/api/health | jq .commitSha` matches; web git-commit meta matches.
3. Worker-only redeploys can flip env without a SHA change: verify flags via the CF settings API, not the SHA.
Exit: both match. If not, do not call it live.

## Stuck deploy
"Deploy container image + worker" over 35 minutes = stuck (normal 8-21). Cancel it to unblock the one-at-a-time queue, redeploy.

## Rollback
Previous Worker version in the Cloudflare dashboard (Workers > skipwaitmanus > deployments). Verify the health gate after.

## Billing ops
Prod is the LIVE Chargebee site (BILLING_ENV=live). Test changes on skipwait-test first; free/earning options only (D-031); payment failures escalate to the founder immediately; customer payments never break silently.

## Access
Vault first; batch access asks into one message to the owner.
