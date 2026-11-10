# PROCESS-provenance-loader-bounds

## 1. Goal and measured blocker

Restore truthful provenance loading in both actual picker and review-gate paths.
On main `f1adbc2a64c3db26996f2fbda4528c0020903074`, the trusted registry is
1,620,441 bytes. Both `scripts/next-task.mjs:51` and
`scripts/review-gate.mjs:39` use execFileSync with its default output buffer.
Reading that actual registry through either wrapper fails ENOBUFS/SIGTERM;
the nullable adapters then report unreadable/invalid registry. A pure resolver
harness with a larger Git output limit succeeds, which does not prove that
production loaders work. Review-gate's separate 64MiB source-file helpers at
128/184 do not cover its trusted registry loader at282.

The separately admitted GLM test source and receipts must be preserved. This
support defect blocks privacy-copy follow-through; it is not permission to
compress, erase, rewrite or relabel evidence. The customer privacy copy remains
unshipped and prep completion remains held until real loader composition works.

## 2. Registration, tier and ownership

One new append-only row: `PROCESS-provenance-loader-bounds`, Tier 2, lane
`provenance-loader`, branch `agent/queue/process-provenance-loader-bounds`.
No dependency or FIFO reorder. The previous PROCESS-model-provenance outcome
is not reopened or reused as a claim. Existing tooling precedents classify
picker/gate infrastructure as Tier 2; independent assessment must judge this
bounded classification, not accept it just because the packet says so.

Current shared paths are held in the registry by PICKER-fullstack-lights,
PICKER-qa-stage and REVIEW-GATE-fetch-parity. Their ownership, contributions and
unpublished work remain. This row declares no owns rather than falsely taking
exclusive ownership or manufacturing a dependency. This is an exact manual
allowlist, not an automated scope PASS. Check actual current claims/carriers
and coordinate the two wrapper hunks before editing or integrating. Isolate
work, preserve every contribution, and resolve ambiguous overlap through
Instinct. Do not assume silence is consent. No other task is automatically
unblocked, bypassed or marked done by registration.

## 3. Required behavior and limits

Both actual provenance consumers must load identical trusted-main evidence
successfully at the supported aggregate size, including the measured registry
and a deterministic valid fixture above1MiB. Use one shared bounded Git output
reader/limit so the two paths cannot silently diverge. A finite aggregate bound
must be named, justified and documented; existing 64MiB source-reader precedent
is evidence to consider, not an instruction to blindly allocate unbounded data.
The per-artifact16MiB schema limit does not imply an unlimited aggregate registry.

Reads above the chosen bound, malformed/truncated content, unreadable Git
objects, missing trusted main and process failures must remain explicit failures
with no truncated success, stale fallback, candidate-local substitution, legacy
fallback, review pass or silent internal-error approval. Preserve existing
origin/main trust, operator/model separation, full contribution resolution,
exact-head binding, review independence, source receipt/history and all checks.
Do not change the evidence schema, add new trust or weaken a gate to fix output
transport. Keep unrelated Git behavior and environment/stdio/trim semantics.

## 4. Exact implementation allowlist

- @scripts/next-task.mjs: only wire the existing Git read wrapper to the shared
  bounded reader, preserving CLI, claim/avoid/role/holder/FIFO behavior.
- @scripts/review-gate.mjs: the same wrapper wiring and related error handling
  only; preserve review classification, protected checks and existing helpers.
- @scripts/provenanceGitOutput.mjs: NEW bounded Git output transport helper,
  no policy, network, claim, registry editing or trust decisions.
- @scripts/provenanceGitOutput.test.ts: NEW deterministic real-Git regression
  exercising actual production loader integration, not just a pure fixture.
- @docs/MODEL_PROVENANCE.md: only document supported aggregate output bound,
  error behavior and the distinction between real loaders and pure resolver.
- This packet's `## Status` section: actual evidence and outcome only.

No model-provenance.json edits, receipt modifications, existing tests weakened,
workflow/config/protection change, dependency, environment key, new service,
product file, customer data, schema/migration, legal/money/auth policy or paid
route. Do not change scope-check, queue ordering, model aliases or ownership.
If inspection needs another exact path, report the measured reason for scope
review before writing it, not a broad discover-and-edit expansion.

## 5. Execution and provenance sequence

Use the ordinary current-main picker and actual session identity. Registration
alone does not force this row ahead of earlier eligible work. If the picker
proposes unsupported or held work, ground a narrow session constraint using
its supported avoid semantics, never manufacture a target claim or blanket
avoid list. Current main CI/red safety and active landing slot still apply.

