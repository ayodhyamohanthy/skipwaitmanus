import { COOKIE_NAME } from "@shared/const";
import type { NextFunction, Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";

/**
 * Sliding session renewal for every role (seeker, referrer, admin). A valid session
 * token older than a day is replaced with a fresh one on the next /api request, so an
 * active person stays signed in and an idle one is signed out after 30 days.
 * Never throws: a renewal failure leaves the current cookie working until it expires.
 */
export async function sessionRenewal(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path.endsWith("logout")) return next();
    const current = req.headers.cookie?.match(/(?:^|;\s*)app_session_id=([^;]+)/)?.[1];
    if (current) {
      const renewed = await sdk.renewSessionIfDue(decodeURIComponent(current));
      if (renewed) res.cookie(COOKIE_NAME, renewed, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
    }
  } catch { /* keep the current session */ }
  next();
}
