# Record: whole-platform goal-design mandate (Oct 25 2026, evening)

Owner anchors (authenticated iMessage, newest first; IDs only, repo is public):

1. phonemsg-01M5STDB8BJW12X5Y4HF8EHZV3 (20:51): the pages are not redesigned
   per the goal-focused design; push that to the repo.
2. phonemsg-01M5STEZ4F7S410PFJ6ASSS43Y (20:51): the entire platform should
   have only goal-focused design.
3. phonemsg-01M5STFBWMKPCM7AZ2ERKZC5XS (20:51): not reskinning.
4. phonemsg-01M5STFM8C562Z826QDRP8VGYR (20:51): a proper goal-focused UI
   and UX.

## Reading (binding)

- Scope: the ENTIRE platform - every page, role, dialog and state (loading,
  empty, error, offline), seeker, referrer, employer, admin and public -
  not a few screens and not public pages only.
- Bar: goal-oriented flow redesign (information hierarchy, the one next
  action, honest status and cost, journey completion), NOT new colours,
  tokens or components over old layouts. A token swap or component overlay
  on a legacy layout fails by construction.
- Preserved: every frozen product rule and the working payment/auth
  functionality. Repair, not rewrite, never means retaining a bad UX layout.
- Honesty: no surface is complete on tokens alone; no platform-complete
  claim while any route still serves the kit page. Completion needs real
  journey proof on desktop 1280 and phone 390, and the legacy fallback
  removed or unreachable.
- Staged migration is acceptable; falsely reporting all-complete is not.

## Source material

The coverage inventory, quality bar, flow-vs-reskin assessment, definition
of done and ownership split are recorded from the design reviewer's brief in
docs/plans/DESIGN-goal-platform-brief-oct25.md (same PR). That brief is the
designer's analysis against this mandate; it is not a set of owner-approved
new layouts, and its PASS verdicts are source/capture reviews, not live
journey proof.

## Sequencing notes (coordinator)

- #592 queues RELEASED additions R1/R4 and unblocks four held rows; turning
  a surface on in production requires the actual safe journey verification
  first, not merely a design PASS.
- Open implementation PRs and registered-only surfaces are inventoried in
  the brief section 2; merging every open PR still leaves the
  registered-only surfaces (settings, profile, messages, support, policy,
  admin, employer, billing/premium, verify, system/links, public-profile,
  discovery, home-signed-in, skippy) needing new flow designs.

## Status

Mandate recorded Oct 25 2026. Assignment, merge/release sequencing and
functional proof tracking run under this record (todo-01M5STDVVVF5GC0X1YY9N2CDHQ).