Before external implementation, independently qualify fresh exact-task free
routes under MODEL_PROVENANCE and normally admit them. Existing privacy-prep,
Messages or old PROCESS routes/receipts cannot qualify this task. Retain actual
selected author, exact input/output, applied byte range and all real contributions.
The broken current loader may itself prevent a new ordinary external-route
claim. Resolve that exact bootstrap path before authoring: new candidate
routes alone are not a working claim. Do not patch a local CLI and let it
self-qualify its own external execution, impersonate a legacy model, fabricate
manual markers or bypass the broken trusted read. Any available ordinary
nonexternal development route must have genuinely established author identity
and applicable authority, not a relabeled external model. If no supported
route exists, report this precise execution blocker while continuing bounded
registration/research; this packet grants no bootstrap exception.

Unknown identity stays held; no self-admission, hidden operator semantic edits,
cosmetic rewrite or history replacement. Any actual source repair needs its
real author/fixer attribution. Separate final exact review and execution receipt
admission remain required before supported completion markers.

## 6. Red-first verification

1. Write the focused real-Git regression first. On unchanged production code,
   reproduce the output cap through BOTH actual wrapper/loadTrustedProvenance
   integration paths. The expected failure is the measured ENOBUFS/unreadable
   registry boundary, not import/setup/auth/network failure.
2. Create isolated local Git fixture repos with origin/main registry commits,
   valid routes/receipts and content above1MiB. Do not push fake live markers.
   Read using the production paths, not test-injected larger-buffer wrappers.
   A parser-only or separately enlarged harness is not loader acceptance.
3. After repair, both actual paths must load the exact complete fixture and
   measured public registry bytes/digests and preserve contributor resolution.
   Assert the production scripts actually use the helper, not an unused helper
   that passes while the old wrappers remain. Preserve nonmutating behavior.
4. Negative controls cover missing trusted object/ref, malformed JSON, truncated
   read, process failure and over-bound output; none may become a pass, an empty
   valid registry or legacy fallback. Preserve wrong-model/task/head and unknown
   contributor rejection. Existing suites remain unchanged and pass.
5. Run focused tests, all scripts suites, assignment validation, decision and
   deploy contract checks, pnpm check and applicable full gate. Record exact
   failures; OOM/timeouts are not PASS. Validate final current-main composition,
   independent exact review and required exact-head green CI before ordinary
   protected non-packet-writer landing. No admin bypass or check skipping.
6. After normal merge, verify main CI, then actual released nonmutating loader/
   picker/gate fixture behavior and the existing privacy prep composition with
   its unchanged real source/receipt. New source data must not be rewritten to
   fit the tooling. Pure resolver success alone is not completion. This is
   tooling acceptance, not a shipped customer privacy fix or live provider QA.

## Status

PROCESS-provenance-loader-bounds: in progress — Qoder · 5f11 — 2026-11-10 — branch agent/queue/process-provenance-loader-bounds

Implementation evidence (local, branch `agent/queue/process-provenance-loader-bounds`, base main `92fc6ebc`):

- Measured red on unchanged code, real repo: `docs/model-provenance.json` is 1,620,441 bytes; the picker adapter returns `invalid provenance registry` and the gate's own read throws `ENOBUFS` (raw script output captured). Registry is genuinely populated: 5 routes, 3 executions.
- `scripts/provenanceGitOutput.test.ts` red-first: 4 of 7 failed on the pre-fix wrappers (wiring pins, `>1MiB` picker loader, gate CLI, unreadable-registry control) and all 7 pass with the wiring. Mutation proof: reverting only the two wrapper hunks turns 3 back red, the two CLI cases failing with `invalid provenance registry`; restoring returns 7/7.
- Both real CLIs keep behaving: the picker prints `NEXT: CONTINUE: LAND T` from the oversized fixture (contributor resolution intact) and `review-gate.mjs` prints "has an independent passing review"; a tampered observation still holds.
- Bound: one shared `TRUSTED_GIT_OUTPUT_MAX_BYTES = 64 MiB` reader, documented in `docs/MODEL_PROVENANCE.md`; over-bound output still throws `ENOBUFS`, and missing/malformed/unreadable sources keep their explicit errors.
- Gate on this branch merged with current main: `pnpm check` 0, design-token audit OK, migrations lint 0, deploy triggers OK, `pnpm build` 0. Full suite 6684 passed / 5 failed, all five in files this change does not touch (`classifyCiChange` 400-commit timeout; four `startGoal.test.tsx` element lookups); `classifyCiChange` passes alone with a longer timeout and `startGoal.test.tsx` passes alone 7/7, so they are this host's load flakes, not regressions.

Nothing external was claimed for this row; it is ordinary tooling work under D-311, which the new mechanism does not authorize to merge itself.

Registration candidate from mainf1adbc, November10,2026. Both default-buffer
failures independently reproduced. No implementation, external prompt, route,
claim, source fix, execution receipt, verdict, completion or deployment is
asserted. Supervisor retains implementation/testing/independent review and
normal nonwriter landing follow-through; packet writer supplies docs only.
The original privacy outcome remains active and unshipped.
