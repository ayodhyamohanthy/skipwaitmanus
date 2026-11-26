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
function openAt(hash = "", search = "") {
  window.history.replaceState({}, "", `/sign-in${search}${hash}`);
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, hash, pathname: "/sign-in", search, origin: "http://localhost" } });
}
const realLocation = window.location;
beforeEach(() => {
  passkeys.enabled = false;
  passkeys.autofill.mockClear();
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(window, "location", { configurable: true, value: realLocation }); });

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
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-setup"));
    expect(calls[0].url).toBe("/api/auth/otp/verify");
  });

  it.each(["s", "r"] as const)("an expired or used link says so and offers a new one on plane %s", async plane => {
    openAt(new URL(emailSignInLink("https://skipwait.me", { email: plane === "r" ? "ref@acme.com" : "asha@gmail.com", code: "482913", plane })).hash);
    const calls = stubFetch(() => ({ status: 400, body: { error: "That code could not be verified." } }));
    render(<GoalSignInPage emailLinkEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain("expired or was already used");
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(screen.getByRole("button", { name: plane === "r" ? "Send sign-in code" : "Email me a sign-in link" })).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(plane === "r" ? "/api/auth/otp/verify" : "/api/auth/workos/email-code/verify");
  });

  it.each([
    { name: "valid seeker", hash: "#email-link&e=asha%40gmail.com&c=482913&p=s" },
    { name: "valid referrer", hash: "#email-link&e=ref%40acme.com&c=654321&p=r" },
    { name: "bare marker", hash: "#email-link" },
    { name: "invalid referrer", hash: "#email-link&c=invalid&p=r" },
  ])("ignores the $name fragment entirely while the switch is off", ({ hash }) => {
    openAt(hash);
    const replace = vi.spyOn(window.history, "replaceState");
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled={false} />);
    expect(screen.queryByTestId("email-link-confirm")).toBeNull();
    expect(screen.queryByRole("button", { name: "Email me a sign-in link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send a new link" })).toBeNull();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);
    expect(calls).toEqual([]);
  });

  it.each([
    { name: "bare marker", hash: "#email-link", referrer: false },
    { name: "missing email", hash: "#email-link&c=482913&p=s", referrer: false },
    { name: "invalid email", hash: "#email-link&e=invalid&c=482913&p=s", referrer: false },
    { name: "missing code", hash: "#email-link&e=asha%40gmail.com&p=s", referrer: false },
    { name: "short code", hash: "#email-link&e=asha%40gmail.com&c=12&p=s", referrer: false },
    { name: "nonnumeric code", hash: "#email-link&e=asha%40gmail.com&c=abcdef&p=s", referrer: false },
    { name: "missing plane", hash: "#email-link&e=asha%40gmail.com&c=482913", referrer: false },
    { name: "invalid plane", hash: "#email-link&e=asha%40gmail.com&c=482913&p=other", referrer: false },
    { name: "referrer missing email", hash: "#email-link&c=654321&p=r", referrer: true },
    { name: "referrer invalid email", hash: "#email-link&e=invalid&c=654321&p=r", referrer: true },
    { name: "referrer missing code", hash: "#email-link&e=ref%40acme.com&p=r", referrer: true },
    { name: "referrer invalid code", hash: "#email-link&e=ref%40acme.com&c=invalid&p=r", referrer: true },
  ])("clears an invalid marked link with $name and restarts without a request", ({ hash, referrer }) => {
    const search = "?returnTo=%2Finbox&source=email";
    openAt(hash, search);
    const replace = vi.spyOn(window.history, "replaceState");
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    const { container } = render(<GoalSignInPage emailLinkEnabled />);
    expect(screen.getByRole("alert").textContent).toContain("This sign-in link is invalid.");
    expect(screen.getAllByRole("button", { name: "Send a new link" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Sign in$/ })).toBeNull();
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: referrer ? /Give a referral/ : /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(replace).toHaveBeenCalledExactlyOnceWith(expect.anything(), "", `/sign-in${search}`);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(screen.queryByTestId("email-link-confirm")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: referrer ? "Send sign-in code" : "Email me a sign-in link" })).toBeTruthy();
    if (referrer) {
      expect(screen.getByLabelText("Company email")).toBeTruthy();
      expect(screen.queryByLabelText("Email address")).toBeNull();
      expect(screen.queryByLabelText("Password")).toBeNull();
      expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Use a password instead" })).toBeNull();
      expect(passkeys.autofill).not.toHaveBeenCalled();
    }
    expect(replace).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each([
    { name: "bare marker", hash: "#email-link" },
    { name: "missing plane", hash: "#email-link&e=ref%40acme.com&c=654321" },
    { name: "unknown plane", hash: "#email-link&e=ref%40acme.com&c=654321&p=other" },
  ])("preserves the referrer query intent when restarting an invalid $name link", ({ hash }) => {
    passkeys.enabled = true;
    openAt(hash, "?intent=referrer");
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled />);
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("This sign-in link is invalid.");
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Send a new link" }));
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with|passkey|saved device/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use a password instead" })).toBeNull();
    expect(passkeys.autofill).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it.each(["s", "r"] as const)("preserves the path and query when clearing a valid plane %s link", plane => {
    const search = "?returnTo=%2Finbox&source=email";
    openAt(new URL(emailSignInLink("https://skipwait.me", { email: plane === "r" ? "ref@acme.com" : "asha@gmail.com", code: "482913", plane })).hash, search);
    const replace = vi.spyOn(window.history, "replaceState");
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled />);
    expect(screen.getByRole("button", { name: /^Sign in$/ })).toBeTruthy();
    expect(replace).toHaveBeenCalledExactlyOnceWith(expect.anything(), "", `/sign-in${search}`);
    expect(calls).toEqual([]);
  });

  it.each([
    { name: "absent", hash: "" },
    { name: "ordinary anchor", hash: "#section" },
    { name: "marker prefix", hash: "#email-linking&e=asha%40gmail.com&c=482913&p=s" },
    { name: "wrong marker separator", hash: "#email-link?e=asha%40gmail.com&c=482913&p=s" },
    { name: "marker after another anchor", hash: "#section&email-link&e=asha%40gmail.com&c=482913&p=s" },
  ])("leaves an $name fragment unchanged", ({ hash }) => {
    openAt(hash);
    const replace = vi.spyOn(window.history, "replaceState");
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    render(<GoalSignInPage emailLinkEnabled />);
    expect(screen.queryByTestId("email-link-confirm")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);
    expect(calls).toEqual([]);
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
