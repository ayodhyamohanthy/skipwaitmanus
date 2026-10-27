# Incident and audit branch retention

This record preserves evidence and active handoffs. It does not approve cleanup, authorize a deletion, mark a task complete, or clear a review gate.

`branch-retention.json` is the version 1 contract consumed by the proposed BRANCH-HYGIENE-1 implementation. Each hold is an exact branch name with a reason and source ref. Holds are branch-wide, not tied to a tip: an updated tip remains retained. Existing incident, audit and cleanup handoffs remain held even when their queue row says done. The landing slot and report log remain independently protected by the cleanup code.

The holds cover the observed #750, #579 and #650 review records, strict comparison correction, branch-hygiene review and its heartbeat, the audit's existing #703 claim, and the red-main repair/evidence branches. They also cover matching incident/audit handoff branches present when this record was prepared. A missing branch in this list is not approval to delete it. New evidence or handoff refs need a retained record before cleanup is considered.

Source: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/758#issuecomment-6446386246

No cleanup command is part of this change. Any eventual cleanup needs its own owner-authorized scope, a current dry run, verified retention completeness, completed independent code review and fresh branch/PR/task-state checks. No timer, done status, green CI or merge removes a hold. Hold removal requires a separate reviewed amendment with evidence that the related incident, audit and handoff retention needs are settled. Do not infer permission for production effects, settings, local worktree cleanup or branch deletion from this record.
