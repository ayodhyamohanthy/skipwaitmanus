// One place for the Retry-After header on 429s. Only call it where the limiter really knows when its window ends.
import type { Response } from "express";

/** Whole seconds until `untilMs`, never below 1 (a 0 would invite an instant retry that fails again). */
export function retryAfterSecondsUntil(untilMs: number, nowMs: number): number {
  if (!Number.isFinite(untilMs) || !Number.isFinite(nowMs)) return 1;
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

/** Sets Retry-After (delay-seconds form) and returns the seconds so the body can carry the same number. */
export function setRetryAfter(res: Pick<Response, "set">, seconds: number): number {
  const safe = Math.max(1, Math.ceil(Number.isFinite(seconds) ? seconds : 1));
  res.set("Retry-After", String(safe));
  return safe;
}
