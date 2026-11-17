// @vitest-environment jsdom
// D-048-p3-signin: the goal /sign-in, /forgot-password, /reset-password and
// /reviewer-sign-in (packet docs/plans/D-048-auth.md sections 4, 6, 7 and the
// November 11 correction). Every case renders the real page module through its
// goalSurfaceOn("sign-in") switch, so the path under test is the one the
// switch selects. The login rule (D-030 as amended by D-049/D-057) is
// re-asserted on the goal path: seekers keep the five social providers plus
// the six-digit email code, referrers get the work-email code only.
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { SEEKER_SOCIAL, seekerSocialUrl } from "@/components/SeekerSignIn";
import { assertGoalPage } from "@/test/goalPageContract";
import SignIn from "./SignIn";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import ReviewerSignIn from "./ReviewerSignIn";
import { GOAL_PAGE as SIGN_IN_PAGE } from "./goal/sign-in/GoalSignInPage";
import { GOAL_PAGE as FORGOT_PAGE } from "./goal/sign-in/GoalForgotPassword";
import { GOAL_PAGE as RESET_PAGE } from "./goal/sign-in/GoalResetPassword";
import { GOAL_PAGE as REVIEWER_PAGE } from "./goal/sign-in/GoalReviewerSignIn";
import { GOAL_SEEKER_SOCIAL, goalSeekerSocialUrl } from "./goal/sign-in/seekerSocial";

const surfaces = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on && id === "sign-in" }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
}));

type Reply = { status: number; body: unknown } | "network";
type Call = { url: string; method: string; body: unknown };

/** Routes each request to a scripted reply; anything unscripted fails the test loudly. */
function stubFetch(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]));
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const key = Array.from(queues.keys()).find(route => url.startsWith(route));
    if (!key) throw new Error(`unscripted request ${method} ${url}`);
    const queue = queues.get(key)!;
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next === "network") throw new TypeError("Failed to fetch");
    return { ok: next.status < 400, status: next.status, url: `http://localhost${url}`, headers: new Headers({ "content-type": "application/json" }), json: async () => next.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function stubLocation(search = "") {
  const assign = vi.fn();
  window.history.replaceState({}, "", `/sign-in${search}`);
  vi.stubGlobal("location", { ...window.location, assign, search });
  return assign;
}

const read = (path: string) => readFileSync(join(__dirname, path), "utf8");
const primary = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-g-primary]");

beforeEach(() => { surfaces.on = true; localStorage.clear(); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  document.head.querySelectorAll('meta[name="robots"]').forEach(node => node.remove());
});

describe("goal /sign-in: the switch", () => {
  it("renders the goal page under goalSurfaceOn('sign-in') and the kit page with it off", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    stubLocation();
    const goal = render(<SignIn />);
    expect(goal.container.querySelector('[data-goal-page="sign-in"]')).not.toBeNull();
    expect(screen.queryByText("Welcome to skipwait.me.")).toBeNull();
    goal.unmount();
    surfaces.on = false;
    render(<SignIn />);
    expect(screen.getByText("Welcome to skipwait.me.")).toBeTruthy();
    expect(document.querySelector('[data-goal-page="sign-in"]')).toBeNull();
  });

  it("keeps passkey management (?passkeys=manage) on the device sign-in page that owns it", () => {
    stubFetch({ "/api/auth/passkey": { status: 200, body: { enabled: false } } });
    stubLocation("?passkeys=manage");
    render(<SignIn />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Manage your saved passkeys.");
  });
});

