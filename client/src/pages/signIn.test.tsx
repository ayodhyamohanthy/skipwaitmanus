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
    expect(screen.getByText("Welcome to SkipWait.")).toBeTruthy();
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
    expect(screen.queryByRole("button", { name: /Create a free account/ })).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Find a referral/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create a free account/ }));
    expect(assign).toHaveBeenLastCalledWith("/api/auth/workos/sign-up?returnTo=%2Fexplore");
    expect(assign).toHaveBeenCalledTimes(1);
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

  it("continue with email collects only the address and hands off to the hosted WorkOS screen", () => {
    const assign = stubAssign();
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect(assign).not.toHaveBeenCalled();
    const email = screen.getByLabelText("Email address");
    // The password is typed on WorkOS's own screen, never on this page.
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
    expect(screen.getByText(/finish signing in on the next, secure screen/)).toBeTruthy();
    // No password credential exists (WorkOS AuthKit owns sign-in), so no reset path is offered.
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();
    fireEvent.change(email, { target: { value: " Asha@Wipro.com " } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&login_hint=asha%40wipro.com");
    fireEvent.click(screen.getByRole("button", { name: "Use another method" }));
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("ships no design-preview scaffolding", () => {
    render(<SignIn />);
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
  });
});
