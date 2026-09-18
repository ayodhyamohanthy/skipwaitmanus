import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verifyCode: vi.fn(), sendCode: vi.fn(), getUserByOpenId: vi.fn(), upsertUser: vi.fn(), resolveLoginIdentity: vi.fn(), getVerifiedWorkEmailAccess: vi.fn(), saveVerifiedWorkEmail: vi.fn(), createSessionToken: vi.fn(), revokeSession: vi.fn(),
}));
vi.mock("../workEmailOtp", () => ({ workEmailOtpService: { verifyCode: mocks.verifyCode, sendCode: mocks.sendCode } }));
vi.mock("../db", () => ({ isWorkEmailDomain: () => true, getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser, resolveLoginIdentity: mocks.resolveLoginIdentity, getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess, saveVerifiedWorkEmail: mocks.saveVerifiedWorkEmail }));
vi.mock("./sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken, revokeSession: mocks.revokeSession } }));
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
