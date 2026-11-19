# Release log

One entry per live deploy, newest first. Written by the deploying lane before the health-gated deploy is called done.

Format: `| date (IST) | live commit | PR | what changed | rollback |`

| Date | Commit | PR | What changed | Rollback |
| --- | --- | --- | --- | --- |
| 2026-10-22 | 907bf2cd | #353 | D-038 timers live: the hourly `referral-timers` job runs both parts — 24 h claim reminder, 48 h claim/allocation lapse (no new credit, lapsed referrer excluded, at most 5 open claims per referrer), day-2/day-4 referred reminders, the 5-day (8 with one 3-day extension) referred lapse that reopens the ask and revokes the document grant without moving a ledger row, extend/step-back/seeker-confirm, and the north-star referred-within-7-days metric; the daily money check adds `refund_after_pickup` and `referred_deadline_stuck` | revert this commit and redeploy: the job registration goes with it and every step is replay-safe; setting `REFERRED_DEADLINE_ENABLED = false` stops part B without a revert |
| 2026-10-20 | e383a5d4 | - | Baseline for the goal-UI wave; health green | previous Worker version in the CF dashboard |
