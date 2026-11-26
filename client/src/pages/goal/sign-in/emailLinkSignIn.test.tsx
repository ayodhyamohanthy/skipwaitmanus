// @vitest-environment jsdom
// D-406 (owner, Nov 25 2026): enter an email, get one email with a link and a code. These cases render the real
// goal /sign-in with the release switch on, preserving the existing password, social and passkey paths.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailSignInLink } from "@shared/emailSignIn";
import GoalSignInPage from "./GoalSignInPage";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
  useSearch: () => "",
}));
const passkeys = vi.hoisted(() => ({ enabled: false, autofill: vi.fn() }));
vi.mock("@/components/goal/GoalPasskeySignIn", () => ({
  usePasskeyAvailability: () => ({ enabled: passkeys.enabled }),
  PasskeyAutofill: ({ enabled, returnTo }: { enabled: boolean; returnTo: string }) => {
    if (enabled) passkeys.autofill(returnTo);
    return null;
  },
  PasskeySignInButton: () => null,
  PasskeyEnrollmentOffer: () => null,
}));

type Call = { url: string; body: unknown };
function stubFetch(reply: (url: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const next = reply(url);
    return { ok: next.status < 400, status: next.status, url: `http://localhost${url}`, headers: new Headers({ "content-type": "application/json" }), json: async () => next.body };
  }));
  return calls;
}

let assign: ReturnType<typeof vi.fn>;
function openAt(hash = "") {
  window.history.replaceState({}, "", `/sign-in${hash}`);
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, hash, pathname: "/sign-in", search: "", origin: "http://localhost" } });
}
const realLocation = window.location;
beforeEach(() => {
  passkeys.enabled = false;
  passkeys.autofill.mockClear();
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Object.defineProperty(window, "location", { configurable: true, value: realLocation }); });

describe("D-406 emailed link", () => {
  it("shows one Sign in button, clears the code from the address bar and posts nothing until pressed", async () => {
    const hash = new URL(emailSignInLink("https://skipwait.me", { email: "asha@gmail.com", code: "482913", plane: "s" })).hash;
    openAt(hash);
    const replace = vi.spyOn(window.history, "replaceState");
    const calls = stubFetch(() => ({ status: 200, body: { signedIn: true } }));
    render(<GoalSignInPage emailLinkEnabled />);
    expect(screen.getByTestId("email-link-confirm").textContent).toContain("asha@gmail.com");
    expect(replace).toHaveBeenCalledWith(expect.anything(), "", "/sign-in");
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls).toEqual([{ url: "/api/auth/workos/email-code/verify", body: { email: "asha@gmail.com", code: "482913" } }]);
  });

  it("finishes a referrer link on the work-email code endpoint and lands on referrer setup", async () => {
    openAt(new URL(emailSignInLink("https://skipwait.me", { email: "ref@acme.com", code: "654321", plane: "r" })).hash);
    const calls = stubFetch(() => ({ status: 200, body: { signedIn: true } }));
    render(<GoalSignInPage emailLinkEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-setup"));
    expect(calls[0].url).toBe("/api/auth/otp/verify");
  });

  it("an expired or used link says so and offers a new one", async () => {
    openAt(new URL(emailSignInLink("https://skipwait.me", { email: "asha@gmail.com", code: "482913", plane: "s" })).hash);
    stubFetch(() => ({ status: 400, body: { error: "That code could not be verified." } }));
    render(<GoalSignInPage emailLinkEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("expired or was already used");
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeTruthy();
  });

  it("ignores the fragment entirely while the switch is off", () => {
    openAt(new URL(emailSignInLink("https://skipwait.me", { email: "asha@gmail.com", code: "482913", plane: "s" })).hash);
    stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled={false} />);
    expect(screen.queryByTestId("email-link-confirm")).toBeNull();
    expect(screen.queryByRole("button", { name: "Email me a sign-in link" })).toBeNull();
  });
});

describe("D-406 seeker email sign-in", () => {
  it.each([true, false])("keeps native autofill and its email hint aligned with passkey availability %s", enabled => {
    passkeys.enabled = enabled;
    openAt();
    stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage />);
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeTruthy();
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe(enabled ? "username webauthn" : "email");
    if (enabled) expect(passkeys.autofill).toHaveBeenCalledWith("/explore");
    else expect(passkeys.autofill).not.toHaveBeenCalled();
  });

  it("defaults to the email step with one primary button, then signs in with the code", async () => {
    openAt();
    const calls = stubFetch(url => url.endsWith("/send") ? { status: 200, body: { sent: true } } : { status: 200, body: { signedIn: true } });
    const { container } = render(<GoalSignInPage emailLinkEnabled />);
    expect(container.querySelectorAll("[data-g-primary]").length).toBe(1);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: " Asha@Gmail.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    const codeInput = await screen.findByLabelText("Six-digit code");
    expect(screen.getByTestId("seeker-email-code").textContent).toContain("asha@gmail.com");
    fireEvent.change(codeInput, { target: { value: "48 29 13" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls).toEqual([
      { url: "/api/auth/workos/email-code/send", body: { email: "asha@gmail.com" } },
      { url: "/api/auth/workos/email-code/verify", body: { email: "asha@gmail.com", code: "482913" } },
    ]);
  });

  it("keeps the password form one tap away, and back again", () => {
    openAt();
    stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Use a password instead" }));
    expect(screen.getByLabelText("Password")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link instead" }));
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeTruthy();
  });

  it("points a referrer work email to the work-email code", async () => {
    openAt();
    stubFetch(() => ({ status: 403, body: { error: "Work emails at companies on skipwait.me sign in with a work-email code under Give a referral. Use a personal email here.", code: "use_work_email_code" } }));
    render(<GoalSignInPage emailLinkEnabled />);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "ref@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("link", { name: "Sign in with your work-email code" })).toBeTruthy();
  });

  it("referrer side keeps the work-email code only: no personal email, password, social or passkey control", () => {
    passkeys.enabled = true;
    openAt();
    stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled />);
    passkeys.autofill.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(passkeys.autofill).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Company email").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByTestId("referrer-work-email-otp")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Email me a sign-in link" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });
});
