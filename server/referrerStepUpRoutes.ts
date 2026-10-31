// D-057-session-gate (D-245, packet docs/plans/D-057-session-gate.md §0b.4):
// the in-session work-email step-up for a person who is already signed in.
//   POST /api/referrer/step-up/send   { email }             -> { sent, challengeId, expiresAt }
//   POST /api/referrer/step-up/verify { challengeId, code } -> { verified, expiresAt }
// Neither endpoint signs anyone in, creates, links or merges an account, or
// writes profiles/users/aliases/canonical people. They never call
// resolveLoginIdentity, saveVerifiedWorkEmail or completeWorkEmailOtpEnrollment,
// never mint `amr`, and set no cookie except send's re-sign of the caller's OWN
// session (same openId) when it predates the session key (§0b.2).
import { parse as parseCookieHeader } from "cookie";
import { randomBytes, randomInt } from "node:crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import {
  REFERRER_STEP_UP_SEND_PATH, REFERRER_STEP_UP_VERIFY_PATH, STEP_UP_CODE_TTL_MS, STEP_UP_MAX_ATTEMPTS, STEP_UP_PROOF_TTL_MS,
  stepUpSendRequestSchema, stepUpVerifyRequestSchema, type StepUpErrorCode,
} from "../shared/referrerStepUp";
import { OTP_RESEND_COOLDOWN_SECONDS } from "./otpPolicy";
import { sha256Hex, stepUpCodeHash } from "./referrerStepUp";
import { defaultReferrerSessionGateDeps, installReferrerSessionGate, type GateIdentity, type ReferrerSessionGateDeps } from "./referrerSessionGate";
import { isVerifiedEmployeeOfCompany } from "./referrerAvailability";
import { workEmailStorageKeys } from "./workEmailKey";
import { resolveTrustedClientIp } from "./_core/trustedClientIp";

export type StepUpActivity = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; metadata?: Record<string, string | number | boolean | null | undefined> };
export type ReferrerStepUpRouteDeps = {
  resolveIdentity: (req: Request) => Promise<GateIdentity | undefined>;
  gate?: ReferrerSessionGateDeps;
  now?: () => number;
  sendCode?: (input: { to: string; code: string }) => Promise<{ sent: boolean; reason: string }>;
  /** Throws an Error with message OTP_RATE_LIMITED and retryAfterSeconds when a limit is spent. */
  consumeLimits?: (keys: { ip: string; email: string; account: number }, now: number) => Promise<void>;
  lock?: { activeUntil: (key: string, ip: string, now: number) => Promise<Date | null>; recordFailure: (key: string, ip: string, now: number) => Promise<void> };
  /** §0b.2: re-sign the caller's own pre-ssid cookie so this session gets a key. */
  reSignOwnCookie?: (req: Request, identity: GateIdentity) => Promise<{ token: string; sessionKey: string } | null>;
  recordActivity?: (entry: StepUpActivity) => Promise<void>;
  captureError?: (error: unknown, context: Record<string, unknown>) => void;
};

