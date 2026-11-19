// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPanels } from "../components/settings/PrivacyPanels";
import { readCookieConsent } from "../components/CookieConsent";

const { consentV2 } = vi.hoisted(() => ({ consentV2: vi.fn() }));
vi.mock("@microsoft/clarity", () => ({ default: { consentV2 } }));
vi.mock("@/lib/clarity", () => ({ isClarityActive: () => true }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("../components/settings/BlockedPeople", () => ({ default: () => null }));
vi.mock("../components/settings/TalentConsentPanel", () => ({ TalentConsentPanel: () => null }));

beforeEach(() => {
  window.localStorage.clear(); consentV2.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ export: null }), text: async () => "{}" })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderPanel = () => render(<QueryClientProvider client={new QueryClient()}><PrivacyPanels getToken={async () => "t"} /></QueryClientProvider>);

describe("Cookies & analytics panel", () => {
  it("starts off, keeps Essential locked, and drives the same stored choice and Clarity as the banner", () => {
    renderPanel();
    const toggle = screen.getByRole("switch", { name: "Product analytics" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Keeps you signed in and the site working. Always on.")).toBeTruthy();
    fireEvent.click(toggle);
    expect(readCookieConsent()).toBe("all");
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "granted" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(readCookieConsent()).toBe("essential");
    expect(consentV2).toHaveBeenLastCalledWith({ ad_Storage: "denied", analytics_Storage: "denied" });
  });
  it("reflects a choice already made on the banner", () => {
    window.localStorage.setItem("skipwait:cookie-consent", "all");
    renderPanel();
    expect(screen.getByRole("switch", { name: "Product analytics" }).getAttribute("aria-checked")).toBe("true");
  });
});
