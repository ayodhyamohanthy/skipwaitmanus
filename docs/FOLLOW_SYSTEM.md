# Follow System & Messaging Gate (X-style) — skipwait.me

Shipped: build `aebe0a6` (2026-09-10). Design reference: X's follow-gated DM state (empty conversation shows credibility signals + paid access path).

## The rule (as implemented)
> **Superseded by D-012(3) (Oct 2026) for referrers.** When either person is a verified referrer, a direct message (new thread or reply) can be sent only after that referrer accepted a referral request linking the two; a paid plan, mutual follow and an earlier thread no longer open it, and the send is rejected with `403 { reason: "referrer_acceptance_required" }` (`server/dmReferrerGate.ts`, rechecked inside `sendDirectMessage`). The paid "message referrers directly" perk has ended. The rule below now applies only between two members who are not verified referrers.

You can start a direct message with a member if ANY of these is true:
1. **Mutual follow** — you follow each other (X-style: following is one-way and free; mutual = both directions), OR
2. **Existing thread** — you already share a conversation (replies are always free).
Otherwise the send is rejected with `402 { upgrade: true }` and the UI shows the paywall.

> **D-067 (owner, Oct 18 2026):** the retired paid plans are removed completely, including their member-message perk and its paywall copy; a wallet still marked with one counts as Free. Until that lane ships, the code also opens messaging for a wallet on one of those plans (`hasPremium` in `server/dmRoutes.ts`).

Referral *requests* through fast-track links and the wall follow the ask credit rules (D-063: 3 asks free every month; more use credits), never this messaging gate.

## API
- `POST /api/users/:userId/follow` — follow (idempotent). 400 self, 404 unknown, 401 anon.
- `DELETE /api/users/:userId/follow` — unfollow.
- `GET /api/users/:userId/follow-state` — `{ followers, followingCount, isFollowingViewer, isFollowingTarget, isMutual, joinedMonthYear, viewerSignedIn }`.
- `GET /api/users/:userId/followers` / `/following` — anonymous-safe labels only (`Member` / `Referrer · company.com`); never names/emails.
- `GET /api/dms/compose/:userId` — **retired** (D-012(3) review, Oct 2026): no client read it, and its answer let any member learn, without sending anything, whether a user ID has a verified work email. Unknown `/api` paths return the JSON 404.
- DM gate: `POST /api/dms/threads/:userId` — mutual follow OR existing thread (plus the paid-plan path D-067 removes), between two members who are not verified referrers only. With a verified referrer on either side it opens only after that referrer accepted a request linking the two (`403 referrer_acceptance_required` otherwise; superseded by D-012(3), see the note above). The thread view returns the same `sendBlock`. After 10 refused sends in an hour (`server/dmRefusalLimit.ts`), every further refusal by that sender is the same `429` with `retryAt`, so 402 vs 403 cannot be used to enumerate verified referrers.

## Schema
`userFollows` (migration `drizzle/0038_user_follows.sql`): followerUserId, followingUserId (both FK → users, cascade), createdAt; unique pair index. Auto-created by the boot-time schema reconciler (also in `server/schemaReconcile.ts` DESIRED_TABLES). Verified live: follow endpoints return 200 on skipwait.me.

## UI
- Fast-track pages (`/fast/:code`, `/refer/:slug/:alias`): follower count + "Joined {month}" + Follow button next to the Message composer; paywall card mentions the follow-for-free path (the paywall copy goes with D-067).
- `/messages` paywall: same copy.

## Tests
`server/followRoutes.test.ts` (4), `server/dmRoutes.test.ts` (+2 gate cases), `client/src/components/followButton.test.tsx` (2). Full suite: 399+ passed.

## Operations
- No manual migration needed; reconciler self-heals on boot/health-check.
- If the live DB ever blocks CREATE/ALTER (permission or lock), the reconciler reports per-statement results at `GET /api/admin/schema/reconcile` (admin only) and `/admin/schema` in the UI.
