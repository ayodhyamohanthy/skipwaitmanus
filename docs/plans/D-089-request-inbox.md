# Packet D-089-request-inbox: the employee request-inbox link with a screen name (idea 1, loop L4)

| Field | Value |
|---|---|
| Queue rows | `D-089.server` (Tier 1), `D-089.ui` (Tier 2), and the parent `D-089-request-inbox` as the release row (Tier 1, D-223 (3)). **The two build rows are written here but are not in `docs/plans/assignments.json` yet** — adding them needs the owner's word on his Oct 31 "new rows paused" restriction (§10, and the question in `docs/DECISIONS.md`, Open owner questions) |
| Decisions | D-089 (3), D-087 (L4), D-163 (5), D-050, D-017, D-106, D-019(e), D-030/D-049/D-057 with D-245 (login rule), D-034, D-128, D-150/D-167 (goal pages), D-153/D-180 (wording), D-223 (rows and switches), D-246 (order). Rulings in D-268 (§10) |
| Verified against | `origin/main` `8650b06c` (Oct 30 2026); re-checked on `05d0f7de` (Nov 1 2026, Hark · a442: §3 files unchanged except the landed `D-048-p3-links` landings, §3.8 updated); re-checked on `e36c3d62` (Nov 1 2026, Qoder · f00e: `git diff --stat 05d0f7de e36c3d62` over every file §3 names returns empty, so §3 still describes `main`); re-checked on `f5b9afb9` (Nov 1 2026, Claude Code · 1999: `git diff --stat e36c3d62 f5b9afb9` over every file §3 names is empty, and the §3.3, §3.4, §3.6, §3.8 and §3.9 claims were re-read in the code). Line numbers drift: find functions by name |
| Migrations, env keys, dependencies | None. One in-code switch, `REQUEST_INBOX_LINK_ENABLED = false` (§4.1) |
| Writer | Hark · b6a8, then Hark · a442, then Qoder · f00e, then Claude Code · 1999; architect lock `agent/architect/d089-request-inbox` |

## 0. Read receipt (D-225)
Read before writing: `AGENTS.md`, `START_HERE.md`, `docs/DELEGATION.md`, the register entries D-017, D-050, D-087, D-089, D-106, D-128, D-162, D-163, D-223, D-225, D-227 and D-240 to D-247 (the newest on `main`), `docs/BACKLOG.md` item 10 (the idea-lab stub), `docs/PRD.md` growth table, `docs/plans/GOAL_UI_COVERAGE.md` §5, and the packets `D-090-BYOR.md`, `D-086-demand-list.md`, `D-099-bonus-pages.md` and `D-057-session-gate.md` §4. No newer entry changes this task's scope: no register entry names `D-089-request-inbox` under `Affects tasks:`.
Re-read on `origin/main` `e36c3d62` (Nov 1 2026, Qoder · f00e): `AGENTS.md`, `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, the register entries D-248 to D-265 (every entry newer than the packet's own D-263 draft), `docs/plans/assignments.json`, and the four `D-100` csp/authz rows' status lines. Two things moved this scope. First, D-263 on `main` is now `SYNC-LOG-off-main`, so this packet's entry is renumbered to **D-266** — D-264 is held by `agent/architect/d094-ai-in-ui` and D-265 by `docs/d265-decision-copy-unblock`. Second, the "new rows paused" restriction is still live text and still cited as in force by D-254, D-256 and D-262, so the two build rows stay unregistered (§5). No entry names `D-089.server` or `D-089.ui`.
Re-read on `origin/main` `f5b9afb9` (Nov 1 2026, Claude Code · 1999, takeover from Qoder · f00e): `CLAUDE.md`, `AGENTS.md`, `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `docs/DELEGATION.md` §4a, the register entries D-263, D-265 and D-266 (every entry on `main` newer than D-262), this row in `docs/plans/assignments.json`, and PR #811 comments 6552398955, 6553366280 and 6554018714. None of those entries names `D-089-request-inbox`, `D-089.server` or `D-089.ui`; D-265 narrows `D-057-session-gate`'s alerts test glob and touches no path §5 owns. One thing moved: D-266 is now `PRICING-banded-oct25` on `main` (#935), so this packet's entry is renumbered to **D-268** (D-264 is held by `agent/architect/d094-ai-in-ui`, D-267 by #932's branch). The new-rows question is posted and acknowledged but not answered: the 04:23Z coordination note on #811 says the conflict is unresolved and no new rows are created, and `docs/BUILD_CONTINUITY.md` on `main` still says "new rows paused", so the two build rows stay unregistered.

