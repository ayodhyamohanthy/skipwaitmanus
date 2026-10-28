# CI-architect-real-checks

## State and scope boundary

Tier1. Architect/ownership reconciliation only; NOT ready for implementation. Incident748 and audit741 remain open. Proposed scope from the repository planning source: https://github.com/ayodhyamohanthy/skipwaitmanus/issues/748#issuecomment-6443126687 . That source supplies a proposal, not user authority. This row implements no workflow change and grants no merge or production action.

The original user-backed objective is real required checks before landing and safe deployment. Owner subtask direction supports splitting work, not skipped checks. Coordination instructions require protected registration and direct ownership reconciliation, without waiting for unrelated pricing implementation. Do not ask the founder to approve internal wording.

## Proven defect and evidence

PR752 substantive five-file docs/registry head36842c00 had all three CI jobs skipped in run40506287399, then merged02eb6c95 at2026-10-27T12:48:12Z. Main CI40506662910 succeeded afterward, which is separate postmerge evidence. Existing ci.yml skips architect prefixes together with marker refs. Source06e20175/PR658 assumed marker branches never merge, but substantive architect packet PRs do. Preserve evidence in audit741comment6442763129; no history rewrite or false incident closure.

- https://github.com/ayodhyamohanthy/skipwaitmanus/pull/752
- https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/40506287399
- https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/40506662910
- https://github.com/ayodhyamohanthy/skipwaitmanus/pull/658

## Ownership handoff required before implementation

Current ci.yml owner is PRICING-banded-oct25/PR666. Current521c8610 delta there is only c9572fcf's typecheck memory headroom: NODE_OPTIONS=--max-old-space-size=6144 pnpm check plus comment. Preserve it through explicit handoff/integration and exact review. Request: https://github.com/ayodhyamohanthy/skipwaitmanus/pull/666#issuecomment-6443114513 . No acknowledgment at registration. Do not claim owner consent or concurrently edit the file.

Resolve through an explicit temporary workflow handoff or separately reviewed transfer of that exact CI hunk. Then amend this registry row with the final exact owns and move from architect to todo through a protected PR, removing/reconciling the old owner's workflow claim as appropriate. Do not make urgent CI safety wait for the unrelated pricing feature. Do not pretend full workflow editing is switch-only: ownsOverlap exempts only two switch-only entries, not a full workflow plus one switch. No test weakening or gate exemption to make registration pass.

Proposed eventual owns (NOT granted yet): .github/workflows/ci.yml, scripts/ciMarkerSkip.test.ts, scripts/classifyCiChange.mjs, scripts/classifyCiChange.test.ts and this packet. Check all these against live owners before final amendment. P1-deploy-green-gate owns deploy-api.yml, deploy-pages.yml, rollback.yml and its gate files, disjoint from this proposed correction. No artificial dependency on P1 or pricing; preserve required job names and main push semantics used by P1.

## Proposed implementation acceptance, after handoff

- Classify substantive vs marker-only by the complete actual diff at pinned trusted base/head SHAs, not by branch prefix. Exactly no changed files is the only proposed marker fast path; no missing/failed/truncated/unresolved read may become an empty list.
- Unknown classifier state fails closed to full required checks. Test shallow/missing fetch, moved base, rerun/event variants, malformed or truncated responses, and non-empty runtime or docs/registry changes hidden under every marker prefix.
- Substantive PRs run real typecheck, unit/component/route tests and build. Do not gate required jobs behind a classifier dependency whose failure makes them skipped. No success aggregate may conceal skipped required jobs. Classification must not trust unreviewed PR-controlled code or data to declare itself empty.
- Preserve legitimate true marker behavior without broad branch exemptions. Verify the newest100-runs concern honestly: skipping job steps does not necessarily remove a workflow run from the picker's API window. Do not promise that result without measurement.
- Red-first tests update obsolete branch-prefix pins for the new correct contract, without weakening protection or ordinary/recovery exact-SHA gates. Current P1 tests already reject skipped run/job conclusions.
- Independent non-builder/non-fixer Tier1 semantic review. Exact current main and candidate requiredCI success before normal merge-commit landing. Reproduce real linked safe draft-PR runs: substantive architect docs/registry runs all required checks, invalid assignments fails tests, and genuinely empty marker uses only the justified fast path. Source/YAML pins alone are not workflow proof. Do not merge throwaway tests or change production/settings.

Out of scope: deployment workflow files, production, DB, real rollback/dispatch, protection/ruleset settings, spending, branch/history deletion and feature activation. Registration is not implementation, review, landing or incident acceptance.
