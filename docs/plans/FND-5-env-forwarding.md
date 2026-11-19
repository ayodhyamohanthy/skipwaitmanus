# Packet FND-5: every key the server reads reaches the container, or is removed

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-5` |
| Decisions | AGENTS.md "Environment" (`.env.example` is a contract; a server secret needs the `src/worker.ts` passthrough) |
| Risk tier | 2 |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd5-env` |
| Depends on | D-067 live (it removes `GIFT_CHECKOUT_ENABLED` and `VITE_GIFT_CHECKOUT_ENABLED`) |
| Verified against | `main` `e6b87f8` |

## 1. Current behaviour
These keys are read by server code but are not in `CONTAINER_ENV_KEYS` (`src/worker.ts`), so in production they always fall back to their defaults:
- `OPPORTUNITY_MAX_OPEN_PER_USER`, `OPPORTUNITY_MAX_PER_USER_PER_DAY`, `OPPORTUNITY_HIRING_NOW_TTL_DAYS` (`server/opportunityLimits.ts`; defaults 3, 10, 30);
- `ZEPTOMAIL_FROM_NAME` (`server/emailDelivery.ts`; default "SkipWait");
- `PORT` (harmless: the Dockerfile sets 3000).

`server/configContract.test.ts` checks declared and forwarded keys, but not "read implies forwarded".

## 2. Target behaviour
1. **Forward the four.** Add the three `OPPORTUNITY_*` keys and `ZEPTOMAIL_FROM_NAME` to `CONTAINER_ENV_KEYS`. Do not add `PORT`.
2. **New contract test** in `server/configContract.test.ts`: every key read by non-test code under `server/` and `shared/` (the same collector the file already uses) is either forwarded or on an explicit allowlist with a reason. The allowlist contains `PORT` (set in the Dockerfile) and `NODE_ENV` (set by the runtime).
3. **No secret values** anywhere; `.env.example` already declares these keys.

## 3. Files
`src/worker.ts` (the list only), `server/configContract.test.ts`, the §3b row, and `docs/ARCHITECTURE.md` §11 item 5.

## 4. Definition of done
Gate green. After the push, the API deploy runs (`src/worker.ts` is in its path filter): verify CONVERGED. Row done. Tier 2.