## 1. Goal
A verified employee gets one link to paste wherever seekers ask for referrals (a LinkedIn bio, a Blind or Fishbowl reply). It is signed with a screen name they choose, never their real name. A seeker who opens it sees "a verified employee at <company>" plus that screen name, and sends a referral request that goes to that employee alone. The employee sees those requests marked as sent to them directly. Loop L4 (D-087): each employee who shares the link brings seekers, and every request through it reaches a verified referrer straight away.

Test (AGENTS.md product compass): the seeker gets a named, verified person to ask, so their request is more likely to be read. The referrer gets a link they control, under a name they chose, and can tell direct requests apart from the pool. Nobody's money moves differently.

## 2. Binding rules (quoted)
- **D-089 (3):** "build all three ideas, order 2 (bring-your-own-referrer one-time link), then 1 (employee request-inbox link with screen name), then 3 (public referral-bonus pages with sourced figures), after W0/W1 and the demand list; designer places each inside the goal system first."
- **D-087:** "L4 employee request-inbox link … Rules: real counts only; … no seeker details exposed; referrers never charged; nothing that annoys users. Changeable: weekly link cap 5, anonymous referrer identity, …"
- **D-050:** "until that referrer claims, accepts or passes, the seeker can withdraw the ask with the credit back." (The 7-day expiry is suspended by D-174.)
- **D-106:** the impact card shows "the referrer's fast-track screen name". In code that screen name is the link's `vanityAlias` (`server/impactCard.ts`, `const screenName = link.vanityAlias ?? "your link"`).
- **D-019(e) and the task note:** never the referrer's real name before an accept; never a seeker's name or file before acceptance.
- **Login rule (AGENTS.md, D-030/D-049/D-057, D-245):** a referrer surface uses the work-email code only, and `getOrCreateReferrerFastTrackLink` is on D-057's gated route list (`docs/plans/D-057-session-gate.md` §4 item 4).
- **D-128:** the feature is "Your referral link" to users. "Fast Track" is a seeker plan name.
- **D-150/D-167:** a moved page opens with its goal line and has one "Your next step" block with exactly one black commit.
- **D-223:** rows split by owned files. Each row lands by itself behind a switch that starts off, and the release row turns it on.

## 3. Current behaviour (verified on `8650b06c`, re-checked on `05d0f7de`)
1. **Storage.** `referrerFastTrackLinks` (`drizzle/schema.ts`) has one row per referrer (`referrer_fast_track_referrer_unique`), with `linkCode` (32 hex), `vanityAlias` (varchar 30, globally unique), `companyDomain`, `isActive` and `deactivatedAt`.
2. **Minting.** `getOrCreateReferrerFastTrackLink` (`server/db.ts`, near `ReferrerFastTrackLink`) refuses anyone who is not a verified employee of their work-email domain. It mints `ref-` plus 10 hex characters (`createFastTrackAlias`). Nothing lets a referrer choose the alias: `isSafeFastTrackAlias` exists (format plus the reserved list `reservedFastTrackAliases`), but only the resolvers call it.
3. **A paused link can never come back (defect).** `getOrCreateReferrerFastTrackLink` returns the existing row whenever its company matches and it has an alias, including `isActive: false`. The card's "Create a new link" calls the same GET again and stays paused. A pause is permanent unless the referrer changes company.
4. **Routes** (`server/privateReferralRoutes.ts`, the `/api/referrer-fast-track` block):
   - `GET /me` mints or returns the link, `url` `/fast/<code>`, `vanityUrl` `/refer/<companyDomain.split(".")[0]>/<alias>` and `suggestedBioCopy`.
   - `POST /me/deactivate` pauses it.
   - `GET /:linkCode` and `GET /vanity/:companySlug/:vanityAlias` are public, `no-store`, and return `{ link: { companyDomain, isActive: true } }` only: no alias and no referrer field.
