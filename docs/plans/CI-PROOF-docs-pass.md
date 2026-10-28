# CI proof: docs-only on an architect branch, based on main

Throwaway branch for docs/plans/CI-architect-real-checks.md packet C1/C2. It is based on
`origin/main` and changes only this file, so the queue gate reads it as docs-only and the
pull request is based on the task branch, whose merge ref carries the new ci.yml. Never
merged; deleted after the run is recorded.
