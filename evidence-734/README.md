# Evidence for PR #734 (row FIX-share-hub-link-ready)

Not product code; never merged. Delete this branch when FIX-share-hub-link-ready is done (D-205).

- Captured from commit cee0ddca (fix) vs eb0fd8cd (main, "before"); product code under `client/` is byte-identical to the PR head 53ae7a56.
- Real Chromium (Playwright), viewport-true (no stitching): 390x844 @2x and 1280x900 @1x. Two Vite servers with `VITE_GOAL_SURFACES=share`: main on :3200 ("before"), the fix on :3100 ("after"). API mocked at the network layer, fictional data only (invite code FICTION-7Q). Script: `share-capture.mjs`.
- `report.json` records the share-hub status line from the first DOM frame (MutationObserver), the Copy button's aria-disabled, and page errors.
- Result: before, the first frame says "Your link is ready." with no link; after, it says "Creating your link…". Loading screenshots before/after are byte-identical; ready screenshots differ only by the dev-server port inside the link text (localhost:3200 vs :3100).
