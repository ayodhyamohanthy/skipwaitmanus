// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import Settings from "./Settings";

const accessState = vi.hoisted(() => ({ verified: false }));
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: true, isLoaded: true, signOut: vi.fn(), getToken: vi.fn(async () => null) }),
  useUser: () => ({ user: { emailAddresses: [] } }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
describe("Settings work email", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (input: string) => String(input).includes("/api/company-referrals/access") ? { ok: true, json: async () => ({ verifiedCompanyAccess: accessState.verified, workEmailDomain: accessState.verified ? "acme.com" : null }) } : { ok: true, json: async () => ({ requests: [] }) })); });
  afterEach(() => { cleanup(); accessState.verified = false; window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("offers Add work email when no verified work email exists", async () => {
    render(<Settings />);
    expect(await screen.findByText("No verified work email yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add work email" }).getAttribute("href")).toBe("/referrer?setup=work-email");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/company-referrals/access", expect.objectContaining({ credentials: "include" }));
  });

  it("offers Referrer mode after a work email is verified", async () => {
    accessState.verified = true;
    render(<Settings />);
    expect(await screen.findByText("Work email verified")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch to Job Referrer mode" })).toBeTruthy();
  });

  it("exposes authenticated privacy controls without claiming an immediate deletion", () => {
    render(<Settings />);
    expect(screen.getByRole("button", { name: "Download my data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request account deletion" })).toBeTruthy();
    expect(screen.getByText(/review deletion requests rather than silently removing/i)).toBeTruthy();
  });
});
