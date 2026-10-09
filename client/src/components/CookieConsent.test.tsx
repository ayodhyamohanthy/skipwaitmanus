// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CookieConsent from "./CookieConsent";

const { consentV2, clarity } = vi.hoisted(() => ({ consentV2: vi.fn(), clarity: { active: false } }));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@microsoft/clarity", () => ({ default: { consentV2 } }));
vi.mock("@/lib/clarity", () => ({ isClarityActive: () => clarity.active }));

beforeEach(() => { window.localStorage.clear(); consentV2.mockReset(); clarity.active = false; });
afterEach(cleanup);

describe("CookieConsent", () => {
  it("shows on first visit and stores an essential-only choice", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Cookie choices" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("essential");
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
  });

  it("stores accept-all and stays hidden on return visits", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("all");
    cleanup();
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
  });

  it("treats an unknown stored value as no choice yet", () => {
    window.localStorage.setItem("skipwait:cookie-consent", "maybe");
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: "Cookie choices" })).toBeTruthy();
  });

  it("keeps Clarity analytics storage denied until the visitor accepts all", () => {
    clarity.active = true;
    render(<CookieConsent />);
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "granted" });
  });

  it("denies Clarity analytics storage on essential only and re-applies the stored choice on return", () => {
    clarity.active = true;
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
    cleanup();
    window.localStorage.setItem("skipwait:cookie-consent", "all");
    consentV2.mockReset();
    render(<CookieConsent />);
    expect(consentV2).toHaveBeenCalledWith({ ad_Storage: "denied", analytics_Storage: "granted" });
  });

  it("does not touch Clarity when it is not configured", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(consentV2).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("all");
  });

  it("hides for this visit when storage is blocked", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(screen.queryByRole("dialog", { name: "Cookie choices" })).toBeNull();
    setItem.mockRestore();
  });
});
