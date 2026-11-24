// D-174-pool-nudges (D-193 §5.9, D-384 (4)): the waiting-pool nudges switch.
//
// D-097: every part ships behind this switch, which stays off until QA verifies
// it. While it is false none of the parts runs: the inbox carries no waiting
// count, a pool delivery writes no review grant, the hourly pool-review-email
// job sends nothing and no release notice is written.
//
// It lives in this leaf module so server/db.ts and the job can both read it
// without an import cycle; server/poolNudges.ts re-exports it.
export const POOL_NUDGES_ENABLED = false;
