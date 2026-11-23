// @vitest-environment jsdom
// Device sign-in (owner report, Oct 25): returning users on the same device see the
// email they last signed in with, and the six-digit code field is ready for the
// phone's code autofill the moment it opens.
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferrerOtpSignIn } from "./ReferrerOtpSignIn";
import { SeekerSignIn } from "./SeekerSignIn";

const SEEKER_KEY = "skipwait:signin-email:seeker";
const REFERRER_KEY = "skipwait:signin-email:referrer";

function stubFetch(replies: Record<string, Record<string, unknown>>, status = 200) {
  const fetchMock = vi.fn(async (url: string) => ({ ok: status < 400, status, json: async () => replies[url] ?? {} }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function stubLocation() {
  const assign = vi.fn(); const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign, reload });
  return { assign, reload };
}
async function settle() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe("seeker sign-in on a returning device", () => {
  it("prefills the email this device last signed in with", () => {
    window.localStorage.setItem(SEEKER_KEY, "ana@example.com");
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("ana@example.com");
    expect(screen.getByRole("button", { name: /Not you\? Forget this email/ })).toBeTruthy();
  });

  it("remembers the email only after a password sign-in succeeds", async () => {
    stubLocation();
    stubFetch({ "/api/auth/password/sign-in": { ok: true, step: "signed_in", redirectTo: "/explore" } });
    render(<SeekerSignIn returnTo="/explore" />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " Ana@Example.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    expect(window.localStorage.getItem(SEEKER_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await settle();
    expect(window.localStorage.getItem(SEEKER_KEY)).toBe("ana@example.com");
  });

  it("does not remember the email when password sign-in fails", async () => {
    stubLocation();
    const fetchMock = stubFetch({ "/api/auth/password/sign-in": { ok: true, step: "signed_in", redirectTo: "/explore" } });
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fetchMock.mockImplementation(async () => ({ ok: false, status: 400, json: async () => ({ ok: false, code: "invalid_credentials", message: "Incorrect password." }) }));
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await settle();
    expect(window.localStorage.getItem(SEEKER_KEY)).toBeNull();
  });

  it("Not you? forgets the remembered email and clears the field", () => {
    window.localStorage.setItem(SEEKER_KEY, "ana@example.com");
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    fireEvent.click(screen.getByRole("button", { name: /Not you\? Forget this email/ }));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
    expect(window.localStorage.getItem(SEEKER_KEY)).toBeNull();
    expect(screen.queryByRole("button", { name: /Not you\?/ })).toBeNull();
  });

  it("renders the password field shaped for current-password autofill", () => {
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.required).toBe(true);
    expect(screen.getByRole("button", { name: /Show password/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Forgot password\?/ })).toBeTruthy();
  });

  it("a storage that throws never breaks sign-in", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
  });

  it("ignores a stored value that is not an email", () => {
    window.localStorage.setItem(SEEKER_KEY, "<script>");
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
  });
});

describe("referrer work-email sign-in on a returning device", () => {
  it("prefills the work email this device last signed in with, never the seeker's", () => {
    window.localStorage.setItem(SEEKER_KEY, "ana@example.com");
    window.localStorage.setItem(REFERRER_KEY, "ana@acme.com");
    render(<ReferrerOtpSignIn />);
    expect((screen.getByLabelText("Company email") as HTMLInputElement).value).toBe("ana@acme.com");
  });

  it("does not borrow the seeker's personal email", () => {
    window.localStorage.setItem(SEEKER_KEY, "ana@example.com");
    render(<ReferrerOtpSignIn />);
    expect((screen.getByLabelText("Company email") as HTMLInputElement).value).toBe("");
  });

  it("remembers the work email after the code verifies, and opens the code field focused", async () => {
    stubLocation();
    stubFetch({ "/api/auth/otp/send": { sent: true }, "/api/auth/otp/verify": { signedIn: true } });
    const onSignedIn = vi.fn();
    render(<ReferrerOtpSignIn onSignedIn={onSignedIn} />);
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "Ana@Acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Send sign-in code/ }));
    await settle();
    const code = screen.getByLabelText("Six-digit code") as HTMLInputElement;
    expect(document.activeElement).toBe(code);
    expect(code.getAttribute("pattern")).toBe("[0-9]*");
    expect(code.maxLength).toBe(6);
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify & sign in/ }));
    await settle();
    expect(window.localStorage.getItem(REFERRER_KEY)).toBe("ana@acme.com");
    expect(window.localStorage.getItem(SEEKER_KEY)).toBeNull();
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("Not you? forgets the remembered work email", () => {
    window.localStorage.setItem(REFERRER_KEY, "ana@acme.com");
    render(<ReferrerOtpSignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Not you\? Forget this email/ }));
    expect((screen.getByLabelText("Company email") as HTMLInputElement).value).toBe("");
    expect(window.localStorage.getItem(REFERRER_KEY)).toBeNull();
  });
});
