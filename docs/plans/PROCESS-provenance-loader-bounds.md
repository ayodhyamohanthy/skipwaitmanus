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
registration/research; the original registration granted no bootstrap exception. D-312 now supplies
only the owner-approved one-task automated-claim exception, subject to section
5a below. It does not establish any missing execution fact.

Unknown identity stays held; no self-admission, hidden operator semantic edits,
cosmetic rewrite or history replacement. Any actual source repair needs its
real author/fixer attribution. Separate final exact review and execution receipt
admission remain required before supported completion markers.

## 5a. D-312 pre-dispatch binding and landing review

The complete owner proposal at 12:30:24 IST and its actual owner-added like at
15:27:23 IST are recorded in D-312. Only the automated task claim for this
registered loader repair is excepted. No code generation has been requested
under this record. This section must be complete and independently reviewed
before source dispatch; open fields below are blockers, not implied approvals.

### Binding record (not yet execution-ready)

- Task: `PROCESS-provenance-loader-bounds`, existing Tier 2, existing six-path
  implementation allowlist in section 4; no new or renamed row.
- Approval-record starting base: `03bb0ff8a72be6c6d73f47e312dc4f8cdfad25a0`.
  It includes the actual pagination merge; do not use the older wrapper/core
  context as an execution base. Public prebinding snapshot assembled from that base: 125,131 bytes,
  SHA-256 `cf174693f25bc32eff4c62b0a67ca955c6256675b78c9df619b43746daea7b65`.
  It includes actual consumers/resolver, current provenance and pagination
  tests, packet/model contract, config and package context. This is NOT the
  final prompt digest. After admitted binding is included, retain the final
  supplied bytes/digest immediately before generation; do not claim a
  circular digest of the yet-to-be-committed carrier.
- Actual operator/session: `Instinct · public-model-review-nov10`, separately
  attributed transport/testing coordinator, not the code author.
- Actual coding author selection: Macaly public selector explicitly reselected
  `GLM 5.3` on November 10 at 15:30:48 IST, before source dispatch. Provider
  https://www.macaly.com/ ; existing author session
  https://www.macaly.com/chat/ntir2jti8lu3np3l0bvabmzb?variant=ntir2jti8lu3np3l0bvabmzb .
  Conservative canonical family `glm-5.3` retains GLM/Flash alias exclusion;
  this does not assert an unobserved served checkpoint. Selection screenshot was inspected and shows `GLM 5.3`; its PNG SHA-256 is
  `7c85df042ff75a1ac82897e260e44efcc835f869454282c7e87ab3ee4082e2c8`.
  Actual independent binding assessment remains pending. Existing privacy
  work is not this execution.
- Free route: supervisor inspected current Macaly billing at 15:30:16 IST:
  account is on Free; adding capacity requires purchasing a plan. Stop at
  capacity, any paid requirement or possible card charge; no top-ups, upgrade
  or payment. The exact private allowance/account identifier is not published.
  This observed account state and hard stop must remain valid at dispatch.
- Ownership: current live exact fullstack-lights/QA/fetch-parity branch
  queries returned no branches. Their rows and ownership remain; absence is
  not an ACK or proof of no unpublished work. Preserve histories and isolate
  the two wrapper hunks; shared-hunk composition still requires review.
- FIFO: actual supported nonmutating previews on current base at 15:35:40
  offered own prep CONTINUE after only `--avoid D-090-BYOR` (unknown real
  contributors, outside this exception). That prep's completion is actually
  blocked by the confirmed production loader defect. Adding only
  `--avoid UI-referrer-privacy-copy-tests` then offered BUILD
  `PROCESS-provenance-loader-bounds`. No claim, target override or blanket
  avoid was used. This is ordinary eligibility, not a priority exception.
  Rerun fresh after binding admission/main movement; retain exact outputs.
- Source branch: `agent/queue/process-provenance-loader-bounds`, absent at the
  supervisor's prebinding check. Start it from the admitted, independently
  reviewed binding on current main; no ordinary claim marker is asserted.
