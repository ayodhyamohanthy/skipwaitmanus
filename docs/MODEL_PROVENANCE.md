# External coding-model provenance (D-311)

This support separates the real operator/session from a public external coding model. It does not authenticate a provider cryptographically. It does not qualify this implementation's unknown underlying author or clear held product work. The checked-in registry starts empty.

## Trust boundary and sequence

Both picker and gate read only `origin/main:docs/model-provenance.json`. A candidate file, CLI model name, comment, digest or successful fixture is not qualification. First deliver this tooling through the existing Tier 2 independent-review, required-test and protected-merge path. It cannot authorize its own first merge.

Before starting external work, separately review a task/operator/model route and merge that qualification through the existing protected process. Use a public provider URL, its selected public model name, sanitized retained observation bytes, and independent qualification-review URL. The reviewer checks the actual selection evidence, canonical model identity (including aliases), operator, task, supported roles and limits. A route only permits claims. It proves no completed coding or review execution.

After the actual run, separately review and merge the exact execution receipt onto main before accepting completion. Check the actual input supplied, output received, observed selected model, exact generated patch and commit range, and whether the operator changed semantics. Keep sensitive content out of this public repository. If sanitized evidence is insufficient to qualify authorship, hold it rather than asserting a model identity. No private transcripts, secrets or internal model metadata belong here.

Qualification changes are their own bounded docs work, not candidate self-approval. A qualified route/receipt is an independently reviewed assertion, not a signed provider receipt. Code checks its structure, digests, binding and contribution independence; human/model review establishes whether the asserted observation is true. Revoke a route with `revoked: true`; do not relabel history to clear a hold.

## Registry version 1

Root fields: `version: 1`, `routes: []`, `executions: []`. IDs are unique within each collection, 1-120 ASCII letters/digits/dot/underscore/hyphen, starting with a letter/digit. Artifact strings are nonempty, no control characters other than tab/newline, at most 16 MiB. SHA fields are lowercase hex (40 for commits, 64 for SHA-256).

Each route has:

- `id`, `taskId`, `operator` (exact actual session, not the model), `modelId` (reviewed canonical public identity), `roles` (subset of `build`, `fix`, `review`, `land`), `revoked` (must be explicitly false to use).
- `providerUrl`, `selectedModel`, `observation`, `observationSha256`, `qualificationReview`. Both URLs must be HTTPS. The observation digest binds retained sanitized bytes, not authorship.

Each execution has:

- `id`, `routeId`, `taskId`, `operator`, `role`, `claimSha`, `inputSha`, `outputSha`.
- `input`, `output`, `observation`, each with its corresponding `Sha256` digest, and HTTPS `reviewUrl` for separate execution qualification.
- `semanticEdits: false` only when the operator was pure transport. Operator-authored semantic code/test/fix work is unresolved by this version and holds the route. Do not silently call it transport.
- For build/fix: `output` equals the applied `git diff --binary --no-ext-diff INPUT OUTPUT --` string as read by the CLI (outer whitespace trimmed), with `patchSha256` binding those same bytes. Input must precede output, output must precede the evaluated head, and every branch-owned file-changing commit must be covered. Only the existing landing-status exception is allowed outside those ranges. Main merges must have two parents and a main-anchored second parent, and apply exactly the main delta or have an empty supported Git remerge diff. Semantic merge resolutions are not invisible transport. On older Git, overlapping content merges that cannot be proven clean hold rather than guessing.
- For review: `inputSha === outputSha` names the reviewed exact head, `verdict` is `pass` or `findings`, and `output` retains the actual sanitized verdict. A completed verdict marker must name the same reviewed SHA and verdict. Later code invalidates PASS; only existing supported main merges/status-only commits retain it.

The execution must bind the actual same-operator, same-route role claim in the retained task/lock history. Build/Takeover and Fix claims cannot be replaced by another operator's receipt. Unknown or unqualified build/fix markers hold the task, even if a later receipt spans the whole diff. Earlier review/findings-only participation does not make someone a code contributor (D-184).

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
