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
    for (const name of ["Microsoft", "LinkedIn", "Slack"]) expect(screen.queryByRole("button", { name: new RegExp(`Continue with ${name}`) })).toBeNull();
  });

  it("ships no design-preview scaffolding", () => {
    render(<SignIn />);
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
  });
});
