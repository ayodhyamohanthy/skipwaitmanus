// @vitest-environment jsdom
/**
 * Honest-status contract for the browser-owned passkey action (design-lens
 * boundary, Oct 26): a click must never dead-end. Dismissal returns the
 * button to idle with no scare copy; a real failure says so; an unsupported
 * browser hides the action entirely.
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startAuthentication = vi.fn();
const startRegistration = vi.fn();
let webauthnSupported = true;
let autofillSupported = false;
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
  startRegistration: (...args: unknown[]) => startRegistration(...args),
  browserSupportsWebAuthn: () => webauthnSupported,
  browserSupportsWebAuthnAutofill: async () => autofillSupported,
}));

const postJSON = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const result = await postJSON(url, init?.body ? JSON.parse(String(init.body)) : {});
    return { ok: result.ok, json: async () => result.data } as Response;
  }));
});

import { PasskeyAutofill, PasskeyEnrollmentOffer, PasskeySignInButton } from "./GoalPasskeySignIn";

beforeEach(() => {
  webauthnSupported = true; autofillSupported = false;
  startAuthentication.mockReset(); startRegistration.mockReset(); postJSON.mockReset();
  vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PasskeySignInButton honest states", () => {
  it("is hidden unless server availability enabled the action", () => {
    render(<PasskeySignInButton returnTo="/explore" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(postJSON).not.toHaveBeenCalled();
  });
  it("is hidden when the browser has no WebAuthn platform support", () => {
    webauthnSupported = false;
    render(<PasskeySignInButton enabled returnTo="/explore" />);
    expect(screen.queryByRole("button", { name: /Use a saved passkey/ })).toBeNull();
  });
  it("a dismissed browser prompt returns the button to idle with no error copy", async () => {
    postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x" } });
    startAuthentication.mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"));
    render(<PasskeySignInButton enabled returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Use a saved passkey/ })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a failed ceremony shows an honest error, not silence", async () => {
    postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x" } });
    startAuthentication.mockResolvedValueOnce({ id: "assertion" });
    postJSON.mockResolvedValueOnce({ ok: false, data: { error: "That sign-in could not be verified. Try again." } });
    render(<PasskeySignInButton enabled returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not be verified"));
  });
  it.each(["options", "verify"])("recovers from a rejected %s request and permits retry", async leg => {
    if (leg === "verify") {
      postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x", ceremonyId: 101 } });
      startAuthentication.mockResolvedValueOnce({ id: "assertion" });
    }
    postJSON.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PasskeySignInButton enabled returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/connection|connect/i));
    expect(screen.getByRole("button", { name: /Use a saved passkey/ }).getAttribute("aria-busy")).toBeNull();
    postJSON.mockResolvedValueOnce({ ok: false, data: { error: "Try again later" } });
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Try again later"));
  });
  it("does not mislabel authenticator faults as cancellation", async () => {
    postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x" } });
    startAuthentication.mockRejectedValueOnce(new Error("authenticator unavailable"));
    render(<PasskeySignInButton enabled returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/device/i));
  });
});

describe("enrollment and autofill recovery", () => {
  it.each(["options", "verify"])("enrollment recovers after a rejected %s request", async leg => {
    if (leg === "verify") {
      postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "register" } });
      startRegistration.mockResolvedValueOnce({ id: "credential" });
    }
    postJSON.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PasskeyEnrollmentOffer enabled email="seeker@example.com" returnTo="/explore" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/connection/i));
    expect(screen.getByRole("button", { name: "Save passkey" }).getAttribute("aria-busy")).toBeNull();
    expect(localStorage.getItem("skipwait_passkey_enrolled_seeker@example.com")).toBeNull();
    expect(localStorage.getItem("skipwait_passkey_dismissed_seeker@example.com")).toBeNull();
  });
  it("disabled autofill starts no ceremony", async () => {
    autofillSupported = true;
    render(<PasskeyAutofill returnTo="/explore" />);
    expect(postJSON).not.toHaveBeenCalled();
    expect(startAuthentication).not.toHaveBeenCalled();
  });
  it("autofill shows a failed network request instead of silently swallowing it", async () => {
    autofillSupported = true;
    postJSON.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<PasskeyAutofill enabled returnTo="/explore" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/connect/i);
  });
});
