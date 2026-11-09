# PROCESS-model-provenance

## Goal

Represent actual external coding-model authors and reviewers separately from the operator that runs them. This is delivery tooling for safer independent review, not a customer feature or a declaration that any held fix is ready. D-311 records the owner's November 10 approval. D-151's different-model rule, D-184's review-only exception, exact-head tests and protected merges stay mandatory.

## Registration, risk and prior outcome

Register one new row at the end of the existing queue, `PROCESS-model-provenance`, Tier 2, lane `picker`, branch `agent/queue/process-model-provenance`, no dependencies. This changes coding-process identity, not a person's sign-in/session/identity, product privacy, money or migrations. Existing gate/picker tooling rows are Tier 2. Separate final-version review must assess that classification, not accept it merely because this packet says so.

Current main read: `41e8035274d71bd2ac8247130084b5984530f8f0`. Relevant sources actually inspected: `AGENTS.md`, `docs/BRIEF.md`, `docs/BUILD_CONTINUITY.md`, `docs/PRD.md`, `docs/DELEGATION.md` sections 1-4a, D-151/D-184/D-200/D-225/D-309/D-310, `nextTaskCore.mjs` modelOf/parseMarker/did, `next-task.mjs` marker loader/claim/verdict, and `review-gate.mjs` model and exact-head checks. Current one-prefix identity cannot represent a real operator running an external author or reviewer. A prior uncommitted pure receipt-parser experiment was not integrated, qualified or shipped; it is not this implementation and clears nothing.

No `owns` declaration: existing fullstack/QA/landing-wait rows retain ownership histories for shared picker paths. This is an exact manual allowlist, not an automated scope pass. Inspect current claims, coordinate overlapping unpublished work and use an isolated branch/worktree. D-309 allows isolated development but requires preservation, composed review/tests and serialized safe integration. Never duplicate a holder or overwrite another checkout. No dependency is invented merely for ordering.

## Exact implementation allowlist

- `scripts/modelProvenance.mjs` (new shared pure parsing/validation/resolution)
- `scripts/modelProvenance.test.ts` and `scripts/modelProvenanceIntegration.test.ts` (new focused and integration controls)
- `scripts/nextTaskCore.mjs` (use shared effective-contributor resolution for review/landing eligibility)
- `scripts/next-task.mjs` (truthful explicit operator/model inputs, marker bodies and evidence loading)
- `scripts/nextTaskText.mjs` (only the related provenance instructions and explicit failure messages)
- `scripts/review-gate.mjs` (same evidence and contributor resolution, preserving the exact-head gate)
- `docs/MODEL_PROVENANCE.md` (new public, sanitized evidence format and operating instructions)
- `docs/model-provenance.json` if the independently reviewed design needs a registry (new; empty until real qualified records exist)
- this packet's `## Status` section

No other existing tests, workflows, required checks, protections, tier classifier, scope-check, product files, dependencies, environment keys, claims, verdicts, reports, task statuses or live settings may be changed by the implementation. If more scope is needed, report the measured gap for ordinary scope review before that edit. Preserve every existing assertion; do not delete, skip, focus, soften or relabel one to admit the route.

## Required behavior

1. Keep operator/session identity separate from a supported public external model identifier for build, takeover, fix, review and landing stages. Do not make an operator claim to be the model it runs. Never expose private internal model metadata or raw private transcripts. Unverified client labels are not model evidence.
2. Define an auditable evidence contract before enabling the route: task/role, real operator, selected public provider/model, observed session evidence, exact input base/head, actual output or verdict, retained sanitized artifact and digest, and exact resulting head/content binding. A digest detects byte changes; it does not authenticate authorship. Visible provider selection is operator-observed evidence, not cryptographic model identity. State what is checked by code and what independent review must qualify.
3. A candidate branch, arbitrary CLI field, self-declared model string or comment must not authorize its own evidence. Specify and implement a trusted, separately reviewed qualification path for operator/model evidence and execution receipts. A registry read from the candidate under review alone is insufficient. Malformed, absent, ambiguous, conflicting, unqualified or unverifiable external provenance must not fall through to a legacy pass or an internal-error fail-open path.
4. Picker and gate use one shared effective-contributor resolution and the same evidence source. Every real builder/takeover/fixer remains in the contributor set. Unknown historical authorship remains unknown and held; new receipts cannot retroactively rename it, replace it or clear it. A new external draft does not erase prior participation. Review/findings-only participation remains eligible under D-184. Pure transport may be recorded as such only when source evidence supports that no semantic edits occurred. Any operator-authored code/test/fix is a contribution, not neutral transport.
5. Review and landing must exclude every actual build/fix model, including a different session of the same model. Separate public model names must genuinely denote different selected models, not aliases chosen to evade exclusion. Unknown or conflicting relevant identities hold the affected Tier 1 review/landing. No automatic clearance for Messages #1100, Close #1095 or other held work.
6. Bind passing review to the final exact head under the existing gate's supported main-merge/status-only rules. Changed output bytes, a later fix, stale/wrong task/head/role, or unsupported evidence invalidates the external binding. Preserve review/fix locks, current holder checks, D-190 packet-writer exclusions, dependencies, re-sync, FIFO among eligible work, main-red safety and ordinary protected CI/landing.
7. Legacy known-model markers retain their existing behavior and history. Do not globally reinterpret old labels as verified real models. Explicitly held unknown-model work stays held. Do not invent a known identity for this implementation or use the new route to authorize its own initial merge. This Tier 2 tooling change goes through the existing separate-review and required-CI path before the new support is usable.
8. No success claim from a parser-only test. Prove real CLI/loader/picker/gate composition using local fixture repositories without pushing fake live claims/verdicts. Do not enable an externally qualified path until the full composition is tested. Tests must show the actual existing loader preserves the structured evidence needed by the common resolver.

