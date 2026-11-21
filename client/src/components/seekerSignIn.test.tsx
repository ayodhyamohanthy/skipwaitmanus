// @vitest-environment jsdom
// D-049/D-078: the released Goal form signs seekers in with passwords and signs them up by email link.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_AUTH_COPY } from "@shared/passwordAuth";
import { SeekerSignIn } from "./SeekerSignIn";

vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(), startRegistration: vi.fn(),
  browserSupportsWebAuthn: () => true, browserSupportsWebAuthnAutofill: async () => false,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

type Reply = { status: number; body: object } | "network" | "pending";
function setup(replies: Reply[] = [], enabled = false) {
  const calls: Array<{ url: string; body: string }> = [];
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/passkey/availability")) return { ok: true, json: async () => ({ enabled }) };
    calls.push({ url, body: String(init?.body ?? "") });
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request ${url}`);
    if (reply === "network") throw new TypeError("Failed to fetch");
    if (reply === "pending") return new Promise<Response>(() => {});
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  }));
  return { calls, assign };
}
function fill(email = " Asha@Example.com ", password = "  my pass 1 ") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/sign-in"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("seeker passwords in the Goal flow", () => {
  it("create-account asks only for email and posts only email before the neutral link step", async () => {
    const { calls, assign } = setup([{ status: 200, body: { ok: true, step: "check_email" } }]);
    const { container } = render(<SeekerSignIn returnTo="/ask" goal />);
    fireEvent.click(screen.getByRole("button", { name: "Create a free account" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(screen.getByText(/We'll email you a link to set your password/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " New@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const step = await screen.findByTestId("seeker-check-email");
    expect(step.textContent).toContain("Check your email");
    expect(step.textContent).toContain("new@example.com");
    expect(step.textContent).toMatch(/same account/);
    expect(calls).toEqual([{ url: "/api/auth/password/sign-up", body: JSON.stringify({ email: "new@example.com" }) }]);
    expect(assign).not.toHaveBeenCalled();
    expect(container.querySelector("[autocomplete=one-time-code]")).toBeNull();
    expect(screen.getByRole("link", { name: "sign in with your work email" }).getAttribute("href")).toContain("intent=referrer");
  });

  it("keeps five socials and an email-first password form, posts the password verbatim, and remembers success", async () => {
    const { calls, assign } = setup([{ status: 200, body: { ok: true, step: "signed_in", redirectTo: "/plans" } }]);
    const { container } = render(<SeekerSignIn returnTo="/plans" />);
    expect(screen.getByTestId("seeker-sign-in").querySelector("input, button")).toBe(screen.getByLabelText("Email address"));
    for (const provider of ["Google", "Microsoft", "GitHub", "LinkedIn", "Slack"]) expect(screen.getByRole("button", { name: `Continue with ${provider}` })).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByText("Signed in with a code before? Use Forgot password to set one. It's the same account.")).toBeTruthy();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/plans"));
    expect(calls).toEqual([{ url: "/api/auth/password/sign-in", body: JSON.stringify({ email: "asha@example.com", password: "  my pass 1 ", returnTo: "/plans" }) }]);
    expect(localStorage.getItem("skipwait:signin-email:seeker")).toBe("asha@example.com");
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });

  it("a sign-in requiring inbox proof shows the neutral link state without a code or remembered identity", async () => {
    const { calls, assign } = setup([{ status: 200, body: { ok: true, step: "check_email" } }]);
    render(<SeekerSignIn />); fill(); submit();
    expect((await screen.findByTestId("seeker-check-email")).textContent).toContain("link");
    expect(screen.queryByLabelText(/code/i)).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(localStorage.getItem("skipwait:signin-email:seeker")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["invalid_credentials", 401, PASSWORD_AUTH_COPY.invalid_credentials],
    ["account_inactive", 403, PASSWORD_AUTH_COPY.account_inactive],
    ["account_review", 409, PASSWORD_AUTH_COPY.account_review],
    ["password_sign_in_unavailable", 503, PASSWORD_AUTH_COPY.password_sign_in_unavailable],
    ["use_another_method", 403, PASSWORD_AUTH_COPY.use_another_method],
    ["use_work_email_code", 403, PASSWORD_AUTH_COPY.use_work_email_code],
  ] as const)("%s gives the real refusal and no navigation or remembered identity", async (code, status, message) => {
    const { assign } = setup([{ status, body: { ok: false, code, message } }]);
    render(<SeekerSignIn />); fill(); submit();
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(assign).not.toHaveBeenCalled();
    expect(localStorage.getItem("skipwait:signin-email:seeker")).toBeNull();
    expect(screen.getByLabelText("Email address").getAttribute("value")).toBe("Asha@Example.com");
    if (code === "use_work_email_code") expect(screen.getByRole("link", { name: "Sign in with your work-email code" }).getAttribute("href")).toContain("intent=referrer");
  });

  it("rate limits name the wait plus recovery, and a later network failure keeps retry available", async () => {
    const { assign } = setup([
      { status: 429, body: { ok: false, code: "rate_limited", message: PASSWORD_AUTH_COPY.rate_limited, retryAfterSeconds: 900 } }, "network",
    ]);
    render(<SeekerSignIn />); fill(); submit();
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Try again in 15 minutes. You can also use Forgot password, or continue with Google.");
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("We couldn't reach skipwait.me. Check your connection and try again."));
    expect(screen.getByRole("button", { name: "Sign in", exact: true }).getAttribute("aria-busy")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "/sign-in", "/forgot-password", "/reset-password"])('refuses unsafe success redirect "%s"', async redirectTo => {
    const { assign } = setup([{ status: 200, body: { ok: true, step: "signed_in", redirectTo } }]);
    render(<SeekerSignIn />); fill(); submit();
    expect((await screen.findByRole("alert")).textContent).toBe(PASSWORD_AUTH_COPY.temporarily_unavailable);
    expect(assign).not.toHaveBeenCalled();
  });

  it("preserves the exact saved-passkey management return", async () => {
    const { calls, assign } = setup([{ status: 200, body: { ok: true, step: "signed_in", redirectTo: "/sign-in?passkeys=manage" } }]);
    render(<SeekerSignIn returnTo="/sign-in?passkeys=manage" />); fill(); submit();
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/sign-in?passkeys=manage"));
    expect(JSON.parse(calls[0].body).returnTo).toBe("/sign-in?passkeys=manage");
  });

  it("busy submit is inert and cannot be duplicated by Enter or a mode switch", async () => {
    const { calls } = setup(["pending"]);
    render(<SeekerSignIn />); fill(); submit();
    const button = await screen.findByRole("button", { name: "Signing in…" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.submit(screen.getByTestId("seeker-sign-in"));
    fireEvent.click(screen.getByRole("button", { name: "Create a free account" }));
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("offers passkey enrollment once after a successful password sign-in", async () => {
    const { assign } = setup([{ status: 200, body: { ok: true, step: "signed_in", redirectTo: "/explore" } }], true);
    vi.stubGlobal("PublicKeyCredential", { isUserVerifyingPlatformAuthenticatorAvailable: async () => true });
    render(<SeekerSignIn />);
    expect(await screen.findByRole("button", { name: "Use a saved passkey" })).toBeTruthy();
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("username webauthn");
    fill(); submit();
    expect(await screen.findByText("Save this device for faster sign-in?")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(localStorage.getItem("skipwait_passkey_dismissed_asha@example.com")).toBe("true");
    expect(assign).toHaveBeenCalledWith("/explore");
  });
});
