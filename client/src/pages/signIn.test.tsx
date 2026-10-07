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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SignIn", () => {
  it("renders the kit split design with intent choice and WorkOS continuations", () => {
    render(<SignIn />);
    expect(screen.getByText(/One sign-in/)).toBeTruthy();
    expect(screen.getByText("Welcome to SkipWait.")).toBeTruthy();
    expect(screen.getByAltText(/open blue door/)).toBeTruthy();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Give a referral/ }));
    expect(screen.getByText(/Choose who you help/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue with email/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create a free account/ }));
    expect(startLogin).toHaveBeenCalledTimes(3);
  });
});
