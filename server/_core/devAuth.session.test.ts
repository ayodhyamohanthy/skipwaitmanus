// D-057-session-gate (§0 item 4, §0b.2; red first): the cookie identity carries
// the session's own claim and its session key, copied from the verified cookie.
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifySession: vi.fn(), getUserByOpenId: vi.fn(), getDb: vi.fn() }));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 1, sdk: { verifySession: mocks.verifySession } }));
vi.mock("../db", () => ({ getUserByOpenId: mocks.getUserByOpenId, getDb: mocks.getDb }));
import type { Request } from "express";
import { resolveDevIdentity } from "./devAuth";

const req = (cookie: string) => ({ headers: { cookie } }) as unknown as Request;
const account = { id: 7, openId: "user_P", name: "P", email: "p@gmail.com", role: "user", suspended: false };
beforeEach(() => { Object.values(mocks).forEach(fn => fn.mockReset()); mocks.getUserByOpenId.mockResolvedValue(account); });

describe("resolveDevIdentity session fields", () => {
  it("copies amr and the app session key from a code session cookie", async () => {
    mocks.verifySession.mockResolvedValue({ openId: "user_P", appId: "a", name: "", amr: "work_email_otp", ssid: "7c9e6679-7425-40de-944b-e07fc1f90ae7" });
    const identity = await resolveDevIdentity(req("app_session_id=t"));
    expect(identity).toMatchObject({ sessionAmr: "work_email_otp", sessionKey: "app:7c9e6679-7425-40de-944b-e07fc1f90ae7" });
  });

  it("keys a cookie that carries a hosted sid by the WorkOS session", async () => {
    mocks.verifySession.mockResolvedValue({ openId: "user_P", appId: "a", name: "", sid: "session_S1", ssid: "7c9e6679-7425-40de-944b-e07fc1f90ae7" });
    const identity = await resolveDevIdentity(req("app_session_id=t"));
    expect(identity?.sessionKey).toBe("workos:session_S1");
    expect(identity?.sessionAmr).toBeUndefined();
  });

  it("has no session key for an old cookie with neither, and never derives one from the openId", async () => {
    mocks.verifySession.mockResolvedValue({ openId: "workemail_ref@acme.com", appId: "a", name: "" });
    mocks.getUserByOpenId.mockResolvedValue({ ...account, openId: "workemail_ref@acme.com" });
    const identity = await resolveDevIdentity(req("app_session_id=t"));
    expect(identity?.sessionKey).toBeUndefined();
    expect(identity?.sessionAmr).toBeUndefined();
  });
});
