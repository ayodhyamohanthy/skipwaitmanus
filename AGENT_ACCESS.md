# Agent & assistant access (ChatGPT, Claude, Cursor, custom bots)

Status: designed (/connect-assistant, /assistants, /approve, /developers). Backend not built.

## What to build
1. **SkipWait MCP server** at `https://skipwait.me/mcp`, protected with OAuth 2.1 (WorkOS as authorization server). The user signs in and approves on a SkipWait consent screen. No API keys pasted into chats.
2. **Public REST API** (`/api/v1`, same scopes), for power users' own scripts. Personal access tokens can be revoked.
3. **Connected assistants** screen in `/settings`: list of connected apps, scopes, last used, revoke, activity log.

## Who gets it
- Land (Pro tiers) and Concierge (ultra) ONLY: assistants/bots can sign in on the user's behalf via OAuth, connect, search, draft, and apply (send asks with approval) from ChatGPT, Claude, custom bots or the user's own tools via API tokens/webhooks. Concierge: higher rate limits.
- Start and Momentum: no assistant or API access; consent screen shows upgrade.
- Credits are spent exactly as in the app. Every paid action asks the human first.

## Tools (seeker side)
| Tool | Scope | Notes |
|---|---|---|
| search_companies / get_company | read | Only real, open-to-referral companies |
| list_my_requests / get_request_thread | read | The user's own requests only |
| draft_ask | write:draft | Creates a draft; never sends it |
| send_ask | write:send | Needs a human confirm step (in-app or a push approval). Same open-slot limits as the app |
| withdraw_ask, post_progress_update | write | |
| run_tool (Ask One-Pager, dossier, salary coach…) | spend:credits | Shows credit cost, needs confirmation |
| list_alerts / save_alert | read/write | |
| add_work_item / import_work | write:work | |

## Hard rules (do not break)
- **Referrers are never automated.** No tool accepts, passes or refers for a referrer. A person must make every referral decision.
- **No pay-to-win.** Bots get the same open-slot limits, queue order and daily send limits as people. Sending through an API never moves an ask up the queue.
- **No bulk or spray asks.** Max N sends/day per user (same as UI), duplicate-ask detection, quality checks run on every ask.
- Every ask a bot sends is labelled "Sent via [assistant] by [user]" in the referrer's view. The user is fully responsible for it.
- Never expose referrer identities, work emails or other users' data through tools.
- Rate-limit per user and per OAuth client; log every call; revoke a client instantly; abuse goes to `/admin-review`.
- Signed webhooks (request accepted/passed/message) for API users.

## Screens to design
- OAuth consent ("ChatGPT wants to: search companies, draft asks…")
- Settings → Connected assistants (list, scopes, revoke, activity)
- Settings → API tokens (Land only; create once, copy, revoke)
- Phone approval sheet: "Claude wants to send an ask to Wipro · Approve / Edit / Decline"
- Developer docs page `/developers`
- Plans: "Use SkipWait from ChatGPT & Claude" on the Land plan

## Open platform for third-party apps (Instinct-style apps, MCP clients)
- Any app, AI agent or MCP client can integrate so its users search companies and apply (send asks) on SkipWait.
- Two ways in: (1) open MCP at skipwait.me/mcp with OAuth dynamic client registration — unverified clients get read + draft only; (2) register in `/developer-console` → client ID/secret, redirect URLs, scopes, webhooks; send/profile/credit scopes need review → verified badge.
- Scopes: companies:read, requests:read, asks:draft, asks:send (review), profile:read (review), credits:spend (review), webhooks.
- User still approves each send and spend inside SkipWait (`/approve`). Same per-user limits; per-app rate limit; apps can be suspended on abuse reports (admin review).
- Developer console states designed: My apps, New app, App details, In review, Rejected, Suspended. Consent screen has an "Unverified app" state.
