// @vitest-environment jsdom
// D-048-p3-policy (packet docs/plans/D-048-public.md §4-§5): the policy group
// and the three guides move to the goal static frame behind
// goalSurfaceOn("policy"), keyed by route (never /pricing, never /support).
// Legal-text identity pin: the legal body renders the same text with the goal
// flag on and off; the frame fetches nothing; one H1 and the breadcrumb stay.
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { GUIDES } from "@/content/guides";
import { PolicyPageShell } from "@/components/PolicyPageShell";
import Terms from "@/pages/Terms";
import TrustPrivacy from "@/pages/TrustPrivacy";
import RefundPolicy from "@/pages/RefundPolicy";
import CancellationPolicy from "@/pages/CancellationPolicy";
import ShippingPolicy from "@/pages/ShippingPolicy";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Guidelines from "@/pages/Guidelines";
import Support from "@/pages/Support";
import GuidePage from "@/pages/GuidePage";

const { surfaces } = vi.hoisted(() => ({ surfaces: { on: new Set<string>() } }));
vi.mock("@/lib/goalSurfaces", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/goalSurfaces")>()), goalSurfaceOn: (id: string) => surfaces.on.has(id) }));

const POLICY_PAGES: ReadonlyArray<{ route: string; Page: () => React.ReactElement | null; goalLine: string }> = [
  { route: "/terms", Page: Terms, goalLine: "Know your rights." },
  { route: "/privacy", Page: TrustPrivacy, goalLine: "Know your rights." },
  { route: "/refunds", Page: RefundPolicy, goalLine: "Know your rights." },
  { route: "/cancellations", Page: CancellationPolicy, goalLine: "Know your rights." },
  { route: "/shipping", Page: ShippingPolicy, goalLine: "Know your rights." },
  { route: "/guidelines", Page: Guidelines, goalLine: "Know your rights." },
  { route: "/about", Page: About, goalLine: "Know who runs skipwait.me." },
  { route: "/contact", Page: Contact, goalLine: "Talk to a human." },
];

function renderAt(route: string, Page: () => React.ReactElement | null) {
  // jsdom has a window, so wouter reads the browser location, not ssrPath.
  window.history.replaceState({}, "", route);
  return render(<Router ssrPath={route}><Page /></Router>);
}

const norm = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
const legalBody = (container: HTMLElement) => norm(container.querySelector("article")?.textContent);
const shortVersion = (container: HTMLElement) => Array.from(container.querySelectorAll("#policy-summary ~ ul li")).map(li => norm(li.textContent).replace(/^•\s*/, ""));
const guideBody = (container: HTMLElement) => Array.from(container.querySelectorAll("main section")).map(section => norm(section.textContent)).join(" | ");

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  surfaces.on.clear();
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("policy pages on the goal frame (D-048-p3-policy)", () => {
  for (const { route, Page, goalLine } of POLICY_PAGES) {
    it(`${route}: the legal text is identical flag on and off, in a fetch-free goal frame`, () => {
      const off = renderAt(route, Page);
      expect(off.container.querySelector("[data-testid=goal-policy]")).toBeNull();
      const offBody = legalBody(off.container);
      const offSummary = shortVersion(off.container);
      expect(offBody.length).toBeGreaterThan(100);
      cleanup();

      surfaces.on.add("policy");
      const on = renderAt(route, Page);
      const frame = on.container.querySelector("[data-testid=goal-policy]");
      expect(frame).not.toBeNull();
      expect(legalBody(on.container)).toBe(offBody);
      expect(shortVersion(on.container)).toEqual(offSummary);
      expect(on.container.querySelectorAll("h1")).toHaveLength(1);
      expect(norm(on.container.querySelector("h1")?.textContent)).toBe(goalLine);
      expect(on.container.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("never keys /pricing or /support by the policy switch", () => {
    surfaces.on.add("policy");
    const pricing = render(<Router ssrPath="/pricing"><PolicyPageShell screen="pricing" eyebrow="Pricing" title="Pricing." updated="Oct 1, 2026"><p>Plans.</p></PolicyPageShell></Router>);
    expect(pricing.container.querySelector("[data-testid=goal-policy]")).toBeNull();
    cleanup();
    const support = renderAt("/support", Support);
    expect(support.container.querySelector("[data-testid=goal-policy]")).toBeNull();
  });
});

describe("guides on the goal frame (D-048-p3-policy)", () => {
  for (const guide of GUIDES) {
    it(`${guide.route}: sections and questions are identical flag on and off, one H1, fetch-free`, () => {
      const off = renderAt(guide.route, GuidePage);
      expect(off.container.querySelector("[data-testid=goal-policy]")).toBeNull();
      const offBody = guideBody(off.container);
      expect(offBody.length).toBeGreaterThan(200);
      cleanup();

      surfaces.on.add("policy");
      const on = renderAt(guide.route, GuidePage);
      expect(on.container.querySelector("[data-testid=goal-policy]")).not.toBeNull();
      expect(guideBody(on.container)).toBe(offBody);
      expect(on.container.querySelectorAll("h1")).toHaveLength(1);
      for (const entry of guide.faq) expect(on.container.textContent).toContain(entry.question);
      expect(on.container.querySelector('nav[aria-label="Breadcrumb"]')).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
