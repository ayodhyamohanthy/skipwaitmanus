// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubAssign() {
  const assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  return assign;
}

describe("SignIn", () => {
  it("renders the kit split design with intent choice and WorkOS continuations", () => {
    const assign = stubAssign();
    render(<SignIn />);
    expect(screen.getByText(/One sign-in/)).toBeTruthy();
    expect(screen.getByText("Welcome to skipwait.me.")).toBeTruthy();
    expect(screen.getByText("YOUR DOOR STARTS HERE")).toBeTruthy();
    expect(screen.getByAltText(/open blue door/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    // FOUNDER-LOCKED login rule (Oct 16 2026): Give a referral = work-email OTP only, no personal or social options.
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Choose who you help/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with (Google|Microsoft|GitHub)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with email/ })).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps Terms and Privacy Policy reachable as plain-text links, underlined only on hover or focus", () => {
    render(<SignIn />);
    for (const [name, href] of [["Terms", "/terms"], ["Privacy Policy", "/privacy"]]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.className.split(" ")).not.toContain("underline");
      expect(link.className).toContain("hover:underline");
    }
  });

  it("job seeker signs in on skipwait.me: five socials go straight to the provider, email uses a code", () => {
    const assign = stubAssign();
    render(<SignIn />);
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=github");
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    for (const name of ["LinkedIn", "Slack", "Microsoft"]) expect(screen.getByRole("button", { name: new RegExp(`Continue with ${name}`) })).toBeTruthy();
  });

  it("the email field is reachable without a tap (D-095 item 2)", () => {
    render(<SignIn />);
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput).toBeTruthy();
    expect(screen.getByRole("button", { name: /send sign-in code/i })).toBeTruthy();
    const seekerForm = screen.getByTestId("seeker-sign-in");
    const focusable = seekerForm.querySelectorAll<HTMLElement>("input, button");
    expect(focusable[0]).toBe(emailInput);
    for (const name of ["Google", "GitHub", "Microsoft", "LinkedIn", "Slack"]) {
      expect(screen.getByRole("button", { name: new RegExp(`Continue with ${name}`) })).toBeTruthy();
    }
  });

  it("ships no design-preview scaffolding", () => {
    render(<SignIn />);
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
  });
});

describe("SignIn seeker returnTo (D-095)", () => {
  it("flag off: seekers always land on /explore even with a returnTo query", async () => {
    vi.resetModules();
    vi.doMock("@/lib/oneTap", () => ({ ONE_TAP_PAY_SIGNIN: false }));
    window.history.pushState({}, "", "/sign-in?returnTo=%2Fpremium%3Fquantity%3D7");
    const assign = stubAssign();
    const { default: Fresh } = await import("./SignIn");
    render(<Fresh />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(String(assign.mock.calls[0][0])).toContain(encodeURIComponent("/explore"));
    window.history.replaceState({}, "", "/");
    vi.doUnmock("@/lib/oneTap");
  });

  it("flag on: a same-origin returnTo is kept; an off-site one falls back to /explore", async () => {
    vi.resetModules();
    vi.doMock("@/lib/oneTap", () => ({ ONE_TAP_PAY_SIGNIN: true }));
    window.history.pushState({}, "", "/sign-in?returnTo=%2Fpremium%3Fquantity%3D7");
    let assign = stubAssign();
    let mod = await import("./SignIn");
    const first = render(<mod.default />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain("/premium?quantity=7");
    first.unmount();
    vi.resetModules();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/sign-in?returnTo=https%3A%2F%2Fevil.test%2Fx");
    assign = stubAssign();
    mod = await import("./SignIn");
    render(<mod.default />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain("returnTo=/explore");
    window.history.replaceState({}, "", "/");
    vi.doUnmock("@/lib/oneTap");
  });
});
