# Packet D-200-instructions-sync: every agent's instructions say what the picker already does (D-200, re-synced to D-225)

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` `D-200-instructions-sync` (status lives there) |
| Decisions | D-225 (current role split); D-200 (no step waits for one model or session) |
| Risk tier | 3 (docs only) |
| Size | S (under an hour) |
| Implementer | any session, including a Claude session (D-225 makes the role split a docs statement, not an edit restriction) |
| Branch | `agent/queue/d200-instructions-sync` from the latest `origin/main` |
| Depends on | nothing |
| Do not run at the same time as | another edit of the files in §5 |
| Verified against | `main` `42965150` on 2026-10-24; re-synced against `main` `a4b022a5` on 2026-10-28 |

## 0. Why this packet was re-synced (D-202, D-225)
This packet was written on Oct 24 to make four instruction files say **"Claude Code builds too"** (D-200 (3)). On Oct 28 the owner reversed that half: D-225 keeps D-200's no-step-waits rule but splits the roles again - Claude sessions supply intelligence, reasoning and bounded decisions or handoffs, and other tools implement. D-225 names this packet explicitly: "This supersedes earlier Claude-build wording, including the target in the older `D-200-instructions-sync` packet; do not use that packet to restore the older role."

So the packet's target is no longer "write *builds too* into four files". Three of the four files were updated to the newer role split by the D-225 landing, and the work left is the reverse of the original §4: **remove the one surviving "Claude Code builds too" sentence and close the register clause that still says the sync is open.** Nothing here restores the older role.

## 1. Goal
Every instruction file an agent reads before running the picker states one role split - D-225's - and no file still tells a reader that Claude Code builds. The register's D-200 row stops saying its sync is outstanding.

## 2. Binding rules (quoted, not paraphrased)
D-225: "Claude sessions handle intelligence/reasoning; other tools develop. This supersedes earlier Claude-build wording, including the target in the older `D-200-instructions-sync` packet; do not use that packet to restore the older role. Nothing waits for a particular model."
D-225, "Supersedes · affects": "Amends entry/read order under D-073/D-083/D-085/D-202 and earlier Claude-build role wording under D-109/D-200/D-203."
D-200 (2), which still stands: "**No step waits for one model or session** (extends D-195 (1)). Any session other than the one that reported a block clears it; any session writes packets, registers or reorders rows in `docs/plans/assignments.json` (saying why in its pull request), records rulings inside the owner's decisions, reviews and lands."
`docs/BUILD_CONTINUITY.md`, "Roles and limits": "This supersedes earlier Claude-build wording, including the target in the older `D-200-instructions-sync` packet; do not use that packet to restore the older role."

## 3. Current behaviour (verified against `main` `a4b022a5`)
1. `CLAUDE.md:7` - already correct: "**Claude session role (D-225, owner, Oct 28).** Use this session for intelligence and reasoning ...".
2. `AGENTS.md:44` (team rule 7) - already correct: "**Roles (D-225, owner, Oct 28).** Claude sessions handle intelligence, reasoning, direction and decision recommendations ... other tools implement the authorized packets."
3. `docs/BRIEF.md:29` - already correct: "**Roles (D-225):** Claude handles intelligence/reasoning; other tools develop."
4. `docs/DELEGATION.md` §1 and §4a item 7 - already correct: D-225 supersedes the former Claude implementation role; item 7 says the older Claude-build role is superseded.
5. `AGENTS.md:55` (the D-058 row) - **stale.** Its closing sentence reads "**Amended by D-200 (Oct 24):** Claude Code builds too and may take any eligible work the picker assigns ...". D-225 amended exactly that clause.
6. `docs/DECISIONS.md`, row D-200, clause (7) - **stale.** It still reads "**Sync still open:** ... still says Claude Code never builds ...; until it is synced, this entry wins", and the row's status cell says `adopted - sync`.

## 4. Target behaviour (what this packet does)
1. `AGENTS.md:55`: replace the closing D-200 sentence with one that keeps D-200's surviving rule and states D-225's split: no lane waits on one model or session, any capable session may perform authorized work, Claude sessions supply intelligence, reasoning and bounded decisions or handoffs, and other tools implement the authorized packets.
2. `docs/DECISIONS.md`, D-200 clause (7): record that the sync is done and that D-225 overtook the Claude-builds-too clause, which no longer governs; the no-step-waits rule stands.
3. `docs/DECISIONS.md`, D-200 row status cell: `adopted - sync` becomes `synced` (the vocabulary three other rows already use), so the row does not still advertise an open sync.
4. `docs/plans/assignments.json`: this row's `status` to `done` in the landing pull request, and its `title`, which still states the superseded "Claude Code builds too", corrected to the D-225 wording.

## 5. Files
- **In scope (edit only these):** `AGENTS.md` (the D-058 row only), `docs/DECISIONS.md` (the D-200 row only), `docs/plans/D-200-instructions-sync.md` (this packet), `docs/plans/assignments.json` (this row only).
- **Out of scope:** every other line of those files; `CLAUDE.md`, `docs/BRIEF.md` and `docs/DELEGATION.md` (already correct - do not touch); `scripts/`; the `docs/KIT_V4_BUILD_PLAN.md` §3b row `D-200`, which several tasks share (D-134).

## 6. Steps
One commit with the §4 edits. Run `npx vitest run scripts/briefContract.test.ts scripts/registerShape.test.ts scripts/queueGate.test.ts` (run `pnpm install` first in a fresh worktree). The pull request is docs-only, so the queue gate passes it from any branch (D-200); it lands on green required CI.

## 7. Tests
No new test: docs only. Controls that must stay green: `scripts/briefContract.test.ts`, `scripts/registerShape.test.ts`, `scripts/queueGate.test.ts`.

## 8. What not to do here
- Do not re-add "Claude Code builds too" anywhere; D-225 superseded it.
- Do not add a `syncedTo` field to `docs/plans/assignments.json`: `TASK_KEYS` in `scripts/nextTaskCore.mjs` does not allow it yet, so the queue gate would reject the file. The re-sync is recorded in this packet until `PICKER-decision-sync` adds the field.
- Do not restate a rule the code does not follow: the picker's own item 7 already prints the D-225 role.

## 9. Definition of done
- [ ] The §4 edits, nothing else in those files.
- [ ] The three control suites green; required CI green on the pull request.
- [ ] This row set to `done` in `docs/plans/assignments.json` with the merge sha.

## 10. Stop and ask if
A quoted line no longer exists as written, or `scripts/briefContract.test.ts` pins wording you would change: report it `blocked` with the line, and a session that did not raise the block decides it.

## Status
One line per task, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is on `main` (D-134).
- D-200-instructions-sync: in progress — DeepSeek-V4.1-Flash · 113a — 2026-10-28 — branch agent/queue/d200-instructions-sync (takeover from WorkBuddy AI · 9b71, whose claim added no commit; re-synced to D-225 before implementing, because the packet's original target was the superseded Claude-builds-too wording).
