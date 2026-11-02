# Evidence for PR #974 (D-174-seeker-journey-build.search), Hark · 5de4, code head 7ef5cd39

Local captures of `/explore` with `COMPANY_TYPEAHEAD_ENABLED` turned on by an
**uncommitted** local patch (see `capture.sh`: it flips the constant, runs vite dev
with `VITE_GOAL_SURFACES=discovery`, captures, then `git checkout`s the file; the
worktree was clean afterwards). Committed code and production keep the switch `false`.

Harness: the repo's `scripts/kit-screens/capture.mjs --goal discovery --route /explore`
(1280×900 @1x, 390×844 @2x, Asia/Kolkata, fixed clock). Every `/api` call is answered
by the fixture JSON here; `/api/companies/search` is mocked per state; no real backend.
Horizontal overflow 0 at both widths in every state; no unmatched API calls.

| State | Query | Files |
|---|---|---|
| typing (search in flight: the loading "Searching companies…" line) | `tat` | `explore-search-typing-{1280,390}.png` |
| suggestions (combobox list, first option active after ArrowDown) | `t` | `explore-search-suggestions-{1280,390}.png` |
| no match (paste-a-link primary, Request a company quiet link) | `Zeta Labs` | `explore-search-no-match-{1280,390}.png` |
| error (bonus: retry line, Try again) | `tata` | `explore-search-error-{1280,390}.png` |

Logs: `red-8a1a2e0d.log` (6 failed / 10 passed), `green-7ef5cd39.log` (16/16).
Hark's underlying model is unverified; no D-151 independence claim. Not a review.
