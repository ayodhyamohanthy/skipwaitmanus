// @vitest-environment jsdom
// Goal /start (D-048-p3-start, dark): job-link preview, invalid/foreign link,
// draft continuity, clear-and-start-new, fast-track handoff, flags-off kit
// control. Behavior contract copied from the kit Onboarding page: same preview
// call, same domain-confirmation rule, same bridge keys, same /request target.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "./Onboarding";
import { saveReferralDraft, clearReferralDraft, readReferralDraft } from "@/lib/pwaContinuity";
import { TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

const { authState, flags, go } = vi.hoisted(() => ({
  authState: { isSignedIn: true },
  flags: { start: true },
  go: vi.fn(),
}));

vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => (flags as Record<string, boolean>)[id] === true }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("t"), openSignIn: vi.fn() }),
  useUser: () => ({ user: { id: "u1" } }),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/start", go],
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

const VALID_URL = "https://quillmint.com/careers/product-designer";

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(String(url), init) as { __status?: number } | undefined;
    if (body && typeof body === "object" && "__status" in body) return { ok: false, status: body.__status, json: async () => ({ error: (body as { error?: string }).error }) };
    return { ok: true, json: async () => body ?? {} };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function typeUrl(value: string) {
  fireEvent.change(screen.getByLabelText(/Target Role URL/i), { target: { value } });
}

beforeEach(() => {
  authState.isSignedIn = true; flags.start = true; go.mockClear();
  window.history.replaceState({}, "", "/start");
  clearReferralDraft();
  localStorage.removeItem("bridge-target-url");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("goal start", () => {
  it("opens on the goal with one commit and rejects an invalid link inline", async () => {
    stubFetch(() => ({}));
    render(<Onboarding />);
    expect(await screen.findByTestId("goal-start")).toBeTruthy();
    expect(screen.getByText("Paste the job link.")).toBeTruthy();
    typeUrl("notaurl");
    expect(await screen.findByText(TARGET_ROLE_URL_ERROR)).toBeTruthy();
    expect(document.getElementById("continue-hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("previews a valid link and identifies the company as dot+text, not a banner", async () => {
    const fetchMock = stubFetch((url, init) => {
      if (url.includes("/api/job-link/preview")) return { canonicalUrl: VALID_URL, companyDomain: "quillmint.com", companyName: "Quillmint", employerConfidence: "verified", status: "ok" };
      return {};
    });
    render(<Onboarding />);
    typeUrl(VALID_URL);
    expect(await screen.findByText(/Company identified: Quillmint/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/job-link/preview", expect.objectContaining({ method: "POST" })));
    expect(screen.getByRole("button", { name: /Continue/ }).getAttribute("aria-disabled")).toBeNull();
  });

  it("asks for the company domain when the preview is ambiguous, then hands off to /request", async () => {
    stubFetch((url) => {
      if (url.includes("/api/job-link/preview")) return { canonicalUrl: VALID_URL, companyDomain: null, employerConfidence: "ambiguous", status: "ok", reason: "Several companies match", recoveryAction: "Confirm the company domain." };
      return {};
    });
    render(<Onboarding />);
    typeUrl(VALID_URL);
    expect(await screen.findByLabelText(/Company domain/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Company domain/i), { target: { value: "quillmint.com" } });
    const commit = screen.getByRole("button", { name: /Continue/ });
    await waitFor(() => expect(commit.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(commit);
    expect(localStorage.getItem("bridge-target-url")).toBe(VALID_URL);
    expect(readReferralDraft()?.targetUrl).toBe(VALID_URL);
    expect(JSON.parse(localStorage.getItem("bridge-company-confirmation") || "{}")).toEqual({ canonicalUrl: VALID_URL, confirmedDomain: "quillmint.com" });
    expect(go).toHaveBeenCalledWith("/request");
  });

  it("turns a preview outage into a visible retry instead of a dead end", async () => {
    let calls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.includes("/api/job-link/preview")) { calls += 1; return { __status: 500, error: "down" }; }
      return {};
    });
    render(<Onboarding />);
    typeUrl(VALID_URL);
    expect(await screen.findByText(/couldn't verify this job link/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("restores the saved draft and clears it end to end", async () => {
    saveReferralDraft({ name: "Asha", targetUrl: VALID_URL });
    const fetchMock = stubFetch((url, init) => {
      if (url.includes("/api/documents/draft")) return {};
      if (url.includes("/api/job-link/preview")) return { canonicalUrl: VALID_URL, companyDomain: "quillmint.com", companyName: "Quillmint", employerConfidence: "verified", status: "ok" };
      return {};
    });
    render(<Onboarding />);
    expect(await screen.findByText(/Draft saved on this device/)).toBeTruthy();
    expect((screen.getByLabelText(/Target Role URL/i) as HTMLInputElement).value).toBe(VALID_URL);
    fireEvent.click(screen.getByRole("button", { name: /Clear and start new/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/documents/draft", expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect((screen.getByLabelText(/Target Role URL/i) as HTMLInputElement).value).toBe(""));
  });

  it("keeps the private referral path intact through the fast-track handoff", async () => {
    window.history.replaceState({}, "", "/start?fast=FAST123");
    stubFetch((url) => {
      if (url.includes("/api/job-link/preview")) return { canonicalUrl: VALID_URL, companyDomain: "quillmint.com", companyName: "Quillmint", employerConfidence: "verified", status: "ok" };
      return {};
    });
    render(<Onboarding />);
    expect(await screen.findByText(/Private referral path/)).toBeTruthy();
    typeUrl(VALID_URL);
    const commit = await screen.findByRole("button", { name: /Continue/ });
    await waitFor(() => expect(commit.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(commit);
    expect(go).toHaveBeenCalledWith("/request?fast=FAST123");
  });

  it("renders the kit page untouched while the surface is off (release control)", async () => {
    flags.start = false;
    stubFetch(() => ({}));
    render(<Onboarding />);
    expect(await screen.findByText("Paste the job link.")).toBeTruthy();
    expect(screen.queryByTestId("goal-start")).toBeNull();
  });
});
