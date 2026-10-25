# DRIFT-watch-content-equiv: content-equivalence fallback in drift watch (#687)

## Intent

Drift watch (`.github/workflows/drift-watch.yml`) must not flag live API drift
forever when a reverse-direction landing (branch fast-forwarded onto main)
puts the branch's catch-up merges on main's first-parent chain. In that
topology the expected-sha lookup (`git log -1 --first-parent -- <runtime
paths>`) resolves to a merge whose first-parent diff touched watched paths
even when main's tree content there equals the deployed commit (#687:
expected 6cda4650, live 1e97d6ea, content-identical over every runtime path).

## Invariant (unchanged)

The live API artifact must equal a build of origin/main. Sha equality with
the expected commit stays the primary check; an empty
`git diff <liveSha> origin/main -- <same runtime path set>` proves the same
invariant and counts as converged. Unknown or unfetchable live shas still
flag drift (fail closed).

## Scope

- owns: `.github/workflows/drift-watch.yml`, `scripts/driftWatch.test.ts`
- Repair PR: #689. Tracking issue: #687 (stays open until a real dispatched
  Drift watch run reports converged after the repair lands).

## Verification

`pnpm vitest run scripts/driftWatch.test.ts` — includes a fixture
reproducing the reverse-landing topology and fail-closed guard pins.
