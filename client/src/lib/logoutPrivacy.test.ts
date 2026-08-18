// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const pendingResume = vi.hoisted(() => ({ clear: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/pendingResume", () => ({
  clearPendingResumeFiles: pendingResume.clear,
}));

import { clearPrivateReferralBrowserData } from "./logoutPrivacy";

describe("logout privacy cleanup", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    pendingResume.clear.mockClear();
    [
      "bridge-name",
      "bridge-target-url",
      "bridge-seeker-attachments",
      "bridge-request-sent",
      "bridge-tokens",
      "bridge-job-seeker-token-reset-3-free-v1",
      "skipwait-pwa-referral-draft",
      "manus-runtime-user-info",
    ].forEach(key => localStorage.setItem(key, "private"));
    sessionStorage.setItem("skipwait-pending-resume-submit", "true");
  });

  it("removes a pasted role link, resume metadata, pending draft, and cached balance on logout", async () => {
    await clearPrivateReferralBrowserData();

    expect(localStorage.getItem("bridge-target-url")).toBeNull();
    expect(localStorage.getItem("bridge-seeker-attachments")).toBeNull();
    expect(localStorage.getItem("skipwait-pwa-referral-draft")).toBeNull();
    expect(localStorage.getItem("bridge-tokens")).toBeNull();
    expect(sessionStorage.getItem("skipwait-pending-resume-submit")).toBeNull();
    expect(pendingResume.clear).toHaveBeenCalledTimes(1);
  });
});
