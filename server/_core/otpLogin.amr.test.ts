// D-057-session-gate (§0 item 2; red first): the work-email code login is the
// one sign-in that mints the amr claim.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifyCode: vi.fn(async () => true), resolveLoginIdentity: vi.fn(async () => ({ id: 7, openId: "workemail_employee@acme.com", name: "E", role: "user", suspended: false })), getVerifiedWorkEmailAccess: vi.fn(async () => ({ workEmailDomain: "acme.com" })), saveVerifiedWorkEmail: vi.fn(), createSessionToken: vi.fn(async () => "signed-session") }));
vi.mock("../workEmailOtp", () => ({ workEmailOtpService: { verifyCode: mocks.verifyCode, sendCode: vi.fn() } }));
vi.mock("../db", () => ({ isWorkEmailDomain: () => true, resolveLoginIdentity: mocks.resolveLoginIdentity, getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess, saveVerifiedWorkEmail: mocks.saveVerifiedWorkEmail }));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 1, sdk: { createSessionToken: mocks.createSessionToken, revokeSession: vi.fn() } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerReferrerOtpLoginRoutes } from "./otpLogin";

describe("work-email code login claim", () => {
  it("signs the session with amr work_email_otp", async () => {
    const app = express(); app.use(express.json()); registerReferrerOtpLoginRoutes(app);
    const response = await request(app).post("/api/auth/otp/verify").send({ email: "employee@acme.com", code: "123456" });
    expect(response.status).toBe(200);
    expect(mocks.createSessionToken).toHaveBeenCalledWith("workemail_employee@acme.com", expect.objectContaining({ amr: "work_email_otp" }));
  });
});