5. **Asking through a link.** `POST /api/company-referrals` accepts `fastTrackCode` or `fastTrackCompanySlug` plus `fastTrackAlias` (the regex guards near `safeFastTrackCode`). `createCompanyReferralRequest` (`server/db.ts`) resolves the link (`getActiveReferrerFastTrackLink` / `…VanityLink`) and requires the job link's company to equal the link's (`fastTrackLinkMatchesCompany`). It refuses a blocked pair (`BlockedPersonalLinkError`), inserts the request with `referrerId` set to the link owner and notifies only them ("A referral request from your link is ready"). The spend follows the normal delivery path. The ask is visible at once, so D-034 spends at creation. D-050 withdrawal applies.
6. **The referrer's inbox.** `listCompanyReferralInboxByState` (`server/db.ts`) lists a link ask in `new` for its owner (`row.referrerId === userId`). It returns `isClaimedByYou: row.referrerId === userId`, so a link ask looks claimed, and the queue (`client/src/pages/MyCompanyInbox.tsx`) opens it straight in `/conversation`. Nothing tells a link ask apart from one the referrer claimed from the pool. The function already reads claim events for `ownPending` rows.
7. **The referrer cannot reach the link in the product.** `client/src/components/ReferrerFastTrackCard.tsx` is imported by nothing. `#426` (`c1690f40`) removed it from the queue, and `GOAL_UI_COVERAGE.md` §5 lists it for retirement. Only the smoke runtime (`client/src/contexts/smokeRuntime.ts`) calls `GET /me`.
8. **Seeker landings.** `/fast/:linkCode` (`client/src/pages/FastTrackLink.tsx`) and `/refer/:companySlug/:vanityAlias` (`VanityFastTrackLink.tsx`) show the company only, then hand off to `/start?fast=…` or `/start?referCompany=…&referAlias=…`. Their goal redesign `D-048-p3-links` has landed (`5ed99b4f`): behind `goalSurfaceOn("links")` both pages render `GoalFastTrackLink` / `GoalVanityFastTrackLink` from `client/src/pages/goal/links/GoalPrivateLinkLanding.tsx`, whose zod schema accepts `{ link: { companyDomain, isActive: true } }` only and whose copy reads "A verified employee at {companyDomain} shared this link"; the kit pages stay as the fallback. §4.9 edits that goal landing.
9. **Telemetry.** `shared/telemetryScrub.ts` already strips the alias from `/api/referrer-fast-track/vanity/:companySlug/:vanityAlias` (FND-4: the alias names one referrer).
10. **Not to collide with:** `D-090-BYOR` takes `/r/:token` for its one-time links. The idea-lab stub's `skipwait.me/r/theirname` (BACKLOG item 10) cannot be used. This packet keeps `/refer/<company>/<screen name>`.

## 4. Rulings (decided under D-200; changeable; register text D-268 in §10)
1. **One switch.** `REQUEST_INBOX_LINK_ENABLED = false` in `shared/requestInboxLink.ts` (the D-193 in-code pattern; no env key). Both sides read it. While it is false:
   - `PUT /me/screen-name` answers 404.
   - The public payloads carry no `screenName`.
   - The inbox carries no `askedYouDirectly`.
   - The referrer-home panel is not mounted.
   - The landings render exactly as `D-048-p3-links` left them.

   Only the release row flips it.
2. **The screen name is the vanity alias.** There is one name per link, stored in `vanityAlias`, so the impact card (D-106) and the vanity URL use it with no second field. No migration.
3. **Choosing it.** `PUT /api/referrer-fast-track/me/screen-name` takes `{ screenName }`, Zod strict. It is normalized to lower case, trimmed, and spaces become `-`. It must pass `isSafeFastTrackAlias` and must not start with `ref-`, which stays the generated form. It must also not equal any of these for the signed-in person:
   - the slug of `users.name`;
   - any single token of that name with 3 or more characters;
   - the work email's local part, or its `.`/`_`/`-` tokens joined by `-`.

   A refusal answers 422 `{ code: "screen_name_identifying", error: "Pick a name that is not your real name or email. Seekers see it before you accept." }`. A taken name answers 409 `screen_name_taken` (from the unique index, never a pre-read race). A bad format answers 422 `screen_name_invalid`.

   The caller must be a verified employee of the link's company, as for `GET /me`. The route goes on D-057's gated list, so a session without the work-email code gets 403 `work_email_code_required`. It writes `referrer_fast_track.screen_name_set` activity with no name in the metadata.

   The real-name check only catches accidents. A referrer who wants a name-like handle can pick one that does not match exactly. The point is that nothing is ever filled in from their name or email.