const fail = (res: Response, status: number, code: StepUpErrorCode, error: string, retryAfterSeconds?: number) => {
  if (retryAfterSeconds) res.set("Retry-After", String(retryAfterSeconds));
  return res.status(status).json({ code, error, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
};
const WRONG_CODE = "That code did not work. Check the newest code or send a new one.";
/** The lock key is the account, never an address: a step-up lock is per (account, IP) and per IP. */
const lockKeyOf = (userId: number) => `stepup-user:${userId}`;
const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);

/** Production wiring for limits, locks, delivery and the own-cookie re-sign; each one is replaceable in tests. */
async function productionDeps(): Promise<Required<Pick<ReferrerStepUpRouteDeps, "sendCode" | "consumeLimits" | "lock" | "reSignOwnCookie" | "captureError">>> {
  const [{ consumeLimits, limiterKey, activeLockUntil, recordVerifyFailure, otpEmailMessage }, { getDb, getUserByOpenId }, { sendTransactionalEmail }, { sdk }, { captureServerError }] = await Promise.all([
    import("./workEmailOtp"), import("./db"), import("./emailDelivery"), import("./_core/sdk"), import("./sentry"),
  ]);
  const database = async () => { const value = await getDb(); if (!value) throw new Error("STEP_UP_DATABASE_UNAVAILABLE"); return value; };
  return {
    sendCode: ({ to, code }) => sendTransactionalEmail({ to, ...otpEmailMessage(code) }),
    consumeLimits: async (keys, now) => consumeLimits(await database(), [
      { key: limiterKey("stepup-ip10m", keys.ip), windowMs: 600_000, limit: 5 },
      { key: limiterKey("stepup-email10m", keys.email), windowMs: 600_000, limit: 3 },
      { key: limiterKey("stepup-email30s", keys.email), windowMs: OTP_RESEND_COOLDOWN_SECONDS * 1000, limit: 1 },
      { key: limiterKey("stepup-account1h", String(keys.account)), windowMs: 3_600_000, limit: 10 },
      { key: limiterKey("stepup-global1h", "all"), windowMs: 3_600_000, limit: 200 },
    ], now),
    lock: {
      activeUntil: async (key, ip, now) => activeLockUntil(await database(), key, ip, now),
      recordFailure: async (key, ip, now) => recordVerifyFailure(await database(), key, ip, now),
    },
    reSignOwnCookie: async (req, identity) => {
      const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
      const session = token ? await sdk.verifySession(token) : null;
      if (!session) return null;
      // Only the caller's own session for the same account: never resolveLoginIdentity, never another openId.
      const account = await getUserByOpenId(session.openId);
      if (!account || account.id !== identity.account.id) return null;
      const renewed = await sdk.createSessionToken(session.openId, { name: session.name, ...(session.sid ? { sid: session.sid } : {}), ...(session.amr ? { amr: session.amr } : {}) });
      const verified = await sdk.verifySession(renewed);
      const sessionKey = verified?.sid ? `workos:${verified.sid}` : verified?.ssid ? `app:${verified.ssid}` : null;
      return sessionKey ? { token: renewed, sessionKey } : null;
    },
    captureError: (error, context) => captureServerError(error, context),
  };
}

export function registerReferrerStepUpRoutes(app: Express, deps: ReferrerStepUpRouteDeps): void {
  const now = deps.now ?? Date.now;
  let wired: ReturnType<typeof productionDeps> | undefined;
  const prod = () => (wired ??= productionDeps());
  let gateWired: Promise<ReferrerSessionGateDeps> | undefined;
  const gate = () => (gateWired ??= deps.gate ? Promise.resolve(deps.gate) : defaultReferrerSessionGateDeps());
  const record = (entry: StepUpActivity) => { void deps.recordActivity?.({ resourceType: "work_email_step_up", ...entry }).catch(() => undefined); };
  const capture = async (error: unknown, context: Record<string, unknown>) => { try { (deps.captureError ?? (await prod()).captureError)(error, context); } catch { console.error("[step-up] error report failed", context); } };

  installReferrerSessionGate(app, {
    resolveIdentity: deps.resolveIdentity,
    gate,
    onDenied: (_req, identity) => record({ actorUserId: identity.account.id, action: "work_email.step_up_denied", outcome: "denied", metadata: { reason: "code_required" } }),
    onError: (error, req) => { void capture(error, { route: `${req.method} ${req.route?.path ?? "referrer action"}`, step: "referrer_session_gate" }); },
  });

  app.post(REFERRER_STEP_UP_SEND_PATH, async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to continue." });
      const parsed = stepUpSendRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) return fail(res, 400, "step_up_email_mismatch", "Enter your work email address.");
      const email = parsed.data.email;
      const g = await gate();
      const profile = await g.getProfile(identity.account.id);
      const verifiedDomain = profile?.workEmailDomain ?? null;
      if (!profile || !verifiedDomain || !isVerifiedEmployeeOfCompany(profile, verifiedDomain)) return fail(res, 403, "not_verified_referrer", "Verify your work email first.");
      const mismatch = () => { record({ actorUserId: identity.account.id, action: "work_email.step_up_denied", outcome: "denied", metadata: { domain: verifiedDomain, reason: "email_mismatch" } }); return fail(res, 400, "step_up_email_mismatch", `Use the work email you verified at ${verifiedDomain}.`); };
      // Exact address inside this one account: the domain of record, then the address of record once one exists.
      if (domainOf(email) !== verifiedDomain) return mismatch();
      const fingerprint = workEmailStorageKeys(email).write;
      const ofRecord = await g.store.addressOfRecord(identity.account.id, verifiedDomain, profile.workEmailVerifiedAt ?? null);
      if (ofRecord && ofRecord !== fingerprint) return mismatch();

      let sessionKey = identity.sessionKey;
      if (!sessionKey) {
        const reSigned = await (deps.reSignOwnCookie ?? (await prod()).reSignOwnCookie)(req, identity);
        if (reSigned) {
          const [{ getSessionCookieOptions }, { SESSION_ACCESS_TTL_MS }] = await Promise.all([import("./_core/cookies"), import("./_core/sdk")]);
          res.cookie(COOKIE_NAME, reSigned.token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
          sessionKey = reSigned.sessionKey;
        }
      }
      if (!sessionKey) {
        await capture(new Error("STEP_UP_SESSION_UNBINDABLE"), { route: `POST ${REFERRER_STEP_UP_SEND_PATH}` });
        return fail(res, 409, "session_unbindable", "Sign out and sign in again, then confirm your work email.");
      }

      const at = now();
      try {
        await (deps.consumeLimits ?? (await prod()).consumeLimits)({ ip: resolveTrustedClientIp(req) || "unknown", email: fingerprint, account: identity.account.id }, at);
      } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") {
          const retryAfterSeconds = Math.max(1, Number((error as Error & { retryAfterSeconds?: number }).retryAfterSeconds) || 600);
          return fail(res, 429, "step_up_rate_limited", retryAfterSeconds <= OTP_RESEND_COOLDOWN_SECONDS ? "Wait a moment before requesting another code." : "Too many code requests. Wait before trying again.", retryAfterSeconds);
        }
        throw error;
      }
      const sessionKeyHash = sha256Hex(sessionKey);
      const challengeId = randomBytes(32).toString("base64url");
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const codeExpiresAt = new Date(at + STEP_UP_CODE_TTL_MS);
      const delivery = await (deps.sendCode ?? (await prod()).sendCode)({ to: email, code }).catch(() => ({ sent: false, reason: "delivery_failed" }));
      if (!delivery.sent) {
        record({ actorUserId: identity.account.id, action: "work_email.step_up_sent", outcome: "failure", metadata: { domain: verifiedDomain, reason: delivery.reason === "not_configured" ? "not_configured" : "delivery_failed" } });
        if (delivery.reason === "not_configured") return fail(res, 503, "step_up_unavailable", "Email delivery is not configured yet");
        return fail(res, 502, "step_up_unavailable", "We could not deliver the code. Try again shortly.");
      }
      await g.store.supersedePending(identity.account.id, sessionKeyHash, new Date(at));
      await g.store.insertChallenge({ challengeIdHash: sha256Hex(challengeId), userId: identity.account.id, sessionKeyHash, emailFingerprint: fingerprint, workEmailDomain: verifiedDomain, codeHash: stepUpCodeHash(challengeId, fingerprint, code), codeExpiresAt, createdAt: new Date(at) });
      record({ actorUserId: identity.account.id, action: "work_email.step_up_sent", outcome: "success", metadata: { domain: verifiedDomain } });
      return res.json({ sent: true, challengeId, expiresAt: codeExpiresAt.toISOString() });
    } catch (error) {
      await capture(error, { route: `POST ${REFERRER_STEP_UP_SEND_PATH}` });
      return res.status(500).json({ error: "We could not send the code. Nothing changed. Try again in a moment." });
    }
  });

  app.post(REFERRER_STEP_UP_VERIFY_PATH, async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to continue." });
      const parsed = stepUpVerifyRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) return fail(res, 400, "step_up_code_invalid", WRONG_CODE);
      const { challengeId, code } = parsed.data;
      const g = await gate();
      const row = await g.store.findByChallengeIdHash(sha256Hex(challengeId));
      if (!row) return fail(res, 400, "step_up_code_invalid", WRONG_CODE);
      // Bound to this account and this session before the code is looked at (§0b.4).
      if (!identity.sessionKey || row.userId !== identity.account.id || row.sessionKeyHash !== sha256Hex(identity.sessionKey)) {
        record({ actorUserId: identity.account.id, action: "work_email.step_up_denied", outcome: "denied", metadata: { domain: row.workEmailDomain, reason: "session_mismatch" } });
        return fail(res, 403, "step_up_session_mismatch", "This code was sent in another sign-in. Send a new code here.");
      }
      const at = now();
      const ip = resolveTrustedClientIp(req) || "unknown";
      const lock = deps.lock ?? (await prod()).lock;
      const lockKey = lockKeyOf(identity.account.id);
      const lockedResponse = (until: Date) => fail(res, 429, "step_up_locked", "Too many tries. Try again later.", Math.max(1, Math.ceil((until.getTime() - at) / 1000)));
      const lockedUntil = await lock.activeUntil(lockKey, ip, at);
      if (lockedUntil) return lockedResponse(lockedUntil);
      const usable = row.verifiedAt === null && row.revokedAt === null && row.codeExpiresAt.getTime() > at && row.attempts < STEP_UP_MAX_ATTEMPTS;
      const matches = row.codeHash === stepUpCodeHash(challengeId, row.emailFingerprint, code);
      if (usable && matches && await g.store.consume(row.id, new Date(at), new Date(at + STEP_UP_PROOF_TTL_MS), STEP_UP_MAX_ATTEMPTS)) {
        await g.store.supersedeProofs(identity.account.id, row.sessionKeyHash, row.id, new Date(at));
        record({ actorUserId: identity.account.id, action: "work_email.step_up_verified", outcome: "success", metadata: { domain: row.workEmailDomain } });
        return res.json({ verified: true, expiresAt: new Date(at + STEP_UP_PROOF_TTL_MS).toISOString() });
      }
      if (usable && !matches) await g.store.recordWrongAttempt(row.id, STEP_UP_MAX_ATTEMPTS);
      record({ actorUserId: identity.account.id, action: "work_email.step_up_denied", outcome: "denied", metadata: { domain: row.workEmailDomain, reason: matches ? "used_or_expired" : "wrong_code" } });
      if (!matches) {
        try { await lock.recordFailure(lockKey, ip, at); } catch (error) { await capture(error, { route: `POST ${REFERRER_STEP_UP_VERIFY_PATH}`, step: "lock_counter" }); }
        const nowLocked = await lock.activeUntil(lockKey, ip, at).catch(() => null);
        if (nowLocked) return lockedResponse(nowLocked);
      }
      return fail(res, 400, "step_up_code_invalid", WRONG_CODE);
    } catch (error) {
      await capture(error, { route: `POST ${REFERRER_STEP_UP_VERIFY_PATH}` });
      return res.status(500).json({ error: "We could not check the code. Nothing changed. Try again in a moment." });
    }
  });
}
