# Recover a quiet landing whose Fixed head is stale

## Goal and authority

Restore the ordinary picker route for a quiet Tier 1 landing when the current head is positively rejected because commits followed its bound Fixed head. The recovery obtains a legitimate fix-stage holder; it supplies no acceptance itself. This implements the existing D-344 (7)/D-353 head-binding rules and D-200/D-324 continuation direction. It changes no owner-reserved product or money decision.

Goal contribution: billing reliability work can progress through real qualification and required tests, without changing what seekers or referrers pay, see or may access. This is internal maintenance; no new customer behavior or growth metric is claimed.

## Observed case

- `D-100.provider-recon`, PR #1171, head `40595a6cf438fd9cf8642ff330aba3bcb4295a64`.
- Independent findings marker `371da22a` by `Claude Code · 64db`, then the separate fixer's bound Fixed `c5ec0a9a` naming `feab2fba50510c9e2406abdc24ed5d81f0b1a8ef`.
- Later review-lock tip `4bdf3667` is `Land claim` by `Cline · d8cd`. Both work and review refs are quiet beyond two hours.
- Own commits `5fc71c40` and `40595a6c` add landing documentation/registry-note changes and revert them. Their net tree change from `f9114c90` is empty; the gate still correctly inspects both commits individually. The three owned payment-reconciliation source/test files are unchanged since the Fixed head.
- Exact-head CI `44316287767` passes all test shards, aggregate, build and journeys. Its only failed step is `Review gate (independent Tier 1 pass)`: two commits followed the Fixed head.
- On main `2e4b83d2`, `tier1()` handles every `gateOnlyRed && state === "landing"` as a CI-rerun wait, even when the current gate still rejects the head. The ordinary FIX path is below that return. `--fixed` permits only a fix holder, or the last Fixed holder while the stage remains `needs-review`; it cannot refresh this landing stage.

[Read-only reproduction](../evidence/D-100-provider-recon-routing/probe.json) and [probe source](../evidence/D-100-provider-recon-routing/routing-probe.mjs) isolate the ordinary route after clearing reports/this unblock lease **in memory only**. The real work/review refs stay unchanged. Current result is `ineligible` with a CI-rerun explanation; removing the Land claim from an in-memory control reaches REVIEW. That control is not a proposed marker edit or an acceptance route. The probe asserts the historical failure; it is not the new implementation's passing regression test.

The earlier ordinary gate-red implementation already landed in PR #1093, merge `69e9c298`. Preserve that outcome and its safeguards. This row addresses the distinct current-gate-rejection case; it does not revive or certify that earlier packet's acceptance record.

## Contract

1. A new recovery is available only for an ordinary, non-packet Tier 1 row at `landing`, with a quiet existing lease under the existing work/review/heartbeat clocks and exact-tip completed CI red only at the named review gate.
2. The gate's **current, positively evaluated** result must identify the existing stale-Fixed-head rejection. Obtain structured evidence from the shared gate logic, bound to the same tip. Do not parse the human error message or reconstruct a weaker acceptance rule in the picker.
3. Missing, malformed, off-tip or failed reads are unknown. The current loader's `gateClear: false` is insufficient: it also represents caught errors. Its `isStatusCommit: () => false` is deliberately stricter than CI and cannot by itself prove that CI would still reject a legitimate status-only landing commit. Reuse the gate's actual status classification and expose read uncertainty rather than turning either condition into a recovery grant.
4. Keep existing `prFacts` consumers compatible. New structured evidence is optional and defaults to unknown when absent. The existing gate's null/string API and every pass/fail, independence, ancestry, provenance and status-only rule keep the same meaning.
5. A positively identified stale binding on a quiet landing may reach the existing qualified FIX hand-out/claim flow. Preserve the normal reviewer/current-lander exclusion and every ownership/provenance check. The reason must say this is head-binding recovery: verify inherited owned repairs and current-main composition, make no invented source edit, then use ordinary `--fixed` only after all owned findings are truly addressed. Unknown or unresolved obligations remain unresolved.
6. An active landing is never displaced. A currently clear gate with old red CI retains the CI-rerun route. Other gate failures, packet rows and unknown states retain their existing routes.
7. The recovery writes no marker by itself. It does not fabricate a pass, refresh another session's Fixed marker, delete/rewrite a lock or change `--fixed`/`--verdict` permissions. A later genuine Fixed marker still has to name the current pushed head and satisfy D-344 (7); required exact-head CI and protected landing remain mandatory.

