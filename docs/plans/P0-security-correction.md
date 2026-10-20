# Packet P0-security-correction: close the storage-key bypass and make the edge headers canonical

> Read [`docs/BRIEF.md`](../BRIEF.md) first, then this packet. This packet also **corrects two claims** in [`docs/plans/FND-7-triage-result.md`](./FND-7-triage-result.md).

| Field | Value |
|---|---|
| Queue rows | §3b `P0-storage-proxy-bypass` (kept) and `P0-email-link-host-poisoning` (recast); `P0-dev-auth-production-fallback` withdrawn |
| Decisions | D-019, D-068, D-082; FND-7 |
| Risk tier | 1 (security) |
| Size | S |
| Branch | `agent/queue/p0-security-correction` |
| Depends on | nothing |

## 1. What FND-7 got wrong (corrected here)

- **Dev auth in production is already closed.** `workosConfigured()` throws when any of `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD` is missing and `NODE_ENV=production` (`server/_core/workosAuth.ts:49-60`, landed in `5c8d98a3`, PR #92). Boot fails; `registerDevAuthRoutes` is unreachable in production. **The P0 row is withdrawn; no code change.**
- **Review links do not read `X-Forwarded-Host`.** They build from `req.get("host")` (the `Host` header), not `req.hostname`, and the Worker rejects any request whose Cloudflare-set URL host is not `skipwait.me` (`src/worker.ts:70-77`). A client-supplied `X-Forwarded-Host` cannot move the one-click token to another host.
- **The real residue is narrower.** The Worker overwrites `X-Forwarded-For` only (`shared/clientIp.ts:17-37`), so `X-Forwarded-Host` and `X-Forwarded-Proto` pass through even though the trust-proxy comment in `server/_core/index.ts:115-127` says every forwarding header is deleted. Six link builders in `server/privateReferralRoutes.ts` still build the origin from the request (735, 745, 919, 980, 1020, 1133). Harden both as defence in depth.
- **The storage-key bypass stands as written, with a precondition.** The app-layer check is bypassable; whether the backend normalizes the forwarded `path` is unverified. Production uses R2 when configured (`server/_core/index.ts:26-31`), so the exposed set is legacy Forge objects, if the Forge keys are set at all. Fix the app-layer check now; do not claim a production breach.

## 2. Scope

1. `@server/_core/storageProxy.ts` and a new `@server/_core/storageProxy.test.ts`
   - Export `normalizeStorageKey(raw: string): string | null`: collapse empty and `.` segments; reject NUL, backslash, any `..` segment and **any** `private-referrals` segment; return the normalized key or `null`.
   - The route presigns only the normalized key; unsafe/private shapes answer 404 before any provider call, empty answers 400.
   - Make the Forge URL/key/fetch injectable for tests (defaults unchanged: `ENV`, global `fetch`).
2. `@shared/clientIp.ts` and `@server/clientIpEdge.test.ts`
   - Delete client-supplied `X-Forwarded-Host`/`X-Forwarded-Proto` with the IP headers, then set `x-forwarded-host: skipwait.me` and `x-forwarded-proto: https` (Cloudflare terminates TLS).
   - Keep the IP contract and fail-to-shared-bucket behaviour byte-for-byte.
   - The end-to-end test asserts `req.hostname` and `req.protocol` are canonical under spoofed input.
3. `@server/publicOrigin.ts` and `@server/publicOrigin.test.ts`, used at the six link sites in `@server/privateReferralRoutes.ts`
   - `PUBLIC_BASE_URL` (already declared `.env.example:56`, forwarded `src/worker.ts:16`) when set, trailing slashes trimmed; the request origin only as a local fallback.
4. Docs: this packet, the three §3b rows and FND-7 result §1. No `assignments.json` entry: that file is architect-owned and only Claude Code adds tasks (D-083); this correction runs under the owner's direct instruction and is recorded in §3b.

## 3. Tests first (red for the stated reason)

- Storage key table: `skipwait//private-referrals/x`, `./skipwait/private-referrals/x`, `skipwait/a/../private-referrals/x`, `skipwait\\private-referrals\\x`, `skipwait/%2e%2e/private-referrals/x`, NUL; allowed keys unchanged (`skipwait/private-referrals-archive/x` stays allowed); HTTP: private shapes 404 **without** calling fetch, safe key 307, empty 400.
- Edge: spoofed host/proto are replaced; `req.hostname === "skipwait.me"`, `req.protocol === "https"` end to end; no CF-Connecting-IP still sends no X-Forwarded-For.
- Origin: env wins, trailing slashes trim, unset and empty fall back to the request origin.

## 4. No-change list

No migration, schema, dependency, env key, price, credit, payment, webhook or deploy config. No PR closed, no branch deleted. `PUBLIC_BASE_URL` already exists and is already forwarded.

## 5. Verification

Focused tests, `pnpm check`, full gate on the branch merged with the latest `origin/main`, `pnpm build`, design-token audit, migration lint, GitHub CI on the exact head, API **and** Web deploys (`shared/**` is a web path filter), then `/api/health` CONVERGED on the merged `main`.
