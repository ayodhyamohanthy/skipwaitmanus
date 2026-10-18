// @vitest-environment jsdom
// D-049: seekers sign in on skipwait.me with social logins or email + password; the email code is not offered.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import { SeekerSignIn } from "./SeekerSignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

type Reply = { status: number; body: unknown } | Error | Promise<never>;
type Call = { url: string; body: unknown };
function stubFetch(replies: Reply[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    if (next instanceof Error) throw next;
    if (next instanceof Promise) return next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  }));
  return calls;
}
function stubAssign() {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  return assign;
}
function openEmailForm() {
  fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
}
function fillSignIn(email = " Asha@Gmail.com ", password = "  my pass 1 ") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("seekers sign in with email and password, never a sign-in code", () => {
  it("posts the email and the password verbatim, then goes where the server says", async () => {
    const assign = stubAssign();
    const calls = stubFetch([{ status: 200, body: { ok: true, step: "signed_in", redirectTo: "/plans" } }]);
    render(<SeekerSignIn returnTo="/plans" />);
    openEmailForm();
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("username");
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect(screen.getByText(/Signed in with a code before\? Create a password with the same email/)).toBeTruthy();
    fillSignIn();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/plans"));
    expect(calls).toEqual([{ url: "/api/auth/password/sign-in", body: { email: "asha@gmail.com", password: "  my pass 1 ", returnTo: "/plans" } }]);
    expect(calls.some(call => call.url.includes("/api/auth/workos/email-code/"))).toBe(false);
  });

  it("never follows a redirect that leaves the app", async () => {
    const assign = stubAssign();
    stubFetch([{ status: 200, body: { ok: true, step: "signed_in", redirectTo: "https://evil.example" } }]);
    render(<SeekerSignIn />);
    openEmailForm();
    fillSignIn();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(PASSWORD_AUTH_COPY.temporarily_unavailable);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("verification, create-account and error states are explicit", () => {
  it("the verify step takes WorkOS's six-digit code, with a resend cooldown", async () => {
    const assign = stubAssign();
    const calls = stubFetch([
      { status: 200, body: { ok: true, step: "verify_email" } },
      { status: 200, body: { ok: true, step: "verify_email" } },
      { status: 200, body: { ok: true, step: "signed_in", redirectTo: "/explore" } },
    ]);
    // Fake timeouts that still follow the real clock, so Testing Library's own waits keep working.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
    render(<SeekerSignIn />);
    openEmailForm();
    fillSignIn();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    const code = await screen.findByLabelText("Six-digit code") as HTMLInputElement;
    expect(document.activeElement).toBe(code);
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByText(/asha@gmail\.com/)).toBeTruthy();
    const resend = () => screen.getByRole("button", { name: /Send a new code/ }) as HTMLButtonElement;
    expect(resend().disabled).toBe(true);
    // The countdown starts in a passive effect; let it schedule its first tick before moving the clock.
    await waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    for (let second = 0; second < 31; second++) act(() => { vi.advanceTimersByTime(1000); });
    expect(resend().disabled).toBe(false);
    vi.useRealTimers();
    fireEvent.click(resend());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ url: "/api/auth/password/verify-email/resend", body: {} });
    await waitFor(() => expect(resend().disabled).toBe(true));
    fireEvent.change(code, { target: { value: "48a2913x" } });
    expect(code.value).toBe("482913");
    fireEvent.click(screen.getByRole("button", { name: /Verify and continue/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls[2]).toEqual({ url: "/api/auth/password/verify-email", body: { code: "482913" } });
  });

  it("create-account mode shows the rules, posts sign-up and explains an emailed reset link", async () => {
    const calls = stubFetch([{ status: 200, body: { ok: true, step: "verify_email" } }]);
    render(<SeekerSignIn returnTo="/ask" />);
    fireEvent.click(screen.getByRole("button", { name: "Create a free account" }));
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@gmail.com" } });
    fireEvent.change(password, { target: { value: "short" } });
    const submit = () => screen.getByRole("button", { name: /^Create account/ }) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    expect(screen.getByText("At least 10 characters")).toBeTruthy();
    expect(screen.getByText("A number or symbol")).toBeTruthy();
    fireEvent.change(password, { target: { value: "Longpassword1!" } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await screen.findByLabelText("Six-digit code");
    expect(calls).toEqual([{ url: "/api/auth/password/sign-up", body: { email: "new@gmail.com", password: "Longpassword1!", returnTo: "/ask" } }]);
    expect(screen.getByText(/If this email already had a SkipWait account, we sent a password reset link instead/)).toBeTruthy();
  });

  it.each([
    ["a wrong password", { status: 401, body: { ok: false, code: "invalid_credentials", message: PASSWORD_AUTH_COPY.invalid_credentials } }, PASSWORD_AUTH_COPY.invalid_credentials],
    ["too many attempts", { status: 429, body: { ok: false, code: "rate_limited", message: PASSWORD_AUTH_COPY.rate_limited, retryAfterSeconds: 900 } }, "Too many attempts. Try again in 15 minutes."],
    ["password sign-in switched off", { status: 503, body: { ok: false, code: "password_sign_in_unavailable", message: PASSWORD_AUTH_COPY.password_sign_in_unavailable } }, PASSWORD_AUTH_COPY.password_sign_in_unavailable],
    ["a referrer's work email", { status: 403, body: { ok: false, code: "use_work_email_code", message: PASSWORD_AUTH_COPY.use_work_email_code } }, PASSWORD_AUTH_COPY.use_work_email_code],
    ["a garbled answer", { status: 500, body: { html: true } }, PASSWORD_AUTH_COPY.temporarily_unavailable],
    ["a network failure", new TypeError("Failed to fetch"), "We couldn't reach SkipWait. Check your connection and try again."],
  ] as const)("%s shows plain words in an alert", async (_label, reply, message) => {
    stubAssign();
    stubFetch([reply instanceof Error ? reply : { status: reply.status, body: reply.body }]);
    render(<SeekerSignIn />);
    openEmailForm();
    fillSignIn();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("a weak password from WorkOS on create shows its message", async () => {
    stubFetch([{ status: 400, body: { ok: false, code: "weak_password", message: PASSWORD_AUTH_COPY.weak_password } }]);
    render(<SeekerSignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Create a free account" }));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "new@gmail.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create account/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(PASSWORD_AUTH_COPY.weak_password);
  });

  it("busy state disables the submit button while the request is in flight", async () => {
    stubFetch([new Promise<never>(() => {})]);
    render(<SeekerSignIn />);
    openEmailForm();
    fillSignIn();
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    const busy = await screen.findByRole("button", { name: /Signing in/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });
});
