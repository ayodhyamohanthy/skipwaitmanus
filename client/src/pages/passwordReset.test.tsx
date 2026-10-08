// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RESET_PATHS } from "@shared/passwordReset";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/lib/sentry", () => ({ captureClientError: vi.fn(), scrubSentryUrl: (url: string) => url }));

type Reply = { status: number; body: unknown } | "offline";
const calls: Array<{ path: string; body: Record<string, string> }> = [];
let replies: Record<string, Reply[]> = {};

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    calls.push({ path, body: JSON.parse(String(init.body)) as Record<string, string> });
    const reply = replies[path]?.shift();
    if (!reply || reply === "offline") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  }));
}

function renderPage(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}

beforeEach(() => { calls.length = 0; replies = {}; stubFetch(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ForgotPassword", () => {
  it("sends a reset link and shows the neutral, non-enumerating confirmation", async () => {
    replies[PASSWORD_RESET_PATHS.send] = [{ status: 202, body: { status: "sent" } }];
    renderPage(<ForgotPassword />);
    const submit = screen.getByRole("button", { name: "Send reset link" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@wipro.com" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);
    await screen.findByText("Check your email.");
    expect(calls).toEqual([{ path: PASSWORD_RESET_PATHS.send, body: { email: "asha@wipro.com" } }]);
    expect(screen.getByText("asha@wipro.com")).toBeTruthy();
    expect(screen.getByText(/If an account exists for/)).toBeTruthy();
    expect(screen.queryByText(/design preview|Preview the reset screen/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(await screen.findByRole("heading", { name: "Forgot your password?" })).toBeTruthy();
  });

  it("shows rate-limit and network failures without claiming an email was sent", async () => {
    replies[PASSWORD_RESET_PATHS.send] = [{ status: 429, body: { status: "rate_limited", retryAfterSeconds: 120 } }, "offline"];
    renderPage(<ForgotPassword />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "asha@wipro.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many reset requests. Try again in 2 minutes.");
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't reach SkipWait/));
    expect(screen.queryByText("Check your email.")).toBeNull();
  });
});

describe("ResetPassword", () => {
  const TOKEN = "aaaa.bbbb.cccc-signed-link-token";

  it("checks the emailed link, strips it from the address bar and updates the password", async () => {
    window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
    replies[PASSWORD_RESET_PATHS.status] = [{ status: 200, body: { status: "valid" } }];
    replies[PASSWORD_RESET_PATHS.confirm] = [{ status: 200, body: { status: "updated", otherSessionsSignedOut: true } }];
    renderPage(<ResetPassword />);
    expect(window.location.search).toBe("");
    expect(screen.getByText("Checking your reset link…")).toBeTruthy();
    await screen.findByRole("button", { name: "Update password" });
    expect(calls[0]).toEqual({ path: PASSWORD_RESET_PATHS.status, body: { token: TOKEN } });
    const submit = screen.getByRole("button", { name: "Update password" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-42" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new-password-42" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
    fireEvent.click(submit);
    await screen.findByText("Password updated.");
    expect(calls[1]).toEqual({ path: PASSWORD_RESET_PATHS.confirm, body: { token: TOKEN, password: "new-password-42" } });
    expect(screen.getByText(/Every device was signed out for safety/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("does not claim other devices were signed out when the server could not confirm it", async () => {
    window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
    replies[PASSWORD_RESET_PATHS.status] = [{ status: 200, body: { status: "valid" } }];
    replies[PASSWORD_RESET_PATHS.confirm] = [{ status: 422, body: { status: "password_rejected" } }, { status: 200, body: { status: "updated", otherSessionsSignedOut: false } }];
    renderPage(<ResetPassword />);
    await screen.findByRole("button", { name: "Update password" });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-42" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new-password-42" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/can’t be used/);
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByText("Password updated.");
    expect(screen.queryByText(/signed out/)).toBeNull();
  });

  it("shows the expired state from the server and offers a new link", async () => {
    window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
    replies[PASSWORD_RESET_PATHS.status] = [{ status: 410, body: { status: "expired" } }];
    renderPage(<ResetPassword />);
    await screen.findByText("This link has expired.");
    expect(screen.getByText("Reset links work for 1 hour, once. Request a new one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send a new link" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.queryByText(/Preview state|Valid link|Expired link/)).toBeNull();
  });

  it("treats a missing link as invalid without calling the server", () => {
    window.history.replaceState(null, "", "/reset-password");
    renderPage(<ResetPassword />);
    expect(screen.getByText("This link doesn’t work.")).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it("offers a retry when the link check cannot reach the server", async () => {
    window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
    replies[PASSWORD_RESET_PATHS.status] = ["offline", { status: 200, body: { status: "valid" } }];
    renderPage(<ResetPassword />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't reach SkipWait/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Update password" });
  });
});
