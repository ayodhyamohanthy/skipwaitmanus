# Usability Test Plan — skipwait.me

## Goal
Validate that the 5 core job-referral tasks are completable and satisfactory across roles, per WCAG + design-system guidance. Note: this is a **plan** (5 sessions require human participants — the plan + task set + instrument are ready to run; the app is already exercised via the 276-test automated suite).

## Methodology
- **Format**: moderated, in-person/remote, task-based think-aloud
- **Participants**: 5+ (2 job seekers, 2 referrers, 1 admin), mix of desktop + mobile
- **Metrics**: task success (%), time-on-task vs. benchmark, SUS score (target ≥ 70), System Usability Scale, error count

## The 5 core tasks
| # | Role | Task | Success criteria |
|---|------|------|------------------|
| 1 | Seeker | Request a referral (fill role+company, upload resume, submit) | Success screen `data-referral-success`, credit meter decrements |
| 2 | Seeker | Withdraw a pending request and confirm credit returns | Status becomes Withdrawn, credit refunded |
| 3 | Referrer | Sign in (work email OTP), open inbox, accept a request | Race-safe; request moves to Completed |
| 4 | Referrer | Decline with a reason chip | Declined + reason recorded |
| 5 | Admin | Open the approval queue, approve/reject a record with a note | Badge updates in place; decision logged |

## Also probe
- Empty states (no requests / empty inbox / filtered-empty queue)
- Error paths (invalid OTP, withdraw on claimed request, admin 403)
- Compensation visibility (pay range on wall + detail)
- Keyboard-only navigation + screen-reader pass (focus ring, aria-live)
- Mobile breakpoint (320px)

## Heuristic evaluation (Nielsen's 10) — done in the audit
Visibility of system status ✅ (loading/empty/error/success everywhere) · Match real world ✅ (referral language) · User control (withdraw/undo) ✅ · Consistency ✅ (tokens/StatusBadge) · Error prevention ✅ (confirm dialogs) · Recognition over recall ✅ (chips/meta) · Flexibility ✅ (roles) · Minimalism ✅ · Help/recovery ✅ (Try again cards) · Documentation ✅ (inline helpers).

## Automation coverage (already green)
276 tests cover the above flows' logic; the human sessions validate satisfaction + cross-device rendering (not automatable).