4. **Renaming.** Allowed. The old `/refer/…/<old name>` URL stops resolving at once, and the old name becomes free. The confirm dialog says both plainly: "Your old link stops working, and someone else may take the old name." `/fast/<code>` is unchanged by a rename. Stated risk (§11): a colleague at the same company may take the freed name.
5. **Pause and resume (fixes §3.3).** `POST /me/deactivate` is unchanged. A new `POST /me/resume` reactivates the paused row with a fresh `linkCode` (the old `/fast/` link stays dead). It keeps the alias, so a chosen screen name survives a pause and a pause never frees a name. `GET /me` stops being the way back. The old card's "Create a new link" was the only caller, and it is unmounted.
6. **Public payloads.** With the switch on, both public resolvers return `{ companyDomain, isActive: true, screenName }`. `screenName` is `null` while the alias is still generated (`ref-…`): the landing says "a verified employee" and never shows `ref-…` text. Nothing else about the referrer is returned: no id, no real name, no counts, no availability (D-176).
7. **The inbox marker.** With the switch on, each `listCompanyReferralInboxByState` row carries `askedYouDirectly: boolean`. It is true when all of these hold:
   - `status === "pending"`;
   - `referrerId === userId`;
   - `queueAllocationId === null` and `opportunityId === null`;
   - no claim event by this user since the latest release (the `referralWasClaimedTx` rule, from the claim events the function already reads).

   That is exactly D-050's "sent to one referrer, not yet acted on". It covers link asks and, after `D-090-BYOR`, a BYOR ask placed with this referrer. "Asked you directly" is true of both. The builder confirms the BYOR case against `main` after BYOR lands (§9). `isClaimedByYou` keeps its current value: changing the queue's open-in-conversation behaviour is out of scope (§6).
8. **The referrer surface.** `GoalReferralLinkPanel` sits on the goal `/referrer-home`, in the aside column, after "Invite a colleague". It is goal-native (DESIGN.md, `components/goal` primitives, no kit import) and replaces the orphaned kit card. It shows:
   - "Your referral link" and the vanity URL;
   - Copy link, a ghost or secondary button: the page's one black commit stays its `GoalNextStep`;
   - the screen name with an Edit field (status in dot-and-text, the errors from §4.3 in plain words);
   - "Pause link" behind a confirm, and "Turn your link back on" when paused.

   States: loading, error with retry, offline, paused and the 403 step-up (it invalidates the referrer-access query, the D-057 client rule).
9. **The seeker landing.** On the goal landing that `D-048-p3-links` lands, the goal line reads "Ask <screenName>, a verified employee at <Company>" when `screenName` is set, and "Ask a verified employee at <Company>" otherwise. The line under it: "Your request goes only to them. They see your role and note, not your name or files, until they accept." That second sentence restates the Terms line in `shared/referrerAskView.ts`, word for word in substance. The black commit and the handoff to `/start` are unchanged. The cost line is the one `/start` already shows before sending (D-150).
10. **Design gate.** D-089 (3) and BACKLOG item 10 want the design placed and seen first. D-120 makes `DESIGN.md` the design for new UI. So the rows build to `DESIGN.md` behind the switch, and the release row puts the 1280/390 captures in front of the owner before flipping. This is a changeable assumption, not an owner decision changed: if the owner wants comps before any build, `D-089.ui` waits and nothing else moves.

## 5. The rows
**Registration gate (before either row can be picked).** §5.1 and §5.2 are written so a builder can copy them straight into `docs/plans/assignments.json`, and this packet's PR does **not** add them: the owner's Oct 31 "new rows paused" restriction is still the text on `main` (`docs/BUILD_CONTINUITY.md`), D-254, D-256 and D-262 each still treat it as in force, and the two #811 relays of him answering "build" to that exact question (6546540294, 6550450035) are a counterpart's repository answer, which the same instruction says is not his approval. One docs-only PR adds both rows verbatim from here the moment the owner's word is on `main`; nothing else in the queue moves, and both rows already wait for `D-090-BYOR`, `D-086-demand-list`, `D-174-pool-nudges` and `D-086.admit`, all still `todo`, so no build starts earlier either way.

