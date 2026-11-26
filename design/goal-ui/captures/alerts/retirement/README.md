# Alerts retirement parity

These are synthetic local production-build captures, with all APIs and external traffic intercepted. They contain no production account or live mutation evidence.

The baseline entry is from claim `1b92515fa5b9bf9793730bf13ab4729759c526e9`. Build that reference in a separate detached worktree, then run from the retirement checkout:

```sh
node design/goal-ui/captures/alerts/retirement/capture.mjs before /absolute/path/to/baseline/dist/public
pnpm build
node design/goal-ui/captures/alerts/retirement/capture.mjs after
```

`before.json` and `after.json` bind captures to entry-source SHA-256 hashes. `comparison.json` reports every differing pixel without masks or tolerance, keeps raw API-call ordering differences, and separately compares distinct GET paths and mutations. The full captured request lists remain in the phase manifests.

The integrated capture uses main `7b788721` merged at `4925d43d`. All 24 pairs have zero page errors and horizontal overflow. Nineteen pairs are pixel-identical; five phone frames differ by 187 glyph pixels in total, with matching content/layout after visual inspection. All pairs have the same distinct read paths and mutations. Sentry issue history and production acceptance are not established by these fixtures.
