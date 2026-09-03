# Risk Register & Rollback — skipwait.me design

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User feedback drives layout change | Med | Med | Token-driven design → swap tokens, no structural rewrite; spec v1 keeps components stable |
| Brand update (new palette) | Low | Low | All colors are tokens (`--color-*`); a palette swap is a CSS-only change |
| Technical constraint (device/bandwidth) | Med | Med | 320px min, responsive utilities; offline = `prefers-reduced-motion` + cached shell |
| WCAG AA regression after edits | Low | Med | Contrast matrix in DESIGN_SYSTEM_SPEC §2; automated + manual keyboard check on each release |
| New feature (compensation) surprises referrers | Low | Low | Rendered only when present; muted meta style |

## Rollback plan (design iteration)
- **Design scope**: the design is implemented as live code, so rollback = `git revert` of the design commit(s). Current stable design = commit `2d6dc1c` (pre-compensation). To roll back the compensation feature: `git revert 5697760` (and optionally `41e5538` for the admin approvals screens).
- **Full app rollback**: `git revert <last N commits>` then push; the deploy pipeline self-verifies and the container keeps the previous good version until the revert image rolls.
- **Tested**: the pipeline's verify step + the 276-test suite + the WCAG contrast matrix are the pre-rollback gate.

## What to monitor post-release
- `/api/health` reported SHA matches the pushed commit (self-verifying pipeline)
- Error rate on `/api/admin/approval-queue` and the OTP sign-in path
- Compensation field presence on OpportunityWall / MyRequests (no empty placeholders)
- Keyboard/aria regressions on the 3 highest-traffic screens (MyRequests, MyCompanyInbox, Referrer)
