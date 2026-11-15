// D-057-session-gate (§0b.6; red first): the shared referrer fetch helpers turn a
// work_email_code_required refusal into a re-check of the verdict, and the
// step-up client never calls the standalone sign-in.
import { afterEach, describe, expect, it, vi } from "vitest";
import { authedFetch } from "./threadApi";
import { confirmStepUpCode, onWorkEmailCodeRequired, sendStepUpCode } from "./referrerStepUpApi";

const refusal = { ok: false, status: 403, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }), text: async () => JSON.stringify({ error: "Confirm your work email with a code to continue.", code: "work_email_code_required" }) };
afterEach(() => { vi.unstubAllGlobals(); });

describe("work_email_code_required refusals", () => {
  it("authedFetch tells the access verdict to re-check", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => refusal));
    const heard = vi.fn();
    const stop = onWorkEmailCodeRequired(heard);
    await expect(authedFetch("/api/company-referrals/1/claim", async () => "t", { method: "POST" })).rejects.toThrow("Confirm your work email with a code to continue.");
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("step-up client", () => {
  it("posts to the step-up endpoints only", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => url.endsWith("/send") ? { sent: true, challengeId: "a".repeat(43), expiresAt: "2026-10-30T10:00:00.000Z" } : { verified: true, expiresAt: "2026-10-30T22:00:00.000Z" }, text: async () => "" }; }));
    const sent = await sendStepUpCode("ref@acme.com", async () => "t");
    expect(sent).toEqual({ ok: true, challengeId: "a".repeat(43), expiresAt: "2026-10-30T10:00:00.000Z" });
    expect(await confirmStepUpCode("a".repeat(43), "123456", async () => "t")).toEqual({ ok: true, expiresAt: "2026-10-30T22:00:00.000Z" });
    expect(calls).toEqual(["/api/referrer/step-up/send", "/api/referrer/step-up/verify"]);
    expect(calls.some(url => url.includes("/api/auth/otp"))).toBe(false);
  });
});
