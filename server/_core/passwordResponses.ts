import type { Request, Response } from "express";
import type { z } from "zod";
import { safeSignInReturnTo } from "@shared/authReturnTo";
import { PASSWORD_AUTH_COPY, type PasswordAuthErrorCode, type PasswordStep } from "@shared/passwordAuth";
import * as db from "../db";
import type { TransactionalEmailInput, TransactionalEmailResult } from "../emailDelivery";
import type { PasswordWitnessStore } from "../passwordWitness";
import { captureServerError } from "../sentry";
import { recordAuthEvent, type AuthAction, type AuthReason } from "../authEvents";
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
/**
 * "password" (the default, every password path): any address at a verified referrer domain counts as a referrer
 * work email (D-081). "social" (the OAuth callback only): the exact-email rule, so a seeker's own Google account at
 * such a company still signs in.
 */
export type PasswordStandingRule = "password" | "social";
export type PasswordEmailStandingLookup = (email: string, lookup?: { readonly workosUserId?: string; readonly rule?: PasswordStandingRule }) => Promise<PasswordEmailStanding>;
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
  /** S-6: sign-in and sign-up answer no sooner than this (plus jitter) after they start; 0 turns it off (tests). */
  readonly responseFloorMs: number;
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

/**
 * Console and Sentry get the operation, our classification and WorkOS's name/status/code/request id only, plus
 * optional machine-code details (workosErrorCodes); never an email, password, token, link or WorkOS message.
 */
export function reportPasswordFailure(operation: string, kind: string, error: unknown, details: Readonly<Record<string, string>> = {}): void {
  const described = describeWorkosError(error);
  console.warn("[password-auth]", { operation, kind, ...described, ...details });
  captureServerError(new Error(`Seeker password ${operation} failed: ${kind}`), { operation, kind, ...described, ...details });
}

export function failUnexpectedly(res: Response, operation: string, error: unknown): void {
  reportPasswordFailure(operation, "unexpected", error);
  if (!res.headersSent && res.locals.passwordAnswered !== true) sendPasswordError(res, "temporarily_unavailable");
}

/**
 * S-6 (D-078 ruling 7): the time a sign-in or sign-up takes must not say what the server found for an email (an
 * unknown address, a wrong password, a missing witness, a new or existing account). Every answer is held until a
 * floor of AUTH_RESPONSE_FLOOR_MS plus up to a quarter of it in jitter after the request started; slower answers go
 * at once. The first answer wins, with the status it was given; the session cookie is set with it.
 */
export const AUTH_RESPONSE_FLOOR_MS = 1_200;

export function holdAnswersUntilFloor(res: Response, floorMs: number): void {
  if (floorMs <= 0) return;
  const earliest = Date.now() + floorMs + Math.floor(Math.random() * (floorMs / 4));
  const send = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.locals.passwordAnswered === true) return res;
    res.locals.passwordAnswered = true;
    const status = res.statusCode;
    const wait = earliest - Date.now();
    if (wait <= 0) return send(body);
    setTimeout(() => { if (!res.headersSent) { res.status(status); send(body); } }, wait);
    return res;
  }) as Response["json"];
}

const PASSWORD_REASONS: Readonly<Record<string, AuthReason>> = {
  invalid_credentials: "wrong_password", invalid_code: "wrong_code", expired: "code_expired", weak_password: "weak_password", rate_limited: "rate_limited",
  locked: "locked", use_work_email_code: "use_work_email_code", use_another_method: "use_another_method", account_review: "account_review",
  account_inactive: "account_inactive", password_sign_in_unavailable: "unavailable", temporarily_unavailable: "unavailable", email_taken: "email_taken",
  check_email: "check_email", signed_in: "signed_in", not_signed_in_after_reset: "not_signed_in_after_reset",
};

/**
 * D-054 funnel events, and the admin activity log (ADMIN-activity-log, D-393): through recordAuthEvent, so a row
 * carries the account or a masked email, the coarse device and a closed reason code; never the email, password,
 * token or WorkOS ids. `res.req` is the request this answer belongs to.
 */
export function recordPasswordActivity(res: Response, email: string | undefined, action: AuthAction, outcome: "success" | "failure" | "denied", detail: { readonly code?: string; readonly userId?: number } = {}): void {
  const reason = detail.code === undefined ? undefined : PASSWORD_REASONS[detail.code] ?? "other";
  void recordAuthEvent(res.req, { action, outcome, method: "password", plane: "seeker", ...(email ? { email } : {}), ...(reason ? { reason } : {}), ...(detail.userId ? { userId: detail.userId } : {}) });
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
