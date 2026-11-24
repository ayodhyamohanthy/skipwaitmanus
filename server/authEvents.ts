// ADMIN-activity-log (D-393): one way to log a sign-in event, on every sign-in plane.
//
// Each event is an operationalActivityLogs row with action `auth.<event>`, outcome success | failure | denied,
// resourceType "auth" and allow-listed metadata. What is never stored: a password, a code, a token, a cookie, a
// session id, a single-use link, a request body or a full IP address. What is stored:
//   - the account (actorUserId) when the event names one, or when the email is an existing account's verified
//     login email (verified aliases only: an unverified address never attributes an attempt to an account);
//   - otherwise a masked email (a***@gmail.com), never the address itself;
//   - always, when an email is involved, an HMAC of it keyed by JWT_SECRET, so repeated attempts group together
//     and the admin can find them by typing the address;
//   - the IP truncated to /24 (IPv4) or /48 (IPv6), the edge's two-letter country, and the browser family, OS
//     family and device type from the user agent.
// Recording never blocks or fails a sign-in: a failed write is reported to Sentry and the request goes on.
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import { z } from "zod";
import type { OperationalActivityInput } from "./db";

export const AUTH_ACTIONS = [
  "auth.password_sign_in",
  "auth.password_sign_up",
  "auth.password_forgot",
  "auth.password_reset",
  "auth.social_sign_in",
  "auth.admin_sign_in",
  "auth.seeker_email_code",
  "auth.work_email_code_sent",
  "auth.work_email_code_verified",
  "auth.step_up_code_sent",
  "auth.step_up_verified",
  "auth.passkey_sign_in",
  "auth.passkey_registered",
  "auth.passkey_revoked",
  "auth.reviewer_sign_in",
  "auth.sign_out",
] as const;
export type AuthAction = (typeof AUTH_ACTIONS)[number];
export const AUTH_ACTION_PREFIX = "auth.";

/** Closed reason codes: an unknown value is stored as "other", so a code, token or address can never ride in it. */
export const AUTH_REASONS = [
  "wrong_password", "wrong_code", "code_expired", "too_many_attempts", "rate_limited", "locked", "not_allowed",
  "unknown_account", "use_work_email_code", "use_another_method", "verify_email", "check_email", "weak_password",
  "not_work_email", "email_mismatch", "session_mismatch", "session_too_old", "suspended", "not_signed_in",
  "provider_error", "unavailable", "invalid_request", "retired", "cancelled", "signed_in", "not_signed_in_after_reset",
  "other",
] as const;
export type AuthReason = (typeof AUTH_REASONS)[number];

export const AUTH_METHODS = [
  "password", "google", "microsoft", "github", "linkedin", "slack", "apple", "sso", "magic_auth", "passkey",
  "work_email_code", "email_code", "reviewer", "unknown",
] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];
export const AUTH_PLANES = ["seeker", "referrer", "admin", "reviewer"] as const;
export type AuthPlane = (typeof AUTH_PLANES)[number];

const authEventSchema = z.object({
  action: z.enum(AUTH_ACTIONS),
  outcome: z.enum(["success", "failure", "denied"]),
  reason: z.string().optional().transform(value => (value === undefined ? undefined : (AUTH_REASONS as readonly string[]).includes(value) ? (value as AuthReason) : "other")),
  userId: z.number().int().positive().optional(),
  email: z.string().max(320).optional(),
  method: z.enum(AUTH_METHODS).optional(),
  plane: z.enum(AUTH_PLANES).optional(),
  companyDomain: z.string().max(255).regex(/^[a-z0-9.-]+$/i).optional(),
}).strip();
export type AuthEventInput = z.input<typeof authEventSchema> & { action: AuthAction; reason?: AuthReason };

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function maskEmail(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  if (!EMAIL_SHAPE.test(normalized)) return undefined;
  const [local, domain] = normalized.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function authEmailKey(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`auth-email:${normalizeEmail(email)}`).digest("hex").slice(0, 32);
}

function expandIpv6(address: string): string[] | undefined {
  const [head, tail, extra] = address.split("::");
  if (extra !== undefined) return undefined;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return undefined;
  return groups.map(group => parseInt(group, 16).toString(16));
}