## Files and boundaries

The one implementation row owns:

- `scripts/nextTaskCore.mjs`: this guarded ordinary-stage recovery only; no queue reorder, dependency, lease or global hold change.
- `scripts/next-task.mjs`: shared-gate fact collection and optional exports needed by focused tests only; no new GitHub endpoint, claim/completion command or marker permission.
- `scripts/review-gate.mjs`: read-only structured diagnostics/shared status-classification access needed by the loader only. Preserve the gate's existing public null/string behavior and all acceptance decisions.
- `scripts/nextTaskStaleFixedLanding.test.ts`: new route regression and negative controls.
- `scripts/reviewGateStaleFixedFacts.test.ts`: new shared-fact/read-failure coverage.

No existing test edit, skipped assertion, dependency, workflow, ruleset, setting, provenance registry, server/client/shared/drizzle source, payment/provider call or feature-flag change. If those bounds cannot implement the contract, report the exact missing path/contract before widening. Existing open owners of these process files remain; D-314 permits isolated overlapping work and the later lander preserves both changes.

Tier 2 under the current path classifier. Normal required CI and any actor-specific provenance/review restriction still apply; this packet supplies no author qualification or gate waiver.

## Implementation and verification

1. Inspect the live row/refs, current gate and current pending work. Continue only the official assignment on its own branch/worktree. Preserve every existing claimant and unpublished file.
2. Define the optional structured gate-fact contract and write the red regression before changing routing. Reuse the gate's current decision logic; do not duplicate it or infer a diagnostic from console text.
3. Make the narrow recovery admission, retaining the ordinary FIX eligibility checks and claim verb. Explain the binding-specific action in the hand-out's existing reason field.
4. Required new tests: actual stale-Fixed/quiet-Land-claim shape reaches FIX; an active landing does not; clear-gate/stale-CI does not; missing/off-tip/malformed facts do not; gate read failure does not; legitimate status-only commits do not appear stale; reviewer/current-lander exclusions hold; unrelated/mixed/wrong-tip CI and packet behavior stay unchanged; external-provenance holds are not bypassed. Assert that no path invents a pass or changes marker permissions.
5. Run the new suites, existing ordinary gate-red, path-tier, review-gate and claim-role suites, TypeScript and applicable static gates, then required exact-head CI. No old assertion or timeout is weakened to make the new state pass.
6. Before completion run the real picker read-only against the then-current target and record what it actually offers. If PR #1171's head/acceptance already changed, preserve that current outcome and use a labelled deterministic fixture for the historical case. A fixture proves routing logic, not a productive live session; no demonstration claim on another owner's task.

## Consumer and completion

The provider row's existing dependencies, branch, scope, tier and FIFO position are unchanged. No unconditional dependency is added: a normally authorized current-head acceptance could still resolve its gate before this implementation lands. The consumer remains unmerged and off until its real gate and normal tests pass; this registration is not a verdict or completion of PR #1171.

After recovery is implemented, the legitimate fixer integrates current main, verifies all owned repairs/limitations, pushes the last source/packet update, and only then records its own Fixed marker on that head. CI that ran before the marker is re-evaluated through the existing supported rerun/sync route. No non-status bookkeeping is added after that binding without obtaining the acceptance the unchanged gate requires. Landing and production proof use the normal protected path; this row never enables reconciliation.

Rating 7/10: it addresses an observed dead end without changing financial code or acceptance semantics. The cost and risk are a central routing/fact change, so positive shared-gate evidence and the unknown/active/provenance controls are essential. Measure the offered stage, not an unsupported throughput or customer-outcome improvement. No spending or new service is needed.

## Status

Registered by the D-100.provider-recon unblock disposition, GPT-6.1 Sol · 74ff, 2026-11-19, under D-200; decisions through D-366 read, including every entry newer than the consumer's D-227 stamp. D-364/D-365 concern unrelated public input/copy. D-366 preserves session-level review independence and required checks; this contract uses those current rules and does not carry forward the earlier ordinary-recovery packet's model-level restriction. No implementation, source dispatch, product verdict, Fixed/pass marker, consumer landing or live session continuation is claimed.
