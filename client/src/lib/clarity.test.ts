import { describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/clarity", () => ({ default: { init: vi.fn(), identify: vi.fn() } }));

import Clarity from "@microsoft/clarity";
import { identifyClarity, initClarity, isClarityActive, shouldTrackClarityPath } from "./clarity";

describe("Clarity wiring", () => {
  it("stays inactive without VITE_CLARITY_PROJECT_ID and never throws", () => {
    expect(initClarity()).toBe(false);
    expect(isClarityActive()).toBe(false);
    expect(() => identifyClarity("u_1")).not.toThrow();
    expect(Clarity.init).not.toHaveBeenCalled();
  });

  it("never tracks single-use link routes that carry secrets", () => {
    expect(shouldTrackClarityPath("/email-review/abc123")).toBe(false);
    expect(shouldTrackClarityPath("/share-card/xyz")).toBe(false);
    expect(shouldTrackClarityPath("/fast/r12-34")).toBe(false);
    expect(shouldTrackClarityPath("/refer/a/b")).toBe(false);
    // D-090 BYOR: /r/<token> is a one-time bring-your-own-referrer link.
    expect(shouldTrackClarityPath("/r/abc123")).toBe(false);
    expect(shouldTrackClarityPath("/company/claim")).toBe(false);
    expect(shouldTrackClarityPath("/company/dashboard/quillmint")).toBe(false);
    expect(shouldTrackClarityPath("/")).toBe(true);
    expect(shouldTrackClarityPath("/feed")).toBe(true);
    expect(shouldTrackClarityPath("/pricing")).toBe(true);
  });

  // D-090 re-review F3 (P2): Clarity records the full URL, so a sign-in page whose
  // returnTo names a one-time link must not be tracked either.
  it("never tracks a sign-in page whose returnTo points at a one-time link", () => {
    const token = "Q".repeat(43);
    const href = `/sign-in?${new URLSearchParams({ intent: "referrer", returnTo: `/r/${token}` })}`;
    const [pathname, search] = href.split("?");
    expect(shouldTrackClarityPath(pathname, `?${search}`)).toBe(false);
    expect(shouldTrackClarityPath("/sign-in", `?returnTo=${encodeURIComponent(`/email-review/${token}`)}`)).toBe(false);
    expect(shouldTrackClarityPath("/sign-in", "?returnTo=%2Fshare-card%2Fabc")).toBe(false);
    expect(shouldTrackClarityPath("/sign-in", "?returnTo=%2Ffast%2Fabc")).toBe(false);
    // Nested or malformed targets fail safe.
    expect(shouldTrackClarityPath("/sign-in", "?returnTo=%252Fr%252Fabc")).toBe(false);
    expect(shouldTrackClarityPath("/sign-in", "?returnTo=%E0%A4%A")).toBe(false);
    // Ordinary sign-ins are still tracked.
    expect(shouldTrackClarityPath("/sign-in", "?intent=referrer&returnTo=%2Freferrer-setup")).toBe(true);
    expect(shouldTrackClarityPath("/sign-in", "")).toBe(true);
    expect(shouldTrackClarityPath("/pricing", "?utm_source=x")).toBe(true);
  });

  it("does not initialize on a sign-in page that returns to a one-time link", async () => {
    vi.stubGlobal("window", { location: { pathname: "/sign-in", search: "?intent=referrer&returnTo=%2Fr%2Fabc" } });
    vi.stubEnv("VITE_CLARITY_PROJECT_ID", "test-project");
    vi.resetModules();
    try {
      const fresh = await import("./clarity");
      const MockedClarity = (await import("@microsoft/clarity")).default;
      vi.mocked(MockedClarity.init).mockClear();
      expect(fresh.initClarity()).toBe(false);
      expect(MockedClarity.init).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("initializes once and identifies when the project id is set", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubEnv("VITE_CLARITY_PROJECT_ID", "test-project");
    vi.resetModules();
    try {
      const fresh = await import("./clarity");
      const MockedClarity = (await import("@microsoft/clarity")).default;
      expect(fresh.initClarity()).toBe(true);
      expect(MockedClarity.init).toHaveBeenCalledWith("test-project");
      fresh.identifyClarity("u_123");
      expect(MockedClarity.identify).toHaveBeenCalledWith("u_123");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
