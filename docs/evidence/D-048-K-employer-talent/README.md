# Employer-talent retirement: synthetic parity evidence

Task `D-048-K-employer-talent`, draft PR #1372. This is pre-merge, local-browser evidence, not production or release-row acceptance.

## Boundaries and result

- Baseline: released main `d26b995ef4e0654e8540a61dafad38b0cdd71f52`.
- Candidate build: composition `31a791100993b606f55a61580cd0e23502575ca7`, retaining retirement `1ba4257f2`; subsequent `1c45a7a27` changes only test/evidence documentation, not the bundle's app source.
- `verified/capture.json` records the exact input revisions, raw goal-source hashes and equal comment-free TypeScript AST hashes. The only goal-body source change is its obsolete Kit-price comment.
- **30 before/after pairs have identical decoded pixels, visible text, destination routes and method/path request multisets.** Sixty fresh screenshots: 15 states at 1280×900 and 390×844 (phone at 2× device scale).
- Every capture reports zero horizontal overflow, page errors and unmatched API requests. Fixture identity fields never appear in the talent page; pending unlocks stay locked and expose no profile/intro action for that row.
- All API/auth/telemetry/mutation traffic is intercepted in clean browser contexts. No real account, profile unlock, intro, payment or production request occurs.

States: default, shared profile, profile cleared by search, intro sent, intro refused, unlock pending/confirmed/error/402 billing recovery, filtered search, loading, empty, load error, retry and access denied.

Native image inspection covers desktop default and phone pending-unlock/shared-profile captures. Layout, privacy copy, long-reference wrapping and controls remain readable; pending-state and profile-action boundaries match the released page. The mechanical detector reports no findings on the two scoped page files. No redesign was made.

## Reproduce

From the retirement checkout, build the preserved baseline and the candidate using the pinned packages, then run the harness:

```sh
git worktree add --detach ../talent-retire-baseline d26b995ef4e0654e8540a61dafad38b0cdd71f52
(cd ../talent-retire-baseline && pnpm install --frozen-lockfile && pnpm build)
pnpm install --frozen-lockfile
pnpm build
node docs/evidence/D-048-K-employer-talent/capture.mjs ../talent-retire-baseline .
```

The harness always takes fresh screenshots, checks real page interactions, and refuses a goal-runtime AST mismatch. It serves only loopback production bundles and fulfills every backend/external call locally. `verified/parity.json` is written only after all paired assertions pass. `capture.json` is incremental and is not, by itself, proof that a comparison completed.

## Other gates

The current-main compiler/build passed. Five unchanged focused files passed 148 cases; the obsolete source-scan file failed, was converted to a real route consumer regression, and its changed one-case run passed. Those are separate runs, not a claimed full-local pass. Initial CI `44680130215` also failed only at the obsolete source pin and aggregate; old failed jobs were not rerun. Fresh final-head CI and the packet's review/landing rules still apply.

The release PR #1210 is merged, but `D-048-R-employer-talent` remains `todo`. This retirement stays draft/build-ahead until its release lane records completed acceptance. The scoped Sentry read in `sentry.json` is a point-in-time observation, not a soak or a waiver of that dependency. No canonical post-deploy verification is claimed.
