# D-048-p3-discovery captures

Goal `/wall` and `/jobs` at 1280×900 (dpr 1) and 390×844 (dpr 2), Asia/Kolkata time zone, synthetic fixtures only
(example domains, no real people). Every `/api` call is answered by the fixtures in
`capture.mjs`; every other https request is aborted. `manifest.json` records each route,
viewport, page errors (none), horizontal overflow (none: scrollWidth equals the viewport)
and the count of black commits (1 on every loaded, empty and walk-in state; 0 on the
error states, which offer Try again). Since the owner's Oct 30 rule (no kit or legacy UI on a
moved page) it also records, for the whole rendered page: goal share blocks (`goalShare`),
buttons nested in buttons (`nestedButtons`, 0), elements with a hex colour class
(`kitHexClasses`, 0) and visible elements outside the goal scope (`outsideGoalScope`, empty).
Every capture is full page: header, every section and the quiet links.

Reproduce:

```
VITE_GOAL_SURFACES=all pnpm build
node design/goal-ui/captures/discovery/capture.mjs
```

| State | Files |
|---|---|
| `/wall` with a paid placement (labelled), a named poster, a walk-in and a labelled partner tip | `wall-default-*.png` |
| `/wall?opening=3` walk-in with no role link: commit inert, reason shown | `wall-walk-in-*.png` |
| `/wall` empty | `wall-empty-*.png` |
| `/wall` load error | `wall-error-*.png` |
| `/jobs` default, signed out | `jobs-default-*.png` |
| `/jobs?job=12` role without a job link | `jobs-no-link-*.png` |
| `/jobs?q=astronaut` no match | `jobs-empty-*.png` |
| `/jobs` load error | `jobs-error-*.png` |
| `/wall?opening=4` after More: copy path (headless Chromium has no native share sheet), goal status line "Opening link copied." | `wall-share-copied-*.png` |
| `/wall` first visit, no stored cookie choice (no global banner renders on this page) | `wall-first-visit-*.png` |
| `/jobs` signed out after Save: the sign-in step | `jobs-sign-in-step-*.png` |
| `/jobs` first visit, no stored cookie choice | `jobs-first-visit-*.png` |

Not capturable here: the native OS share sheet (navigator.share) and the app-level notices
App.tsx mounts around every route (offline, slow connection, update prompt, toaster), which
are outside this row's owns and stay kit until their own row moves them.
