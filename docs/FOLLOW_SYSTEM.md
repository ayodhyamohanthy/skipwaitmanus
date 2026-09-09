# Follow System & Messaging Gate (X-style) — skipwait.me

Shipped: build `aebe0a6` (2026-09-10). Design reference: X's follow-gated DM state (empty conversation shows credibility signals + paid access path).

## The rule (as implemented)
You can start a direct message with a member if ANY of these is true:
1. **Premium** — you have an active Pro or Max subscription (either wallet), OR
2. **Mutual follow** — you follow each other (X-style: following is one-way and free; mutual = both directions), OR
3. **Existing thread** — you already share a conversation (replies are always free).
Otherwise the send is rejected with `402 { upgrade: true }` and the UI shows the paywall.

Referral *requests* through fast-track links and the wall remain free for everyone — the paywall applies to direct messaging only.

## API
- `POST /api/users/:userId/follow` — follow (idempotent). 400 self, 404 unknown, 401 anon.
- `DELETE /api/users/:userId/follow` — unfollow.
- `GET /api/users/:userId/follow-state` — `{ followers, followingCount, isFollowingViewer, isFollowingTarget, isMutual, joinedMonthYear, viewerSignedIn }`.
- `GET /api/users/:userId/followers` / `/following` — anonymous-safe labels only (`Member` / `Referrer · company.com`); never names/emails.
- `GET /api/dms/compose/:userId` — now also returns `mutualFollow` so the UI can explain why messaging is free.
- DM gate: `POST /api/dms/threads/:userId` — premium OR mutual OR existing thread.

## Schema
`userFollows` (migration `drizzle/0038_user_follows.sql`): followerUserId, followingUserId (both FK → users, cascade), createdAt; unique pair index. Auto-created by the boot-time schema reconciler (also in `server/schemaReconcile.ts` DESIRED_TABLES). Verified live: follow endpoints return 200 on skipwait.me.

## UI
- Fast-track pages (`/fast/:code`, `/refer/:slug/:alias`): follower count + "Joined {month}" + Follow button next to the Message composer; paywall card mentions the follow-for-free path.
- `/messages` paywall: same copy.

## Tests
`server/followRoutes.test.ts` (4), `server/dmRoutes.test.ts` (+2 gate cases), `client/src/components/followButton.test.tsx` (2). Full suite: 399+ passed.

## Operations
- No manual migration needed; reconciler self-heals on boot/health-check.
- If the live DB ever blocks CREATE/ALTER (permission or lock), the reconciler reports per-statement results at `GET /api/admin/schema/reconcile` (admin only) and `/admin/schema` in the UI.
