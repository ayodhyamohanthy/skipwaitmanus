## What and why (evidence; D-096: what seeker, referrer and company each gain, psychology line, necessity test)

## Three-sided simulation (D-096): Seeker / Referrer / Company / Likely failure / Mitigation / Evidence (say "judgement only" and name the cheapest real test if so) / Verdict (ship only if net plus on all sides)

## Loop (D-087: L1-L6 or none)

## Docs touched (D-088: DECISIONS.md / PRD / AGENTS.md / BRIEF / content.json)

## Ported assertions
<!-- Fill only when a test file ends with fewer assertion lines (expect/assert): a table with columns File and "Where each removed assertion now lives", one row per file, full path. CI reads this from the pull request event, so after editing it push again (an empty commit is fine). Pinned login and money tests need a "test-integrity: <file> — D-<n>" commit instead (D-212). -->

## Checks
- [ ] typecheck + tests + build green on this exact commit
- [ ] before/after captures at 1280 and 390 (UI slices)
- [ ] token audit clean, no kit imports on goal surfaces (goal-UI slices)
- [ ] neighbouring flows regression-checked, desktop and 390 (QA)
- [ ] behind a flag, off until QA verifies (D-097); backward compatible; migrations ship with the slice
- [ ] names what it strengthens on the other sides; QA cross-side regression (seeker, referrer, company core paths) before any flag goes on (D-096)
- [ ] one-tap check done (D-095)
- [ ] green front to back: UI, API, DB and real-path integration tests pass; stays a draft until then; no promote without full green plus QA sign-off (D-097)
- [ ] rollback noted in docs/RELEASES.md if this deploys
