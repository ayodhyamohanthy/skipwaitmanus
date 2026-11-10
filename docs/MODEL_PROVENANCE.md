# External coding-model provenance (D-311)

This support separates the real operator/session from a public external coding model. It does not authenticate a provider cryptographically. It does not qualify this implementation's unknown underlying author or clear held product work. The checked-in registry starts empty.

## Trust boundary and sequence

Both picker and gate read only `origin/main:docs/model-provenance.json`. A candidate file, CLI model name, comment, digest or successful fixture is not qualification. First deliver this tooling through the existing Tier 2 independent-review, required-test and protected-merge path. It cannot authorize its own first merge.

Before starting external work, separately review a task/operator/model route and merge that qualification through the existing protected process. Use a public provider URL, its selected public model name, sanitized retained observation bytes, and independent qualification-review URL. The reviewer checks the actual selection evidence, canonical model identity (including aliases), operator, task, supported roles and limits. A route only permits claims. It proves no completed coding or review execution.

After the actual run, separately review and merge the exact execution receipt onto main before accepting completion. Check the actual input supplied, output received, observed selected model, exact generated patch and commit range, and whether the operator changed semantics. Keep sensitive content out of this public repository. If sanitized evidence is insufficient to qualify authorship, hold it rather than asserting a model identity. No private transcripts, secrets or internal model metadata belong here.

Qualification changes are their own bounded docs work, not candidate self-approval. A qualified route/receipt is an independently reviewed assertion, not a signed provider receipt. Code checks its structure, digests, binding and contribution independence; human/model review establishes whether the asserted observation is true. Revoke a route with `revoked: true`; do not relabel history to clear a hold.

## One-task loader repair exception (D-312)

The owner approved one exception to the automated task-claim requirement only
for `PROCESS-provenance-loader-bounds`, because the trusted registry loader
blocks claiming its own repair. Its packet section 5a records the exact
pre-dispatch binding and landing review. Approval alone is not a qualified
author, claim, receipt, implementation acceptance or a working gate path.
Document the task and actual free code author before work starts. Preserve
independent exact-version review, real tests, protected merges, no spending
and every other rule. No other task, old unknown contributor, route or
execution is grandfathered. Do not insert a fabricated normal claim or use
a candidate loader to authorize itself. If the independently reviewed
mechanics cannot preserve the remaining gates, hold and report the exact gap.

## Registry version 1

Root fields: `version: 1`, `routes: []`, `executions: []`. IDs are unique within each collection, 1-120 ASCII letters/digits/dot/underscore/hyphen, starting with a letter/digit. Artifact strings are nonempty, no control characters other than tab/newline, at most 16 MiB. SHA fields are lowercase hex (40 for commits, 64 for SHA-256).

Each route has:

- `id`, `taskId`, `operator` (exact actual session, not the model), `modelId` (reviewed canonical public identity), `roles` (subset of `build`, `fix`, `review`, `land`), `revoked` (must be explicitly false to use).
- `providerUrl`, `selectedModel`, `observation`, `observationSha256`, `qualificationReview`. Both URLs must be HTTPS. The observation digest binds retained sanitized bytes, not authorship.

For contributor exclusion, a separately reviewed `modelId` may deliberately group observed same-family models under one conservative key. Such a key may over-exclude reviewers but must never split aliases to gain independence or assert an unobserved served checkpoint/API endpoint. `selectedModel` and the retained observation still identify exactly what the provider visibly selected; execution receipts must preserve that distinction.

Each execution has:

- `id`, `routeId`, `taskId`, `operator`, `role`, `claimSha`, `inputSha`, `outputSha`.
- `input`, `output`, `observation`, each with its corresponding `Sha256` digest, and HTTPS `reviewUrl` for separate execution qualification.
- `semanticEdits: false` only when the operator was pure transport. Operator-authored semantic code/test/fix work is unresolved by this version and holds the route. Do not silently call it transport.
- For build/fix: `output` equals the applied `git diff --binary --no-ext-diff INPUT OUTPUT --` string as read by the CLI (outer whitespace trimmed), with `patchSha256` binding those same bytes. Input must precede output, output must precede the evaluated head, and every branch-owned file-changing commit must be covered. Only the existing landing-status exception is allowed outside those ranges. Main merges must have two parents and a main-anchored second parent, and apply exactly the main delta or have an empty supported Git remerge diff. Semantic merge resolutions are not invisible transport. On older Git, overlapping content merges that cannot be proven clean hold rather than guessing.
- For review: `inputSha === outputSha` names the reviewed exact head, `verdict` is `pass` or `findings`, and `output` retains the actual sanitized verdict. A completed verdict marker must name the same reviewed SHA and verdict. Later code invalidates PASS; only existing supported main merges/status-only commits retain it.

The execution must bind the actual same-operator, same-route role claim in the retained task/lock history. Build/Takeover and Fix claims cannot be replaced by another operator's receipt. Unknown or unqualified build/fix markers hold the task, even if a later receipt spans the whole diff. A qualified abandoned build Claim/Takeover with no completed execution and no explicit execution reference may be non-contributing only when its next qualified build claim is in the evaluated head ancestry, and every commit from the old claim through the next claim is a single-parent empty commit. Each parent delta is checked, so edits followed by reverts, merges, missing claims and unreadable history cannot use this exception. No fix-lock interval is inferred empty, since its ancestry differs from the code branch. This exception neither invents an execution nor permits review of unreceipted actual code. Earlier review/findings-only participation does not make someone a code contributor (D-184).

