// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "./CookieConsent";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

beforeEach(() => { window.localStorage.clear(); });
afterEach(cleanup);

describe("CookieConsent", () => {
  it("shows on first visit and stores an essential-only choice", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Cookie consent" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("essential");
    expect(screen.queryByRole("dialog", { name: "Cookie consent" })).toBeNull();
  });

  it("stores accept-all and stays hidden on return visits", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("all");
    cleanup();
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog", { name: "Cookie consent" })).toBeNull();
  });
});
