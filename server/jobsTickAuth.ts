// Verifies the Worker cron's tick token (protocol: shared/jobsTick.ts).
// The token is HMAC-SHA256(JWT_SECRET, "jobs-tick:" + unix minute); no other
// secret exists for it. Every candidate minute is derived and compared in
// constant time, so timing never reveals which minute matched or how much of a
// forged token was right.
import { timingSafeEqual } from "node:crypto";
import { deriveJobsTickToken, JOBS_TICK_TOKEN_PATTERN, unixMinute } from "../shared/jobsTick";

/**
 * Accepted minutes either side of the container clock. The cron fires exactly
 * on a minute boundary, so a Worker clock a few hundred milliseconds ahead of
 * (or behind) the container must not turn a genuine tick into a 401.
 */
export const JOBS_TICK_MINUTE_SKEW = 1;

export async function verifyJobsTickToken(presented: string | undefined, secret: string, nowMs: number): Promise<boolean> {
  if (!secret || typeof presented !== "string" || !JOBS_TICK_TOKEN_PATTERN.test(presented)) return false;
  const given = Buffer.from(presented, "hex");
  const minute = unixMinute(nowMs);
  let matched = false;
  for (let offset = -JOBS_TICK_MINUTE_SKEW; offset <= JOBS_TICK_MINUTE_SKEW; offset += 1) {
    if (minute + offset < 0) continue;
    const expected = Buffer.from(await deriveJobsTickToken(secret, minute + offset), "hex");
    if (timingSafeEqual(given, expected)) matched = true;
  }
  return matched;
}
