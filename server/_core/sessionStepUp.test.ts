// D-140 / D-382: fresh sign-in assertion and step-up tests for Skippy money cards
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), revokeUserSessions: vi.fn() }));
vi.mock("../db", () => mocks);
vi.mock("./env", () => ({ ENV: { cookieSecret: "test-secret-at-least-32-characters-long", appId: "skipwait-app" } }));

import { SignJWT } from "jose";
import type { Request, Response, NextFunction } from "express";
import { sdk } from "./sdk";
import type { DevIdentity } from "./devAuth";
import { authTimeFromWorkosClaims } from "./workosAuth";
import {
  assertFreshInteractiveSession,
  requireFreshSeekerSession,
  STEP_UP_MAX_AGE_SECONDS,
} from "./sessionStepUp";

const key = new TextEncoder().encode("test-secret-at-least-32-characters-long");
const forged = (claims: Record<string, unknown>, ageSec = 0) => {
  const iat = Math.floor(Date.now() / 1000) - ageSec;
  return new SignJWT({ openId: "user-1", appId: "skipwait-app", name: "User", ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("https://skipwait.me")
    .setAudience("skipwait-web")
    .setSubject("user-1")
    .setIssuedAt(iat)
    .setJti(`j-${Math.random()}`)
    .setExpirationTime(iat + 86_400 * 30)
    .sign(key);
};

const mockIdentity = (overrides: Partial<DevIdentity> = {}): DevIdentity => ({
  account: {
    id: 1,
    openId: "user-1",
    role: "user",
    name: "Test Seeker",
    email: "seeker@example.com",
    loginMethod: "workos",
  },
  primaryEmail: {
    id: "dev-email-seeker@example.com",
    emailAddress: "seeker@example.com",
    verification: { status: "verified" },
  },
  emailAddresses: [],
  ...overrides,
});

beforeEach(() => {
  mocks.getUserByOpenId.mockReset();
  mocks.getUserByOpenId.mockResolvedValue({ suspended: false, sessionsValidAfter: new Date(0) });
});

describe("assertFreshInteractiveSession (D-140 / D-382)", () => {
  const now = 1_700_000_000;

  it("T1: passes for a fresh interactive session (< 15 mins)", () => {
    const authTime = now - 300; // 5 minutes old
    const identity = mockIdentity({ authTime });
    const result = assertFreshInteractiveSession(identity, STEP_UP_MAX_AGE_SECONDS, now);
    expect(result).toEqual({ fresh: true, authTime, ageSeconds: 300 });
  });

  it("T2: enforces exact boundary (passes at 900s, fails at 901s)", () => {
    // Exact 15 minutes (900 seconds)
    const exactBoundary = assertFreshInteractiveSession(
      mockIdentity({ authTime: now - 900 }),
      STEP_UP_MAX_AGE_SECONDS,
      now
    );
    expect(exactBoundary).toEqual({ fresh: true, authTime: now - 900, ageSeconds: 900 });

    // 1 second past 15 minutes (901 seconds)
    const justExpired = assertFreshInteractiveSession(
      mockIdentity({ authTime: now - 901 }),
      STEP_UP_MAX_AGE_SECONDS,
      now
    );
    expect(justExpired).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "session_too_old",
      ageSeconds: 901,
    });
  });

  it("T3: fails for an old session (> 15 mins)", () => {
    const oldAuthTime = now - 1800; // 30 minutes old
    const identity = mockIdentity({ authTime: oldAuthTime });
    const result = assertFreshInteractiveSession(identity, STEP_UP_MAX_AGE_SECONDS, now);
    expect(result).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "session_too_old",
      ageSeconds: 1800,
    });
  });

  it("T4: fails for a renewed old session because renewal preserves original authTime", async () => {
    const twoDaysAgoSeconds = 2 * 86_400;
    const oldAuthTime = Math.floor(Date.now() / 1000) - 2000; // 2000s old (~33 mins)
    const oldToken = await forged({ auth_time: oldAuthTime }, twoDaysAgoSeconds);

    const renewedToken = await sdk.renewSessionIfDue(oldToken);
    expect(renewedToken).toBeTruthy();

    const verified = await sdk.verifySession(renewedToken);
    expect(verified?.authTime).toBe(oldAuthTime);

    const renewedIdentity = mockIdentity({ authTime: verified?.authTime });
    const result = assertFreshInteractiveSession(renewedIdentity);
    expect(result.fresh).toBe(false);
    expect(result).toMatchObject({
      fresh: false,
      code: "reauth_required",
      reason: "session_too_old",
    });
  });

  it("T5: fails fail-closed when authTime is missing or invalid", () => {
    expect(assertFreshInteractiveSession(undefined)).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
    expect(assertFreshInteractiveSession(null)).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
    expect(assertFreshInteractiveSession(mockIdentity({ authTime: undefined }))).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
    expect(assertFreshInteractiveSession(mockIdentity({ authTime: 0 }))).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
    expect(assertFreshInteractiveSession(mockIdentity({ authTime: -100 }))).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
    expect(assertFreshInteractiveSession(mockIdentity({ authTime: 1.5 }))).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "missing_auth_time",
    });
  });

  it("T6: handles future clock skew (accepts <= 60s future, rejects > 60s future)", () => {
    // 30 seconds into the future (within 60s skew allowance)
    const tolerableSkew = assertFreshInteractiveSession(
      mockIdentity({ authTime: now + 30 }),
      STEP_UP_MAX_AGE_SECONDS,
      now
    );
    expect(tolerableSkew).toEqual({ fresh: true, authTime: now + 30, ageSeconds: 0 });

    // 60 seconds into the future (exact limit of skew allowance)
    const boundarySkew = assertFreshInteractiveSession(
      mockIdentity({ authTime: now + 60 }),
      STEP_UP_MAX_AGE_SECONDS,
      now
    );
    expect(boundarySkew).toEqual({ fresh: true, authTime: now + 60, ageSeconds: 0 });

    // 61 seconds into the future (rejected)
    const unacceptableSkew = assertFreshInteractiveSession(
      mockIdentity({ authTime: now + 61 }),
      STEP_UP_MAX_AGE_SECONDS,
      now
    );
    expect(unacceptableSkew).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "future_auth_time",
    });
  });

  it("T7: WorkOS Bearer token with fresh auth_time passes", () => {
    const claims = { auth_time: now - 100, iat: now - 50 };
    const authTime = authTimeFromWorkosClaims(claims);
    expect(authTime).toBe(now - 100);

    const result = assertFreshInteractiveSession(mockIdentity({ authTime }), STEP_UP_MAX_AGE_SECONDS, now);
    expect(result).toEqual({ fresh: true, authTime: now - 100, ageSeconds: 100 });
  });

  it("T8: WorkOS Bearer token with old auth_time fails with reauth_required", () => {
    const claims = { auth_time: now - 1200, iat: now - 50 };
    const authTime = authTimeFromWorkosClaims(claims);
    expect(authTime).toBe(now - 1200);

    const result = assertFreshInteractiveSession(mockIdentity({ authTime }), STEP_UP_MAX_AGE_SECONDS, now);
    expect(result).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "session_too_old",
      ageSeconds: 1200,
    });
  });

  it("T9: WorkOS Bearer token falls back to iat when auth_time is absent", () => {
    // Fresh iat passes
    const freshClaims = { iat: now - 60 };
    const freshAuthTime = authTimeFromWorkosClaims(freshClaims);
    expect(freshAuthTime).toBe(now - 60);
    const freshResult = assertFreshInteractiveSession(mockIdentity({ authTime: freshAuthTime }), STEP_UP_MAX_AGE_SECONDS, now);
    expect(freshResult).toEqual({ fresh: true, authTime: now - 60, ageSeconds: 60 });

    // Old iat fails
    const oldClaims = { iat: now - 1000 };
    const oldAuthTime = authTimeFromWorkosClaims(oldClaims);
    expect(oldAuthTime).toBe(now - 1000);
    const oldResult = assertFreshInteractiveSession(mockIdentity({ authTime: oldAuthTime }), STEP_UP_MAX_AGE_SECONDS, now);
    expect(oldResult).toEqual({
      fresh: false,
      code: "reauth_required",
      reason: "session_too_old",
      ageSeconds: 1000,
    });
  });
});

describe("requireFreshSeekerSession Express middleware (D-140 / D-382)", () => {
  it("T10: returns HTTP 401 with reauth_required when identity is not fresh", () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();

    const req = {
      identity: mockIdentity({ authTime: Math.floor(Date.now() / 1000) - 1800 }),
    } as unknown as Request & { identity?: DevIdentity };
    const res = { status } as unknown as Response;

    requireFreshSeekerSession(req, res, next as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "reauth_required",
        code: "reauth_required",
        reason: "session_too_old",
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() without sending a response when identity is fresh", () => {
    const status = vi.fn();
    const next = vi.fn();

    const req = {
      identity: mockIdentity({ authTime: Math.floor(Date.now() / 1000) - 60 }),
    } as unknown as Request & { identity?: DevIdentity };
    const res = { status } as unknown as Response;

    requireFreshSeekerSession(req, res, next as NextFunction);

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
