import type { Request, Response } from "express";
import type { z } from "zod";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { PASSWORD_AUTH_COPY, type PasswordAuthErrorCode, type PasswordStep } from "@shared/passwordAuth";
import * as db from "../db";
import type { TransactionalEmailInput, TransactionalEmailResult } from "../emailDelivery";
import type { PasswordWitnessStore } from "../passwordWitness";
import { captureServerError } from "../sentry";
import { configuredPublicOrigin, isTrustedAuthPost } from "./authPostGuard";
import { activeDurableLock, consumeDurableLimits, type DurableLimit, type DurableLimitStore } from "./durableRateLimit";
import type { PasswordWorkosClient } from "./passwordWorkosClient";
import { describeWorkosError } from "./workosPasswordErrors";

/**
 * Shared plumbing for the seeker password routes: one error shape (shared/passwordAuth.ts), fail-closed
 * limits, the login-CSRF guard, and reporting that never carries an email, password, token or WorkOS message.
 * The routes are registered before the Express error middleware, so every failure is answered and reported here.
 */
export type PasswordEmailStanding = "verified_seeker" | "referrer_work_email" | "unknown";
export type PasswordEmailStandingLookup = (email: string, lookup?: { readonly workosUserId?: string }) => Promise<PasswordEmailStanding>;
export type PasswordRouteContext = {
  readonly client: PasswordWorkosClient | null;
  /** undefined: the MySQL limiter; null: no durable store (every limited route fails closed). */
  readonly store: DurableLimitStore | null | undefined;
  readonly now: () => number;
  /** Runs work after the response is sent (forgot, sign-up, the emailed links), so timing says nothing. */
  readonly defer: (task: () => Promise<void>) => void;
  /** SkipWait's own sender (server/emailDelivery.ts) for the password links (D-078 ruling 6); never throws. */
  readonly sendEmail: (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>;
  /** Whether a password's setter proved the inbox (server/passwordWitness.ts, D-078 ruling 5). */
  readonly witness: PasswordWitnessStore;
  /** Read-only, and throws when it cannot decide (server/passwordAccountLookup.ts); runs before any write or WorkOS call. */
  readonly emailStanding: PasswordEmailStandingLookup;
};

const STATUS: Readonly<Record<PasswordAuthErrorCode, number>> = {
  invalid_input: 400, invalid_credentials: 401, expired: 400, weak_password: 400, rate_limited: 429,
  forbidden_origin: 403, account_review: 403, account_inactive: 403, use_work_email_code: 403, use_another_method: 403,
  password_sign_in_unavailable: 503, temporarily_unavailable: 503,
};

export function sendPasswordError(res: Response, code: PasswordAuthErrorCode, options: { readonly retryAfterSeconds?: number; readonly message?: string } = {}): void {
  const retryAfterSeconds = options.retryAfterSeconds === undefined ? undefined : Math.min(86_400, Math.max(1, Math.ceil(options.retryAfterSeconds)));
  if (retryAfterSeconds) res.set("Retry-After", String(retryAfterSeconds));
  res.set("Cache-Control", "no-store").status(STATUS[code]).json({ ok: false, code, message: options.message ?? PASSWORD_AUTH_COPY[code], ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
}

export function sendPasswordStep(res: Response, step: PasswordStep): void {
  res.set("Cache-Control", "no-store").status(200).json(step);
}

/** Login-CSRF guard and strict parsing, in that order; null means the response is already sent. */
export function guardPasswordPost<T>(req: Request, res: Response, schema: z.ZodType<T>): T | null {
  if (!isTrustedAuthPost(req)) { sendPasswordError(res, "forbidden_origin"); return null; }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendPasswordError(res, "invalid_input"); return null; }
  return parsed.data;
}

/** All-or-nothing durable limits; a missing store fails closed. False means the response is already sent. */
export async function passLimits(ctx: PasswordRouteContext, res: Response, limits: readonly DurableLimit[]): Promise<boolean> {
  const result = await consumeDurableLimits(limits, { store: ctx.store, now: ctx.now() });
  if (result.allowed) return true;
  if (result.reason === "unavailable") { console.error("[password-auth] durable limiter unavailable"); sendPasswordError(res, "temporarily_unavailable"); return false; }
  sendPasswordError(res, "rate_limited", { retryAfterSeconds: result.retryAfterSeconds });
  return false;
}

export async function passLock(ctx: PasswordRouteContext, res: Response, lockKeys: readonly string[]): Promise<boolean> {
  const lock = await activeDurableLock(lockKeys, { store: ctx.store, now: ctx.now() });
  if (lock.locked === false) return true;
  if (lock.locked === "unavailable") { sendPasswordError(res, "temporarily_unavailable"); return false; }
  sendPasswordError(res, "rate_limited", { retryAfterSeconds: lock.retryAfterSeconds });
  return false;
}

/** Where to land after signing in: a validated same-site path that is not an auth page, else the job search. */
export function signedInDestination(req: Request, returnTo: string | undefined): string {
  const origin = configuredPublicOrigin() ?? `${req.protocol}://${req.get("host") ?? "localhost"}`;
  return safeSignInReturnTo(returnTo, origin) ?? "/explore";
}

/** The real client IP and browser for WorkOS Radar, so it does not see every attempt as the API container. */
export function clientContext(req: Request): { ipAddress?: string; userAgent?: string } {
  const ip = (req.ip ?? "").replace(/^::ffff:/, "");
  const userAgent = req.get("user-agent")?.slice(0, 512);
  return { ...(ip ? { ipAddress: ip } : {}), ...(userAgent ? { userAgent } : {}) };
}

/** Console and Sentry get the operation, our classification and WorkOS's name/status/code/request id only. */
export function reportPasswordFailure(operation: string, kind: string, error: unknown): void {
  const described = describeWorkosError(error);
  console.warn("[password-auth]", { operation, kind, ...described });
  captureServerError(new Error(`Seeker password ${operation} failed: ${kind}`), { operation, kind, ...described });
}

export function failUnexpectedly(res: Response, operation: string, error: unknown): void {
  reportPasswordFailure(operation, "unexpected", error);
  if (!res.headersSent) sendPasswordError(res, "temporarily_unavailable");
}

/** D-054 funnel events: never the email, password, token or WorkOS ids. */
export function recordPasswordActivity(action: string, outcome: "success" | "failure" | "denied", metadata: Record<string, string>, actorUserId?: number): void {
  void Promise.resolve()
    .then(() => db.recordOperationalActivity({ action, outcome, resourceType: "auth", ...(actorUserId ? { actorUserId } : {}), metadata }))
    .catch(() => undefined);
}

/**
 * A 401 from WorkOS is either a wrong password or a broken API key. Answer "wrong password", but alert once
 * when many arrive with no success in between, which is what a revoked or mistyped key looks like.
 */
let unauthorizedStreak = 0;
const UNAUTHORIZED_ALERT_AFTER = 25;
export function noteWorkosUnauthorized(error: unknown): void {
  if (describeWorkosError(error).status !== 401) return;
  unauthorizedStreak += 1;
  if (unauthorizedStreak === UNAUTHORIZED_ALERT_AFTER) reportPasswordFailure("sign_in", "unauthorized_streak", error);
}
export function noteWorkosSuccess(): void { unauthorizedStreak = 0; }