## Commands and markers

Keep the real operator name, for example `Operator · session`, in `--as`/`--claim`. Do not claim to be the external model. Preview without mutation:

```sh
node scripts/next-task.mjs --as 'Operator · session' --provenance ROUTE_ID
```

Claims, takeovers, fixes and landings use the same `--provenance ROUTE_ID` with ordinary `--claim`. A reclaimed stage must preserve its qualified route. Heartbeats preserve ownership and do not assert a new execution. Completed review and fix markers additionally require their qualified receipt:

```sh
node scripts/next-task.mjs --verdict pass --task TASK --as 'Operator · session' --provenance ROUTE_ID --execution EXECUTION_ID
node scripts/next-task.mjs --fixed --task TASK --as 'Operator · session' --provenance ROUTE_ID --execution EXECUTION_ID
```

The normal subject stays attributed to the actual operator. Body lines `provenance ROUTE_ID` and `execution EXECUTION_ID` are unambiguous references, not free model names. Missing, duplicated, malformed, revoked or wrong-task/operator/role evidence holds external work. Failed completion checks write no marker. Normal fast-forward pushes still settle claim races. Ordinary locks, holder checks, dependencies, main-red safety, tests and protections remain in force.

Picker and gate compare canonical actual model identities against every builder/fixer; another session of the same model is not independent. Legacy-only known-prefix behavior remains unchanged, without claiming those old names are newly verified. An external route cannot reinterpret an unknown legacy contributor. No example here is a qualified live execution.

## Trusted registry read bound (PROCESS-provenance-loader-bounds)

Both production provenance loaders, the picker (`scripts/next-task.mjs`) and the
review gate (`scripts/review-gate.mjs`), read Git through one shared reader,
`scripts/provenanceGitOutput.mjs`. It is transport only: it holds no policy, makes
no trust decision and never edits the registry.

Supported aggregate size: one read returns at most **64MiB** of stdout
(`GIT_OUTPUT_LIMIT_BYTES`). The measured trusted registry is about 1.6MiB, a
single artifact is schema-limited to 16MiB, and a read may legitimately carry
several artifacts, so 64MiB matches the existing source-reader precedent in the
review gate. The bound is finite and named; it is not an unbounded allocation and
the 16MiB per-artifact limit does not imply an unlimited aggregate.

Error behavior is unchanged. A Git that cannot start, a non-zero status, or output
above the bound throws; each wrapper's nullable adapter turns that throw into
`null`, and `loadTrustedProvenance` reports the result through its existing parser
semantics rather than new transport wording: `null` bytes are `invalid provenance
registry`, unparseable bytes are `unreadable provenance registry`, and an absent
trusted main is `no trusted-main provenance registry`. An over-bound read is
therefore a reported failure, not a truncated success, stale fallback,
candidate-local substitution, legacy fallback or silent internal-error approval.
Raising the output buffer is a transport fix; it does not add trust, change the
evidence schema or weaken a gate, and nothing here claims fail-closed behavior for
unrelated preexisting paths.

Real loaders and the pure resolver are different evidence. `loadTrustedProvenance`
composes the actual reader with the actual registry parser, so an integration test
against a real Git repository exercises the production path. A pure resolver
fixture that calls `resolveTaskProvenance` with an in-memory registry proves only
the resolver; it cannot show that the trusted registry is readable at its real
size, which is exactly how the 1MiB defect stayed hidden.

Both wrappers export their real Git bindings (`git`/`tryGit` in the picker, `git`
in the gate) for that regression, and the picker runs `main()` only when executed
as a CLI. Those exports change no decision: they expose the same bindings the
loaders already call, so a test cannot pass against a copy of the reader.


## Picker authoritative-ref repair: alternate author resource, November 11

The initial Mistral author resource could not consume the complete source packet
or return an implementation. It completed no qualified build or fix execution.
Its route and empty ordinary claim remain historical evidence, not a patch to
adopt or a model to relabel.

A new task-bound DeepSeek V4.1 Flash author route is proposed for
`PICKER-authoritative-ref-refresh` only, operated as
`Instinct · picker-free-model-author-deepseek-nov11`. The existing DeepSeek
review route does not qualify authorship and cannot independently review code
from this same canonical model. A distinct qualified final reviewer is required.
The observed resource read a bounded 20,395-byte public source excerpt with both
sentinels and correctly identified the first and last visible functions. The
excerpt intentionally ends mid-function; this is smaller-input capacity evidence,
not proof of whole-packet reading, generated code, tests or a completed review.
Full required source context must be delivered in bounded chunks before work.

This docs admission supplies no ordinary claim or execution. After admission,
use the supported current-main picker and preserve holder, FIFO and route checks.
An abandoned qualified empty claim may be non-contributing only under the existing
single-parent-empty ancestry rule above. Do not force reclaim, alter old history,
reuse the loader-only exception, adopt an unbound draft, or let DeepSeek review its
own code. Actual generated output, applied diff, tests and separate exact-version
review still need their own qualified receipts and normal protected landing.
