import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verifyCode: vi.fn(), sendCode: vi.fn(), getUserByOpenId: vi.fn(), upsertUser: vi.fn(), resolveLoginIdentity: vi.fn(), getVerifiedWorkEmailAccess: vi.fn(), saveVerifiedWorkEmail: vi.fn(), createSessionToken: vi.fn(), revokeSession: vi.fn(), verifySession: vi.fn(), recordAuthEvent: vi.fn(),
}));
vi.mock("../authEvents", () => ({ recordAuthEvent: mocks.recordAuthEvent }));
vi.mock("../referrerStepUp", () => ({ revokeReferrerStepUpsForSessionToken: vi.fn() }));
vi.mock("../workEmailOtp", () => ({ workEmailOtpService: { verifyCode: mocks.verifyCode, sendCode: mocks.sendCode } }));
vi.mock("../db", () => ({ isWorkEmailDomain: () => true, getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser, resolveLoginIdentity: mocks.resolveLoginIdentity, getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess, saveVerifiedWorkEmail: mocks.saveVerifiedWorkEmail }));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 30 * 24 * 60 * 60_000, sdk: { createSessionToken: mocks.createSessionToken, revokeSession: mocks.revokeSession, verifySession: mocks.verifySession } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerReferrerOtpLoginRoutes } from "./otpLogin";

function app() { const value = express(); value.use(express.json()); registerReferrerOtpLoginRoutes(value); return value; }
describe("referrer OTP login completion", () => {
  beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.verifyCode.mockResolvedValue(true); mocks.resolveLoginIdentity.mockResolvedValue({ id: 7, openId: "workemail_employee@acme.com", name: "Employee", role: "user", suspended: false }); mocks.getVerifiedWorkEmailAccess.mockResolvedValue(undefined); mocks.saveVerifiedWorkEmail.mockResolvedValue(undefined); mocks.createSessionToken.mockResolvedValue("signed-session"); });
  it("turns the newest valid code into a provisioned account, profile, and session cookie", async () => {
    const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(200); expect(response.body).toMatchObject({ signedIn: true, email: "employee@acme.com" });
    expect(mocks.resolveLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: "work_email_otp", subject: "employee@acme.com", openId: "workemail_employee@acme.com", emailVerified: true }));
    expect(mocks.saveVerifiedWorkEmail).toHaveBeenCalledWith(7, "employee@acme.com");
    expect(response.headers["set-cookie"]?.join(";")).toContain("app_session_id=signed-session");
  });
  // P0-referrer-exposure: the part before the @ plus the company rebuilds the work
  // email, and a referrer's identity stays hidden until they accept an ask.
  it("never stores the work email's local part as a new account's display name", async () => {
    const response = await request(app()).post("/api/auth/otp/verify").send({ email: "zoya.quill@quasar-ledgers.com", code: "123456" });
    expect(response.status).toBe(200);
    expect(mocks.resolveLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({ subject: "zoya.quill@quasar-ledgers.com", name: null }));
  });
  it("fails before provisioning when the code is invalid", async () => { mocks.verifyCode.mockResolvedValue(false); const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "000000" }); expect(response.status).toBe(400); expect(mocks.resolveLoginIdentity).not.toHaveBeenCalled(); });
  it("still issues a session when profile enrollment needs asynchronous repair", async () => {
  mocks.saveVerifiedWorkEmail.mockRejectedValue(new Error("profile schema drift"));
  const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(200); expect(response.headers["set-cookie"]?.join(";")).toContain("app_session_id=signed-session");
  });
  it("does not mutate or issue a session for a suspended OTP identity", async () => {
    const existing = { id: 7, openId: "workemail_employee@acme.com", name: "Employee", role: "user", suspended: true };
    mocks.resolveLoginIdentity.mockRejectedValue(new Error("ACCOUNT_NOT_ACTIVE"));
    const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(403); expect(response.body).toEqual({ error: "We could not complete sign-in." });
    expect(mocks.resolveLoginIdentity).toHaveBeenCalledOnce(); expect(mocks.saveVerifiedWorkEmail).not.toHaveBeenCalled(); expect(mocks.createSessionToken).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("fails closed if suspension or session revocation races issuance", async () => {
    const existing = { id: 7, openId: "workemail_employee@acme.com", name: "Employee", role: "user", suspended: false };
    mocks.resolveLoginIdentity.mockResolvedValue(existing); mocks.createSessionToken.mockRejectedValue(new Error("ACCOUNT_NOT_ACTIVE"));
    const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(403); expect(response.headers["set-cookie"]).toBeUndefined();
  });
});

// ADMIN-activity-log (D-393): every work-email code send, verify and sign-out leaves one auth row, with no code in it.
describe("referrer OTP sign-in events", () => {
  beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.verifyCode.mockResolvedValue(true); mocks.resolveLoginIdentity.mockResolvedValue({ id: 7, openId: "workemail_employee@acme.com", name: null, role: "user", suspended: false }); mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" }); mocks.createSessionToken.mockResolvedValue("signed-session"); });
  const events = () => mocks.recordAuthEvent.mock.calls.map(call => call[1]);
  it("records a verified code as a referrer sign-in for that account and company", async () => {
    await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(events()).toEqual([{ action: "auth.work_email_code_verified", outcome: "success", email: "employee@acme.com", method: "work_email_code", plane: "referrer", companyDomain: "acme.com", userId: 7 }]);
  });
  it("records a wrong code as a failure and never the code itself", async () => {
    mocks.verifyCode.mockResolvedValue(false);
    await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "654321" });
    expect(events()).toEqual([expect.objectContaining({ action: "auth.work_email_code_verified", outcome: "failure", reason: "wrong_code" })]);
    expect(JSON.stringify(events())).not.toContain("654321");
  });
  it("records a suspended account as denied", async () => {
    mocks.resolveLoginIdentity.mockRejectedValue(new Error("ACCOUNT_NOT_ACTIVE"));
    await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(events()).toEqual([expect.objectContaining({ outcome: "denied", reason: "suspended" })]);
  });
  it("records a sent code, and a rate-limited send as denied", async () => {
    mocks.sendCode.mockResolvedValueOnce({ sent: true }).mockResolvedValueOnce({ sent: false, reason: "rate_limited", retryAfterSeconds: 30 });
    await request(app()).post("/api/auth/otp/send").send({ email: "employee@acme.com" });
    await request(app()).post("/api/auth/otp/send").send({ email: "employee@acme.com" });
    expect(events()).toEqual([
      expect.objectContaining({ action: "auth.work_email_code_sent", outcome: "success", companyDomain: "acme.com" }),
      expect.objectContaining({ action: "auth.work_email_code_sent", outcome: "denied", reason: "rate_limited" }),
    ]);
  });
  it("records a sign-out for the account whose session it was", async () => {
    mocks.verifySession.mockResolvedValue({ openId: "workemail_employee@acme.com" });
    mocks.getUserByOpenId.mockResolvedValue({ id: 7 });
    await request(app()).post("/api/auth/otp/logout").set("Cookie", "app_session_id=signed-session").send();
    expect(events()).toEqual([{ action: "auth.sign_out", outcome: "success", userId: 7, method: "work_email_code", plane: "referrer" }]);
  });
});
