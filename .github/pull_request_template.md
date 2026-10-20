## What and why (evidence; D-096: what seeker, referrer and company each gain, psychology line, necessity test)

## Three-sided simulation (D-096): Seeker / Referrer / Company / Likely failure / Mitigation / Evidence (say "judgement only" and name the cheapest real test if so) / Verdict (ship only if net plus on all sides)

## Loop (D-087: L1-L6 or none)

## Docs touched (D-088: DECISIONS.md / PRD / AGENTS.md / BRIEF / content.json)

## Checks
- [ ] typecheck + tests + build green on this exact commit
- [ ] before/after captures at 1280 and 390 (UI slices)
- [ ] token audit clean, no kit imports on goal surfaces (goal-UI slices)
- [ ] neighbouring flows regression-checked, desktop and 390 (QA)
- [ ] behind a flag, off until QA verifies (D-097); backward compatible; migrations ship with the slice
- [ ] one-tap check done (D-095)
- [ ] green front to back: UI, API, DB and real-path integration tests pass; stays a draft until then; no promote without full green plus QA sign-off (D-097)
- [ ] rollback noted in docs/RELEASES.md if this deploys
