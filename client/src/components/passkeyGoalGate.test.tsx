// @vitest-environment jsdom
/**
 * Owner, Oct 26 (phonemsg-01M5VG4PVZCHMZ8T9R4Z1Q1X3Y): no device-credential UI
 * on the old screens. The passkey affordances live in the goal-native seeker
 * sign-in only; the legacy kit page is byte-identical to main.
 *
 * D-030/D-057/D-333: referrers keep the work-email code only; never a passkey.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: () => true,
  browserSupportsWebAuthnAutofill: async () => false,
}));
vi.mock("@/components/ReferrerOtpSignIn", () => ({
  ReferrerOtpSignIn: () => <div data-testid="mock-referrer-otp">Work Email OTP</div>,
}));
import { SeekerSignIn } from "./SeekerSignIn";
import { GoalSeekerForm } from "@/pages/goal/sign-in/GoalSeekerForm";
import GoalSignIn, { PasskeyManagement } from "../pages/GoalSignIn";

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/sign-in");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("seeker sign-in passkey affordances exist only in the goal-native component", () => {
  it.each([false, "offline"])("hides all passkey entry points when availability is %s", async enabled => {
    const fetchMock = vi.fn(async () => {
      if (enabled === "offline") throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => ({ enabled }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoalSeekerForm returnTo="/explore" />);
    expect(screen.getByRole("button", { name: /^Sign in$/ })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByLabelText(/Email address/).getAttribute("autocomplete")).toBe("email");
    expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
  });
  it("the compatibility entry delegates the same server-enabled Goal passkey behavior", async () => {
    render(<SeekerSignIn />);
    expect(await screen.findByRole("button", { name: /Use a saved passkey/ })).toBeTruthy();
    const email = screen.getByLabelText(/Email address/);
    expect(email.getAttribute("autocomplete")).toBe("username webauthn");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });

  it("the goal sign-in opens with the server-enabled passkey action beside the social options", async () => {
    render(<GoalSeekerForm returnTo="/explore" />);
    expect(await screen.findByRole("button", { name: /Use a saved passkey/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("referrer surface NEVER renders a passkey affordance (D-030, D-057, D-333 pin)", () => {
    window.history.pushState({}, "", "/sign-in?intent=referrer");
    render(<GoalSignIn />);
    expect(screen.queryByRole("button", { name: /Use a saved passkey/ })).toBeNull();
    expect(screen.getByTestId("mock-referrer-otp")).toBeTruthy();
    expect(screen.getByText(/Work email only/)).toBeTruthy();
  });

  it("a password sign-in after enrollment skips the enrollment offer (F9)", async () => {
    localStorage.setItem("skipwait_passkey_enrolled_seeker@example.com", "true");
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("availability") ? { enabled: true } : { ok: true, step: "signed_in", redirectTo: "/explore" } })));
    render(<GoalSeekerForm returnTo="/explore" />);
    await screen.findByRole("button", { name: "Use a saved passkey" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "seeker@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(screen.queryByText(/Save this device for faster sign-in/)).toBeNull();
  });
});

describe("passkey management", () => {
  it("opens management from the seeker sign-in link and returns without a page reload", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith("availability") ? { enabled: true } : { credentials: [] } })));
    render(<GoalSignIn />);
    fireEvent.click(await screen.findByRole("link", { name: "Manage saved passkeys" }));
    expect(await screen.findByRole("heading", { name: "Manage your saved passkeys." })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Back to sign-in" }));
    expect(await screen.findByRole("heading", { name: "Get referred." })).toBeTruthy();
  });
  it("loads owned devices and confirms before revoking, then refreshes the list", async () => {
    let removed = false;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("availability")) return { ok: true, json: async () => ({ enabled: true }) };
      if (url.endsWith("revoke")) {
        expect(JSON.parse(String(init?.body))).toEqual({ credentialId: "owned-device" });
        removed = true;
        return { ok: true, json: async () => ({ revoked: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ credentials: removed ? [] : [{ id: "owned-device", deviceName: "My laptop", createdAt: "2026-11-01T00:00:00Z", lastUsedAt: null }] }) };
    }));
    render(<PasskeyManagement />);
    expect(await screen.findByText("My laptop")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove My laptop" }));
    expect(calls.filter(url => url.endsWith("revoke"))).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByText("You have no saved passkeys.")).toBeTruthy();
    expect(calls.filter(url => url.endsWith("revoke"))).toHaveLength(1);
  });

  it("shows authentication and retry paths after failed reads", async () => {
    let authorized = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("availability")
      ? { ok: true, json: async () => ({ enabled: true }) }
      : { ok: authorized, status: authorized ? 200 : 403, json: async () => authorized ? ({ credentials: [] }) : ({ error: "Sign in first" }) }));
    render(<PasskeyManagement />);
    expect(await screen.findByRole("link", { name: "Sign in to manage passkeys" })).toBeTruthy();
    authorized = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You have no saved passkeys.")).toBeTruthy();
  });

  it("preserves the device on uncertain removal and permits a list reconciliation", async () => {
    let listReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("availability")) return { ok: true, json: async () => ({ enabled: true }) };
      if (url.endsWith("revoke")) throw new TypeError("Lost response");
      listReads++;
      return { ok: true, json: async () => ({ credentials: [{ id: "owned", deviceName: "My laptop", createdAt: "2026-11-01T00:00:00Z", lastUsedAt: null }] }) };
    }));
    render(<PasskeyManagement />);
    await screen.findByText("My laptop");
    fireEvent.click(screen.getByRole("button", { name: "Remove My laptop" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not confirm removal/i);
    expect(screen.getByText("My laptop")).toBeTruthy();
    expect(screen.queryByText(/Passkey removed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload passkeys" }));
    await waitFor(() => expect(listReads).toBe(2));
    expect(screen.getByRole("button", { name: "Remove My laptop" }).getAttribute("aria-busy")).toBeNull();
  });

  it("disabled management never requests account credentials", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { paths.push(url); return { ok: true, json: async () => ({ enabled: false }) }; }));
    render(<PasskeyManagement />);
    expect(await screen.findByText(/Passkey management is not available/)).toBeTruthy();
    expect(paths).toEqual(["/api/auth/passkey/availability"]);
  });
});
