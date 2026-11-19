# Packet FND-7: a triage list of open PRs and stale branches for the owner

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `FND-7` |
| Decisions | D-059 (stale PRs closed with a pointer), D-063 (PR #309 closes with a pointer), D-074 |
| Risk tier | 3 (read-only; the owner acts) |
| Size | S |
| Implementer | any model |
| Branch | `agent/<model>/fnd7-triage` (docs only) |
| Depends on | nothing |

## 1. Goal
Stale PRs and abandoned branches confuse delegated models: some carry fixes that later landed differently, and some contradict decisions. On Oct 18 there were 53 open PRs (about 40 untouched since September) and about 250 remote branches. Produce one evidence-backed list the owner can act on in 15 minutes. You close nothing and delete nothing.

## 2. Steps
1. **List the open PRs** read-only and unauthenticated: `curl -s "https://api.github.com/repos/ayodhyamohanthy/skipwaitmanus/pulls?state=open&per_page=50"`, then `&page=2`. Mind the 60-requests-per-hour limit.
2. **Give each PR a verdict, with evidence:**
   - **SUPERSEDED:** `main` has the change or a decision replaced it. Cite the commit (`git log origin/main --oneline | grep -i <keyword>`, or `git cherry origin/main origin/<branch>`) or the decision ID.
   - **STALE-SALVAGE:** still relevant and not on `main`. Name the §3b row it belongs to.
   - **STALE-DROP:** contradicts an active decision. Cite it.
   - **ACTIVE:** recent, with a §3b row that owns it.
   - **DEPENDABOT:** check whether `package.json` on `main` already has that version or newer.
3. **Security first.**
   - PR #2 claims session-secret fail-open, storage-proxy path bypass and dependency advisories.
   - PR #18 claims auth/authz bugs, CSRF, billing trust and client races.

   For each claimed issue, check whether current `main` still has it and cite file:line. If any is still present, add a P0 row to §3b with the evidence. That one write is allowed besides this packet's output.
4. **Branches.**
   - `git branch -r --merged origin/main` gives the fully merged branches, which are safe to delete.
   - For the rest, run `git cherry origin/main <branch>` and give a one-line description of the unmerged work and whether any §3b row references it.
   - Flag the lane branches that rows depend on: `agent/claude/seeker-signin`, `agent/claude/chargebee-catalog-sync`, `agent/opencode/task12-coach-rewrite`, `agent/qoder/*`. These are never safe to delete.
5. **Write** `docs/plans/FND-7-triage-result.md`, holding:
   - the PR table (number, branch, last update, verdict, evidence);
   - the security findings;
   - the merged branches safe to delete;
   - the unmerged branches by group;
   - the owner's action list in priority order.

## 3. Files
`docs/plans/FND-7-triage-result.md` (new), this row, and plan §6 (point the owner to the result).

## 4. Definition of done
Every verdict has evidence; no PR closed and no branch deleted; docs-only push after `pnpm vitest run scripts/briefContract.test.ts` and `git diff --check`.
