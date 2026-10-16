import type { Express, Request, Response } from "express";
import type { WorkOS } from "@workos-inc/node";
import { getDb } from "../db";
import { sendTransactionalEmail } from "../emailDelivery";
import { OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError } from "../otpPolicy";
import { activeLockUntil, consumeLimits, limiterKey, recordVerifyFailure } from "../workEmailOtp";
import { resolveTrustedClientIp } from "./trustedClientIp";
import { completeWorkosLogin } from "./workosSession";

/**
 * Job-seeker email sign-in on skipwait.me (no hosted authkit.app screen). A six-digit WorkOS Magic Auth code is
 * created server-side, emailed from our own sender, and exchanged here for the WorkOS user, so the person is the
 * same WorkOS user (and the same canonical account) as on every other sign-in path. Referrers do NOT use this:
 * they use the work-email OTP (server/_core/otpLogin.ts). FOUNDER-LOCKED login rule, Oct 16 2026.
 *
 * Abuse limits reuse the work-email OTP limiter tables: sends are capped per IP, per address and globally, with a
 * resend cooldown; wrong codes lock the (email, IP) pair. Send always answers {sent:true} for a well-formed
 * address, so the endpoint never reveals whether an account exists. Codes are never logged.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

type Deps = { workos: Pick<WorkOS, "userManagement">; clientId: string; signHostedLink?: (input: { uid: string; sid: string }) => Promise<string | null>; sendEmail?: typeof sendTransactionalEmail };

export function registerSeekerEmailCodeRoutes(app: Express, deps: Deps) {
  const sendEmail = deps.sendEmail ?? sendTransactionalEmail;

  app.post("/api/auth/workos/email-code/send", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!EMAIL.test(email) || email.length > 320) return res.status(400).json({ error: "Enter a valid email address" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Sign-in is unavailable right now. Try again shortly." });
      const ip = resolveTrustedClientIp(req) || "unknown";
      try {
        await consumeLimits(db, [
          { key: limiterKey("seeker-ip10m", ip), windowMs: 600_000, limit: 10 },
          { key: limiterKey("seeker-email10m", email), windowMs: 600_000, limit: 3 },
          { key: limiterKey("seeker-email-cooldown", email), windowMs: OTP_RESEND_COOLDOWN_SECONDS * 1000, limit: 1 },
          { key: limiterKey("seeker-global1h", "all"), windowMs: 3_600_000, limit: 500 },
        ], Date.now());
      } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") {
          const retryAfterSeconds = (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds ?? 600;
          res.set("Retry-After", String(retryAfterSeconds));
          return res.status(429).json({ error: retryAfterSeconds <= OTP_RESEND_COOLDOWN_SECONDS ? "Wait a moment before requesting another code." : "Too many code requests. Wait before trying again.", retryAfterSeconds });
        }
        throw error;
      }
      const magic = await deps.workos.userManagement.createMagicAuth({ email, ipAddress: ip === "unknown" ? undefined : ip, userAgent: req.get("user-agent") ?? undefined });
      const delivery = await sendEmail({ to: email, subject: "Your skipwait.me sign-in code", text: `Your skipwait.me sign-in code is ${magic.code}. It expires in 10 minutes and works once.\n\nIf you did not request it, ignore this email - nothing changes.` }).catch(() => ({ sent: false }));
      if (!delivery.sent) return res.status(502).json({ error: "We could not deliver the code. Try again shortly." });
      res.json({ sent: true });
    } catch {
      res.status(500).json({ error: "We could not send the sign-in code" });
    }
  });

  app.post("/api/auth/workos/email-code/verify", async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!EMAIL.test(email) || email.length > 320 || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the six-digit code from your email" });
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Sign-in is unavailable right now. Try again shortly." });
      const ip = resolveTrustedClientIp(req) || "unknown";
      const now = Date.now();
      const lockedUntil = await activeLockUntil(db, email, ip, now);
      if (lockedUntil) throw new OtpLockedError(lockedUntil, Math.max(1, Math.ceil((lockedUntil.getTime() - now) / 1000)));
      try {
        await consumeLimits(db, [
          { key: limiterKey("seeker-verify-ip10m", ip), windowMs: 600_000, limit: 20 },
          { key: limiterKey("seeker-verify-email10m", email), windowMs: 600_000, limit: 10 },
        ], now);
      } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") return res.status(429).json({ error: "Too many tries. Try again later." });
        throw error;
      }
      let auth;
      try {
        auth = await deps.workos.userManagement.authenticateWithMagicAuth({ clientId: deps.clientId, code, email, ipAddress: ip === "unknown" ? undefined : ip, userAgent: req.get("user-agent") ?? undefined });
      } catch {
        try { await recordVerifyFailure(db, email, ip, now); } catch { /* counters are best effort */ }
        const nowLocked = await activeLockUntil(db, email, ip, now).catch(() => null);
        if (nowLocked) throw new OtpLockedError(nowLocked, Math.max(1, Math.ceil((nowLocked.getTime() - now) / 1000)));
        return res.status(400).json({ error: "That code could not be verified. Check the latest code and try again." });
      }
      const outcome = await completeWorkosLogin(req, res, { user: auth.user, sealedSession: auth.sealedSession, accessToken: auth.accessToken, signHostedLink: deps.signHostedLink });
      if (outcome.status === "blocked") return res.status(403).json({ error: "We could not complete sign-in. Contact support@skipwait.me." });
      res.json({ signedIn: true });
    } catch (error) {
      if (error instanceof OtpLockedError) { res.set("Retry-After", String(error.retryAfterSeconds)); return res.status(429).json({ error: "Too many tries. Try again later.", retryAfterSeconds: error.retryAfterSeconds }); }
      res.status(500).json({ error: "We could not verify the code" });
    }
  });
}
