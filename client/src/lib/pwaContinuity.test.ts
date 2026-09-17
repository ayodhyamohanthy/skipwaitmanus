import { afterEach, describe, expect, it, vi } from "vitest";
import { clearReferralDraft, markSecureSessionVerified, readReferralDraft, readSecureSessionVerifiedAt, registerSecureSessionRestoration, requestSavedDeviceCredential, saveReferralDraft, supportsBrowserCredentialMediation } from "./pwaContinuity";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe("PWA continuity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("continues when accessing browser storage itself is blocked", () => {
    vi.stubGlobal("window", {
      get localStorage() { throw new DOMException("Storage blocked", "SecurityError"); },
    });
    expect(readReferralDraft()).toBeNull();
    expect(readSecureSessionVerifiedAt()).toBeNull();
    expect(() => saveReferralDraft({ name: "Avery", targetUrl: "https://company.example/jobs/1" })).not.toThrow();
    expect(() => clearReferralDraft()).not.toThrow();
    expect(() => markSecureSessionVerified()).not.toThrow();
  });

  it("treats storage operation failures as unavailable persistence", () => {
    const storage = {
      getItem: () => { throw new DOMException("Storage blocked", "SecurityError"); },
      setItem: () => { throw new DOMException("Storage full", "QuotaExceededError"); },
      removeItem: () => { throw new DOMException("Storage blocked", "SecurityError"); },
    };
    expect(readReferralDraft(storage)).toBeNull();
    expect(readSecureSessionVerifiedAt(storage)).toBeNull();
    expect(() => saveReferralDraft({ name: "Avery", targetUrl: "https://company.example/jobs/1" }, storage)).not.toThrow();
    expect(() => clearReferralDraft(storage)).not.toThrow();
    expect(() => markSecureSessionVerified(storage)).not.toThrow();
  });

  it.each([
    "not json", "null", "[]",
    JSON.stringify({ name: "Avery", targetUrl: 123, updatedAt: 1 }),
    JSON.stringify({ name: {}, targetUrl: "https://company.example/jobs/1", updatedAt: 1 }),
    JSON.stringify({ name: "Avery", targetUrl: "https://company.example/jobs/1" }),
    JSON.stringify({ name: "Avery", targetUrl: "https://company.example/jobs/1", updatedAt: "yesterday" }),
    JSON.stringify({ name: "Avery", targetUrl: "   ", updatedAt: 1 }),
  ])("ignores malformed persisted drafts: %s", (value) => {
    const storage = memoryStorage();
    storage.setItem("skipwait-pwa-referral-draft", value);
    expect(readReferralDraft(storage)).toBeNull();
  });

  it("preserves the native credential container receiver", async () => {
    const credentials = {
      async get(this: unknown, options?: CredentialRequestOptions) {
        if (this !== credentials) throw new TypeError("Illegal invocation");
        expect(options).toEqual({ mediation: "optional", password: true });
        return { id: "device-provided" };
      },
    };
    expect(await requestSavedDeviceCredential(credentials)).toBe("credential");
  });

  it("retains empty and rejected credential fallbacks", async () => {
    expect(await requestSavedDeviceCredential({ get: async () => null })).toBe("empty");
    expect(await requestSavedDeviceCredential({ get: async () => { throw new Error("Cancelled"); } })).toBe("fallback");
  });

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
