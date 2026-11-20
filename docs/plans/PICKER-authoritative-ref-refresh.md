# PICKER-authoritative-ref-refresh

Read docs/BRIEF.md, AGENTS.md, docs/DELEGATION.md and current decisions first.

## Existing outcome and evidence

The owner's November11 instructions are to fix the picker and expose pending
eligible work for agents to pick, not to skip genuine holds or review.
Personally inspected originals: phonemsg-01M73FHPNVWN7DC66AQG08X2XX and
phonemsg-01M73FJZK5STP5W2BG9J9XG75V. These citations record provenance;
repository text does not authenticate the originals.

Current main at registration is 568591ef3e8d9bc24197bc1e32bab34c73cbf6e6.
The real next-task.mjs state() uses default fetch --prune origin; its agent
tracking-ref reads can stay stale in a main-only clone. The coordinator
observed a stale read-only REL850 offer against old3ca although the API
already showed the new b745 pickup. No claim was made from that stale offer.
Refreshing explicit agent refs corrected that clone's snapshot. This is
not proof that every external client has that configuration.

An actual external Claude diagnostic reports local bare-origin/mock-GitHub
fixtures on unmodified f640 source (scripts unchanged at d74): stale live
heartbeat takeover, deleted-ref resurrection, hidden new claim/retry loop,
and a fresh heartbeat arriving during ordinary GitHub reads. These are
reported fixture results, not yet independently rerun acceptance evidence.
The diagnostic's unbound local implementation draft is REFERENCE ONLY:
never copy, adopt, merge, certify or relabel it as this task's source.
Recover the diagnostic fixture files, inspect and rerun against pristine
current main before writing the separately bound implementation.

## Exact manual scope

- scripts/next-task.mjs: authoritative ref refresh at state and existing
  heartbeat/report retry reads; before-write remote-ref comparison and
  stale-snapshot retry/error handling only.
- NEW scripts/nextTaskAuthoritativeRefs.test.ts: real CLI/local bare-origin
  tests using mocked GitHub, including negative controls below.
- This packet Status only.

No owns: other non-done picker rows retain ownership of the shared script;
use the established exact manual-diff qualification and shared-path split.
Skipped automated scope-check is NOT a scope pass. No change to pure
eligibility, FIFO, task statuses, lane/files scope, tier, lease durations,
model identity, provenance resolver, review gate, workflows or protection.
No production/API/account/settings/cleanup/branch-deletion operation.

## Required behavior

1. Fetch required authoritative main/agent/report/lock refs explicitly,
   independent of remote.origin.fetch. Prune stale tracking refs within
   the explicit fetch scope; never delete a remote branch. Do not persist
   a refspec/configuration change in users' clones.
2. Refresh retry tracking refs, not just FETCH_HEAD. Unknown or failed
   refresh is an explicit no-write STOP, never absence or eligibility.
3. Before a claim/reclaim/report write, compare the exact decision-input
   refs to origin, including applicable work, review, architect, side
   heartbeat, landing and report refs. A moved, created or deleted input
   invalidates the snapshot and causes a fresh read/pick, never a stale
   push or a misleading successful assignment. Keep retries bounded and
   distinguish changed snapshot from an actual push rejection.
4. Do not claim transactional multi-ref safety. A remote change can occur
   between a recheck and push. Preserve normal non-force first-push-wins;
   no force-with-lease, atomic marker protocol or cross-ref write is added
   under this packet. If acceptance requires closing that remaining race,
   stop only this source dispatch and return the exact protocol choice to
   Instinct for a separately reviewed packet amendment. Do not silently
   call a one-time ls-remote check a fully atomic ownership guarantee.
5. Shallow/missing ancestry is unknown, never proof that a task is landed
   or abandoned. Existing supported fetch/history behavior may recover;
   otherwise STOP with a precise safe history-fetch instruction, no claim.

## Red-first acceptance

Use real CLI, local bare origin and before/after remote ref snapshots.
Never run a test claim against the live repository.

- Main-only and normal clones: a fresh side heartbeat preserves its holder;
  independent unstarted W is offered/claimed, not the active row.
- Deleted remote branch: no stale branch resurrection; any legitimate new
  build starts from current main and does not adopt deleted history.
- New remote claim: preserve it, expose independent W, no stale three-push
  loop. Read-only --as performs zero remote writes.
