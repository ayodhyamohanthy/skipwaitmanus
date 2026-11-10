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

Routing registration amendment, November 10 at 17:47 IST: the actual holder offered the reference-only alternative in [PR1114 comment6765718585](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1114#issuecomment-6765718585), now accepted. Preserve PR1114 head `a14385f0a1b90c9433dfdf86fe7417b2244b4229`, plain claim77b9962d, active heartbeatbc7597, all old refs/history and unpublished work (UNKNOWN), unmerged and without author certification. This docs registration is subject to separate exact-head review and changes ONLY this existing row's branch to `agent/queue/process-provenance-loader-bounds-glm-nov10-isolated`; it must land on main before a code PR. It implements the accepted reference-only handoff under routine registration/coordination authority, not a D-312 expansion or source allowlist change. The old branch and derived `agent/review/process-provenance-loader-bounds`, `agent/architect/process-provenance-loader-bounds` and `agent/heartbeat/process-provenance-loader-bounds` remain physically preserved but intentionally cease mapping to this row; new derived refs use the `process-provenance-loader-bounds-glm-nov10-isolated` slug. No old ref is deleted, reset, reclaimed or impersonated. Fresh work starts from verified current main (registration base `93b27c59e52324f377037951fe0b8b8dd29967fc`, recheck at binding/admission), not a14385f0: this is a second authoring effort, NOT ancestry continuation or an abandoned-build exception, and no new receipt covers the preserved contribution. The new author receives current-main requirements, measured defect and review findings, never the unknown source patch to reissue as its own; retain exact supplied input proving that exclusion. The fresh GLM route uses its own complete, independently admitted D-312 pre-dispatch binding, NOT an ordinary nonexternal claim or a fabricated qualified marker through the broken loader. The reference-only hold has no dispatch or landing. Earlier branch/base/selection/free snapshots below are historical: fresh actual selection/free-generation capability and hard stop, base, final input bytes/digest, FIFO, shared-hunk composition, unchanged gate/landing mechanics and actual binding assessment remain supervisor-owned prerequisites before generation. The supervisor observed explicit Macaly GLM 5.3 selection at17:35:12 and Free/purchase-required billing at17:36:23 in the existing author session; those snapshots do not prove future free generation. This paragraph proposes no source permission or author clearance; independent final review, exact tests/CI, protected landing and every other rule remain unchanged.

### Binding record (not yet execution-ready)

- Task: `PROCESS-provenance-loader-bounds`, existing Tier 2, existing six-path
  implementation allowlist in section 4; no new or renamed row.
- Approval-record starting base: `03bb0ff8a72be6c6d73f47e312dc4f8cdfad25a0`.
  Fresh current-main composition base: `92fc6ebc2313a93a6ac5623c4a319de79102129e`.
  Its intervening PR1112 changes only prep packet/inert test source, not the
  two production wrappers; preserve that separately merged history.
  It includes the actual pagination merge; do not use the older wrapper/core
  context as an execution base. Historical03bb prebinding snapshot: 125,131 bytes,
  SHA-256 `cf174693f25bc32eff4c62b0a67ca955c6256675b78c9df619b43746daea7b65`.
  It includes actual consumers/resolver, current provenance and pagination
  tests, packet/model contract, config and package context. This is NOT the
  final prompt digest. After admitted binding is included, retain the final
  supplied bytes/digest immediately before generation; do not claim a
  circular digest of the yet-to-be-committed carrier. Final input must be
  reassembled from current92fc including its merged prep and admitted binding.
- Actual operator/session: `Instinct · public-model-review-nov10`, separately
  attributed transport/testing coordinator, not the code author.
- Actual coding author selection: Macaly public selector explicitly reselected
  `GLM 5.3` on November 10 at 15:30:48 IST, before source dispatch. Provider
  https://www.macaly.com/ ; existing author session
  https://www.macaly.com/chat/ntir2jti8lu3np3l0bvabmzb?variant=ntir2jti8lu3np3l0bvabmzb .
  Conservative canonical family `glm-5.3` retains GLM/Flash alias exclusion;
  this does not assert an unobserved served checkpoint. Selection screenshot was inspected and shows `GLM 5.3`; its PNG SHA-256 is
  `7c85df042ff75a1ac82897e260e44efcc835f869454282c7e87ab3ee4082e2c8`.
  The c9d63 record received an actual independent PASS; final exact carrier
  assessment remains pending. Existing privacy work is not this execution.
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
  Main has since moved to92fc6ebc; rerun fresh after binding admission/main
  movement and account for its actual merged prep, retaining exact outputs.
- HISTORICAL reference-only source branch (not the fresh execution route):
  `agent/queue/process-provenance-loader-bounds`. Prior absence
  is historical: at15:45:28 IST another actual session created empty Claim
  `77b9962d2f2f858ac6a1db2f005e792e54bfe79c`, Qoder · 5f11, parent92fc6ebc.
  Its real model, source and unpublished work are unresolved. Preserve that
  claim/history; no overwrite, reclaim or duplicate claim ON THIS PRESERVED
  BRANCH. The fresh isolated GLM route needs its own complete binding. The
  named GLM record is NOT this holder's identity or execution. Holder
  coordination for the reference-only handoff is satisfied by the accepted
  offer above, not author qualification or source composition; do not relabel
  the real claim or treat its unknown author as qualified.
  A plain Qoder Claim can work; the broken loader blocks the provenance-qualified
  external claim path, not every plain marker. This existing plain marker does
  not establish actual-author validity or settle the provenance-qualified route.
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
- Actual independent DeepSeek assessment: PASS for the binding record as
  written at `c9d63bdf149af5ee6a706472d3e5c805a4618c77`, base03bb0ff8,
  NOT dispatch readiness. Source
  https://www.macaly.com/chat/kowmhfs2ijn30ip2sace3744?variant=kowmhfs2ijn30ip2sace3744 .
  The actual verdict requires final supplied bytes/digest, free-route and
  fresh-FIFO rechecks, explicit six-path/two-wrapper manual owner composition,
  exact unchanged non-Tier1 early-return proof, and an actual supported Land
  path under the broken loader before generation. This later status record
  is not a claim that the reviewer already assessed its own added text;
  final exact carrier review remains required. No source generation yet.
- Actual unchanged-check proof plus required final assessment:
  the exact registered Tier 2 source branch is admitted by queue-gate;
  `reviewGateViolation` on base03bb returns for declared/computed non-Tier1
  before provenance resolution. Such a return is NOT identity certification.
  The row's no-owns scope result is SKIPPED, not a scope PASS, so the actual
  six-path/hunk diff and ownership composition need explicit manual review.
  Supervisor ran an isolated local Git fixture of exactc9d63 with the real
  oversized registry: actual Git read still failed ENOBUFS/SIGTERM. The exact
  six implementation paths computed Tier2 and reviewGateViolation returned
  null with provenanceAccessed:false. This is technical control evidence,
  not model certification or production source/claim. No gate edits,
  fabricated claim or data compression are permitted.
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
  slot procedure now has an actual isolated-local-Git proof under the SAME
  ENOBUFS condition: correctly formatted task/operator-only Land claim,
  actual unchanged supported --landed exit0, then readback Landed. An initial
  wrong-format synthetic marker failed exit1 and remains a FAILED probe;
  correction used the actual markerSubject format, not a runtime edit.
  No production marker was created by that fixture. This establishes command
  mechanics, not future live free-slot ownership, final review or CI. Final
  independent assessment still required; no fabricated verdict, admin bypass
  or gate skip is approved.
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


Final exact author-input snapshot assembled20:58 before this digest note: 269391 bytes, SHA-256 `21600dd8fe40b286189b5d5afc23cc7fbe55db2cbfccfe51d720fecc9450a049`, current-main `07ceca64a2350d9870e1e8f5158b6898eb983f6e`, packet snapshot from branch `b3c0c6991ba23bc5bd81701a42b619adf4fd4e74`. Fourteen named public blobs and task instruction retained in full with per-blob exclusion manifest; PR1114 source patch and private context excluded. The snapshot is non-circular: it does not include this later digest note. Not dispatched; actual supported FIFO and independent admission remain pending. GLM actual source author / DeepSeek actual independent reviewer will be recorded separately from operator. This note creates no automated provenance claim or self-authorization.

### Current bounded continuation amendment, November 10 at 20:48 IST

No source has been generated. This amendment supersedes the LOCAL 19:18 proposed holder-ACK/no-takeover path, not any founder rule or source-admission requirement.

The user's authenticated 20:45 instruction was to fix the stalled repair. The supported picker at current main db0a56698eb5e139e28c64c87ccc12a8ac33936b offered TAKEOVER on the same mapped branch after the real holder's two-hour quiet period. The operator used that supported action, not a manually fabricated marker: empty Takeover 0a4b137481878b16cd1b2cb2d6f709f8442578b8, parent 12b05e03d33d270193850f9fedc76ff229567df1, identical tree. Actual operator is Instinct · public-model-review-nov10. This is a transport/coordination takeover, NOT an external GLM coding claim, source qualification or retrospective author certification. No external provenance claim linkage was asserted.

Normal merge f0a02b79556dfb02172645e7fdbeffaa3664374f joins then-current main db0a5669 into that same branch and was pushed normally. 379e0fd6 and 12b05e03 remain ancestors, with all commits and refs preserved. Their actual contribution is empty Claim plus packet Status only. No semantic code exists in this mapped branch. The old PR1114/source/history remains reference-only, unmerged, uncertified and excluded from the new source input. Actual d1a4 underlying model and unpublished work remain UNKNOWN. No absence or elapsed time proves their identity, consent or no unpublished work. The supported takeover establishes only the current branch operator under the existing quiet-holder mechanism; no response is newly required solely for that operation. Any returning work must be preserved and compared before composition, never overwritten.

There is no longer a proposed d1a4 transport role to accept: the actual operator above performs transport/testing and normal main composition. The previous candidate's mandatory ACK/main-join fields are superseded by these actual operations, not marked answered. Its phrase "before merge" denotes the final protected landing, not a normal main-into-work-branch transport merge; this amendment states that distinction explicitly, and no final landing has occurred. Unknown d1a4 attribution remains explicit. Its empty claim and Status-only contribution is not GLM semantic source. Before final landing, the full contribution audit must confirm that unchanged classification. If any real semantic source/fixer contribution emerges, hold its admission until its actual model is established and final review excludes that actual model. No unknown semantic contribution can be certified through takeover.

The complete D-312 manual pre-dispatch binding still applies: exact task/six paths/operator/observed actual GLM author and free route/current base/final exact input must be documented and independently assessed before generation. The operator never supplies semantic code or silent fixes. A second automated GLM Claim is neither required nor invented. Actual final independent source review, real RED/GREEN tests, exact required green CI against current main, legitimate free landing slot and normal protected merge remain. The old slot/1117 history issue is not an extra generation gate. No spending, identity invention, test weakening, source-history rewrite, policy bypass or privacy implementation is allowed.

Current six-path source and wrapper composition: c30d9b65 to db0a5669 changes none of the six implementation paths. The exact changed-file list is retained below. The operator's normal merge adds no runtime code beyond current main; its branch-only delta remains the preserved d1a4 packet Status lines. Current exact fullstack-lights/QA/fetch-parity ref queries returned no matching refs, which is NOT an ACK or proof of no unpublished work. Both wrapper hunks must be isolated and manually assessed against current main and all known contributions. No-owns automated SKIPPED remains not a scope PASS.

Pending dispatch facts: freshly verify actual GLM selection and usable Free capacity/hard stop, assemble and retain final exact public input bytes/digest and exclusion manifest from current main plus this amended binding, and obtain genuine independent assessment of this bounded continuation change. Do not regenerate generic historical binding reviews. Source dispatch remains held until those concrete checks are complete. After source acceptance, verify both real released loaders and original privacy-prep composition, then resume privacy work. Nothing is shipped or marked complete by this amendment.

### Retained support for this continuation

commit f0a02b79556dfb02172645e7fdbeffaa3664374f
Merge: 0a4b1374 db0a5669
Author:     Instinct Agent <agent@instinct.com>
AuthorDate: Tue Nov 10 20:47:34 2026 +0530
Commit:     Instinct Agent <agent@instinct.com>
CommitDate: Tue Nov 10 20:47:34 2026 +0530

    Merge remote-tracking branch 'origin/main' into agent/queue/process-provenance-loader-bounds-glm-nov10-isolated

12b05e03d33d270193850f9fedc76ff229567df1 2026-11-10T12:54:28+00:00 PROCESS-provenance-loader-bounds: record automated claim d1a4 and open 5a dispatch blockers

Actual supported picker output:
 · CTO · Tier 2 · done · done
268. DEPLOY-gate-docs-sync — Sync deployment and manual recovery docs to verified green gate behavior (#748) · CTO · Tier 3 · not started · waiting
269. PICKER-heartbeat-slot-safety — Renew an owned landing lease without taking another fresh landing slot · CTO · Tier 2 · done · done
270. PICKER-landed-marker-continuity — Keep merged work landed through marker-only branch recreation · CTO · Tier 2 · done · done
271. PICKER-landing-wait-fallthrough — Offer eligible disjoint work before returning a landing-slot wait · CTO · Tier 2 · done · done
272. SUPPORT-A — Kit /support page promises only what works today: remove the unbacked person, response-time, triage, pause and notification promises (D-153) · CTO · Tier 2 · done · done
273. CONV-report-entry — Seeker conversation "Report or block" link carries the ask only when it is accepted (R-B-min, seeker side) · CTO · Tier 1 · done · done
274. GATE-migration-cleanup — After the drift reference database exists, an S1/S2 snapshot or step-summary failure still attempts its cleanup, the primary is never dropped, and a failed cleanup no longer hides a FAILED verdict (D-212, D-283) · CTO · Tier 2 · done · done
275. PICKER-gate-red-review-route — A Tier 1 head whose only red is the review gate is handed its REVIEW stage, so the D-254 deadlock stops re-forming on every new Tier 1 pull request (D-286) · CTO · Tier 2 · done · done
276. REVIEW-GATE-fetch-parity — The named CI step "Review gate (independent Tier 1 pass)" fetches origin/main (and keeps fetching the review lock) so it evaluates instead of failing open, and a review-only red fails at that step for the D-286/D-291 picker classifier (D-292) · CTO · Tier 2 · done · done
277. PICKER-land-exact-head — The picker hands LAND only when a green required-checks CI run is on the pull request's current tip: a green run on an older sha, no run on the tip, or an unreadable tip gets no LAND (D-293) · CTO · Tier 2 · done · done
278. PICKER-architect-review-route — A Tier 1 row's packet pull request whose only red is the review gate is handed its REVIEW by the picker, so a Tier 1 packet can reach the independent pass D-074 (3) and D-190 (3) require (D-294) · CTO · Tier 2 · done · done
279. PROCESS-session-continuation-docs — Record automatic next eligible session continuation without changing safety gates · CTO · Tier 1 · done · done
280. PICKER-packet-pass-red-recovery — A passed Tier1 packet red only at review gate returns to qualified REVIEW after quiet, instead of rerun-only NONE (D-307) · CTO · Tier 2 · done · done
281. PICKER-ordinary-gate-red-recovery — Stop ordinary Tier1 passed gate-only-red from zero-delta FIX reclaim loop · CTO · Tier 2 · done · done
282. PICKER-parallel-eligibility — Prove independent claimed-red parallel eligibility and remove false global WAIT instructions (D-309) · CTO · Tier 2 · done · done
283. D-048-GoalEmails-nouns — Ship remaining live GoalEmails local referral nouns independently of broader R7 prep · CTO · Tier 2 · done · done
284. D-048-R7-prep — Prepare existing R7 public release: current drift, policy text equality, goal QA and proof without flag activation · CDO · Tier 2 · done · done
285. D-180-referral-copy-prep — Prepare referral-only shared and email-gallery wording without changing money behavior · CTO · Tier 1 · done · done
286. DEV-prettier-396 — Qualify existing Prettier 3.9.6 dev-only update without unrelated lock changes · CTO · Tier 2 · done · done
287. PICKER-open-pr-pagination — The picker reads every open pull request page by page, so a completed row is handed its review instead of a takeover · CTO · Tier 2 · done · done
288. PROCESS-model-provenance — Represent actual external coding and review models separately from their operator · CTO · Tier 2 · done · done
289. UI-messages-signin-button — One non-nested sign-in button on the released signed-out messages screen · CTO · Tier 1 · done · done
290. UI-referrer-privacy-copy-tests — Prepare complete inert regression source and actual scratch RED proof for referrer privacy copy · CTO · Tier 3 · done · done
291. PROCESS-provenance-loader-bounds — Both production provenance loaders read supported registry output above1MiB without losing failclosed checks · CTO · Tier 2 · RED · quiet · unblocking: Instinct · public-model-review-nov10 · Dev (Skydive) · d1a4 · quiet 2h · report: review — Instinct · public-model-review-nov10: D-313 reference-only/bootstrap disposition is recorded on main; PR1114 stays preserved, unmerged and uncertified. Existing d1a4 claim/history retained, no new source claim. Loader defect remains unfixed; complete independent D-312 binding, holder ACK/no competing semantics, current-base/FIFO/composition/free/input checks remain pending. This is coordination review only, not green, fixed, source qualification or generation clearance.

LOCAL WORK ORIGIN CANNOT SEE (D-085):
- your main checkout is 113 commits behind origin/main: git pull --ff-only before reading any doc

Newest decisions (read before you work):
- D-313 · 2026-11-10 · PROCESS-provenance-loader-bounds: §5a gates every source dispatch on this row, so the plain-Qoder dispatch is unbound and cannot be certified — PR #1114 stays r
- D-312 · 2026-11-10 · One-task automated-claim exception for the broken provenance file loader (owner approved).
- D-311 · 2026-11-10 · Truthful external coding-model and review provenance, separate from its operator (owner approved).
- D-310 · 2026-11-09 · The D-180-referral-copy-prep block clears: the bounded correction the report asked for is already recorded on main, so the row returns to BUILD under the amende
- D-309 · 2026-11-09 · Parallel development, coordinator-owned integration.
If any of these changes what your task says, stop and run `node scripts/next-task.mjs --report blocked "PROCESS-provenance-loader-bounds: conflicts with D-nnn"` (D-032). A newer decision always beats an older packet, note or chat message.

NEXT: TAKE OVER PROCESS-provenance-loader-bounds — Both production provenance loaders read supported registry output above1MiB without losing failclosed checks
Half-built and quiet: nobody has pushed to agent/queue/process-provenance-loader-bounds-glm-nov10-isolated since 2026-11-10T12:54:28.000Z (queue rule 2, D-085; started by Dev (Skydive) · d1a4).
Continue on the same branch and keep every commit on it. Note the takeover in its line in the Status section of docs/plans/PROCESS-provenance-loader-bounds.md ("PROCESS-provenance-loader-bounds: ..."; the §3b row "PROCESS" is shared by several tasks, so never edit it).
1. Work in your own worktree, never by switching branches in a shared checkout: git fetch origin && git worktree add ../skipwaitmanus-wt/process-provenance-loader-bounds-glm-nov10-isolated agent/queue/process-provenance-loader-bounds-glm-nov10-isolated (if it already exists, use it). Then run `pnpm install --frozen-lockfile` before your first `pnpm check`: a fresh worktree has no packages, and missing ones fail as TS2688/TS5101 or 'vitest not found' (REGISTER-520, Oct 24). It installs only the versions pinned in pnpm-lock.yaml, so it is always allowed, whatever your session says about installing (D-200 (5)).
2. See where it stopped before touching anything: its line in the Status section of docs/plans/PROCESS-provenance-loader-bounds.md ("PROCESS-provenance-loader-bounds: ..."; the §3b row "PROCESS" is shared by several tasks, so never edit it), `git log --oneline origin/main..origin/agent/queue/process-provenance-loader-bounds-glm-nov10-isolated`, and any uncommitted changes in your worktree. Read docs/BRIEF.md and docs/plans/PROCESS-provenance-loader-bounds.md.
3. Follow docs/DELEGATION.md §4 steps 4-8 exactly: the packet's tests first (they must fail for its reason), one step per commit, only the packet's files, then the full gate on your branch merged with the latest origin/main.
4. Push your branch after every commit. Before any step that may take over an hour without a commit (the full gate, a long test run), run `node scripts/next-task.mjs --heartbeat --as "Instinct · public-model-review-nov10"`: a claim nobody has pushed to for 2 hours is handed to the next agent (D-085). Before you stop for any reason, commit (a WIP commit is fine) and push.
5. Run `node scripts/scope-check.mjs <id>` before you push: it reads the task's declared `owns` from origin/main and fails on any change outside them (PICKER-owns-scope). Probe every other open branch of the same goal for conflicts: `git merge-tree $(git merge-base origin/main origin/<a>) origin/<a> origin/<b> | grep -c '^+<<<<<<<'` must print 0. Land under D-082: push the branch, open a pull request, and wait until every check on that exact commit is green and main's own CI is green. Then fast-forward main to that exact commit (`git push origin <sha>:main`; GitHub's "Create a merge commit" button is also safe, because the ruleset only lets an up-to-date branch merge, but never squash or rebase-merge: they replace the tested commits, D-134 (6)). If that push is refused because main moved, merge the latest origin/main into your branch, re-run the full gate, push, wait until every check on the new commit is green and fast-forward again; never force-push. Watch main's CI and both deploys to the end and run the live check from docs/BRIEF.md "How to ship". If anything goes red, revert or fix your commit before anything else. In that same pull request set this task's "status" to "done" in docs/plans/assignments.json and its line in the Status section of docs/plans/PROCESS-provenance-loader-bounds.md ("PROCESS-provenance-loader-bounds: ..."; the §3b row "PROCESS" is shared by several tasks, so never edit it) to "done — <sha>".
6. If anything is unclear, a test fails for a reason the packet does not give, or the call is the owner's: stop, write the question in your status line (your §3b row, or your line in the packet's Status section when the row is shared), push the branch and ask the owner. Never guess about money, sign-in, identity or privacy.
7. When you stop, land, open a pull request or get blocked, report to the CEO: `node scripts/next-task.mjs --report <green|red|blocked|review|landed> --task PROCESS-provenance-loader-bounds --as "Instinct · public-model-review-nov10" --note "<one line: what is green, what is not, what you need; no secrets or personal data>"` (D-085). If you cannot take a task for a reason of your own session (an instruction not to touch it, a tool or permission you lack), never report it blocked: that holds it for every agent. Run this picker again with `--avoid PROCESS-provenance-loader-bounds` added instead, and it hands you something else. A red report holds its lane and the tasks that depend on it, not every lower independent task, until a newer report on the task (or a newer green CI run on its pull request) clears it; a blocked one stands until a green or landed report, or any report from a session that neither raised the block nor holds the task, clears it (D-200, D-309).


Exact c30-to-db0 changed paths:
docs/DECISIONS.md
docs/plans/D-093-language.md
docs/plans/assignments.json
drizzle/deploy/0121_account_language.sql
drizzle/schema.ts
server/accountLanguage.test.ts
server/accountLanguage.ts
server/accountPreferences.test.ts
server/accountPreferences.ts
server/schemaReconcile.ts
shared/accountPreferences.ts
shared/languages.test.ts
shared/languages.ts


Actual bounded continuation assessment at20:55-20:56: DeepSeek V4.1 Flash closed F1/F2/F3/F5 on supported takeover, exact quiet timestamps, clean normal merge/tree reproduction, scoped final-landing condition and exact changed-path evidence. F4 was explicitly withdrawn as an incorrect Tier1 analogy: this registered Tier2 source branch is not a D190 architect packet PR. No private internal operator model disclosure is required or permitted. Actual GLM semantic authorship and independent DeepSeek review will be enforced manually with retained exact source and model observations, not falsely claimed visible through the operator markers. No operator self-review or semantic edits. Full clean-merge proof: merge --no-commit --no-ff exit0, reproduced index and actual f0a02b79 tree both7fbacfea0f30dbab27d77ffc3ea3f20680fc7f61, no unmerged entries. No source generation or execution clearance follows from this record assessment.

Fresh actual dispatch preparation: GLM5.3 explicitly selected in the existing author session at20:53:01, screenshot inspected; Free with remaining capacity/purchase-required extra capacity inspected20:52:26, private allowance not published. Hard stop at paid requirement, exhaustion or possible card charge. Current main07ceca64 adds only D093metrics paths, none of loader six paths; normal main merge9048e754 is pushed. Actual 20:55 supported FIFO is WAIT on preserved Qoder5f11 blocked report; a legitimate nonholder coordinator must settle that disposition via supported reporting before dispatch. No invented green/fixed/verdict. Final supplied bytes/digest remain pending and will be retained before generation.

PROCESS-provenance-loader-bounds: automated claim held (D-312 exception) by Dev (Skydive) · d1a4 — 2026-11-10 — branch agent/queue/process-provenance-loader-bounds-glm-nov10-isolated; no source authored: section 5a open prerequisites (final input bytes/digest, free-route recheck, fresh FIFO recheck on current main, six-path/two-wrapper owner composition, actual binding assessment) remain supervisor-owned and unmet, so no dispatch is execution-ready. Question for owner/supervisor: should this automated claim be kept as the dispatch target, or released?

Registration candidate from mainf1adbc, November10,2026. Both default-buffer
failures independently reproduced. No implementation, external prompt, route,
claim, source fix, execution receipt, verdict, completion or deployment is
asserted. Supervisor retains implementation/testing/independent review and
normal nonwriter landing follow-through; packet writer supplies docs only.
The original privacy outcome remains active and unshipped.

D-312 approval-record preparation, November 10 at 15:28 IST: actual approval
recovered. Binding facts and supported mechanics above are unresolved; no
source dispatch, claim, implementation readiness or customer completion.

Routing registration candidate, November 10 at17:47 IST: old PR1114 is reference-only, preserved and unmerged; the proposed isolated route is not execution-ready. No new source generation, ordinary BUILD claim, identity certification or customer completion is asserted.
