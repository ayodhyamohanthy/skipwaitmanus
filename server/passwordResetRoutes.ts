import { createHash, createHmac } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { SignJWT, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { WorkOS } from "@workos-inc/node";
import { and, eq, lt, sql } from "drizzle-orm";
import { workEmailOtpRateLimits } from "../drizzle/schema";
import * as db from "./db";
import { configuredWorkosClientId, resolveWorkosOpenId, workosConfigured } from "./_core/workosAuth";
import { resolveTrustedClientIp } from "./_core/trustedClientIp";
import { sendTransactionalEmail } from "./emailDelivery";
import { captureServerError } from "./sentry";
import {
  PASSWORD_RESET_LINK_TTL_MS, PASSWORD_RESET_PATHS, passwordResetConfirmRequestSchema, passwordResetSendRequestSchema,
  passwordResetStatusRequestSchema, resetLinkTokenSchema,
  type PasswordResetConfirmResponse, type PasswordResetSendResponse, type PasswordResetStatusResponse,
} from "@shared/passwordReset";
import type { TransactionalEmailInput, TransactionalEmailResult } from "./emailDelivery";

/**
 * Forgot / reset password over WorkOS AuthKit (the only credential store).
 *
 * POST send    { email }           -> always the same neutral 202 once rate limits pass; the WorkOS
 *                                     lookup and email run after the response (no enumeration, even by timing).
 * POST status  { token }           -> valid | expired | invalid (local signature + expiry check only).
 * POST confirm { token, password } -> WorkOS resetPassword, then every app + WorkOS session is revoked.
 *
 * The emailed link carries WorkOS's one-time token inside a link signed here, so a link
 * never outlives one hour even if the provider token would, and expiry is a typed answer.
 */

export type RateLimitRule = { readonly key: string; readonly windowMs: number; readonly limit: number };
export type RateLimitDecision = { readonly ok: true } | { readonly ok: false; readonly reason: "limited"; readonly retryAfterSeconds: number } | { readonly ok: false; readonly reason: "unavailable" };
export type ResetUserManagement = {
  createPasswordReset(options: { email: string }): Promise<{ id: string; email: string; passwordResetToken: string; expiresAt: string }>;
  resetPassword(options: { token: string; newPassword: string }): Promise<{ user: { id: string } }>;
};
export type PasswordResetDependencies = {
  userManagement: ResetUserManagement | null;
  linkSecret: string;
  appOrigin: (req: Request) => string | null;
  sendEmail: (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>;
  consumeRateLimit: (rules: readonly RateLimitRule[], nowMs: number) => Promise<RateLimitDecision>;
  /** Signs the person out everywhere (every alias). Resolves false when any part could not be confirmed. */
  revokeSessions: (workosUserId: string) => Promise<boolean>;
  clientIp: (req: Request) => string;
  now: () => number;
  defer: (task: () => Promise<void>) => void;
  reportError: (error: unknown, context: Record<string, string>) => void;
};

const LINK_AUDIENCE = "skipwait-password-reset";
const LINK_ISSUER = "https://skipwait.me";
const linkPayloadSchema = z.object({ rt: z.string().min(1).max(2048) });
const smallJson = express.json({ limit: "8kb" });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const linkKey = (secret: string) => createHmac("sha256", secret).update("skipwait-password-reset-link-v1").digest();

export async function sealResetLink(secret: string, input: { providerToken: string; resetId: string; nowMs: number; providerExpiresAt: string }): Promise<{ token: string; expiresAtMs: number }> {
  const providerExpiry = Date.parse(input.providerExpiresAt);
  const expiresAtMs = Math.min(input.nowMs + PASSWORD_RESET_LINK_TTL_MS, Number.isFinite(providerExpiry) ? providerExpiry : Infinity);
  const token = await new SignJWT({ rt: input.providerToken }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(LINK_ISSUER).setAudience(LINK_AUDIENCE)
    .setSubject(input.resetId).setIssuedAt(Math.floor(input.nowMs / 1000)).setExpirationTime(Math.floor(expiresAtMs / 1000)).sign(linkKey(secret));
  return { token, expiresAtMs };
}

export async function openResetLink(secret: string, token: string, nowMs: number): Promise<{ status: "valid"; providerToken: string } | { status: "expired" } | { status: "invalid" }> {
  try {
    const { payload } = await jwtVerify(token, linkKey(secret), { algorithms: ["HS256"], issuer: LINK_ISSUER, audience: LINK_AUDIENCE, currentDate: new Date(nowMs) });
    const parsed = linkPayloadSchema.safeParse(payload);
    return parsed.success ? { status: "valid", providerToken: parsed.data.rt } : { status: "invalid" };
  } catch (error) {
    // jose checks the signature before the claims, so an expired verdict is never given to a forged link.
    return error instanceof joseErrors.JWTExpired ? { status: "expired" } : { status: "invalid" };
  }
}

function providerFailure(error: unknown): { status: number | null; text: string; retryAfter: number | null } {
  if (!error || typeof error !== "object") return { status: null, text: "", retryAfter: null };
  const status = "status" in error && typeof error.status === "number" ? error.status : null;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const retryAfter = "retryAfter" in error && typeof error.retryAfter === "number" ? error.retryAfter : null;
  return { status, text: `${code} ${message}`.toLowerCase(), retryAfter };
}

/** Maps a WorkOS resetPassword failure to the typed contract; anything unrecognised is a retryable failure. */
export function classifyResetFailure(error: unknown): PasswordResetConfirmResponse {
  const failure = providerFailure(error);
  if (failure.status === 429) return { status: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(failure.retryAfter ?? 60)) };
  if (failure.status === 404 || (failure.status !== null && failure.status < 500 && /token|expired|not.?found|already.?used/.test(failure.text))) return { status: "expired" };
  if (failure.status === 400 || failure.status === 422) return { status: "password_rejected" };
  return { status: "failed" };
}

const HTTP_STATUS: Record<PasswordResetConfirmResponse["status"] | PasswordResetSendResponse["status"] | PasswordResetStatusResponse["status"], number> = {
  sent: 202, invalid_email: 400, valid: 200, updated: 200, weak_password: 400, invalid: 400, expired: 410,
  password_rejected: 422, rate_limited: 429, failed: 502, unavailable: 503,
};
function reply(res: Response, body: PasswordResetSendResponse | PasswordResetStatusResponse | PasswordResetConfirmResponse) {
  if (body.status === "rate_limited") res.set("Retry-After", String(body.retryAfterSeconds));
  res.set("Cache-Control", "no-store").status(HTTP_STATUS[body.status]).json(body);
}
function limited(decision: RateLimitDecision) {
  if (decision.ok) return null;
  return decision.reason === "limited" ? { status: "rate_limited" as const, retryAfterSeconds: decision.retryAfterSeconds } : { status: "unavailable" as const };
}

function resetEmail(link: string, expiresAtMs: number, nowMs: number): Omit<TransactionalEmailInput, "to"> {
  const minutes = Math.max(1, Math.round((expiresAtMs - nowMs) / 60_000));
  const window = minutes >= 60 ? "1 hour" : `${minutes} minutes`;
  const safeLink = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return {
    subject: "Reset your SkipWait password",
    text: `Use this link to set a new SkipWait password. It works for ${window}, once.\n\n${link}\n\nDidn't ask for this? Ignore this email. Your password stays the same.`,
    html: `<p>Use this link to set a new SkipWait password. It works for ${window}, once.</p><p><a href="${safeLink}">Set a new password</a></p><p>Didn't ask for this? Ignore this email. Your password stays the same.</p>`,
  };
}

export function registerPasswordResetRoutes(app: Express, deps: PasswordResetDependencies = createWorkosPasswordResetDependencies()) {
  app.post(PASSWORD_RESET_PATHS.send, smallJson, async (req, res) => {
    const parsed = passwordResetSendRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply(res, { status: "invalid_email" });
    const userManagement = deps.userManagement;
    const origin = deps.appOrigin(req);
    if (!userManagement || !deps.linkSecret || !origin) return reply(res, { status: "unavailable" });
    const { email } = parsed.data;
    const nowMs = deps.now();
    const decision = await deps.consumeRateLimit([
      { key: `pwr-ip10m:${digest(deps.clientIp(req))}`, windowMs: 600_000, limit: 10 },
      { key: `pwr-email10m:${digest(email)}`, windowMs: 600_000, limit: 3 },
      { key: `pwr-email1m:${digest(email)}`, windowMs: 60_000, limit: 1 },
      { key: `pwr-global1h:${digest("all")}`, windowMs: 3_600_000, limit: 300 },
    ], nowMs).catch((): RateLimitDecision => ({ ok: false, reason: "unavailable" }));
    const blocked = limited(decision);
    if (blocked) return reply(res, blocked);
    reply(res, { status: "sent" });
    deps.defer(async () => {
      let reset: Awaited<ReturnType<ResetUserManagement["createPasswordReset"]>>;
      try { reset = await userManagement.createPasswordReset({ email }); } catch (error) {
        const { status } = providerFailure(error);
        // No account (or one WorkOS will not reset) looks exactly like success to the caller.
        if (status === 400 || status === 404 || status === 422) return;
        return deps.reportError(error, { stage: "password_reset_create" });
      }
      const sealed = await sealResetLink(deps.linkSecret, { providerToken: reset.passwordResetToken, resetId: reset.id, nowMs, providerExpiresAt: reset.expiresAt });
      if (sealed.expiresAtMs <= deps.now()) return deps.reportError(new Error("WorkOS returned an already-expired reset token"), { stage: "password_reset_seal" });
      const link = `${origin}/reset-password?token=${encodeURIComponent(sealed.token)}`;
      const delivery = await deps.sendEmail({ to: reset.email, ...resetEmail(link, sealed.expiresAtMs, nowMs) });
      if (!delivery.sent) deps.reportError(new Error(`Password reset email not delivered: ${delivery.reason}`), { stage: "password_reset_email" });
    });
  });

  app.post(PASSWORD_RESET_PATHS.status, smallJson, async (req, res) => {
    const parsed = passwordResetStatusRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply(res, { status: "invalid" });
    if (!deps.linkSecret) return reply(res, { status: "unavailable" });
    const decision = await deps.consumeRateLimit([{ key: `pwr-status-ip10m:${digest(deps.clientIp(req))}`, windowMs: 600_000, limit: 60 }], deps.now())
      .catch((): RateLimitDecision => ({ ok: false, reason: "unavailable" }));
    const blocked = limited(decision);
    if (blocked) return reply(res, blocked);
    const opened = await openResetLink(deps.linkSecret, parsed.data.token, deps.now());
    return reply(res, opened.status === "valid" ? { status: "valid" } : opened);
  });

  app.post(PASSWORD_RESET_PATHS.confirm, smallJson, async (req, res) => {
    const parsed = passwordResetConfirmRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const tokenOnly = z.object({ token: resetLinkTokenSchema, password: z.string() }).strict().safeParse(req.body);
      return reply(res, tokenOnly.success ? { status: "weak_password" } : { status: "invalid" });
    }
    const userManagement = deps.userManagement;
    if (!userManagement || !deps.linkSecret) return reply(res, { status: "unavailable" });
    const { token, password } = parsed.data;
    const decision = await deps.consumeRateLimit([
      { key: `pwr-confirm-ip10m:${digest(deps.clientIp(req))}`, windowMs: 600_000, limit: 10 },
      { key: `pwr-confirm-link10m:${digest(token)}`, windowMs: 600_000, limit: 5 },
    ], deps.now()).catch((): RateLimitDecision => ({ ok: false, reason: "unavailable" }));
    const blocked = limited(decision);
    if (blocked) return reply(res, blocked);
    const opened = await openResetLink(deps.linkSecret, token, deps.now());
    if (opened.status !== "valid") return reply(res, opened);
    let workosUserId: string;
    try { workosUserId = (await userManagement.resetPassword({ token: opened.providerToken, newPassword: password })).user.id; } catch (error) {
      const outcome = classifyResetFailure(error);
      if (outcome.status === "failed") deps.reportError(error, { stage: "password_reset_confirm" });
      return reply(res, outcome);
    }
    const otherSessionsSignedOut = await deps.revokeSessions(workosUserId).catch(error => { deps.reportError(error, { stage: "password_reset_revoke" }); return false; });
    return reply(res, { status: "updated", otherSessionsSignedOut });
  });
}

class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) { super("PASSWORD_RESET_RATE_LIMITED"); }
}

