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
    expect(shouldTrackClarityPath("/")).toBe(true);
    expect(shouldTrackClarityPath("/feed")).toBe(true);
    expect(shouldTrackClarityPath("/pricing")).toBe(true);
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
