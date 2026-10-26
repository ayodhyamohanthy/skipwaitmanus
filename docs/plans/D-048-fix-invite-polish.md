# D-048-fix-invite-polish - goal /invite design findings from the post-merge pass

D-048-p3-invite landed (PR 577, fb420761) behind `goalSurfaceOn('invite')`
(OFF). The post-merge design-lens pass filed findings routed in PR 577
comment 6416616361. This row is the fix loop. Its packet is standalone: the
D-048-referrer packet bars adding rows to it.

## Contract

- `client/src/pages/goal/invite/GoalInvite.tsx`: replace the three literal
  whites with goal tokens - :155 main wrapper `bg-white`, :89 function
  select `bg-white`, :40 signed-out SignInButton `text-white`.
- Success copy "That's the growth loop." (:69) becomes plain goal copy
  (what happened, what is next). Update both pins:
  `client/src/pages/goal/invite/goalInvite.test.tsx:91` and
  `client/src/pages/referrerHome.test.tsx:297` (cross-surface pin; this row
  owns that file for this alignment only).
- Recapture the 390 set with settled layout (no stitch artifacts like the
  866/995px captures) and note in the capture comment how each captured
  state was reached (signed-out, request, invite, success).
- No behavior, route, flag or pricing change. `goalSurfaceOn('invite')`
  stays OFF. The dual-mode chooser (request/invite) is the packet-scoped
  design and is NOT changed (resolved in PR 577 comment 6416616361).
- Legacy `client/src/pages/Invite.tsx` is out of scope (flag-off surface).

## Gates

Tier 2: green CI on the exact head, design-token-audit clean, design
re-review of the new head's captures, one independent review (D-151).
