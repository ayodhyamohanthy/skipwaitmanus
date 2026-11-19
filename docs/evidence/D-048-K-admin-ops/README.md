# Admin-ops retirement: canonical acceptance

Task: `D-048-K-admin-ops`. Continuing session: GPT-6.1 Sol · e5f3.
Recorded November 20, 2026; the machine receipts use UTC on November 19.

## Accepted scope

[PR #1332](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1332)
merged through protected merge-commit auto-merge as
`053e8a72f859d8226d247ae35cf9eec0a2ad1a4d`. Its tree equals tested head
`324766622b8d5e75d7de7e3e2e1a0b482c989727`.
The five existing page exports now render their already released goal pages
without the retired Kit bodies or surface switch. This evidence follow-up
changes no application runtime, API, export, authentication, schema, provider,
setting or sale flag.

- [Exact-head CI 44627342458](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44627342458): all three full test shards and aggregate, typecheck, production build and E2E passed (8 E2E journeys). The optional capture matrix was not applicable and was skipped.
- [Merged-main CI 44628367308](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44628367308): passed.
- [Pages deployment 44628367146](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44628367146): passed.
- [Release verify 44629224149](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44629224149): passed; `release/verified` is successful.

[Release receipts](release.json) retain exact heads, job outcomes and public
workflow links without raw runner logs.

## Canonical read-only checks

[Identity receipt](identity.json), checked at `2026-11-19T22:29:25Z`:
canonical `/admin/activity` served web SHA `053e8a72`; `/api/health/ready`
returned HTTP 200, `ready`, API SHA
`e285f13c25da90b69ca3df172cb15f27dbb9826c`. That API SHA matched a freshly
read remote `api-runtime` commit marker before and after the readiness check.
The API did not need to deploy for this web-only delta; its expected SHA is
not assumed to equal the web SHA.

[Browser receipt](receipt.json) records **10/10 successful signed-out cases**
from `22:32:08Z` to `22:32:35Z`. Each used actual 1280×900@1x or
390×844@2x viewports, the exact deployed web SHA, one heading, and full-document
PNG capture. Desktop PNG width is 1280 pixels; phone PNG width is 780 pixels.
All cases have zero uncaught page errors, unexpected private API reads or
business-write attempts. No image is cropped to hide overflow.

| Canonical route | Desktop capture | Phone capture | Observed signed-out state |
|---|---|---|---|
| `/admin/activity` | [1280](activity-1280.png) | [390](activity-390.png) | Goal heading, administrator explanation, one Sign in action |
| `/admin/flow-health` | [1280](flow-health-1280.png) | [390](flow-health-390.png) | Goal heading, administrator explanation, one Sign in action |
| `/admin/schema` | [1280](schema-1280.png) | [390](schema-390.png) | Goal heading, administrator explanation, one Sign in action |
| `/admin/partners` | [1280](partners-1280.png) | [390](partners-390.png) | Goal heading, administrator explanation, one Sign in action |
| `/admin/smoke` | [1280](smoke-1280.png) | [390](smoke-390.png) | Not found; real status GET returned 404; fixture controls absent |

All ten images were natively inspected. The goal headings, explanations,
navigation and actions are readable and unclipped; smoke's plain Not found
state is expected. These are **signed-out checks only**, not real signed-in
admin workflow or mutation proof. No sign-in, reconcile, smoke activation,
sponsorship change, payment, migration or settings action occurred.

## Initial verifier failure and narrow repair

The first canonical attempt **failed before any successful case**: three
blocked `/api/csp-report` POSTs were counted as business writes. None reached
production. A separate read-only diagnosis found expected reports from the
existing report-only CSP: Cloudflare beacon, `eval`, and Sentry ingest.
There were no uncaught page errors. The policy and report handler are unchanged
by the retirement.

[Repair receipt](verifier-repair.json) and the exact successful
[external verifier](canonical-verifier.cjs) preserve the distinction. Only the
diagnosed report-only content type, disposition, document route and source
classes are recorded separately, and those requests are still aborted.
Every other business write or private read fails acceptance; an unexpected CSP
report also fails. This is not a CSP product fix or permission to send reports.

## Sentry and retained limitations

[Sentry receipt](sentry.json): fresh read-only searches in
`skipwait/skipwait-webapp`, `is:unresolved environment:production transaction:<route>`,
over the preceding 24 hours returned zero matches and no further page for all
five routes at `22:30:39Z`–`22:30:50Z`. This is a point-in-time query, **not a
new 24-hour post-release watch** or proof of all production paths.

- The 72 retained synthetic captures and 36 identical before/after pairs remain under [retirement-6f46](../../../design/goal-ui/captures/admin-ops/retirement-6f46/comparison.json). Their four populated-phone overflows remain real, pre-existing findings. [D-048-admin-ops-mobile-width](../../plans/D-048-admin-ops-mobile-width.md) stays separate and unfinished; signed-out width checks do not resolve it.
- The 5,400-second full-local run timed out without final totals. The unchanged-file diagnostic completed 56/57, failing the existing classifier timeout. Neither is green. No unchanged full-local rerun, weakened assertion, timeout increase or gate waiver was used. Complete CI passes above are separate evidence.
- The normal post-merge `--report landed` failed after GitHub deleted the merged source branch: the picker no longer recognized this session as a task holder. [Published delivery gap](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1332#issuecomment-7024000960) remains unresolved. No successful report marker, forced claim, restored source branch or forged marker is claimed. This protected documentation path records acceptance without bypassing that rejection.

## Evidence verification and continuation

Run `node docs/evidence/D-048-K-admin-ops/verify-evidence.mjs` to check image
hashes, PNG dimensions, exact identities, case outcomes and the preserved
release/Sentry receipts without accessing production.
`manifest.json` binds all ten image files and their visual-inspection result.
The copied external verifier can reproduce read-only checks with existing
Playwright dependencies; it takes checkout, expected web SHA and output-directory
arguments. Do not overwrite this historical receipt or treat it as current
identity after another release.

The follow-up was created from main `0facc46044f7e80e08803a36ceffb24a70f5e88b`
and normally fast-forwarded to `495bdd3991aef17c01eca809f0320abf17a73c20`
before its first commit. The incoming Premium source-repair routing receipt
is preserved; it adds no admin-ops change and does not release Premium's hold.
BRIEF, PRD, AGENTS, BUILD_CONTINUITY, COLLABORATION, retirement/admin packets,
prior PR outcome and decisions through D-367 were checked. D-367 changes pricing,
not this retirement's scope. All 386 queue rows, their order, both original
tail additions and every other row/hold are preserved. Premium #1254 and
seeker-passwords #324 remain outside this acceptance. No new decision or
runtime work is introduced.

Before protected landing, main advanced to
`a61d38ed046562cde723925e8c91317a2fe0d0e8`. A normal two-parent merge
preserves its D-368 Post Opportunity routing entry, parity dependency and new
FIFO-tail repair row. D-368 was read; it changes no admin-ops scope. All 387
current rows/order, both original tail additions and every other field/hold
survive. The only queue difference from that main is this task's `done` status;
its D-366 sync stamp and main's complete `DECISIONS.md` bytes remain unchanged.
Historical evidence files and runtime receipts are not regenerated.
