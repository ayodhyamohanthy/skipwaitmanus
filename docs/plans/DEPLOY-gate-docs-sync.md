# DEPLOY-gate-docs-sync

Incident: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/748

Tier3, docs only. Owns AGENTS.md, docs/DEPLOY.md, docs/ARCHITECTURE.md and docs/BRIEF.md, limited to truthful deployment and deliberate manual-recovery instructions. Waits for P1-deploy-green-gate, D-090-BYOR and D-099-bonus-pages because the latter two already own shared docs. This serialization avoids retaking active ownership or blocking the urgent runtime safety fix behind unrelated features.

Read the actual landed workflows and exact gate code before updating instructions. Describe CI-before-migrations and Web/API deployment, fail-closed behavior, exact target-SHA requirements, explicit older-target recovery intent/reason and actor, concurrency, identity and health verification, and honest retry steps. Remove resolved gap statements only after evidence supports them. Name any remaining CI-cancellation/path-filter liveness limitation. Preserve unrelated edits from all dependencies. Do not imply actual rollback execution or permission, blanket green tests, activation or incident closure. No runtime/settings/DB/secret/payment changes.

Use normal picker claim, focused docs/registry checks and exact required CI, current-main green and protected merge-commit landing. Registration is not implementation; incident748 acceptance remains independently tracked.
