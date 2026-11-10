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

PICKER-authoritative-ref-refresh: registration candidate only; no source
claim, source dispatch, independently rerun fixture PASS or runtime fix.
