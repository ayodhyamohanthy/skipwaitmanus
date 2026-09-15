import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { isWorkEmailDomain } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { workEmailOtpService } from "../workEmailOtp";

/**
 * Referrer OTP-first login: the work-email OTP IS the sign-in.
 *
 * Flow: POST /api/auth/otp/send { email }  -> code via ZeptoMail (work domains only)
 *       POST /api/auth/otp/verify { email, code } -> app_session_id JWT issued.
 *
 * The verified company email becomes the identity (openId workemail_<email>),
 * enrolled as a referrer profile on first login, so the referrer lands ready
 * to receive their company's private requests. Seekers and admins keep their
 * separate entries (AuthKit / admin gate).
 */

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function registerReferrerOtpLoginRoutes(app: Express) {
  app.post("/api/auth/otp/send", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 320) {
        return res.status(400).json({ error: "Enter a valid work email address" });
      }
      const domain = email.split("@")[1];
      if (!isWorkEmailDomain(domain)) {
        return res.status(400).json({ error: "Referrers sign in with a company email. Personal email providers are not accepted." });
      }
      const result = await workEmailOtpService.sendCode(email, { ip: req.ip || req.header("cf-connecting-ip") || req.header("x-forwarded-for") || "unknown" });
      if (!result.sent) console.warn("[OTP] send failed:", result.reason, "| zepto key len:", (process.env.ZEPTOMAIL_API_KEY || "").length, "| from:", process.env.ZEPTOMAIL_FROM_EMAIL);
      if (result.sent) return res.json({ sent: true });
      if (result.reason === "rate_limited") { res.set("Retry-After", "600"); return res.status(429).json({ error: "Too many code requests. Wait before trying again.", retryAfterSeconds: 600 }); }
      if (result.reason === "invalid_domain") return res.status(400).json({ error: "Enter a deliverable work email address" });
      if (result.reason === "not_configured") return res.status(503).json({ error: "Email delivery is not configured yet" });
      return res.status(502).json({ error: "We could not deliver the code. Try again shortly." });
    } catch {
      res.status(500).json({ error: "We could not send the verification code" });
    }
  });

  app.post("/api/auth/otp/verify", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const code = normalizeEmail(req.body?.code);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Enter the six-digit code from your company email" });
      }
      const verified = await workEmailOtpService.verifyCode(email, code);
      if (!verified) {
        await workEmailOtpService.registerFailedAttempt(email, code);
        return res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." });
      }
      // Identity: the verified company email itself.
      const openId = `workemail_${email}`;
      const existing = await db.getUserByOpenId(openId);
      if (!existing) {
        await db.upsertUser({ openId, name: email.split("@")[0], email, loginMethod: "otp_work_email", lastSignedIn: new Date() });
      } else {
        await db.upsertUser({ openId, name: existing.name ?? email.split("@")[0], email, loginMethod: "otp_work_email", lastSignedIn: new Date() });
      }
      const account = await db.getUserByOpenId(openId);
      if (!account) return res.status(500).json({ error: "We could not complete sign-in. Please try again." });
      // First login: enroll the verified company address as the referrer profile
      const existingProfile = await db.getVerifiedWorkEmailAccess(account.id).catch(() => undefined);
      if (!existingProfile?.workEmailDomain) {
        await db.saveVerifiedWorkEmail(account.id, email).catch(() => undefined);
      }
      const token = await sdk.createSessionToken(openId, { name: account.name ?? email, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ signedIn: true, role: account.role, email });
    } catch {
      res.status(500).json({ error: "We could not verify the code" });
    }
  });

  app.post("/api/auth/otp/logout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
    res.json({ signedOut: true });
  });
}


