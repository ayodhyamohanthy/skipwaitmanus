// D-057-session-gate (§0 items 1-3, §0b.2; red first): the app session carries
// the work-email-code claim (`amr`) and a session-chain id (`ssid`), both kept
// on renewal and both read back only in their exact shape.
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), revokeUserSessions: vi.fn() }));
vi.mock("../db", () => mocks);
vi.mock("./env", () => ({ ENV: { cookieSecret: "test-secret-at-least-32-characters-long", appId: "skipwait-app" } }));
import { SignJWT } from "jose";
import { sdk } from "./sdk";

const key = new TextEncoder().encode("test-secret-at-least-32-characters-long");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const forged = (claims: Record<string, unknown>, ageSec = 0) => {
  const iat = Math.floor(Date.now() / 1000) - ageSec;
  return new SignJWT({ openId: "user-1", appId: "skipwait-app", name: "User", ...claims }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer("https://skipwait.me").setAudience("skipwait-web").setSubject("user-1").setIssuedAt(iat).setJti(`j-${Math.random()}`).setExpirationTime(iat + 86_400 * 30).sign(key);
};
beforeEach(() => { mocks.getUserByOpenId.mockReset(); mocks.getUserByOpenId.mockResolvedValue({ suspended: false, sessionsValidAfter: new Date(0) }); });

describe("the work-email-code claim (amr)", () => {
  it("is written only when it is exactly work_email_otp, and read back only then", async () => {
    expect((await sdk.verifySession(await sdk.createSessionToken("user-1", { amr: "work_email_otp" })))?.amr).toBe("work_email_otp");
    expect((await sdk.verifySession(await sdk.createSessionToken("user-1")))?.amr).toBeUndefined();
    expect((await sdk.verifySession(await forged({ amr: "pwd" })))?.amr).toBeUndefined();
    expect((await sdk.verifySession(await forged({ amr: ["work_email_otp"] })))?.amr).toBeUndefined();
  });

  it("is never inferred from a workemail_ subject", async () => {
    const token = await sdk.createSessionToken("workemail_ref@acme.com");
    expect((await sdk.verifySession(token))?.amr).toBeUndefined();
  });
});

describe("the session key (ssid)", () => {
  it("mints a UUID per new session chain and keeps one it is handed", async () => {
    const first = (await sdk.verifySession(await sdk.createSessionToken("user-1")))?.ssid;
    const second = (await sdk.verifySession(await sdk.createSessionToken("user-1")))?.ssid;
    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
    expect(first).not.toBe(second);
    const kept = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect((await sdk.verifySession(await sdk.createSessionToken("user-1", { ssid: kept })))?.ssid).toBe(kept);
  });

  it("reads back only the UUID shape", async () => {
    expect((await sdk.verifySession(await forged({ ssid: "not-a-uuid" })))?.ssid).toBeUndefined();
    expect((await sdk.verifySession(await forged({})))?.ssid).toBeUndefined();
  });
});

describe("renewal keeps sid, amr and ssid (§0b.2)", () => {
  it("re-issues an old code session with the same claim and the same ssid", async () => {
    const ssid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const renewed = await sdk.renewSessionIfDue(await forged({ amr: "work_email_otp", ssid, sid: "session_ABC123" }, 2 * 86_400));
    expect(renewed).toBeTruthy();
    const session = await sdk.verifySession(renewed);
    expect(session).toMatchObject({ openId: "user-1", amr: "work_email_otp", ssid, sid: "session_ABC123" });
  });

  it("keeps a personal session claim-free through renewal", async () => {
    const ssid = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const session = await sdk.verifySession(await sdk.renewSessionIfDue(await forged({ ssid }, 2 * 86_400)));
    expect(session?.amr).toBeUndefined();
    expect(session?.ssid).toBe(ssid);
  });
});

describe("the interactive authentication timestamp (auth_time) (D-140 / D-382)", () => {
  it("defaults authTime to current Unix timestamp on new interactive session", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await sdk.createSessionToken("user-1");
    const after = Math.floor(Date.now() / 1000);
    const session = await sdk.verifySession(token);
    expect(typeof session?.authTime).toBe("number");
    expect(session!.authTime).toBeGreaterThanOrEqual(before);
    expect(session!.authTime).toBeLessThanOrEqual(after);
  });

  it("accepts and preserves an explicit authTime", async () => {
    const explicit = 1700000000;
    const token = await sdk.createSessionToken("user-1", { authTime: explicit });
    const session = await sdk.verifySession(token);
    expect(session?.authTime).toBe(explicit);
  });

  it("reads back only positive safe integers", async () => {
    expect((await sdk.verifySession(await forged({ auth_time: "not-a-number" })))?.authTime).toBeUndefined();
    expect((await sdk.verifySession(await forged({ auth_time: -500 })))?.authTime).toBeUndefined();
    expect((await sdk.verifySession(await forged({ auth_time: 0 })))?.authTime).toBeUndefined();
    expect((await sdk.verifySession(await forged({ auth_time: 1.5 })))?.authTime).toBeUndefined();
    expect((await sdk.verifySession(await forged({})))?.authTime).toBeUndefined();
  });

  it("preserves original authTime across session renewal while refreshing iat", async () => {
    const originalAuthTime = 1690000000;
    const twoDaysAgo = 2 * 86_400;
    // Old session from 2 days ago with originalAuthTime
    const oldToken = await forged({ auth_time: originalAuthTime }, twoDaysAgo);
    const renewedToken = await sdk.renewSessionIfDue(oldToken);
    expect(renewedToken).toBeTruthy();

    const renewedSession = await sdk.verifySession(renewedToken);
    expect(renewedSession?.authTime).toBe(originalAuthTime);

    // Verify iat is refreshed (current second)
    const [, p] = renewedToken!.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    expect(payload.iat).toBeGreaterThanOrEqual(now - 2);
    expect(payload.auth_time).toBe(originalAuthTime);
  });

  it("preserves absence of authTime across renewal for legacy tokens", async () => {
    // Old legacy token with no auth_time
    const oldLegacyToken = await forged({}, 2 * 86_400);
    const renewedToken = await sdk.renewSessionIfDue(oldLegacyToken);
    expect(renewedToken).toBeTruthy();

    const renewedSession = await sdk.verifySession(renewedToken);
    expect(renewedSession?.authTime).toBeUndefined();
  });
});