describe("goal /sign-in: job seeker (login rule, D-030/D-049, D-095)", () => {
  it("opens with the goal line and one next step whose only commit sends the email code", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    stubLocation();
    const { container } = render(<SignIn />);
    assertGoalPage(container, SIGN_IN_PAGE);
    expect(container.querySelector('[data-skipwait-screen="sign-in"]')).not.toBeNull();
    expect(primary(container)?.textContent).toBe("Send sign-in code");
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("puts the email field first (no tap needed) and offers all five social providers straight to WorkOS", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    const assign = stubLocation();
    render(<SignIn />);
    const form = screen.getByTestId("seeker-sign-in");
    expect(form.querySelectorAll<HTMLElement>("input, button")[0]).toBe(screen.getByLabelText("Email address"));
    for (const provider of ["Google", "Microsoft", "GitHub", "LinkedIn", "Slack"]) expect(screen.getByRole("button", { name: `Continue with ${provider}` })).toBeTruthy();
    expect(document.querySelector("input[type=password]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=github");
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("authkit.app"));
  });

  it("keeps the provider list and URLs identical to the shared seeker core", () => {
    expect(GOAL_SEEKER_SOCIAL.map(item => [item.id, item.label])).toEqual(SEEKER_SOCIAL.map(item => [item.id, item.label]));
    for (const returnTo of ["/explore", "/premium?quantity=7", "/admin"]) {
      for (const item of SEEKER_SOCIAL) expect(goalSeekerSocialUrl(item.id, returnTo)).toBe(seekerSocialUrl(item.id, returnTo));
    }
  });

  it("'Continue with email' moves straight to the email field", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    stubLocation();
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
  });

  it("sends and verifies the six-digit code against the email-code routes, then lands on /explore", async () => {
    const { calls } = stubFetch({
      "/api/auth/passkey/availability": { status: 200, body: { enabled: false } },
      "/api/auth/workos/email-code/send": { status: 200, body: { sent: true } },
      "/api/auth/workos/email-code/verify": { status: 200, body: { signedIn: true } },
    });
    const assign = stubLocation();
    const { container } = render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " Asha@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    const code = await screen.findByLabelText("Six-digit code");
    assertGoalPage(container, SIGN_IN_PAGE);
    expect(primary(container)?.textContent).toBe("Sign in");
    fireEvent.change(code, { target: { value: "12a3456" } });
    fireEvent.click(screen.getByRole("button", { name: /^Sign in/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(calls.filter(call => call.method === "POST")).toEqual([
      { url: "/api/auth/workos/email-code/send", method: "POST", body: { email: "asha@example.com" } },
      { url: "/api/auth/workos/email-code/verify", method: "POST", body: { email: "asha@example.com", code: "123456" } },
    ]);
  });

  it("shows the server's own words on a refused send, plain words on a network failure, and keeps the typed email", async () => {
    stubFetch({
      "/api/auth/passkey/availability": { status: 200, body: { enabled: false } },
      "/api/auth/workos/email-code/send": [{ status: 429, body: { error: "Too many codes. Try again in a few minutes." } }, "network"],
    });
    stubLocation();
    const { container } = render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many codes. Try again in a few minutes.");
    assertGoalPage(container, SIGN_IN_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("We could not reach SkipWait. Check your connection and try again."));
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("asha@example.com");
  });

  it("honours a same-origin returnTo only where the kit page does (D-095: /admin), never an off-site one", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    let assign = stubLocation("?returnTo=%2Fadmin%2Fpayments");
    const first = render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(assign).toHaveBeenCalledWith(seekerSocialUrl("google", "/admin/payments"));
    first.unmount();
    vi.unstubAllGlobals();
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    assign = stubLocation("?returnTo=%2Fpremium");
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(assign).toHaveBeenCalledWith(seekerSocialUrl("google", "/explore"));
  });

  it("offers the saved-passkey sign-in and its management link when the server enables passkeys (DEVICE-SIGNIN-passkeys)", async () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: true } } });
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() { /* jsdom stand-in */ });
    stubLocation();
    const { container } = render(<SignIn />);
    expect(await screen.findByRole("button", { name: "Use a saved passkey" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage saved passkeys" }).getAttribute("href")).toBe("/sign-in?passkeys=manage");
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("username webauthn");
    assertGoalPage(container, SIGN_IN_PAGE);
  });

  it("shows no passkey control while the server keeps passkeys off", async () => {
    const { calls } = stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() { /* jsdom stand-in */ });
    stubLocation();
    render(<SignIn />);
    await waitFor(() => expect(calls.some(call => call.url === "/api/auth/passkey/availability")).toBe(true));
    expect(screen.queryByRole("button", { name: "Use a saved passkey" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Manage saved passkeys" })).toBeNull();
  });

  it("carries the legal links, the money sentence and no design-preview scaffolding", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    stubLocation();
    render(<SignIn />);
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    expect(document.body.textContent).toContain(MONEY_SENTENCE_SHORT);
    expect(document.body.textContent).toContain("A referral never guarantees an interview.");
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /review account/i })).toBeNull();
  });
});