function affectedRows(result: unknown): number {
  const header: unknown = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header && typeof header.affectedRows === "number" ? header.affectedRows : 0;
}

/** Durable fixed-window limiter on the existing limiter table (keys are prefixed `pwr-` and hashed). */
async function consumeDurableRateLimit(rules: readonly RateLimitRule[], nowMs: number): Promise<RateLimitDecision> {
  const database = await db.getDb();
  if (!database) return { ok: false, reason: "unavailable" };
  try {
    await database.transaction(async tx => {
      await tx.delete(workEmailOtpRateLimits).where(lt(workEmailOtpRateLimits.expiresAt, new Date(nowMs)));
      for (const rule of rules) {
        const start = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
        const inserted = await tx.execute(sql`INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${rule.key}, ${new Date(start)}, 1, ${new Date(start + rule.windowMs)})`);
        if (affectedRows(inserted) === 1) continue;
        const incremented = await tx.update(workEmailOtpRateLimits).set({ hitCount: sql`${workEmailOtpRateLimits.hitCount} + 1` })
          .where(and(eq(workEmailOtpRateLimits.limiterKey, rule.key), eq(workEmailOtpRateLimits.windowStart, new Date(start)), lt(workEmailOtpRateLimits.hitCount, rule.limit)));
        if (affectedRows(incremented) !== 1) throw new RateLimitedError(Math.max(1, Math.ceil((start + rule.windowMs - nowMs) / 1000)));
      }
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof RateLimitedError) return { ok: false, reason: "limited", retryAfterSeconds: error.retryAfterSeconds };
    throw error;
  }
}

/** Reset links always point at the canonical app origin, never at a caller-supplied Host header. */
function canonicalAppOrigin(req: Request): string | null {
  const configured = process.env.WORKOS_REDIRECT_URI;
  if (configured) { try { return new URL(configured).origin; } catch { return null; } }
  return process.env.NODE_ENV === "production" ? null : `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

export function createWorkosPasswordResetDependencies(): PasswordResetDependencies {
  let workos: WorkOS | null = null;
  try { if (workosConfigured()) workos = new WorkOS(process.env.WORKOS_API_KEY ?? "", { clientId: configuredWorkosClientId() }); } catch { workos = null; }
  const reportError = (error: unknown, context: Record<string, string>) => {
    console.warn("[password-reset]", context.stage ?? "unknown", error instanceof Error ? error.name : "unknown");
    captureServerError(error, context);
  };
  return {
    userManagement: workos ? workos.userManagement : null,
    linkSecret: process.env.WORKOS_COOKIE_PASSWORD ?? "",
    appOrigin: canonicalAppOrigin,
    sendEmail: sendTransactionalEmail,
    consumeRateLimit: consumeDurableRateLimit,
    revokeSessions: async workosUserId => {
      // Same revocation path as suspension: sessionsValidAfter on the account and its canonical person.
      // WorkOS sessions are revoked even when the database is down; only a full revocation reports true.
      let appSessionsRevoked = false;
      if (await db.getDb()) {
        const match = await db.findUserByWorkosId(workosUserId);
        await db.revokeUserSessions(match?.openId ?? resolveWorkosOpenId(workosUserId));
        appSessionsRevoked = true;
      }
      if (!workos) return false;
      const sessions = await (await workos.userManagement.listSessions(workosUserId)).autoPagination();
      for (const session of sessions) if (session.status === "active") await workos.userManagement.revokeSession({ sessionId: session.id });
      return appSessionsRevoked;
    },
    clientIp: resolveTrustedClientIp,
    now: () => Date.now(),
    defer: task => { void task().catch(error => reportError(error, { stage: "password_reset_deferred" })); },
    reportError,
  };
}
