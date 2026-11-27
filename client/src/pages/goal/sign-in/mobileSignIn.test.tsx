// @vitest-environment jsdom
// D-414: the compact presentation keeps the existing authentication contracts.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { emailSignInLink } from "@shared/emailSignIn";
import GoalSignInPage from "./GoalSignInPage";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/goal/GoalPasskeySignIn", () => ({
  usePasskeyAvailability: () => ({ enabled: false }),
  PasskeyAutofill: () => null,
  PasskeySignInButton: () => null,
  PasskeyEnrollmentOffer: () => null,
}));

const originalLocation = window.location;
let assign: Mock;
function open(search = "", width = 390, hash = "") {
  window.history.replaceState({}, "", `/sign-in${search}${hash}`);
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, pathname: "/sign-in", search, hash, origin: "http://localhost", assign } });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: width < 641, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}
function requests() {
  return vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/send")) return new Response(JSON.stringify({ sent: true }), { status: 200 });
    if (url.endsWith("/verify")) return new Response(JSON.stringify({ signedIn: true }), { status: 200 });
    throw new Error(`Unexpected request: ${url}`);
  }));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("D-414 mobile sign-in", () => {
  it("asks for the role first on an unqualified entry, then opens the chosen method", () => {
    open();
    render(<GoalSignInPage mobileSignInEnabled />);
    expect(screen.getByRole("heading", { level: 1, name: "What brings you here?" })).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /I want a referral/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to get referred." })).toBeTruthy();
    expect(screen.getByLabelText("Email address")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "I am here to" })).toBeNull();
  });

  it("carries the selected role and keeps referrer methods work-email-only, including after Switch", async () => {
    open("?intent=referrer&returnTo=%2Fqueue");
    requests();
    render(<GoalSignInPage mobileSignInEnabled />);
    expect(screen.getByText(/You chose I can refer someone/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "I am here to" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Google|password|More ways/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "Person@employer.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my code" }));
    await screen.findByLabelText("Six-digit code");
    expect(fetch).toHaveBeenCalledWith("/api/auth/otp/send", expect.objectContaining({ body: JSON.stringify({ email: "person@employer.example" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    fireEvent.click(screen.getByRole("button", { name: /I want a referral/ }));
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByLabelText("Work email")).toBeNull();
  });

  it("discloses the remaining seeker methods and signs in with the existing password endpoint", async () => {
    open("?intent=seeker");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/password/sign-in") return new Response(JSON.stringify({ ok: true, step: "signed_in", redirectTo: "/explore" }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<GoalSignInPage mobileSignInEnabled />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Microsoft" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More ways to sign in" }));
    const sheet = screen.getByRole("dialog");
    for (const provider of ["Microsoft", "GitHub", "LinkedIn", "Slack"]) expect(within(sheet).getByRole("button", { name: `Continue with ${provider}` })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Use a password instead" }));
    fireEvent.change(within(sheet).getByLabelText("Email address"), { target: { value: "candidate@example.com" } });
    fireEvent.change(within(sheet).getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(fetch).toHaveBeenCalledWith("/api/auth/password/sign-in", expect.objectContaining({ body: JSON.stringify({ email: "candidate@example.com", password: "fictional-password", returnTo: "/explore" }) }));
  });

  it("keeps password sign-in compact when email links are disabled and discloses the remaining methods", async () => {
    open("?intent=seeker");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/password/sign-in") return new Response(JSON.stringify({ ok: true, step: "signed_in", redirectTo: "/explore" }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    }));
    const { container } = render(<GoalSignInPage mobileSignInEnabled emailLinkEnabled={false} />);
    const form = screen.getByTestId("seeker-sign-in");
    expect(within(form).getByLabelText("Email address")).toBeTruthy();
    expect(within(form).getByLabelText("Password")).toBeTruthy();
    expect(within(form).getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    expect(within(form).getByRole("button", { name: "Create a free account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Email me a sign-in link/ })).toBeNull();
    for (const provider of ["Microsoft", "GitHub", "LinkedIn", "Slack"]) expect(screen.queryByRole("button", { name: `Continue with ${provider}` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More ways to sign in" }));
    const sheet = screen.getByRole("dialog");
    for (const provider of ["Microsoft", "GitHub", "LinkedIn", "Slack"]) {
      const button = within(sheet).getByRole("button", { name: `Continue with ${provider}` });
      fireEvent.click(button);
      expect(assign).toHaveBeenLastCalledWith(expect.stringContaining(`provider=${provider.toLowerCase()}`));
    }
    expect(within(sheet).queryByLabelText("Email address")).toBeNull();
    expect(within(sheet).queryByLabelText("Password")).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /Email me a sign-in link|Use a password instead/ })).toBeNull();
    expect(document.querySelectorAll('input[type="email"]')).toHaveLength(1);
    expect(container.querySelector("form form")).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Back to password sign-in" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(within(form).getByLabelText("Email address"), { target: { value: "candidate@example.com" } });
    fireEvent.change(within(form).getByLabelText("Password"), { target: { value: "fictional-password" } });
    fireEvent.click(within(form).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenLastCalledWith("/explore"));
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/auth/password/sign-in", expect.objectContaining({ body: JSON.stringify({ email: "candidate@example.com", password: "fictional-password", returnTo: "/explore" }) }));
  });

  it("uses the same single-use email code path and removes alternatives during code entry", async () => {
    open("?intent=seeker");
    requests();
    render(<GoalSignInPage mobileSignInEnabled />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "Candidate@Example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await screen.findByLabelText("Six-digit code");
    expect(screen.queryByRole("button", { name: "More ways to sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/explore"));
    expect(fetch).toHaveBeenCalledWith("/api/auth/workos/email-code/verify", expect.objectContaining({ body: JSON.stringify({ email: "candidate@example.com", code: "123456" }) }));
  });

  it("does not interpose role selection or consume an emailed link on arrival", () => {
    const hash = new URL(emailSignInLink("http://localhost", { plane: "r", email: "person@employer.example", code: "123456" })).hash;
    open("", 390, hash);
    const fetcher = vi.fn();
    const replace = vi.spyOn(window.history, "replaceState");
    vi.stubGlobal("fetch", fetcher);
    render(<GoalSignInPage mobileSignInEnabled />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "I am here to" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith(expect.anything(), "", "/sign-in");
  });

  it.each([{ enabled: false, width: 390 }, { enabled: true, width: 1280 }])("preserves the incumbent surface with enabled=$enabled at $width", ({ enabled, width }) => {
    open("?intent=seeker", width);
    render(<GoalSignInPage mobileSignInEnabled={enabled} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to find or give a referral." })).toBeTruthy();
    expect(screen.getByRole("group", { name: "I am here to" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More ways to sign in" })).toBeNull();
  });
});
