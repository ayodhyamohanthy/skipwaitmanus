import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verifyCode: vi.fn(), sendCode: vi.fn(), getUserByOpenId: vi.fn(), upsertUser: vi.fn(), getVerifiedWorkEmailAccess: vi.fn(), saveVerifiedWorkEmail: vi.fn(), createSessionToken: vi.fn(), revokeSession: vi.fn(),
}));
vi.mock("../workEmailOtp", () => ({ workEmailOtpService: { verifyCode: mocks.verifyCode, sendCode: mocks.sendCode } }));
vi.mock("../db", () => ({ isWorkEmailDomain: () => true, getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser, getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess, saveVerifiedWorkEmail: mocks.saveVerifiedWorkEmail }));
vi.mock("./sdk", () => ({ sdk: { createSessionToken: mocks.createSessionToken, revokeSession: mocks.revokeSession } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerReferrerOtpLoginRoutes } from "./otpLogin";

function app() { const value = express(); value.use(express.json()); registerReferrerOtpLoginRoutes(value); return value; }
describe("referrer OTP login completion", () => {
  beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); mocks.verifyCode.mockResolvedValue(true); mocks.getUserByOpenId.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 7, openId: "workemail_employee@acme.com", name: "Employee", role: "user" }); mocks.getVerifiedWorkEmailAccess.mockResolvedValue(undefined); mocks.createSessionToken.mockResolvedValue("signed-session"); });
  it("turns the newest valid code into a provisioned account, profile, and session cookie", async () => {
    const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(200); expect(response.body).toMatchObject({ signedIn: true, email: "employee@acme.com" });
    expect(mocks.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "workemail_employee@acme.com", loginMethod: "otp_work_email" }));
    expect(mocks.saveVerifiedWorkEmail).toHaveBeenCalledWith(7, "employee@acme.com");
    expect(response.headers["set-cookie"]?.join(";")).toContain("app_session_id=signed-session");
  });
  it("fails before provisioning when the code is invalid", async () => { mocks.verifyCode.mockResolvedValue(false); const response = await request(app()).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "000000" }); expect(response.status).toBe(400); expect(mocks.upsertUser).not.toHaveBeenCalled(); });
});
