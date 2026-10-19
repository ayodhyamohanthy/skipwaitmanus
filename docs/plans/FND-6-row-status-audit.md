# Packet FND-6: the queue says the truth about rows that were claimed on Oct 15

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-6` |
| Decisions | D-068 ("a stale statement is a defect"), queue rules 2 and 5 |
| Risk tier | 3 (docs only) |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd6-row-audit` |
| Depends on | nothing |
| Verified against | `main` `e6b87f8` |

## 1. Goal
Five §3b rows still read "in progress — Claude — 2026-10-15", and none of their named branches exists on `origin`. Some of the work clearly shipped: migrations 0084 (data exports), 0085–0086 (moderation) and 0088 (account preferences) are live, and `server/accountSessions.ts` exists. A model reading "in progress" skips these rows forever.

## 2. The rows
- **4:** 4a data-export-async; 4b deletion held.
- **5:** phase 1 case file, 1b evidence.
- **7:** 7b session management; 7a consent toggles.
- **21:** part B, the new-ask email switch.
- **25:** API PR (time zone and date format), client PR.

## 3. What to do
For each row:
1. Find the evidence on `main`: `git log --oneline origin/main | grep -i <feature>`, the migration file, the route registration in `server/_core/index.ts`, the client page or component, and its tests. Record the commit SHAs.
2. Rewrite only the Status cell:
   - `done — <sha(s)>` for the shipped part, with one line of evidence;
   - the remaining part as `todo` with its blocker (for example, "4b deletion held for owner answers"; quote the existing hold);
   - or `stalled — no branch on origin — available under queue rule 2`.
3. Never change a row's scope text or another row.

## 4. Files
`docs/KIT_V4_BUILD_PLAN.md` §3b (those five Status cells) and this packet's own row.

## 5. Definition of done
Every claim in the new cells has a SHA or a path. Docs-only push; no gate beyond `pnpm vitest run scripts/briefContract.test.ts` and `git diff --check`.