### 5.1 `D-089.server` (Tier 1: referrer identity on a public payload and referrer inbox data; M)
**Depends on:**
- `D-090-BYOR`: the owner's order puts idea 2 first.
- `D-086-demand-list`: the owner's order is after the demand list.
- `D-174-pool-nudges`: the end of the open chain of rows that own `server/db.ts` and `server/privateReferralRoutes.ts` (`P0-referral-access-availability` → `D-132-item3` → `D-174-held-ask-reconfirm` → `D-174-ask-from-job` → `D-174-pool-nudges`). This row goes after them, so no other row is reordered.
- `D-057-session-gate` is reached through BYOR (D-246).

**Owns:**
- `shared/requestInboxLink.ts`, `shared/requestInboxLink.test.ts`;
- `server/referrerScreenName.ts`, `server/referrerScreenName.test.ts`;
- `server/db.ts`: only `getOrCreateReferrerFastTrackLink`, the two `getPublicReferrerFastTrack*` resolvers, a new `resumeReferrerFastTrackLink`, and the `askedYouDirectly` field in `listCompanyReferralInboxByState`;
- `server/privateReferralRoutes.ts`: only the `/api/referrer-fast-track` block and the D-057 gated-list entry;
- `server/referrerFastTrackLinks.test.ts`, `server/privateReferralRoutes.requestInboxLink.test.ts`;
- `server/referrerSessionGate*.test.ts`: only adding the two new routes to the pinned list.

**Steps:**
1. `shared/requestInboxLink.ts`: the switch, `screenNameInputSchema` (strict), `normalizeScreenName`, `isIdentifyingScreenName(name, { fullName, workEmail })`, `publicReferralLinkSchema`, `inboxDirectFlagSchema`, and the copy strings from §4.3, §4.4 and §4.9. Reuse `isSafeFastTrackAlias` by moving its regex and reserved list here. `server/db.ts` re-exports, so `server/referrerFastTrackLinks.test.ts` keeps passing unchanged.
2. `server/referrerScreenName.ts`: `setReferrerScreenName(userId, input)`. It reads the profile and the user's name, checks §4.3, and updates `vanityAlias` on the owner's row by `referrerId`. ER_DUP_ENTRY becomes 409. It never reads to pre-check uniqueness. A row that does not exist gets one minted first through `getOrCreateReferrerFastTrackLink`.
3. `server/db.ts`: add `resumeReferrerFastTrackLink(userId)` (§4.5, verified employee only, fresh `linkCode`, alias kept). The resolvers add `screenName` under the switch (§4.6). The inbox flag follows §4.7.
4. Routes: `PUT /me/screen-name` and `POST /me/resume` (identity required, `private, no-store`, 404 while the switch is off). Add both to D-057's gated list and its pin test.
5. Docs: none in this row. The release row syncs AGENTS.md.

**Red-first tests (they must fail on `main` for the stated reason):**
- T1. A paused link resumes: deactivate, then `resumeReferrerFastTrackLink`, then `isActive: true`, a new `linkCode`, the same alias. Fails today because nothing resumes (§3.3).
- T2. A screen name is set, returned by `GET /me`, resolves at `/vanity/<slug>/<name>`, and the old `ref-` alias no longer resolves.
- T3. Refusals. The name slug, a name token, the email local part, `ref-anything`, a reserved word, 1 character and 31 characters are each refused with their code. A name taken by another referrer gives 409. Two concurrent sets of one name give one success and one 409.
- T4. Switch off: `PUT` gives 404, the public payload has no `screenName` key, and inbox rows have no `askedYouDirectly` key. Switch on (test override): present.
- T5. Public payload strictness: `publicReferralLinkSchema.strict()` parses the resolver output. `screenName` is `null` for a generated alias. A spy proves no user or profile name column is selected by the public resolvers.
- T6. `askedYouDirectly` is true for a link ask before any action. It is false after the referrer claims, for a queue allocation, for a first-look post ask, and for a pool ask the referrer claimed.
- T7. A non-verified caller gets 403 on `PUT` and `resume`. A WorkOS session without the code gets 403 `work_email_code_required` with no store call (spies, the D-057 pattern).
- T8. A blocked pair still refuses the link ask (`BlockedPersonalLinkError`). This is a regression pin: the behaviour is unchanged.

