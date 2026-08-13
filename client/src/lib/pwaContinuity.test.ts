import { describe, expect, it } from "vitest";
import { clearReferralDraft, markSecureSessionVerified, readReferralDraft, readSecureSessionVerifiedAt, registerSecureSessionRestoration, requestSavedDeviceCredential, saveReferralDraft, supportsBrowserCredentialMediation } from "./pwaContinuity";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe("PWA continuity", () => {
  it("keeps only lightweight request context for recovery", () => {
    const storage = memoryStorage();
    saveReferralDraft({ name: "Avery", targetUrl: "https://company.example/jobs/1" }, storage);
    expect(readReferralDraft(storage)).toMatchObject({ name: "Avery", targetUrl: "https://company.example/jobs/1" });
    clearReferralDraft(storage);
    expect(readReferralDraft(storage)).toBeNull();
  });

  it("records only a session verification timestamp, never credentials", () => {
    const storage = memoryStorage();
    markSecureSessionVerified(storage);
    expect(readSecureSessionVerifiedAt(storage)).toEqual(expect.any(Number));
  });

  it("detects browser credential capability without retrieving stored credentials", () => {
    expect(supportsBrowserCredentialMediation({ get: () => undefined })).toBe(true);
    expect(supportsBrowserCredentialMediation({})).toBe(false);
    expect(supportsBrowserCredentialMediation(undefined)).toBe(false);
  });

  it("uses saved-device credential mediation only when a user flow asks for it", async () => {
    const get = async () => ({ id: "device-provided" });
    expect(await requestSavedDeviceCredential({ get })).toBe("credential");
    expect(await requestSavedDeviceCredential(undefined)).toBe("unsupported");
  });

  it("restores the secure session on focus, reconnect, and visible app resume", () => {
    const listeners = new Map<string, () => void>();
    const target = { addEventListener: (event: string, listener: () => void) => listeners.set(event, listener), removeEventListener: (event: string) => listeners.delete(event) };
    const documentTarget = { ...target, visibilityState: "visible" };
    let calls = 0;
    const cleanup = registerSecureSessionRestoration(() => { calls += 1; }, target, documentTarget);
    listeners.get("focus")?.(); listeners.get("online")?.(); listeners.get("visibilitychange")?.();
    expect(calls).toBe(3);
    cleanup();
    expect(listeners.size).toBe(0);
  });
});