## Red-first acceptance

- Reproduce loss/conflation of operator versus external model through the current loader/picker/gate path, not only a fabricated pure object. Then demonstrate an eligible separately qualified external author/reviewer case through the new full path.
- Negative controls: missing/unknown author; missing/ambiguous/conflicting evidence; self-declared unqualified model; candidate-controlled receipt; wrong task/role/operator/input/output/head/digest; stale proof; unsupported URL/path; malformed body; duplicate records; same external build/review model; same model with different session; operator-authored fix mislabeled transport; omitted historical contributor; unknown earlier builder; unreviewed fix after PASS; new receipt hiding old history; picker/gate disagreement; external validation read failure.
- Preserve D-184 review-only re-review; ordinary legacy distinct-model pass; existing same-model rejection; active locks, current-holder checks, packet-writer exclusion, dependency/re-sync and main-red controls; exact-head/main-merge/status-only semantics.
- All existing picker/review-gate suites pass unchanged. Run the new focused tests, assignment validation, decision-ID check, `pnpm check`, applicable full gate and exact required CI on final current-main composition. Report failures honestly; local timeout/OOM is not PASS.
- Obtain separate final-version review under the owner's existing routine-merge grant; the reviewer assesses the complete shared resolver, source loading, CLI, evidence contract, compatibility and failure paths. Fix findings red-first and re-review the changed final head. No admin bypass.
- After normal landing, demonstrate the released tooling's supported truthful route with a nonmutating preview or local fixture. A live external code authoring/review session is a later task-specific execution, not something this registration or unit tests claim happened.

## Out of scope

No product behavior, sign-in provider, user account, money, legal copy, migration, feature flag, production data, paid service, secret/public transcript publication, protection change, review waiver, history rewrite or automatic release of old fixes. Do not reopen original policy choices or invent evidence to satisfy the contract. If an external service is unavailable, report that fact without substituting an unknown model or claiming success.

## Status

2026-11-10: proposed registration only from main41e80352 after the owner's explicit approval of truthful separate external-model/operator support. Runtime is unimplemented and unverified. No claim, verdict, receipt, registry entry or held-fix clearance was recorded by this registration. Prior held work is preserved.

2026-11-10: in progress - Instinct · provenance-nov10 - branch `agent/queue/process-model-provenance`. Ordinary released picker from reviewed registration source selected BUILD with supported explicit session-scope avoids; no new provenance route was used to claim its own implementation. Isolated preliminary qualification is uncommitted, incomplete and not a qualified external model contribution. Existing unknown-model product work stays held. Real local fixture tests and separate final review are still required before any completion claim.

2026-11-10: implementation in progress on the original claimed branch. Shared trusted-main resolver, CLI bodies, picker/gate wiring and sanitized contract are implemented; registry is intentionally empty. Real local CLI/git controls and unchanged script suites pass at the recorded test snapshots, and production build passes. Full-suite command and enlarged-heap typecheck exceeded local time/resource limits, not PASS. Separate final-version review, exact required CI and current-main composition remain required. No held product history is cleared and this implementation's unknown underlying model is not relabeled.

2026-11-10: separate external final review found a real abandoned-empty-build-claim availability defect. Independently reproduced red with real git before repair. Narrow repair proves every commit from the qualified old build claim through the next qualified takeover is single-parent and empty; edit/revert, merge, omitted or unqualified claims remain held. No missing actual contribution receipt is waived and fix-lock ancestry is not inferred. Changed-head review and exact required CI remain owed; prior FAIL is not relabeled PASS.
