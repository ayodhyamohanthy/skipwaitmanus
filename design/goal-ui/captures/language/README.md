# D-093.mount shell captures

`capture.mjs` records the three language UI mounts in the normal production bundle at 1280 and 390 CSS pixels:

- `AppShell` on `/alerts`, signed in and signed out;
- `GoalAppShell` on `/explore`, signed in and signed out;
- the signed-out `GoalLandingV9` on `/`.

The capture set contains a baseline build and the candidate's English-only build. The harness asserts pixel and visible-text equality for those 10 pairs, no horizontal overflow, page errors or unmatched requests, and no visible language picker or consent with the production registry. A third isolated fixture build exposes only the existing Hindi record and expands its endonym in memory; it asserts that consent appears on all mounts and that the picker appears only in the two signed-out shell headers. It never edits the source registry or writes to production.

## Reproduce

```sh
node design/goal-ui/captures/language/capture.mjs <baseline-worktree> <candidate-worktree>
```

Both worktrees need completed `pnpm build` output. The capture is local Playwright/Chromium with synthetic responses for read endpoints; it does not sign in, send a preference, send email, make a payment or call external services. The test-only bundle is created in a temporary directory and removed on completion.

`verified/` contains the 30 PNGs and machine-readable `capture.json` from the candidate before the latest docs-only edits. The registry hash is recorded in the JSON so the fixture's non-production visibility cannot be mistaken for a language approval.
