import type { Request, Response, NextFunction } from "express";
import type { DevIdentity } from "./devAuth";

/** D-140 / D-382: Maximum age (in seconds) of an interactive sign-in for money cards: 15 minutes. */
export const STEP_UP_MAX_AGE_SECONDS = 15 * 60; // 900 seconds

export type StepUpCheckResult =
  | { fresh: true; authTime: number; ageSeconds: number }
  | {
      fresh: false;
      code: "reauth_required";
      reason: "missing_auth_time" | "session_too_old" | "future_auth_time";
      ageSeconds?: number;
    };

/**
 * Pure assertion verifying that an identity was established by an interactive sign-in
 * no older than maxAgeSeconds (default 15 minutes).
 *
 * Rules:
 * 1. Missing, null, undefined identity, or non-positive safe integer authTime -> missing_auth_time
 * 2. Clock skew guard: authTime > nowSeconds + 60 -> future_auth_time
 * 3. Age > maxAgeSeconds -> session_too_old
 * 4. Otherwise -> fresh: true
 */
export function assertFreshInteractiveSession(
  identity: DevIdentity | undefined | null,
  maxAgeSeconds = STEP_UP_MAX_AGE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): StepUpCheckResult {
  if (
    !identity ||
    typeof identity.authTime !== "number" ||
    !Number.isSafeInteger(identity.authTime) ||
    identity.authTime <= 0
  ) {
    return { fresh: false, code: "reauth_required", reason: "missing_auth_time" };
  }
  // Clock skew guard: allow up to 60 seconds of future drift
  if (identity.authTime > nowSeconds + 60) {
    return { fresh: false, code: "reauth_required", reason: "future_auth_time" };
  }
  const ageSeconds = Math.max(0, nowSeconds - identity.authTime);
  if (ageSeconds > maxAgeSeconds) {
    return { fresh: false, code: "reauth_required", reason: "session_too_old", ageSeconds };
  }
  return { fresh: true, authTime: identity.authTime, ageSeconds };
}

/**
 * Express middleware guard requiring a fresh interactive seeker session
 * before proceeding (e.g. before money card approval).
 */
export function requireFreshSeekerSession(
  req: Request & { identity?: DevIdentity },
  res: Response,
  next: NextFunction
): void {
  const check = assertFreshInteractiveSession(req.identity);
  if (!check.fresh) {
    res.status(401).json({
      error: "reauth_required",
      code: "reauth_required",
      message: "Interactive sign-in required within the last 15 minutes to approve a purchase",
      reason: check.reason,
    });
    return;
  }
  next();
}
