# PICKER-report-append-snapshot: append a report while unrelated reports arrive

Read `docs/BRIEF.md`, `AGENTS.md` and current decisions first. This packet records the one-task exception before source dispatch; it does not claim a normal picker assignment or an implemented fix.

| Field | Binding |
|---|---|
| Queue row / status | `PICKER-report-append-snapshot`, D-212; status evidence in this packet |
| Decisions | D-372; D-321 (11), D-324, D-370; preserve D-085 ownership and D-346 block deduplication |
| Tier / lane | 2 / `picker-report-append` |
| Actual author | `GPT-6.1 Sol · 8817` |
| Implementation branch | `agent/queue/picker-report-append-snapshot-8817` |
| Pre-dispatch code baseline | `751a9a1ef45883eb9453c6182302e5fac1cab5ef` |
| Prerequisite | `PICKER-snapshot-scope` / #1421, already merged |
| Authority | The current user explicitly approved the bounded bootstrap-repair proposal in this session after the report and claim routes failed; D-372 records the exact limit |

## 1. Goal

Allow the existing guarded report command to append without losing other tasks' reports or accepting stale same-task inputs. This restores the existing operational handoff, not a product or money feature. No growth-loop instrumentation changes.

## 2. Binding rules

- D-372 substitutes this documented one-task author/branch/base binding for the broken automated claim path, only for this repair. No fabricated Claim/Takeover/Fixed marker or generic manual-claim authority.
- D-370: green required CI lands the protected pull request; no model/review dependency. No admin bypass, force push, spending, settings, secrets or production-money action.
- Preserve authentication, ownership, the current task/main freshness checks, non-force first-push-wins, fail-closed unreadable/incomplete history and the existing bounded retry policy.

## 3. Measured remaining defect

After adopting #1421, the ordinary report still exhausted three snapshot checks (773.13 seconds). A read-only comparison found only `main` and `agent/reports/log` different from the captured inputs. The target admin-money row, its direct dependency rows and decision-sync result were unchanged. The report-log delta was one other task's report: `f93c4d291`, `D-048-R-profile`, after `6eabf5504`.

`runCommand` builds report permissions/deduplication/evidence through `state()`, then `pushMarker` requires the report log to remain exactly unchanged during those lengthy reads. `blockedReportError` consults the selected task's reports only; unrelated task reports do not change this report's permission, evidence or duplicate decision. The current non-force append already protects against overwriting the parent.

## 4. Target behavior

1. For an existing report log, refresh its tip immediately before constructing a report commit. Accept a moved parent only when it is a fast-forward consisting entirely of empty, recognized Report commits for different task IDs.
2. A same-task report, unrecognized marker, file-changing commit, merge, rewritten/deleted/unreadable log or unprovable delta must fail closed or trigger the existing full snapshot reread. A newly created log keeps the current reread behavior.
3. Only after proving the intervening reports unrelated may the report snapshot adopt that parent. The unchanged ordinary write guard still validates every other scoped input and the relevant main content, then the non-force push appends to that exact parent.
4. A further change between refresh and push retains the existing race refusal/retry. Add no unbounded or nested retry loop, CLI flag, alternate transport or permission shortcut.
5. The claim, heartbeat, review, landing, blocked-report duplicate and task-selection policies do not change. No hardcoded task or session exception in runtime logic.

## 5. Files

- In scope: `scripts/next-task.mjs`, `scripts/nextTaskAuthoritativeRefs.test.ts`, this packet, `docs/plans/PICKER-snapshot-scope.md`, `docs/plans/assignments.json`, and the bounded D-372 entry/receipt in `docs/DECISIONS.md`.
- Read only: `scripts/nextTaskCore.mjs`, `scripts/modelProvenance.mjs`, existing picker/ref/push tests.
- Out of scope: product code, payments, auth settings, workflows, dependencies, environment variables, CI requirements and every other task's source.

## 6. Dispatch and steps