- Mock a relevant heartbeat/ref change during GitHub reads: reread before
  write, preserve live holder. Include reports and landing-slot inputs.
- Origin unavailable during refresh/revalidation: nonzero explicit STOP,
  zero origin writes. Retry heartbeat/report tracks the real remote tip.
- Configuration unchanged, remote branch set unchanged except expected
  ordinary claims, and shallow/missing-history negative fails closed.
- Existing nextTask*.test.ts suites unchanged and full applicable checks.
- Independently qualify actual source model, all fixers and distinct final
  reviewer; current-main exact-head required CI and protected merge.

## Execution and handoff

Registration is not source dispatch or author/reviewer evidence. Obtain a
real ordinary assignment and admitted task/operator/actual free-model
binding before source work, with real execution input/output/observation.
D312's loader-only exception does not apply. Unknown contributors remain
held. No broad plan, external client's label, inherited diagnostic or
operator impersonation supplies a coding identity. Preserve other active
picker/gate branches; inspect shared paths before integration. Report
actual fresh offer/claim and same-session useful progress separately from
fixture PASS, then check the complete released CLI in a nonclaim live run.

## Status

PICKER-authoritative-ref-refresh: in progress — GPT-6.1 Sol · e560 — 2026-11-20 — branch `agent/queue/picker-authoritative-ref-refresh`.

Read receipt: current main `a4e93b796`, instructions `AGENTS.md`,
`docs/BRIEF.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`,
`COLLABORATION.md`, `docs/DELEGATION.md`, plan §§3–6 and bug-free gate read;
register checked through D-370. Prior branch had only claim/transport
commits, no source change or PR. Official takeover `f42d30fcc` and main
integration `ad0a72abc` retain that history. No previous diagnostic PASS is
claimed. D-370 supersedes this packet's model-binding and independent-review
requirements; ordinary exact-session ownership and required CI remain.

Planned implementation: explicit main/agent tracking-ref refresh, complete
history requirement and bounded pre-write snapshot invalidation in
`scripts/next-task.mjs`; local bare-origin/mock-provider regression tests in
`scripts/nextTaskAuthoritativeRefs.test.ts`. No dependency, deployed
application, schema, configuration, eligibility or lease change. All proof
pending; recheck/push still has the documented multi-ref race window.

2026-11-20 technical execution amendment under D-200 (2): the original
November 11 diagnostic fixtures could not be recovered in targeted local
Git history/reflog/worktree and temporary-directory searches. Replace only
the fixture-recovery prerequisite above with independently authored local
bare-origin/mock-GitHub CLI reproductions; these are new tests, never the
original diagnostic or its implementation. All required behavior and
red-first acceptance remain. The first run on unchanged CLI `def7e4558`
produced 12 failures and 2 passing controls (14 cases); the report-marker
fixture syntax is being corrected before final qualification. No runtime
source was changed before this amendment. D-370 removes the historical
model-binding/reviewer requirements; unique session claims, all tests,
required CI and protected merging still apply. Original evidence remains
unverified. No atomic multi-ref protocol is authorized or claimed.

Implementation checkpoint, 2026-11-20: explicit fetch destinations/pruning
refresh main and nested agent tracking refs without changing clone config;
before every marker push, relevant work/review/architect/heartbeat/landing/
report refs are compared with origin. Changed snapshots rerun the command
at most three times using one session identity. Report and side-heartbeat
push races reread complete state. Shallow or unreadable history/ref reads
STOP before writing. Pushes remain non-force; the recheck-to-push race is
not atomic or eliminated.

Validation: independently authored actual-CLI bare-origin fixtures first
failed 12/14 on unchanged source. Final 17/17 pass in the broader tooling
run, including main-only and normal clone controls, deleted/new/mid-read
refs, report/heartbeat retries, bounded churn, unavailable origin and
shallow history. Existing requested-task CLI suite passes 8/8; compiler,
syntax, whitespace, token audit, migration lint and deploy-trigger checks
pass. Scope checker declares no owns and therefore performs no comparison;
manual diff contains only the CLI, new test and this packet Status. The
broader scripts suite is still running and has a separate 400-commit
classification-fixture timeout; no full-suite PASS or deployment is claimed.
Required CI, current-main integration and released-CLI live read remain.
