## What and why (evidence: research, data, or the repo decision)

## Loop (D-083: L1-L6 or none)

## Docs touched (D-084: DECISIONS.md / PRD / AGENTS.md / BRIEF / content.json)

## Checks
- [ ] typecheck + tests + build green on this exact commit
- [ ] before/after captures at 1280 and 390 (UI slices)
- [ ] token audit clean, no kit imports on goal surfaces (goal-UI slices)
- [ ] neighbouring flows regression-checked, desktop and 390 (QA)
- [ ] backward compatible; migrations ship with the slice
- [ ] rollback noted in docs/RELEASES.md if this deploys
