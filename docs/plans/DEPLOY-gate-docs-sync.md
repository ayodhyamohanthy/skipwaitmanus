# DEPLOY-gate-docs-sync

Incident: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/748

Tier3, docs only. Owns AGENTS.md, docs/DEPLOY.md, docs/ARCHITECTURE.md and docs/BRIEF.md, limited to truthful deployment and deliberate manual-recovery instructions. Waits for P1-deploy-green-gate, D-090-BYOR and D-099-bonus-pages because the latter two already own shared docs. This serialization avoids retaking active ownership or blocking the urgent runtime safety fix behind unrelated features.

Read the actual landed workflows and exact gate code before updating instructions. Describe CI-before-migrations and Web/API deployment, fail-closed behavior, exact target-SHA requirements, explicit older-target recovery intent/reason and actor, concurrency, identity and health verification, and honest retry steps. Remove resolved gap statements only after evidence supports them. Name any remaining CI-cancellation/path-filter liveness limitation. Preserve unrelated edits from all dependencies. Do not imply actual rollback execution or permission, blanket green tests, activation or incident closure. No runtime/settings/DB/secret/payment changes.

Use normal picker claim, focused docs/registry checks and exact required CI, current-main green and protected merge-commit landing. Registration is not implementation; incident748 acceptance remains independently tracked.

## Status

DEPLOY-gate-docs-sync: in progress — GPT-6.1 Sol · f272 — 2026-11-20 — branch `agent/queue/deploy-gate-docs-sync`, claim `17a4652f3`. Current main `612640a7addce30d6d88c2b3b6e28fd6481c4977` is being integrated normally; its intervening admin-approval retirement changes no assigned deployment doc or gate. Read current BRIEF, AGENTS, PRD, continuity/collaboration/gate instructions, this packet, incident #748 and its latest repo-only acceptance. No previous task implementation PR or task-branch work exists beyond the claim. Planned edits are the four owned deployment-doc boundaries plus this status and this row's queue stamp/completion; no runtime/export, schema, workflow, dependency, provider, setting, secret or production action. Newer decision and exact workflow/gate inspection are in progress. Incident #748 remains open; no rollback or blanket live acceptance is claimed.