### 5.2 `D-089.ui` (Tier 2: renders the server payloads behind the switch; S–M)
**Depends on:**
- `D-089.server`;
- `D-048-p3-links`: owns the landings and their goal folder;
- `D-086.admit`: the last open owner of `GOAL_UI_COVERAGE.md`. `D-086.ui` and `D-090-BYOR` also own it, and are reached through it and through `D-089.server`;
- `D-057-session-gate`: owns `MyCompanyInbox.tsx` and `referrerData.ts`, reached through BYOR.

**Owns:**
- `client/src/components/referrer-home/GoalReferralLinkPanel.tsx`, `client/src/components/referrer-home/referralLinkApi.ts`, `client/src/components/referrer-home/goalReferralLinkPanel.test.tsx`;
- `client/src/pages/goal/referrer-home/GoalReferrerHome.tsx` (switch only: one mount);
- `client/src/components/referrer-home/referrerData.ts`: only the `askedYouDirectly` field;
- `client/src/pages/MyCompanyInbox.tsx`: only the marker;
- `client/src/pages/goal/links/**`, `client/src/pages/FastTrackLink.tsx` (switch only), `client/src/pages/VanityFastTrackLink.tsx` (switch only);
- `client/src/pages/requestInboxLanding.test.tsx`;
- `docs/plans/GOAL_UI_COVERAGE.md`: one component line;
- `design/goal-ui/captures/request-inbox/**`.

**Steps:**
1. Build the panel (§4.8). It talks to the server through `referralLinkApi.ts`, using `referrerData`'s shared fetch helpers so the D-057 403 handling applies.
2. Mount the panel under the switch.
3. Add a "Sent to you directly" marker on queue rows where `askedYouDirectly` is true. It is dot-and-text, no new colour, and reads as "Asked you directly" to screen readers.
4. Add the landing line (§4.9).
5. Add the coverage line.
6. Take captures at 1280 and 390 of: the panel's generated, named, editing, taken-name error, paused and step-up states; the landing with and without a screen name; and a queue row with the marker.

**Red-first tests:**
- U1. Switch off: no panel, the landing text is unchanged, no marker.
- U2. Switch on: the panel shows the URL, Copy and Edit, and the page still has exactly one black commit (`assertGoalPage`).
- U3. 409 and 422 show their plain line and keep the typed value.
- U4. Pause then resume calls the two routes and shows the paused state between.
- U5. A 403 `work_email_code_required` invalidates the access query and never navigates to `referrerSignInHref`.
- U6. The landing names the screen name only when it is non-null and never renders `ref-`.
- U7. The goal boundary test stays green (no kit import).

### 5.3 `D-089-request-inbox`: the release row (Tier 1; status `owner`, waits for the registration question and then its rows)
**Owns:** `shared/requestInboxLink.ts` (switch only), `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md`, `docs/BACKLOG.md`.

**Steps:**
1. Flip `REQUEST_INBOX_LINK_ENABLED` to true.
2. QA on a preview, no money: a verified referrer sets a name, copies the link, pauses and resumes. A seeker opens the vanity link signed out, signs in and sends one request. The referrer sees it marked.
3. Captures at 1280 and 390 go to the owner (§4.10) together with the independent Tier 1 review (privacy: the public payload, the real-name check, D-019(e)).
4. Sync the AGENTS.md living map (the referrer link row), the PRD growth table (L4 live), BACKLOG item 10 (closed by this packet), and the §3b row.

## 6. Out of scope (every row)
- Changing `isClaimedByYou`, the queue's open-in-conversation rule, or D-050/D-038 lifecycles.
- Any change to money, the spend key, coverage or delivery.
- A screen name on the seeker's My asks row. That is a follow-up after BYOR's `MyRequests.tsx` work.
- Deleting `ReferrerFastTrackCard.tsx`, which is `GOAL_UI_COVERAGE.md` §5's retirement.
- Any weekly cap on link asks. The existing caps hold: two open requests per company and the five-open-claims cap. D-087's "weekly link cap 5" is BYOR's knob (`D-090-BYOR.md` §4 item 5).
- Any public count, availability or response-time figure about the referrer.
- `/r/…` routes.
- Legal text.

