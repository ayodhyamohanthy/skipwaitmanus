# D-048-p3-discovery captures

Goal `/wall` and `/jobs` at 1280×900 (dpr 1) and 390×844 (dpr 2), synthetic fixtures only
(example domains, no real people). Every `/api` call is answered by the fixtures in
`capture.mjs`; every other https request is aborted. `manifest.json` records each route,
viewport, page errors (none), horizontal overflow (none: scrollWidth equals the viewport)
and the count of black commits (1 on every loaded, empty and walk-in state; 0 on the
error states, which offer Try again).

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
