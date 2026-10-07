// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Home from "./Home";

vi.mock("@/_core/auth", () => ({
  SignedIn: ({ children }: { children?: React.ReactNode }) => null,
  SignedOut: ({ children }: { children?: React.ReactNode }) => children,
  useAuth: () => ({ isSignedIn: false }),
  useUser: () => ({ user: null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ acceptedReferrals: 0 }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("landing discovery and search metadata", () => {
  it("keeps the kit public destinations one tap from the header", () => {
    render(<Home />);
    const nav = screen.getByRole("navigation", { name: "Website navigation" });
    for (const [text, href] of [["Explore companies", "/explore"], ["For referrers", "/referrer"], ["Help & safety", "/safety"]]) {
      const link = within(nav).getByText(text);
      expect(link.closest("a")?.getAttribute("href")).toBe(href);
    }
  });

  it("answers the pre-signup questions in visible copy and in FAQ structured data", () => {
    render(<Home />);
    expect(screen.getByText("Are job referrals really free?")).toBeTruthy();
    const jsonLd = JSON.parse(document.getElementById("route-jsonld")?.textContent ?? "{}");
    expect(jsonLd["@type"]).toBe("FAQPage");
    expect(jsonLd.mainEntity).toHaveLength(4);
    expect(jsonLd.mainEntity[0].name).toBe("Are job referrals really free?");
  });

  it("links the live policy and company pages from the footer", () => {
    render(<Home />);
    const footer = document.querySelector("footer");
    for (const href of ["/help", "/terms", "/privacy", "/safety", "/for-companies"]) expect(footer?.querySelector(`a[href="${href}"]`)).toBeTruthy();
  });

  it("keeps the mobile menu on the same public destinations", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const nav = screen.getByRole("navigation", { name: "Website navigation" });
    for (const href of ["/explore", "/referrer", "/safety", "/sign-in"]) expect(nav.querySelector(`a[href="${href}"]`)).toBeTruthy();
  });
});
