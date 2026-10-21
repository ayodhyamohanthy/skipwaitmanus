// @vitest-environment jsdom
// The forgot page never says whether an account exists, promises no fixed link lifetime, and points referrers
// to their work-email code (they never have a password, D-049).
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import ForgotPassword from "./ForgotPassword";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function stubFetch(reply: { status: number; body: unknown }) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  }));
  return calls;
}
function requestReset(email: string) {
  render(<ForgotPassword />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the forgot page is neutral and parses the response", () => {
  it("shows the same confirmation whatever the server holds, with no fixed lifetime promised", async () => {
    const calls = stubFetch({ status: 200, body: { ok: true } });
    requestReset(" Asha@Gmail.com ");
    expect(await screen.findByText("Check your email.")).toBeTruthy();
    // Review F-R2 (b): a covered-domain account gets no link (D-081), so the line never promises one to every account.
    expect(screen.getByText(/If asha@gmail\.com can use a password on skipwait\.me, we've sent a link/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/has a skipwait\.me account/);
    // D-078 ruling 8, worded so the two lines agree (screenshot pass, item 4): no email means no account to reset yet.
    expect(screen.getByText("No email after a few minutes, and nothing in spam? Create an account with the same address and we'll email you a link to set a password.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/joins your existing account/);
    expect(document.body.textContent).not.toMatch(/1 hour|an hour/);
    expect(calls).toEqual([{ url: "/api/auth/password/forgot", body: { email: "asha@gmail.com" } }]);
  });

  // Screenshot pass, item 2: "Use a different email" used a class with no CSS and rendered as plain text.
  it("offers a real secondary button to use a different email, which goes back to the form", async () => {
    stubFetch({ status: 200, body: { ok: true } });
    requestReset("asha@gmail.com");
    const again = await screen.findByRole("button", { name: "Use a different email" });
    expect(again.className).not.toContain("brand-button-secondary");
    expect(again.className.split(" ")).toEqual(expect.arrayContaining(["brand-button", "border-2", "bg-background"]));
    fireEvent.click(again);
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeTruthy();
  });

  it("too many requests says how long to wait", async () => {
    stubFetch({ status: 429, body: { ok: false, code: "rate_limited", message: PASSWORD_AUTH_COPY.rate_limited, retryAfterSeconds: 1800 } });
    requestReset("asha@gmail.com");
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Try again in 30 minutes.");
    expect(screen.queryByText("Check your email.")).toBeNull();
  });

  it("an unexpected answer is an error, not a false confirmation", async () => {
    stubFetch({ status: 200, body: { ok: true, debugToken: "leak" } });
    requestReset("asha@gmail.com");
    expect((await screen.findByRole("alert")).textContent).toBe(PASSWORD_AUTH_COPY.temporarily_unavailable);
    expect(screen.queryByText("Check your email.")).toBeNull();
  });

  it("is titled for setting a first password as well as resetting one (D-078 ruling 8)", () => {
    render(<ForgotPassword />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Set or reset your password");
  });

  it("points referrers to the work-email sign-in", () => {
    render(<ForgotPassword />);
    const link = screen.getByRole("link", { name: /Sign in with your work email/ });
    expect(link.getAttribute("href")).toBe("/sign-in?intent=referrer");
    // Screenshot pass, item 3: an inline link inside the sentence, not a 44px flex box on its own line.
    expect(link.className).not.toContain("text-link");
    expect(link.parentElement?.textContent).toBe("Give referrals? Referrers have no password: Sign in with your work email.");
  });
});
