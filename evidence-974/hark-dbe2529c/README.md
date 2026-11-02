# #974 invalid-input captures at dbe2529c (Instrument Sans verified)

Head `dbe2529c` = merge of main `fa462f69` into `agent/queue/d174-journey-search` (code unchanged from `4be63e27`).

These four PNGs replace the fallback-font captures in `../hark-4be63e27/` for the two invalid states:
- `explore-search-invalid-too-long-{1280,390}.png` — "Use 80 characters or fewer to search companies."
- `explore-search-invalid-refused-{1280,390}.png` — route 400 on a schema-valid query: "We couldn’t use that search. Try a different company name."

Recipe (local only, nothing committed to the PR): `COMPANY_TYPEAHEAD_ENABLED` flipped to true by an uncommitted patch and reverted after capture (committed code keeps `false`); Vite dev with `VITE_GOAL_SURFACES=discovery` through a wrapper config outside the repo that only adds `server.fs.allow` for the symlinked node_modules realpath (so `@fontsource/instrument-sans` is served instead of 403); kit-screens `capture.mjs`. Before each state, a probe loaded Instrument Sans 400/500/600/700 at 1280 and 390 and required `document.fonts.check` true for all four and no font response >= 400; both probes passed (`font-probe-*.log`).

Hark's underlying model unverified; no D-151 independence claim; no self-merge; needs separate final-head review against current main and a distinct normal lander; D-284 waiver not relied on.
