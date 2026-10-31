# D-048-wrapper-notice-cookie-repair

Docs-only registration of the existing #877 acceptance finding, not a new feature or a completed repair.

- Base checked: main aa16ce3c03b1874ceadbe90db3b40e2c34df8467, 2026-10-31.
- Parent: D-048-F-app-wrapper, merged #877. Its original acceptance requires whole-page notices with no cookie-banner overlap. The 390 first-visit offline and slow notice is hidden below the banner. README acknowledgment does not change that acceptance.
- Goal: visitors can see the real network state while cookie choices remain accessible.
- Tier 2, lane d048-app-wrapper. Depends on completed D-048-F-app-wrapper. Register at the end of the existing queue, changing no existing order or status. Normal FIFO and picker rules apply; registration is not a dispatch or a claim.
- Newest register checked: D-255. Read current owner instructions and register again before claiming or editing.

## Owns
- client/src/components/goal/wrapper/GoalNotice.tsx
- client/src/components/goal/wrapper/goalNotice.cookieLayout.test.tsx (new)
- design/goal-ui/captures/app-wrapper-cookie-repair/** (new proof folder)
- This packet's Status section.

## Boundaries
CookieConsent.tsx, cookie behavior, consent storage, tracking, shell parts and held #767 stay unchanged and read-only. No App.tsx change, route release, env/flag edit, global z-index change, production operation or new package. Preserve every existing app-wrapper capture. Do not place the notice over cookie choices or hide the notice to pass overlap checks. Preserve offline/slow triggers, copy, ARIA status/live region, no layout shift and page pointer behavior. Existing error/update/toast behavior is unchanged.

## Red first
Before changing GoalNotice, add a regression that fails on the current 390 first-visit landing with cookie banner open for both offline and slow states. Assert the visible pill, not only its full-width container: legible, inside the viewport and not occluded by/intersecting the cookie dialog. Pin the absence of layout shift and consent action obstruction. Keep cookie-dismissed and 1280 controls. A DOM class assertion alone is not pixel proof; use the existing capture tooling with fictional fixtures and inspect actual images.

## Acceptance and proof
Capture 390 and 1280 with cookie-open offline, cookie-open slow and cookie-dismissed controls; retain source head, viewport, DPR, command and visible-pill/dialog boxes in a new manifest. Inspect actual full-page pixels for visibility, clipping, contrast and clickable cookie actions. Preserve existing tests and reproduce the red-before/green-after regression. Run current packet-required checks, focused behavior/layout/boundary tests, design token audit, normal and goal-all builds, scope-check, and required CI on the exact candidate composed with current main. Obtain an independent delta/design check, not the repairer's self-acceptance. Land through the normal gate only, with required authority for the release consequence; no forced merge. Verify released head and affected visuals before closing the existing finding.

## Status
Unimplemented and unclaimed. Registration only. No runtime or production operation performed.

## Coordination provenance and narrow scope
A pause on starting new rows has been propagated through project coordination and repository instructions. The recovered explicit pause wording was an earlier coordination suggestion; the subsequent owner-channel messages at 06:48 and 07:20 on Oct 31 forward Hark's reports of that pause. Those forwards do not by themselves establish owner adoption, and no direct owner adoption or rejection has been recovered. The origin and scope of owner adoption therefore remain uncertain; this packet does not describe the pause as either a confirmed founder ruling or merely optional advice.

Project coordination now makes a narrow operational disposition for this already released, previously reported acceptance defect: register its bounded repair through the normal D-200 packet/queue path. This disposition is not a founder reopening, a silence-based waiver, or permission for new product builds. Existing new-build pause, FIFO, file holds, privacy/security restrictions, production/settings/migration/drill/spending limits and genuinely owner-grounded frozen decisions remain unchanged. The row is appended without moving any earlier task; the picker must still select it normally before implementation. If conflicting authenticated owner scope is recovered, stop the affected action and resolve it through the existing coordination route.

The original wrapper row remains done as historical implementation; this follow-through row carries only its still-open notice acceptance gap. No second writer is assigned by this PR. The implementer reports actual claim receipt, exact branch/head and productive red-first progress before continuation is described as running.