## 7. Analytics
Activity events, with no name or alias in their metadata:
- `referrer_fast_track.screen_name_set`, with `{ renamed: boolean }`;
- `referrer_fast_track.link_resumed`;
- the existing `…link_resolved` and `…vanity_resolved` gain `{ named: boolean }`.

Clarity: link copied and edit opened (consent-respecting, the existing `client/src/lib/clarity.ts` helper).

The release row records before and after counts for: requests created through a link per week, the share of link requests answered within 5 days, and referrers with a chosen screen name. The source is a read-only query on `referralRequests` joined to the activity log, with numbers only in the PR.

## 8. Privacy check (for the Tier 1 review)
- The public payload adds one field the referrer typed themselves (`screenName`), nullable, and nothing derived from name, email or id.
- Seekers learn nothing new about other seekers.
- A blocked pair is refused before any credit (unchanged).
- The scrubber already treats the alias as personal data (FND-4).
- A referrer who leaves the company stops resolving at once (`isVerifiedEmployeeOfCompany` in both resolvers, unchanged).

## 9. Stop and ask
Stop and `--report blocked "D-089.<row>: <question>"` if any of these hold:
- after BYOR lands, a BYOR ask placed with a referrer does not meet §4.7's condition, or meets it for a reason other than being sent to that referrer alone;
- D-057's gated-route pin lives somewhere this packet's owns do not name;
- `D-048-p3-links` lands a landing whose goal line cannot take §4.9's wording without a second black commit;
- a newer register entry names these rows.

Never guess about identity or privacy.

## 10. Register entry added by this packet
D-268 (in `docs/DECISIONS.md`): the rulings in §4 in short, plus the registration gate in §5 with the measurements behind it. `Affects tasks: D-089-request-inbox`. `D-089.server` and `D-089.ui` are named in the entry as rows this packet defines, not as rows on `main`, so the picker has nothing to re-sync on them. The entry also carries the one question to the owner, in `docs/DECISIONS.md` → Open owner questions: lift "new rows paused", or keep these two rows parked.

