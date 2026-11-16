# D-048-p3-public-profile captures

Goal `/p/:handle` at 1280×900 (dpr 1) and 390×844 (dpr 2), Asia/Kolkata time zone, synthetic fixtures only
(example domains, no real people). Every `/api` call is answered by the fixtures in `capture.mjs`; every other
https request is aborted. `manifest.json` records each route, viewport, page errors (none) and horizontal
overflow (none: scrollWidth equals the viewport), plus the rendered h1, the count of black commits (exactly 1
on every loaded state), nested buttons (0) and elements with a hex colour class (0).

Every capture is full page. The transient loading frame is pinned by the test, not captured, exactly as the
signed-in home row did.

Reproduce:

```
VITE_GOAL_SURFACES=all pnpm build
node design/goal-ui/captures/public-profile/capture.mjs
```

| State | Files |
|---|---|
| A visitor sees a public page: goal line, verified work email, open-to chips, two pieces | `visible-*.png` |
| The same page with no shared pieces: the honest "No work shared yet." state | `empty-*.png` |
| A private page: plain words, no name, headline or piece | `private-*.png` |
| An unknown handle: says the link is not available, never that the page is private | `missing-*.png` |
| A failed read: says so and offers Try again, never the private gate | `error-*.png` |
| The owner: who-can-see-this radios, the one black commit (Copy your link), all pieces with their visibility | `owner-*.png` |
| The owner's Visitor preview: no owner controls, only the pieces a visitor gets | `owner-visitor-*.png` |
| The owner offline: the notice above a still-readable page, edits held | `offline-*.png` |
