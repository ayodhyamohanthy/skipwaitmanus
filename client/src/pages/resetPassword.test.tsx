// @vitest-environment jsdom
// The reset page says only what happened: WorkOS set the password, and this browser is signed in only when the
// server says so (the old page claimed "You're signed in" after a confirm that set nothing).
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import ResetPassword from "./ResetPassword";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const TOKEN = "Z1uX3RbwcIl5fIGJJJCXXisdI";
type Call = { url: string; body: unknown };
function stubFetch(reply: { status: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  }));
  return calls;
}
function openWithToken(token: string | null) {
  window.history.replaceState({}, "", token === null ? "/reset-password" : `/reset-password?token=${encodeURIComponent(token)}`);
  render(<ResetPassword />);
}
function submitNewPassword(password = "Newpassword1!") {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("the reset token never stays in the address bar", () => {
  it("drops the token from the URL once read, and still uses it on submit", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true, signedIn: true, redirectTo: "/explore" } });
    openWithToken(TOKEN);
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.href).not.toContain(TOKEN);
    submitNewPassword();
    expect(await screen.findByText("Password updated.")).toBeTruthy();
    expect(calls).toEqual([{ url: "/api/auth/password/reset/confirm", body: { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" } }]);
  });
});

describe("the reset page is truthful", () => {
  it("makes no request before submit, then shows signed in only when the server signed this browser in", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true, signedIn: true, redirectTo: "/explore" } });
    openWithToken(TOKEN);
    expect(calls).toHaveLength(0);
    submitNewPassword();
    expect(await screen.findByText("Password updated.")).toBeTruthy();
    expect(screen.getByText(/You're signed in\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/explore");
    expect(calls).toEqual([{ url: "/api/auth/password/reset/confirm", body: { token: TOKEN, password: "Newpassword1!", confirm: "Newpassword1!" } }]);
  });

  it("says sign in to continue when the server did not sign this browser in", async () => {
    stubFetch({ status: 200, body: { ok: true, signedIn: false, redirectTo: "/sign-in" } });
    openWithToken(TOKEN);
    submitNewPassword();
    expect(await screen.findByText("Password updated.")).toBeTruthy();
    expect(screen.getByText("Sign in to continue.")).toBeTruthy();
    expect(screen.queryByText(/You're signed in/)).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("an expired link shows the expired screen", async () => {
    stubFetch({ status: 400, body: { ok: false, code: "expired", message: PASSWORD_AUTH_COPY.expired } });
    openWithToken(TOKEN);
    submitNewPassword();
    expect(await screen.findByText("This link has expired.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send a new link" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByText(/1 hour/)).toBeNull();
  });

  it("a password WorkOS refuses shows its message and keeps the form", async () => {
    stubFetch({ status: 400, body: { ok: false, code: "weak_password", message: PASSWORD_AUTH_COPY.weak_password } });
    openWithToken(TOKEN);
    submitNewPassword("Password123!");
    expect((await screen.findByRole("alert")).textContent).toBe(PASSWORD_AUTH_COPY.weak_password);
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("too many attempts says how long to wait", async () => {
    stubFetch({ status: 429, body: { ok: false, code: "rate_limited", message: PASSWORD_AUTH_COPY.rate_limited, retryAfterSeconds: 120 } });
    openWithToken(TOKEN);
    submitNewPassword();
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Try again in 2 minutes.");
  });

  // Screenshot pass, item 4: with no token there was no link to expire; say what the page needs instead.
  it("a missing token says the page needs the emailed link and points to Forgot password, without asking the server", () => {
    const calls = stubFetch({ status: 200, body: {} });
    openWithToken(null);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page needs the link from your email.");
    expect(screen.queryByText("This link has expired.")).toBeNull();
    expect(screen.getByRole("link", { name: "Set or reset your password" }).getAttribute("href")).toBe("/forgot-password");
    expect(calls).toHaveLength(0);
  });

  it("a malformed token still shows the expired screen", () => {
    openWithToken("bad token!");
    expect(screen.getByText("This link has expired.")).toBeTruthy();
  });

  // Screenshot pass, item 5: every state short of "Password updated" has a way back to sign in.
  it("offers Back to sign in on the form, the expired and the no-link screens, not once the password is updated", async () => {
    const back = () => screen.queryByRole("link", { name: /Back to sign in/ });
    openWithToken(null);
    expect(back()?.getAttribute("href")).toBe("/sign-in");
    cleanup();
    openWithToken("bad token!");
    expect(back()?.getAttribute("href")).toBe("/sign-in");
    cleanup();
    stubFetch({ status: 200, body: { ok: true, signedIn: true, redirectTo: "/explore" } });
    openWithToken(TOKEN);
    expect(back()?.getAttribute("href")).toBe("/sign-in");
    submitNewPassword();
    expect(await screen.findByText("Password updated.")).toBeTruthy();
    expect(back()).toBeNull();
  });

  it("the update button waits for the three rules", async () => {
    stubFetch({ status: 200, body: { ok: true, signedIn: true, redirectTo: "/explore" } });
    openWithToken(TOKEN);
    const button = () => screen.getByRole("button", { name: "Update password" }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Newpassword1!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Newpassword2!" } });
    expect(button().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Newpassword1!" } });
    await waitFor(() => expect(button().disabled).toBe(false));
  });
});
