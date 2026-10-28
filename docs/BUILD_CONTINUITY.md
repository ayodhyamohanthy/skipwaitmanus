# Build and continue: current-instruction preflight (D-225)

Owner direction, October 28, 2026: every agent reads the latest instructions and decisions and always works toward the goal. `build`, `continue`, `resume` and `next` mean continuation, not starting an old plan again.

## Before claiming or changing a task
1. Fetch current `origin/main`. Record its SHA. Read current `docs/BRIEF.md`, `AGENTS.md`, `docs/DECISIONS.md` and the task's current packet, not just the checkout's old copies. Do not reset a shared worktree or discard anyone's work. Reconcile your branch with current main through the normal merge process.
2. Read the previous session's **repo-only outcome**: its packet status, branch/commit, PR and review/test results. Follow actual artifact links and inspect the content. A chat title, remembered summary or instruction to "read the last chat" is not evidence of a read. Never publish raw private chat/session logs or private sources. If there was no prior session, record that with the current task state; do not invent a handoff.
3. Check what already landed or is in progress, the live picker board, dependencies and file ownership. Name the unfinished task and explain how it helps SkipWait become the go-to global site for job referrals, getting people referred faster. Never repeat finished work or revive a superseded backlog item. The queue proposes work within current direction; it cannot overrule that direction.
4. Apply the owner's latest instructions. Frozen decisions remain binding until the owner explicitly reopens them. A newer file timestamp, higher decision ID, agent proposal or older chat does not itself authorize a change. If a newer owner instruction is not yet recorded, record it through the docs/review path before implementing it. Resolve contradictions against the owner's actual decision, not file age.
5. Write a short repo-safe read receipt in the task/PR handoff: current main SHA; instruction/decision IDs and paths actually read; prior outcome commit/PR and what remains; selected task, goal contribution and owned paths; conflicts or missing evidence. Fetch again before implementation and landing; re-check if relevant instructions, decisions or ownership changed.
6. Then use `node scripts/next-task.mjs --claim "<your model name>"` and retain its exact session-tagged identity. Reconcile the printed assignment with this preflight. If context is missing, stale or conflicting, do not implement or land the affected task. Report the exact missing source/conflict through the existing process; continue independent authorized preparation or other eligible work. Never halt every lane merely because one task needs re-sync.

## Roles and limits
Claude sessions provide intelligence/reasoning and bounded decisions/handoffs. Other development tools implement. This supersedes earlier Claude-build wording, including the target in the older `D-200-instructions-sync` packet; do not use that packet to restore the older role. Nothing waits for a particular model. Preserve file ownership, independent review, exact required CI, frozen product decisions, free-only choices, no force-push, and all payment, API, data/deletion and go-live holds. This rule grants no new product or spending authority.

## Publication is not machine enforcement
This document is a required session-start instruction, not a process running on the owner's computer. Repository prompts cannot prove that every client read them. The picker now enforces the decision half (`PICKER-decision-sync`, landed `86559ba7`): it reads the register, withholds a task whose `syncedTo` trails an entry naming it, prints that row as `re-sync (D-nnn)`, and opens every pick with the newest decisions. What it cannot prove is that a session read them, so the actual read receipt and the reviewer check stay required evidence. Do not report every agent synced without its receipt.

## Carry the next handoff forward
At the end of a session update its existing packet/PR with: actual completed outcome and commit, real test/review evidence, remaining goal-aligned work, current decisions checked, owned paths, and blockers. The next session reads that result before selecting work. Never replace this with raw private transcripts, an obsolete plan or an unsupported "done" claim.

## Ask Instinct before asking the owner manually

Owner instruction, October 29, 2026: "Whatever the coding sessions are they will ask you before asking me manually." The owner then asked to push this rule to the instructions and repo. This applies to coding sessions on every platform, not just one client.

- Route a blocker, question or approval request to Instinct through the established project coordination channel before asking the owner manually. Include the task/subtask, exact branch and head, current instruction checked, the bounded question, relevant non-secret evidence and what remains blocked. Do not make the owner carry screenshots or copy replies between sessions when a working coordination route is available.
- Instinct answers within existing owner decisions and permissions, or brings the owner only the exact step that genuinely needs them. A model's question, a repository comment or a counterpart's answer is not new owner approval. Do not treat silence as consent.
- Hold only the affected action while the answer is pending. Continue independent, authorized work. Do not repeat a rejected action, bypass a permission prompt, spend, publish as the owner, change accounts or frozen product rules, or waive review/CI because a question was routed.
- Never put secrets, private account data, raw session logs or private security reproductions in public repository questions. Use the established private route for sensitive material. Keep ordinary repository questions task-scoped.
- Instructions are not proof of a connection. Report whether the question was actually delivered and answered. If automatic delivery or answering a local permission prompt has not been tested, say so. If the route is unavailable, report that exact gap through the available coordination channel; do not claim automatic handling or enable blanket approval.

Source: owner messages `phonemsg-01M62CB8XBVFSQBMZZWQFWWT43` and `phonemsg-01M62CBN289B7VFT8FK43EA45M`. This is an instruction and escalation rule only; it changes no product behavior, file ownership, spending permission or release gate.