describe("goal /sign-in: referrer (work-email code only, D-030/D-057)", () => {
  it("?intent=referrer opens on Give a referral with the company email only: no personal email, social or passkey", async () => {
    const { calls } = stubFetch({});
    stubLocation("?intent=referrer&returnTo=%2Freferrer-home");
    const { container } = render(<SignIn />);
    assertGoalPage(container, SIGN_IN_PAGE);
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getByTestId("referrer-work-email-otp")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /passkey/i })).toBeNull();
    expect(screen.getByText(/The seeker's name and resume stay hidden until you accept/)).toBeTruthy();
    expect(screen.getByText(/open the resume only while your document access is active/)).toBeTruthy();
    expect(screen.getByText("Work email only. We never use personal email or social logins for referrers.")).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("switching to Give a referral removes every personal and social option", () => {
    stubFetch({ "/api/auth/passkey/availability": { status: 200, body: { enabled: false } } });
    stubLocation();
    const { container } = render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    assertGoalPage(container, SIGN_IN_PAGE);
  });

  it("sends and verifies through the work-domain OTP routes, never WorkOS, then lands on the safe return path", async () => {
    const { calls } = stubFetch({
      "/api/auth/otp/send": { status: 200, body: { sent: true } },
      "/api/auth/otp/verify": { status: 200, body: { signedIn: true } },
    });
    const assign = stubLocation("?intent=referrer&returnTo=%2Freferrer-home");
    const { container } = render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "asha@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    fireEvent.change(await screen.findByLabelText("Six-digit code"), { target: { value: "654321" } });
    assertGoalPage(container, SIGN_IN_PAGE);
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-home"));
    expect(calls.map(call => call.url)).toEqual(["/api/auth/otp/send", "/api/auth/otp/verify"]);
    expect(calls.some(call => call.url.includes("workos"))).toBe(false);
  });

  it("an off-site referrer returnTo falls back to /referrer-setup", async () => {
    stubFetch({ "/api/auth/otp/send": { status: 200, body: { sent: true } }, "/api/auth/otp/verify": { status: 200, body: { signedIn: true } } });
    const assign = stubLocation("?intent=referrer&returnTo=https%3A%2F%2Fevil.example%2Fx");
    render(<SignIn />);
    fireEvent.change(screen.getByLabelText("Company email"), { target: { value: "asha@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }));
    fireEvent.change(await screen.findByLabelText("Six-digit code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/referrer-setup"));
  });

  it("source scan: no referrer-side or password/reviewer goal file opens AuthKit (SignInButton / openSignIn / auth/workos)", () => {
    for (const file of ["goal/sign-in/GoalSignInPage.tsx", "goal/sign-in/GoalAuthFrame.tsx", "goal/referrer/GoalOtpSignIn.tsx", "goal/sign-in/GoalForgotPassword.tsx", "goal/sign-in/GoalResetPassword.tsx", "goal/sign-in/GoalReviewerSignIn.tsx"]) {
      expect(read(file), file).not.toMatch(/SignInButton|openSignIn|auth\/workos/);
    }
    // The seeker files may reach WorkOS (D-049), but never through the AuthKit widget.
    for (const file of ["goal/sign-in/GoalSeekerForm.tsx", "goal/sign-in/seekerSocial.ts"]) expect(read(file), file).not.toMatch(/SignInButton|openSignIn|authkit\.app/);
    expect(read("goal/sign-in/GoalSignInPage.tsx")).not.toMatch(/reviewer-sign-in/);
  });
});

describe("goal /forgot-password", () => {
  it("asks for the account email under the goal line, then gives the neutral answer with the 1-hour line", async () => {
    const { calls } = stubFetch({ "/api/auth/password/forgot": { status: 200, body: { ok: true } } });
    const { container } = render(<ForgotPassword />);
    assertGoalPage(container, FORGOT_PAGE);
    expect(container.querySelector('[data-skipwait-screen="forgot-password"]')).not.toBeNull();
    expect(primary(container)?.textContent).toBe("Send reset link");
    fireEvent.change(screen.getByLabelText("Account email"), { target: { value: " asha@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Check your email" })).toBeTruthy();
    expect(document.body.textContent).toContain("If an account exists for asha@example.com, a reset link is on its way. It works for 1 hour, once.");
    assertGoalPage(container, FORGOT_PAGE);
    expect(primary(container)?.closest("a")?.getAttribute("href")).toBe("/sign-in");
    expect(calls).toEqual([{ url: "/api/auth/password/forgot", method: "POST", body: { email: "asha@example.com" } }]);
    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect((screen.getByLabelText("Account email") as HTMLInputElement).value).toBe(" asha@example.com ");
  });

  it("shows a 429 in the server's words, a network failure in plain words, and keeps the typed email", async () => {
    stubFetch({ "/api/auth/password/forgot": [{ status: 429, body: { error: "Too many requests. Try again later." } }, "network"] });
    const { container } = render(<ForgotPassword />);
    fireEvent.change(screen.getByLabelText("Account email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many requests. Try again later.");
    assertGoalPage(container, FORGOT_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("We could not reach SkipWait. Check your connection and try again."));
    expect((screen.getByLabelText("Account email") as HTMLInputElement).value).toBe("asha@example.com");
    expect(screen.queryByRole("heading", { name: "Check your email" })).toBeNull();
  });

  it("holds the send while offline and says why, without a request", () => {
    const { calls } = stubFetch({});
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<ForgotPassword />);
    fireEvent.change(screen.getByLabelText("Account email"), { target: { value: "asha@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByText("You are offline. Your email is kept; send the link when you are back online.")).toBeTruthy();
    expect(calls).toEqual([]);
    online.mockRestore();
  });
});

describe("goal /reset-password", () => {
  it("a link with no token goes straight to the request-a-new-link panel, with no request", () => {
    const { calls } = stubFetch({});
    window.history.replaceState({}, "", "/reset-password");
    const { container } = render(<ResetPassword />);
    expect(screen.getByRole("heading", { level: 2, name: "This link has expired or was already used" })).toBeTruthy();
    assertGoalPage(container, RESET_PAGE);
    expect(primary(container)?.closest("a")?.getAttribute("href")).toBe("/forgot-password");
    expect(calls).toEqual([]);
  });

  it("checking state: shows a status line and no next step (exempt from the one-commit contract while the link is checked)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => { /* never settles */ })));
    window.history.replaceState({}, "", "/reset-password?token=tok-fixture-123");
    const { container } = render(<ResetPassword />);
    expect(screen.getByRole("status").textContent).toContain("Checking this link");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(primary(container)).toBeNull();
  });

  it("a valid link sets a new password with the server's three rules, and the done panel claims no session", async () => {
    const { calls } = stubFetch({
      "/api/auth/password/reset/verify": { status: 200, body: { valid: true } },
      "/api/auth/password/reset/confirm": { status: 200, body: { ok: true } },
    });
    window.history.replaceState({}, "", "/reset-password?token=tok-fixture-123");
    const { container } = render(<ResetPassword />);
    const password = await screen.findByLabelText("New password");
    assertGoalPage(container, RESET_PAGE);
    expect(primary(container)?.textContent).toBe("Update password");
    fireEvent.change(password, { target: { value: "longer-pass-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "longer-pass-1" } });
    for (const rule of ["At least 10 characters", "A number or symbol", "Passwords match"]) expect(screen.getByText(rule).closest("li")?.getAttribute("data-passed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Reset complete" })).toBeTruthy();
    assertGoalPage(container, RESET_PAGE);
    expect(document.body.textContent).not.toMatch(/you're signed in|you are signed in/i);
    expect(document.body.textContent).toContain("Other devices were signed out for safety.");
    expect(primary(container)?.closest("a")?.getAttribute("href")).toBe("/sign-in");
    expect(calls.map(call => call.url)).toEqual(["/api/auth/password/reset/verify?token=tok-fixture-123", "/api/auth/password/reset/confirm"]);
    expect(calls[1].body).toEqual({ token: "tok-fixture-123", password: "longer-pass-1", confirm: "longer-pass-1" });
    expect(document.body.innerHTML).not.toContain("tok-fixture-123");
  });

  it("keeps the commit inert until the three rules pass", async () => {
    const { calls } = stubFetch({ "/api/auth/password/reset/verify": { status: 200, body: { valid: true } } });
    window.history.replaceState({}, "", "/reset-password?token=tok-fixture-123");
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "short" } });
    const commit = screen.getByRole("button", { name: "Update password" });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(commit);
    expect(calls.map(call => call.url)).toEqual(["/api/auth/password/reset/verify?token=tok-fixture-123"]);
  });

  it("an invalid link, and a confirm refused as consumed, both land on the request-a-new-link panel in the server's words", async () => {
    stubFetch({ "/api/auth/password/reset/verify": { status: 200, body: { valid: false } } });
    window.history.replaceState({}, "", "/reset-password?token=tok-old");
    const first = render(<ResetPassword />);
    expect(await screen.findByRole("heading", { level: 2, name: "This link has expired or was already used" })).toBeTruthy();
    assertGoalPage(first.container, RESET_PAGE);
    first.unmount();
    vi.unstubAllGlobals();
    stubFetch({
      "/api/auth/password/reset/verify": { status: 200, body: { valid: true } },
      "/api/auth/password/reset/confirm": { status: 400, body: { error: "This link was already used. Request a new one.", code: "consumed" } },
    });
    window.history.replaceState({}, "", "/reset-password?token=tok-used");
    const { container } = render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "longer-pass-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "longer-pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("heading", { level: 2, name: "This link has expired or was already used" })).toBeTruthy();
    expect(document.body.textContent).toContain("This link was already used. Request a new one.");
    assertGoalPage(container, RESET_PAGE);
  });

  it("a 429 or network failure on confirm keeps the form with the reason and a retry", async () => {
    stubFetch({
      "/api/auth/password/reset/verify": { status: 200, body: { valid: true } },
      "/api/auth/password/reset/confirm": [{ status: 429, body: { error: "Too many requests. Try again later." } }, "network"],
    });
    window.history.replaceState({}, "", "/reset-password?token=tok-fixture-123");
    const { container } = render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "longer-pass-1" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "longer-pass-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many requests. Try again later.");
    assertGoalPage(container, RESET_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("We could not reach SkipWait. Check your connection and try again."));
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("a network failure while checking the link offers a retry instead of calling the link expired", async () => {
    stubFetch({ "/api/auth/password/reset/verify": ["network", { status: 200, body: { valid: true } }] });
    window.history.replaceState({}, "", "/reset-password?token=tok-fixture-123");
    const { container } = render(<ResetPassword />);
    expect(await screen.findByRole("heading", { level: 2, name: "We could not check this link" })).toBeTruthy();
    expect(screen.queryByText(/expired/)).toBeNull();
    assertGoalPage(container, RESET_PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("New password")).toBeTruthy();
  });
});

describe("goal /reviewer-sign-in (demo accounts, behind REVIEWER_LOGIN_ENABLED)", () => {
  it("is noindex, names the accounts as demo data, and its one commit posts the reviewer route", async () => {
    const { calls } = stubFetch({ "/api/auth/reviewer/sign-in": { status: 401, body: { error: "Email or password is not right." } } });
    const { container } = render(<ReviewerSignIn />);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,nofollow");
    expect(container.querySelector('[data-skipwait-screen="reviewer-sign-in"]')).not.toBeNull();
    assertGoalPage(container, REVIEWER_PAGE);
    expect(document.body.textContent).toContain("demo data only");
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Review account email"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not-the-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Email or password is not right.");
    assertGoalPage(container, REVIEWER_PAGE);
    expect(calls).toEqual([{ url: "/api/auth/reviewer/sign-in", method: "POST", body: { email: "demo@example.test", password: "not-the-one" } }]);
    expect(document.body.textContent).not.toContain("not-the-one");
  });

  it("with REVIEWER_LOGIN_ENABLED off the route answers 404, and the page says review sign-in is off instead of promising it works", async () => {
    stubFetch({ "/api/auth/reviewer/sign-in": { status: 404, body: { error: "Not found" } } });
    const assign = stubLocation();
    render(<ReviewerSignIn />);
    fireEvent.change(screen.getByLabelText("Review account email"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw-fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Review sign-in is switched off on this site.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the 15-minute wait in the server's words and follows only a same-origin landing", async () => {
    stubFetch({ "/api/auth/reviewer/sign-in": [{ status: 429, body: { error: "Too many tries. Wait 15 minutes." } }, { status: 200, body: { signedIn: true, redirectTo: "https://evil.example/x" } }, { status: 200, body: { signedIn: true, redirectTo: "/inbox" } }] });
    const assign = stubLocation();
    render(<ReviewerSignIn />);
    fireEvent.change(screen.getByLabelText("Review account email"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw-fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many tries. Wait 15 minutes.");
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/plans"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/inbox"));
  });

  it("a network failure says so in plain words", async () => {
    stubFetch({ "/api/auth/reviewer/sign-in": "network" });
    render(<ReviewerSignIn />);
    fireEvent.change(screen.getByLabelText("Review account email"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw-fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to review" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We could not reach SkipWait. Check your connection and try again.");
  });
});