export function truncateIp(raw: string | undefined): string | undefined {
  const value = (raw ?? "").trim();
  const mapped = value.toLowerCase().startsWith("::ffff:") ? value.slice(7) : value;
  if (isIP(mapped) === 4) return `${mapped.split(".").slice(0, 3).join(".")}.0/24`;
  if (isIP(value) !== 6) return undefined;
  const groups = expandIpv6(value.toLowerCase());
  return groups ? `${groups.slice(0, 3).join(":")}::/48` : undefined;
}

export type ReducedUserAgent = { browser: string; os: string; device: "desktop" | "mobile" | "tablet" | "bot" | "unknown" };
export function reduceUserAgent(userAgent: string | undefined): ReducedUserAgent {
  const ua = (userAgent ?? "").slice(0, 512);
  if (!ua.trim()) return { browser: "Other", os: "Other", device: "unknown" };
  const device: ReducedUserAgent["device"] = /bot|crawl|spider|curl|wget|python|headless|httpclient|okhttp/i.test(ua) ? "bot"
    : /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet"
    : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile" : "desktop";
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari" : "Other";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows NT/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /CrOS/.test(ua) ? "ChromeOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  return { browser, os, device };
}

export type AuthEventContext = { ip?: string; country?: string } & ReducedUserAgent;
export function authEventContext(req: Request): AuthEventContext {
  const country = (req.header("cf-ipcountry") ?? "").trim().toUpperCase();
  const ip = truncateIp(req.ip);
  return { ...(ip ? { ip } : {}), ...(/^[A-Z]{2}$/.test(country) ? { country } : {}), ...reduceUserAgent(req.header("user-agent")) };
}

export type AuthEventDeps = {
  record: (row: OperationalActivityInput) => Promise<void>;
  /** The canonical user whose verified login alias is this exact address, if any. */
  findVerifiedUserIdByEmail: (normalizedEmail: string) => Promise<number | undefined>;
  secret: () => string | undefined;
  capture: (error: unknown, context: Record<string, unknown>) => void;
};

export function createAuthEventRecorder(deps: AuthEventDeps) {
  return async function recordAuthEvent(req: Request | undefined, input: AuthEventInput): Promise<void> {
    try {
      const event = authEventSchema.parse(input);
      const email = event.email && EMAIL_SHAPE.test(normalizeEmail(event.email)) ? normalizeEmail(event.email) : undefined;
      let userId = event.userId;
      if (userId === undefined && email) {
        try { userId = await deps.findVerifiedUserIdByEmail(email); } catch { userId = undefined; }
      }
      const secret = deps.secret();
      const metadata: Record<string, string> = {};
      if (event.reason) metadata.reason = event.reason;
      if (event.method) metadata.method = event.method;
      if (event.plane) metadata.plane = event.plane;
      if (email && secret) metadata.emailKey = authEmailKey(email, secret);
      if (email && userId === undefined) { const masked = maskEmail(email); if (masked) metadata.maskedEmail = masked; }
      if (req) for (const [key, value] of Object.entries(authEventContext(req))) if (value !== undefined) metadata[key] = value;
      await deps.record({ actorUserId: userId, action: event.action, outcome: event.outcome, resourceType: "auth", ...(event.companyDomain ? { companyDomain: event.companyDomain.toLowerCase() } : {}), metadata });
    } catch (error) {
      deps.capture(error, { lane: "auth-events", action: input.action, outcome: input.outcome });
    }
  };
}

let defaultRecorder: ReturnType<typeof createAuthEventRecorder> | undefined;
/** Records one sign-in event with the production store. Never throws; callers do not await it. */
export function recordAuthEvent(req: Request | undefined, input: AuthEventInput): Promise<void> {
  defaultRecorder ??= createAuthEventRecorder({
    record: async row => { const db = await import("./db"); await db.recordOperationalActivity(row); },
    findVerifiedUserIdByEmail: async email => { const db = await import("./db"); return db.findVerifiedUserIdByEmail(email); },
    secret: () => process.env.JWT_SECRET || undefined,
    capture: (error, context) => { void import("./sentry").then(sentry => sentry.captureServerError(error, context)).catch(() => undefined); },
  });
  return defaultRecorder(req, input);
}
