// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignIn from "./SignIn";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/sign-in"],
}));
vi.mock("../const", () => ({ startLogin: vi.fn() }));
import { startLogin } from "../const";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.mocked(startLogin).mockClear(); });

describe("SignIn", () => {
  it("renders the kit split design with intent choice and WorkOS continuations", () => {
    render(<SignIn />);
    expect(screen.getByText(/One sign-in/)).toBeTruthy();
    expect(screen.getByText("Welcome to SkipWait.")).toBeTruthy();
    expect(screen.getByText("YOUR DOOR STARTS HERE")).toBeTruthy();
    expect(screen.getByAltText(/open blue door/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    expect(screen.getByRole("button", { name: /Find a referral/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByRole("button", { name: /Give a referral/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Choose who you help/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create a free account/ }));
    expect(startLogin).toHaveBeenCalledTimes(2);
  });

  it("continue with email collects only the address and hands off to the hosted WorkOS screen", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    expect(startLogin).not.toHaveBeenCalled();
    const email = screen.getByLabelText("Email address");
    // The password is typed on WorkOS's own screen, never on this page.
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(document.querySelector("input[type=password]")).toBeNull();
    expect(screen.getByText(/enter your password on the next, secure screen/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe("/forgot-password");
    fireEvent.change(email, { target: { value: " Asha@Wipro.com " } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(assign).toHaveBeenCalledWith("/api/auth/workos/sign-in?login_hint=asha%40wipro.com");
    fireEvent.click(screen.getByRole("button", { name: "Use another method" }));
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("ships no design-preview scaffolding", () => {
    render(<SignIn />);
    expect(screen.queryByText(/whole flow|design preview|preview/i)).toBeNull();
  });
});