- Source transport: only public repository input, the exact section 4 scope
  and required tests. Retain final supplied bytes/digest, exact raw generated
  output, byte-for-byte patch application, every actual author/fixer range,
  RED/GREEN output and all independent findings/revisions in the repair PR.
  The operator does not write semantic source or silently repair output.
  No private transcripts, secrets or hidden metadata in the public repo.
- Replacement claim binding: D-312 plus this independently reviewed task,
  operator, observed author/model/provider/session, current-base/scope/branch
  and free-hard-stop record replaces only this broken automated task claim.
  Do NOT create normal Claim/provenance/execution markers or normal D-311
  receipts with invented claim linkage. Later code needs its own actual
  manual attribution and exact evidence, not this pre-execution record alone.
- Independent binding/mechanics assessment: PENDING exact carrier SHA and
  actual independent model verdict/source, required before generation.
- Proposed unchanged-check path, subject to actual independent assessment:
  the exact registered Tier 2 source branch is admitted by queue-gate;
  `reviewGateViolation` on base03bb returns for declared/computed non-Tier1
  before provenance resolution. Such a return is NOT identity certification.
  The row's no-owns scope result is SKIPPED, not a scope PASS, so the actual
  six-path/hunk diff and ownership composition need explicit manual review.
  No gate edits, fabricated claim or data compression are permitted.
- Implementation review: genuine independent DeepSeek exact-source/manual
  attribution/current-main assessment, excluding the actual GLM author and
  any real fixer. Record the actual model and complete verdict, not a made-up
  pass marker. Reviewer identity/availability still needs fresh execution
  evidence at that stage. Final required tests/CI must pass on the exact head.
- Proposed protected nonwriter landing/slot mechanics, for independent
  assessment: after current-main and exact-head CI plus actual independent
  final review, verify the landing slot is free, record an honest empty
  task/operator-only Land claim as in prior nonwriter documentation admissions,
  and normally protected-merge the registered Tier 2 branch. This is NOT a
  BUILD claim, D-311 qualifier or identity certification. Supported --landed
  after an explicit landing-ref fetch was proved earlier today. Current slot
  was empty with Landed f32a29e3; revalidate it at landing. The proposed loader-specific
  slot procedure still needs actual independent assessment; no
  fabricated verdict, admin bypass or unchanged-gate skip is approved.
- After actual merge: settle main CI and slot via their supported operations,
  prove both released production loaders and unchanged original prep D-311
  receipt composition, then resume ordinary protocol. Do not call --fixed or
  complete unless genuine existing markers support it. Record this one-task
  manual exception's actual outcome explicitly, without a counterfeit marker.

This is not a new schema or runtime gate exception. If the proposed replacement
binding cannot work through the remaining unchanged checks, report that precise
conflict for review before authoring. Do not broaden the founder's approval to
skip CI, review, scope, independence, protections, history or any other rule.

After actual source output, preserve input/output/observation bytes and digests,
actual author/fixer identities and ranges, test failures and revisions. Obtain
actual independent exact-final-version implementation review, required exact
CI and current-main validation before normal protected landing. Neither this
approval record nor a candidate repaired loader may approve its own code.
The one-task exception ends with acceptance or explicit abandonment of this
repair; it never becomes a reusable route for other work.

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

Registration candidate from mainf1adbc, November10,2026. Both default-buffer
failures independently reproduced. No implementation, external prompt, route,
claim, source fix, execution receipt, verdict, completion or deployment is
asserted. Supervisor retains implementation/testing/independent review and
normal nonwriter landing follow-through; packet writer supplies docs only.
The original privacy outcome remains active and unshipped.

D-312 approval-record preparation, November 10 at 15:28 IST: actual approval
recovered. Binding facts and supported mechanics above are unresolved; no
source dispatch, claim, implementation readiness or customer completion.
