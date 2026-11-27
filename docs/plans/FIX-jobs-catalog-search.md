# FIX-jobs-catalog-search: /jobs answers a search from company careers sites (#1706)

Bug [#1706](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1706), filed by the daily QA explorer (D-409): `/jobs` ("Browse roles" in the home footer) always says "No jobs match", even for "engineer", while `/explore/openai` lists many roles. Registered under D-200 because no picker route handed bug issues out yet (`PICKER-bug-issues`, D-412 (7)(c)).

## Cause

`GET /api/jobs` reads only the legacy `jobs` table (employer-posted roles plus hidden per-request placeholders), and production has no public row there. The job catalog (Greenhouse, Ashby and Lever boards, D-394) is deliberately kept out of `/api/jobs`, the sitemap and the `JobPosting` markup (D-193 §2, pinned by `server/jobCatalogRoutes.test.ts`). So the fix is in the page, not the route.

## Fix

- `client/src/pages/goal/discovery/GoalJobs.tsx`: when `/api/jobs` returns no role for a submitted search, the page asks `GET /api/search?q=` (the universal search, D-360, D-394) once. The posted list, its JSON-LD, saved roles and the `?q=`/`?job=` URLs are unchanged.
- `client/src/pages/goal/discovery/JobsCatalogAnswer.tsx` (new): no search yet → "Search a role or company to see open roles."; careers-site roles → the `/explore` result rows (`UniversalSearchResults`: presence label, Apply on the careers site, Ask for a referral); the location box filters them by substring; no match → "No jobs match", with "Clear the location" only when a location was entered; a failed search → a plain error with Try again, never "no match".
- "Ask for a referral" on a careers-site row uses the page's existing hand-off (referral draft, then `/start`).
- Careers-site rows never become `JobPosting` markup (test asserts the head holds none of their titles).
- `client/src/test/goalPagesBoundary.test.ts`: `pages/explore/UniversalSearchResults.tsx` joins the audited list as goal-styled (goal tokens and `GoalButton` only; checked mechanically).

No route, schema, money, sign-in or legal change. Tier 2.

## Proof

Red first: four new cases in `client/src/pages/goal/discovery/discovery.goal.test.tsx` failed on main, then pass; existing `/jobs` cases unchanged. Captures at 1280 and 390 with synthetic responses in `design/goal-ui/captures/jobs/fix-1706/`. After deploy: `/jobs?q=engineer` on skipwait.me lists careers-site roles.

## Status

- FIX-jobs-catalog-search: done — 68856c594 — Claude Code · 3770, 2026-11-27. Four new cases red on main then green, 296 focused tests pass; 10 synthetic captures at 1280/390 (no page errors, no overflow, no careers-site row in JSON-LD; `design/goal-ui/captures/jobs/fix-1706/results.json`). Unverified: live `/jobs?q=engineer` after the web deploy; issue 1706 closes then.