1. Publish this packet, D-372 and the single appended row in the normal docs-only registration PR before source edits. Once that binding and the source receipt below are public, D-372 permits draft-only build-ahead work; source readiness/landing still waits for registration on main and all normal gates. Preserve existing task order and statuses. This corrects the implementer's extra development wait; it does not relax the user's pre-dispatch binding condition or any landing guard.
2. Before source edits, publish a source-branch receipt naming the actual integration base and this binding. Check for an ordinary intervening claim/branch owner and preserve it; do not overwrite another writer. No fabricated automatic claim marker.
3. Add the consumer-visible CLI regressions below, observe their failure on the current report path, then implement the smallest parent-refresh helper using the existing bounded Git and marker parsers.
4. Run the focused safety suites and compiler; update the packet with real proof, push, and use a protected PR on current main with every required check green. No separate review is introduced.
5. Prove an ordinary guarded report and then return to normal picker claiming. This exception expires with this repair; it applies to no other task.

## 7. Tests first and controls

In the existing isolated real-CLI fixture:

- Seed an existing report log; append an unrelated task's empty native report while the CLI reads GitHub. The selected task's report must publish once, keep the intervening report in ancestry, and use a non-force append.
- A same-task report arriving in that window must cause a full reread; repeated relevant churn must stop without publishing stale/duplicate output.
- A file-changing or unknown/non-report append and non-fast-forward/merge history must not be silently adopted. Missing or unreadable history remains a refusal.
- Preserve the existing created/deleted ref, own heartbeat, main-row/dependency, shallow history, unavailable origin, report push race, ownership and first-push-wins controls. Do not remove, weaken or skip old assertions.

## 8. Races and failure behavior

Refresh is not an atomic multi-ref protocol. The existing final guard and non-force push remain the authority. A report arriving afterward can still reject the attempt; the existing bounded outer reread handles it. Never reconstruct the report log, reset a shared branch, replay another author's marker or treat a failed fetch as an empty history.

## 9. Done means

- New regressions fail before the fix and pass after it; existing safety controls and required exact-head CI pass.
- Scope and ID checks pass using the main-first registration; no self-authorizing gate edit.
- Protected merge on green current main; ordinary report publication is observed, not inferred from a test.
- Normal queue claiming resumes, or its distinct remaining failure is reported honestly. No admin-money fixture/capture/live acceptance is implied.

## 10. Review questions

Does the accepted delta contain only other tasks' empty native reports? Can a same-task change slip through? Is the parent preserved by ancestry and non-force push? Are all original guards and retries still active? Is the exception visibly limited to this one pre-bound task?

## 11. Stop conditions

Stop source dispatch if the binding/receipt is unpublished, another session owns the implementation branch, the target protocol differs from this inspected baseline, or the change requires weakening freshness/auth/ownership or changing CI/settings. Stop source readiness/landing until registration is admitted on main and every ordinary gate passes. Preserve work and report the exact conflict.

## 12. Owner questions

The one-task bootstrap exception is explicitly approved. There is no permission to waive any remaining guard or apply it to another task.

## Status

- Pre-dispatch binding only — `GPT-6.1 Sol · 8817` — November 21, 2026 — baseline `751a9a1ef45883eb9453c6182302e5fac1cab5ef`. No source edits, manual marker, implementation pass or normal claim is asserted by this registration. The earlier #1421 repair is retained, not duplicated.
- Source dispatch receipt — `GPT-6.1 Sol · 8817` — source branch `agent/queue/picker-report-append-snapshot-8817`, parent/base `e928ea485aeeceb8b19c41f57cad1eb3461145d3` (includes main `e8b1bc83d` and the published registration binding). The branch was absent on origin before this first non-force publication. This receipt is committed and pushed before source/test edits under D-372, not a fabricated automatic Claim. Registration #1425 remains a prerequisite for source readiness/landing; development stays draft-only. No source implementation, passing regression or ordinary report is asserted yet.