## 11. Gaps and risks (stated, not hidden)
- **A freed name can be taken.** After a rename, a colleague at the same company may take the old name, and seekers following an old bio link would reach that colleague. Harm is bounded: it is still a verified employee of the same company, under the same D-019(e) privacy. Preventing it needs a retired-names table, which means a migration. Left out to keep the rows migration-free. The owner or any session may add it later.
- **The real-name check is exact-match only.** It stops accidents, not a determined referrer, and that is by design: the name is theirs to choose.
- **Order cost.** Both rows wait for BYOR and the demand list (the owner's order, D-089 (3)). The server row also waits for the D-174 server chain (it ends at `D-174-pool-nudges`), and the UI row waits for `D-086.admit`, which waits for `D-048-p3-admin`. The reason is file ownership, not priority. So L4 ships late. Any session may shorten this by reordering rows under D-200, giving the reason. This packet does not, because that would move other rows' work.
- **The mocks.** No comp exists in `design/goal-ui/` for these surfaces. The design gate is moved to the release (§4.10).
- **The release row's docs claim collides until the build rows exist.** §5.3 gives the release row `AGENTS.md`, `docs/PRD.md`, `docs/KIT_V4_BUILD_PLAN.md` and `docs/BACKLOG.md`; `D-086-demand-list`, `D-090-BYOR` and `D-057-session-gate` claim some of the same files, and PICKER-owns-scope rejects two non-done rows owning the same path unless one transitively waits for the other (`scripts/nextTaskCore.mjs:350-356`). With `D-089.server` and `D-089.ui` registered that clears on its own, because the server row waits on both and reaches D-057 through BYOR. Without them it does not, so the parked release row lists `D-090-BYOR` and `D-086-demand-list` in `dependsOn` for now; drop those two edges in the same commit that adds the build rows. Measured: `validateAssignments` returns `[]` with them and three overlap errors without.

## Status
- D-089.server: not registered (§5 registration gate); when it is, todo, waiting for `D-090-BYOR`, `D-086-demand-list` and `D-174-pool-nudges`.
- D-089.ui: not registered (§5 registration gate); when it is, todo, waiting for `D-089.server`, `D-048-p3-links` and `D-086.admit`.
- D-089-request-inbox (release): `status: "owner"` — waits for the one owner word in §10, then for both rows. Packet written by Hark · b6a8, Oct 30 2026.
- Nov 1 2026, Hark · a442 (takeover from Antigravity · 5a06): merged `origin/main` `05d0f7de`; register entry renumbered D-248 → D-263 (D-248 was taken on `main`); §3 re-checked, §3.8 updated for the landed `D-048-p3-links`. Landing held: the packet adds rows `D-089.server` and `D-089.ui`, and the Oct 31 owner restriction ("new rows paused", `docs/BUILD_CONTINUITY.md`) is out to Instinct before it merges.
- Nov 1 2026, Qoder · f00e (takeover from Hark · a442): merged `origin/main` `e36c3d62`. **Correction:** the line above says the new-rows question "is out to Instinct"; it was not — no comment on PR #811 named D-089 before this session, so the question had never been delivered. It is posted now (#811 comment 6552398955, and as the first entry under Open owner questions in `docs/DECISIONS.md`), with the measurements: main still carries the Oct 31 restriction as live text, D-254/D-256/D-262 each still treat it as in force, and the task-id set in `docs/plans/assignments.json` at `2d72dec7` (the last commit before Oct 31 00:00) equals the set at `e36c3d62` — 241 rows both, so no new row has reached `main` under the relayed lift. The relayed owner word is real evidence and is cited (§5), but BUILD_CONTINUITY says a counterpart's repository answer is not the owner's approval, so the two build rows are not registered here. Register entry renumbered again, D-263 → **D-266** (D-263 is `SYNC-LOG-off-main` on `main`, D-264 and D-265 are held by open branches). §3 re-verified: `git diff --stat 05d0f7de e36c3d62` over every file §3 names returns empty. The release row is restamped `architect` → `owner`, `syncedTo` → `D-266`, with this packet as its `packet`; no other row's fields, tier, lane, branch or dependency changed, and `validateAssignments` returns `[]`.
- Nov 1 2026, Claude Code · 1999 (takeover from Qoder · f00e, quiet 5h; claim `c166f202`): merged `origin/main` `f5b9afb9`. Register entry renumbered D-266 → **D-268**: #935 landed `PRICING-banded-oct25` as D-266 while this branch held the same number, which was the only merge conflict (`docs/DECISIONS.md`); D-267 is held by #932. Every current reference moved (register entry and open question, this packet's header, §4 and §10, the row's `syncedTo` and note, the §3b row, the PRD line); the two older Status lines keep their numbers as history. §3 re-verified: `git diff --stat e36c3d62 f5b9afb9` over every file §3 names is empty, and the load-bearing claims were re-read in code on `f5b9afb9` (`server/db.ts` `getOrCreateReferrerFastTrackLink` returns an inactive row whose company matches, the public resolvers return `{ companyDomain, isActive: true }` only, `isClaimedByYou: row.referrerId === userId`; `server/impactCard.ts` `link.vanityAlias ?? "your link"`; `GoalPrivateLinkLanding.tsx` schema `{ companyDomain, isActive: true }`; the FND-4 scrub of the vanity path). No ruling, row, status, tier, lane, owns or dependency changed; nothing is landed by this session (the writer never lands, D-190). Two facts for whoever lands or reviews this: (1) the landed goal landing says "their identity stays private" (`GoalPrivateLinkLanding.tsx`, the sentence under the goal line); §4.9's builder and the Tier 1 reviewer check that it stays true beside a chosen screen name, given §11's exact-match limit. (2) This PR's only red is `review-gate: D-089-request-inbox … Tier 1: this head has no independent passing review` (run 41265866609, job 124728484326, head `86496898`): `scripts/review-gate.mjs` `findGateRow` maps `agent/architect/<slug>` to this Tier 1 row, while the picker hands a packet PR only LAND when green and the packet stage otherwise (`scripts/nextTaskCore.mjs`, the D-190 block before `actionFor`'s architect branch), never a REVIEW, so no session can be handed the pass the gate asks for. The green run 41265911791 on the same head is PR #931 from `docs/d266-d089-request-inbox-packet`, a branch the gate maps to no row; it is not this PR's CI, it conflicts with `main` on D-266, and this session did not touch it.
