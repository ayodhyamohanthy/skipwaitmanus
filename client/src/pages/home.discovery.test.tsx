// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Home from "./Home";
import { LANDING_EXPLORE, LANDING_FAQ } from "@shared/landingContent";

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

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ acceptedReferrals: 3 }) }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("landing discovery and search metadata", () => {
  it("keeps every public destination one tap from the hero", () => {
    render(<Home />);
    const nav = screen.getByRole("navigation", { name: "Public navigation" });
    for (const href of ["/jobs", "/wall", "/pricing", "/support", "/privacy"]) expect(nav.querySelector(`a[href="${href}"]`)).toBeTruthy();
  });

  it("answers the pre-signup questions in visible copy and in FAQ structured data", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Common questions, answered plainly." })).toBeTruthy();
    for (const entry of LANDING_FAQ) expect(screen.getByText(entry.question)).toBeTruthy();
    const jsonLd = JSON.parse(document.getElementById("route-jsonld")?.textContent ?? "{}");
    expect(jsonLd["@type"]).toBe("FAQPage");
    expect(jsonLd.mainEntity).toHaveLength(LANDING_FAQ.length);
    expect(jsonLd.mainEntity[0].name).toBe(LANDING_FAQ[0].question);
  });

  it("links every public page from the footer so no landing path dead-ends", () => {
    render(<Home />);
    const footer = document.querySelector("footer");
    for (const link of LANDING_EXPLORE) expect(footer?.querySelector(`a[href="${link.href}"]`)).toBeTruthy();
  });

  it("keeps the mobile menu on the same public destinations", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu" });
    for (const href of ["/jobs", "/wall", "/pricing"]) expect(menu.querySelector(`a[href="${href}"]`)).toBeTruthy();
  });
});