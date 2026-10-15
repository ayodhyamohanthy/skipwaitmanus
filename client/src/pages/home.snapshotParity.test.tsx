// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Home from "./Home";
import { landingSnapshot } from "../../../scripts/prerender-public-pages";
import { LANDING_H1, LANDING_HERO_LEAD } from "@shared/landingContent";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: false }), SignedIn: () => null, SignedOut: ({ children }: { children?: React.ReactNode }) => children, useUser: () => ({ user: null }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/Brand", () => ({ Brand: () => <div>skipwait.me</div> }));

const flat = (text: string | null) => (text ?? "").replace(/\s+/g, "");

describe("landing first paint matches the page", () => {
  afterEach(() => cleanup());

  it("the served snapshot's headline and lead are the React hero's, so the swap never changes the copy", () => {
    const { container } = render(<Home />);
    const hero = container.querySelector(".launch-hero-copy");
    const doc = new DOMParser().parseFromString(landingSnapshot([]), "text/html");
    expect(flat(hero?.querySelector("h1")?.textContent ?? null)).toBe(flat(doc.querySelector("h1")?.textContent ?? null));
    expect(flat(hero?.querySelector("h1")?.textContent ?? null)).toBe(flat(LANDING_H1));
    expect(flat(hero?.querySelector("p")?.textContent ?? null)).toBe(flat(doc.querySelector("main > p")?.textContent ?? null));
    expect(flat(hero?.querySelector("p")?.textContent ?? null)).toBe(flat(LANDING_HERO_LEAD));
  });

  it("no public landing copy promises monthly free requests", () => {
    const html = landingSnapshot([]);
    expect(html).not.toMatch(/free every month|every month\./i);
    expect(html).toContain("keeps up to 3 requests open at once");
  });
});
