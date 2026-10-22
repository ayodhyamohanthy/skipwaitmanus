import express from "express";
import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ resolve: vi.fn(), save: vi.fn(), createSessionToken: vi.fn(), inserts: [] as unknown[], updates: [] as unknown[] }));
const chain = (rows: unknown[] = []): any => new Proxy(() => undefined, { get: (_t, k) => k === "then" ? undefined : (...a: unknown[]) => { if (k === "values") m.inserts.push(a[0]); if (k === "set") m.updates.push(a[0]); return k === "limit" ? Promise.resolve(rows) : chain(rows); } });
vi.mock("../db", () => ({ resolveLoginIdentity: m.resolve, saveVerifiedWorkEmail: m.save, getDb: async () => ({ insert: () => chain(), select: () => chain(), update: () => chain() }) }));
vi.mock("./sdk", () => ({ sdk: { createSessionToken: m.createSessionToken }, SESSION_ACCESS_TTL_MS: 1000 }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({}) }));
vi.mock("./trustedClientIp", () => ({ resolveTrustedClientIp: () => "203.0.113.9" }));
import { hashReviewerPassword, registerReviewerLoginRoutes, verifyReviewerPassword } from "./reviewerLogin";

const app = () => { const a = express(); a.use(express.json()); registerReviewerLoginRoutes(a); return a; };
const post = (a: express.Express, email: string, password: string) => request(a).post("/api/auth/reviewer/sign-in").send({ email, password });
beforeEach(() => {
  m.inserts.length = 0; m.updates.length = 0; Object.values(m).forEach(f => typeof f === "function" && (f as any).mockReset());
  m.resolve.mockResolvedValue({ id: 9, openId: "reviewer_x", name: "Demo", suspended: false }); m.createSessionToken.mockResolvedValue("tok"); m.save.mockResolvedValue(undefined);
  vi.stubEnv("REVIEWER_LOGIN_ENABLED", "true");
  vi.stubEnv("REVIEWER_SEEKER_PASSWORD_HASH", hashReviewerPassword("seeker-pass-1"));
  vi.stubEnv("REVIEWER_EMPLOYER_PASSWORD_HASH", hashReviewerPassword("employer-pass-1"));
  vi.stubEnv("REVIEWER_ADMIN_PASSWORD_HASH", hashReviewerPassword("admin-pass-1"));
});
afterEach(() => vi.unstubAllEnvs());

describe("reviewer sign-in", () => {
  it("hashes with scrypt and verifies only the right password", () => {
    const h = hashReviewerPassword("abc");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyReviewerPassword("abc", h)).toBe(true);
    expect(verifyReviewerPassword("abd", h)).toBe(false);
    expect(verifyReviewerPassword("abc", undefined)).toBe(false);
  });
  it("is a 404 unless explicitly enabled", async () => {
    vi.stubEnv("REVIEWER_LOGIN_ENABLED", "");
    expect((await post(app(), "seeker@reviewer.skipwait.me", "seeker-pass-1")).status).toBe(404);
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });
  it("signs the demo seeker in with the right password and lands on plans", async () => {
    const res = await post(app(), " Seeker@Reviewer.skipwait.me ", "seeker-pass-1");
    expect(res.status).toBe(200); expect(res.body).toEqual({ signedIn: true, role: "seeker", redirectTo: "/plans" });
    expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ provider: "reviewer", email: "seeker@reviewer.skipwait.me" }));
    expect(res.headers["set-cookie"]?.[0]).toContain("tok");
  });
  it("rejects a wrong password, an unknown email and a real person's email with the same answer", async () => {
    const a = app();
    for (const [e, p] of [["seeker@reviewer.skipwait.me", "nope"], ["someone@gmail.com", "seeker-pass-1"], ["referrer@reviewer.skipwait.me", "x"]]) {
      const res = await post(a, e, p); expect(res.status).toBe(401); expect(res.body).toEqual({ error: "Email or password is not right." });
    }
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });
  it("creates an approved demo employer account and no admin rights for the employer", async () => {
    const res = await post(app(), "employer@reviewer.skipwait.me", "employer-pass-1");
    expect(res.body.redirectTo).toBe("/employer");
    expect(m.inserts).toContainEqual(expect.objectContaining({ approvalStatus: "approved", companyName: "Demo Employer (review account)" }));
    expect(m.updates).not.toContainEqual(expect.objectContaining({ role: "admin" }));
  });
  it("refuses the admin demo account unless REVIEWER_ALLOW_ADMIN is true (never on prod)", async () => {
    expect((await post(app(), "admin@reviewer.skipwait.me", "admin-pass-1")).status).toBe(401);
    vi.stubEnv("REVIEWER_ALLOW_ADMIN", "true");
    const res = await post(app(), "admin@reviewer.skipwait.me", "admin-pass-1");
    expect(res.status).toBe(200); expect(m.updates).toContainEqual({ role: "admin" });
  });
  it("rate limits repeated failures", async () => {
    const a = app(); let last = 0;
    for (let i = 0; i < 9; i++) last = (await post(a, "seeker@reviewer.skipwait.me", "bad" + i)).status;
    expect(last).toBe(429);
    expect((await post(a, "seeker@reviewer.skipwait.me", "seeker-pass-1")).status).toBe(429);
  });
});
