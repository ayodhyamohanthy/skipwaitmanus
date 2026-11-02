# Evidence for PR #974, Hark · 5de4, code head bb34ca02 (search vs directory filter follow-up)

Same harness and method as `../hark-7ef5cd39/README.md`: the switch was turned on by an uncommitted local patch, then reverted. Committed code keeps it `false`.

| State | Query | Files |
|---|---|---|
| function query with directory matches (no paste-a-link, no empty claim) | `Engineering` | `explore-search-function-query-*.png` |
| alias suggestion, directory filter empty (no empty claim) | `tata` → TCS | `explore-search-alias-*.png` |
| loading (no empty claim under the in-flight search) | `tat` | `explore-search-typing-*.png` |
| error (retry line only, no empty claim) | `tata` | `explore-search-error-*.png` |
| real no match (paste-a-link plus the directory empty state) | `Zeta Labs` | `explore-search-no-match-*.png` |
| suggestions | `t` | `explore-search-suggestions-*.png` |

The red log `red-cb70567c.log` shows 4 failed / 17 passed. Green is 21/21, and 57/57 with explore + drawer.
