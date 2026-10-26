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
let webauthnSupported = true;
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...args: unknown[]) => startAuthentication(...args),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: () => webauthnSupported,
  browserSupportsWebAuthnAutofill: async () => false,
}));

const postJSON = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const result = await postJSON(url, init?.body ? JSON.parse(String(init.body)) : {});
    return { ok: result.ok, json: async () => result.data } as Response;
  }));
});

import { PasskeySignInButton } from "./GoalPasskeySignIn";

beforeEach(() => { webauthnSupported = true; startAuthentication.mockReset(); postJSON.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PasskeySignInButton honest states", () => {
  it("is hidden when the browser has no WebAuthn platform support", () => {
    webauthnSupported = false;
    render(<PasskeySignInButton returnTo="/explore" />);
    expect(screen.queryByRole("button", { name: /Use a saved passkey/ })).toBeNull();
  });
  it("a dismissed browser prompt returns the button to idle with no error copy", async () => {
    postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x" } });
    startAuthentication.mockRejectedValueOnce(new DOMException("cancelled", "NotAllowedError"));
    render(<PasskeySignInButton returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Use a saved passkey/ })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("a failed ceremony shows an honest error, not silence", async () => {
    postJSON.mockResolvedValueOnce({ ok: true, data: { challenge: "x" } });
    startAuthentication.mockResolvedValueOnce({ id: "assertion" });
    postJSON.mockResolvedValueOnce({ ok: false, data: { error: "That sign-in could not be verified. Try again." } });
    render(<PasskeySignInButton returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Use a saved passkey/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not be verified"));
  });
});
