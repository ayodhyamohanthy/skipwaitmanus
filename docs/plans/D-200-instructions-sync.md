# Packet D-200-instructions-sync: every agent's instructions say what the picker already does (D-200)

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` `D-200-instructions-sync` (status lives there) |
| Decisions | D-200 (binding text quoted in §2); amends the role wording of D-083, D-085, D-109 |
| Risk tier | 3 (docs only) |
| Size | S (under an hour) |
| Implementer | any model except a Claude Code session (its safety check refuses edits to its own instruction files, D-200 (7)) |
| Branch | `agent/queue/d200-instructions-sync` from the latest `origin/main` |
| Depends on | nothing |
| Do not run at the same time as | another edit of the four files in §5 |
| Verified against | `main` `42965150` on 2026-10-24 |

## 1. Goal
The picker and the CI queue gate already follow D-200 (merged in #640): any session clears another session's block, writes packets, registers rows and lands, and Claude Code sessions build too. Four instruction files still say Claude Code never builds and that some steps are Claude-only, so an agent that reads them before running the picker gets the old rule. Make the four files say what D-200 says.

## 2. Binding rules (quoted, not paraphrased)
D-200 (2): "**No step waits for one model or session** (extends D-195 (1)). Any session other than the one that reported a block clears it; any session writes packets, registers or reorders rows in `docs/plans/assignments.json` (saying why in its pull request), records rulings inside the owner's decisions, reviews and lands."
D-200 (3): "**Claude Code builds too.** When a Claude Code session is present it also takes the CEO review when nothing else waits; when none is present, nothing waits for it."
D-200 (7): "the role wording in CLAUDE.md, AGENTS.md, docs/BRIEF.md and docs/DELEGATION.md still says Claude Code never builds and some steps are Claude-only; until it is synced, this entry wins."
The picker's refinement of (2), from the #640 review: a block is cleared by a green or landed report from anyone, or by any report from a session that neither raised a block still open on the task nor holds the task.

## 3. Current behaviour (verified)
1. `CLAUDE.md:7` opens "**You, Claude Code, are the CEO (D-085, in effect now).** **D-109: you decide, the open models execute.**" and says the picker offers Claude Code "never a build, takeover, make-green or findings fix".
2. `AGENTS.md:43` (team rule 7, "Roles") says the picker offers Claude Code "never a build, takeover, make-green or findings fix".
3. `docs/BRIEF.md:29` ("Roles") says Claude Code "claims as `--claim "Claude Code"` and never builds".
4. `docs/DELEGATION.md:96` (item 7) ends "never a build, takeover, make-green or findings fix."
5. `docs/DECISIONS.md`, row D-200, clause (7) says the sync is still open.

## 4. Target behaviour
1. `CLAUDE.md`: directly above the "You, Claude Code, are the CEO" paragraph, add one paragraph: "**D-200 (owner, Oct 24): speed first; nothing waits for one model or session.** Claude Code builds too; any session that neither raised a block nor holds the task clears it; any session writes packets, registers or reorders rows and lands; D-198's second-account rule is withdrawn. Where the text below makes a step Claude-only, D-200 wins." In that paragraph, replace "never a build, takeover, make-green or findings fix" with "and, since D-200, builds, takeovers, make-greens and findings fixes like any session".
2. `AGENTS.md` rule 7: append to its bold heading "; amended by D-200, Oct 24: Claude Code builds too, and no step waits for one model or session", and replace "never a build, takeover, make-green or findings fix" with "and, since D-200, builds, takeovers, make-greens and findings fixes like any session".
3. `docs/BRIEF.md:29`: replace "and never builds" with "and builds like any session (D-200)", and "report to the CEO" with "report on the board every session reads".
4. `docs/DELEGATION.md:96`: replace "; never a build, takeover, make-green or findings fix." with ". Since D-200 it is also offered builds, takeovers, make-greens and findings fixes like any session, and none of these steps is Claude-only."
5. `docs/DECISIONS.md` D-200 clause (7): replace "Sync still open: ... this entry wins (D-157: the newest decision wins)." with "Synced by D-200-instructions-sync (<your merge sha>)."

## 5. Files
- **In scope (edit only these):** `CLAUDE.md`, `AGENTS.md`, `docs/BRIEF.md`, `docs/DELEGATION.md`, `docs/DECISIONS.md` (the D-200 row only), `docs/plans/assignments.json` (this row's status only).
- **Out of scope:** every other line of those files; `scripts/` (the picker already follows D-200).

## 6. Steps
One commit with the §4 edits. Run `npx vitest run scripts/briefContract.test.ts scripts/registerShape.test.ts scripts/queueGate.test.ts` (run `pnpm install` first in a fresh worktree). The pull request is docs-only, so the queue gate passes it from any branch (D-200); it lands on green required CI.

## 7. Tests
No new test: docs only. Controls that must stay green: `scripts/briefContract.test.ts`, `scripts/registerShape.test.ts`, `scripts/queueGate.test.ts`.

## 9. Definition of done
- [ ] The five §4 edits, nothing else in those files.
- [ ] The three control suites green; required CI green on the pull request.
- [ ] This row set to `done` in `docs/plans/assignments.json` with the merge sha.

## 11. Stop and ask if
A quoted line no longer exists as written, or `scripts/briefContract.test.ts` pins wording you would change: report it `blocked` with the line, and a session that did not raise the block decides it.

## Status
