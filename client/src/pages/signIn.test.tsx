// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_AUTH_COPY, USE_PASSWORD_SIGN_IN_COPY } from "@shared/passwordAuth";
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

  it("job seeker signs in on skipwait.me: five socials go straight to the provider, email uses a password", () => {
    const assign = stubAssign();
    render(<SignIn />);
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Continue with GitHub/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=github");
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    for (const name of ["LinkedIn", "Slack", "Microsoft"]) expect(screen.getByRole("button", { name: new RegExp(`Continue with ${name}`) })).toBeTruthy();
  });

  // D-049 (owner, Oct 18 2026): the seeker email method is a password; the password field is for seekers only.
  it("the password field is for seekers only", () => {
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(document.querySelector("input[type=password]")).toBeTruthy();
    expect(screen.queryByLabelText("Six-digit code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
    expect(screen.getByLabelText("Company email")).toBeTruthy();
  });

  it("honours a validated seeker returnTo and keeps the referrer returnTo handling", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, search: "?returnTo=%2Fplans" });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(assign).toHaveBeenLastCalledWith("/api/auth/workos/sign-in?returnTo=%2Fplans&provider=google");
    cleanup();
    for (const unsafe of ["//evil.example", "https://evil.example", "/api/x", "/sign-in"]) {
      vi.stubGlobal("location", { ...window.location, assign, search: `?${new URLSearchParams({ returnTo: unsafe })}` });
      render(<SignIn />);
      fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
      expect(assign).toHaveBeenLastCalledWith("/api/auth/workos/sign-in?returnTo=%2Fexplore&provider=google");
      cleanup();
    }
    // The referrer branch still lands on its own safe path (work-email OTP only, no social).
    vi.stubGlobal("location", { ...window.location, assign, search: "?intent=referrer&returnTo=%2Freferrer-home" });
    render(<SignIn />);
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  // D-078 ruling 4: a social sign-in with a referrer's verified work email lands here instead of a session.
  it("says why when a social sign-in was refused for a verified work email, on the referrer side only", () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "?intent=referrer&reason=use_work_email_code" });
    render(<SignIn />);
    expect(screen.getByRole("status").textContent).toBe(PASSWORD_AUTH_COPY.use_work_email_code);
    expect(screen.getByLabelText("Company email")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    cleanup();
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "?reason=use_work_email_code" });
    render(<SignIn />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "?intent=referrer&reason=%3Cb%3Eanything%3C%2Fb%3E" });
    render(<SignIn />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  // Review F1: a password finished on WorkOS's hosted page is refused at the callback and sent here instead.
  it("tells a seeker refused at the callback to sign in with their password here", () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "?reason=use_password_sign_in" });
    render(<SignIn />);
    expect(screen.getByRole("status").textContent).toBe(USE_PASSWORD_SIGN_IN_COPY);
    expect(screen.getByRole("button", { name: /Continue with email/ })).toBeTruthy();
    cleanup();
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), search: "?intent=referrer&reason=use_password_sign_in" });
    render(<SignIn />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ships no design-preview scaffolding", () => {
    render(<SignIn />);
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
  });
});
