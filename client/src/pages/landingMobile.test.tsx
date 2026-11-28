// @vitest-environment jsdom
// MOBILE-landing-choice (D-414, docs/plans/MOBILE-app-flow.md): the one-screen
// phone landing with both roles up front, behind MOBILE_LANDING_V2 (off).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const flags = vi.hoisted(() => ({ mobileLanding: false }));
const clarity = vi.hoisted(() => ({ trackClarityEvent: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false }) }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => id === "home" }));
vi.mock("@/lib/clarity", async (importOriginal) => ({ ...(await importOriginal<object>()), trackClarityEvent: clarity.trackClarityEvent }));
vi.mock("@shared/landingContent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/landingContent")>();
  return { ...actual, get MOBILE_LANDING_V2() { return flags.mobileLanding; } };
});

import Home from "./Home";
import MobileLanding, { MOBILE_LANDING_EVENTS, PHONE_QUERY } from "./goal/landing/MobileLanding";
import CookieConsent from "@/components/CookieConsent";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import * as landing from "@shared/landingContent";
import { landingSnapshot, mobileLandingSnapshot } from "../../../scripts/prerender-public-pages";

function viewport(phone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === PHONE_QUERY ? phone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderAt(node: React.ReactNode) {
  const location = memoryLocation({ path: "/", record: true });
  render(<Router hook={location.hook}>{node}</Router>);
  return location;
}

beforeEach(() => {
  window.localStorage.removeItem("skipwait:cookie-consent");
  flags.mobileLanding = false;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clarity.trackClarityEvent.mockClear();
});

describe("Home: which landing a signed-out visitor gets", () => {
  it("switch off (the shipped state): a phone keeps the current landing", () => {
    viewport(true);
    renderAt(<Home />);
    expect(screen.queryByTestId("mobile-landing")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(landing.GOAL_LANDING_H1);
  });

  it("switch on: a phone gets the one-screen role choice", () => {
    flags.mobileLanding = true;
    viewport(true);
    renderAt(<Home />);
    expect(screen.getByTestId("mobile-landing")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(landing.MOBILE_LANDING.h1);
  });

  it("switch on: a desktop keeps the current landing", () => {
    flags.mobileLanding = true;
    viewport(false);
    renderAt(<Home />);
    expect(screen.queryByTestId("mobile-landing")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(landing.GOAL_LANDING_H1);
  });
});

describe("MobileLanding", () => {
  it("shows the owner-approved words and both roles (D-414 (2))", () => {
    viewport(true);
    renderAt(<MobileLanding />);
    const c = landing.MOBILE_LANDING;
    for (const text of [c.lead, c.question, c.seekerTitle, c.seekerNote, c.referrerTitle, c.referrerBody, c.smallPrint]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    expect(screen.getByPlaceholderText(c.seekerPlaceholder)).toBeTruthy();
    expect(c.seekerNote).toMatch(/^\d+ free requests a month$/);
  });

  it("has exactly one black commit: the seeker card", () => {
    renderAt(<MobileLanding />);
    expect(screen.getAllByTestId("goal-next-step")).toHaveLength(1);
  });

  it("the seeker search goes to explore with the query and records a search start", () => {
    const location = renderAt(<MobileLanding />);
    fireEvent.change(screen.getByPlaceholderText(landing.MOBILE_LANDING.seekerPlaceholder), { target: { value: "  Stripe engineer " } });
    fireEvent.click(screen.getByRole("button", { name: landing.MOBILE_LANDING.seekerSubmit }));
    expect(location.history?.at(-1)).toBe("/explore?q=Stripe%20engineer");
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith(MOBILE_LANDING_EVENTS.search);
  });

  it("an empty search opens the directory", () => {
    const location = renderAt(<MobileLanding />);
    fireEvent.click(screen.getByRole("button", { name: landing.MOBILE_LANDING.seekerSubmit }));
    expect(location.history?.at(-1)).toBe("/explore");
  });

  it("the referrer card opens the work-email sign-in only, with the role carried (login rule, D-030)", () => {
    renderAt(<MobileLanding />);
    const card = screen.getByTestId("mobile-landing-referrer");
    expect(card.getAttribute("href")).toBe(referrerSignInHref());
    expect(card.getAttribute("href")).toContain("intent=referrer");
    fireEvent.click(card);
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith(MOBILE_LANDING_EVENTS.referrer);
  });

  it("links the proof to /how-it-works and uses the slim cookie bar", () => {
    renderAt(<MobileLanding />);
    expect(screen.getByRole("link", { name: landing.MOBILE_LANDING.howItWorks }).getAttribute("href")).toBe("/how-it-works");
    expect(screen.getByTestId("cookie-consent-bar")).toBeTruthy();
    expect(screen.queryByTestId("cookie-consent-spacer")).toBeNull();
  });
});

describe("CookieConsent bar layout (packet rule 4)", () => {
  it("keeps the same words and the same two equal choices as the card", () => {
    const { container: bar } = render(<CookieConsent layout="bar" />);
    const barText = bar.textContent;
    const barButtons = Array.from(bar.querySelectorAll("button")).map(b => [b.textContent, b.className]);
    cleanup();
    const { container: card } = render(<CookieConsent />);
    expect(barText).toBe(card.querySelector("[role=dialog]")?.textContent);
    expect(barButtons).toEqual(Array.from(card.querySelectorAll("button")).map(b => [b.textContent, b.className]));
  });

  it("stores the choice and hides itself", () => {
    render(<CookieConsent layout="bar" />);
    fireEvent.click(screen.getByRole("button", { name: "Essential only" }));
    expect(window.localStorage.getItem("skipwait:cookie-consent")).toBe("essential");
    expect(screen.queryByTestId("cookie-consent-bar")).toBeNull();
  });
});

describe("prerendered first paint", () => {
  it("switch off: the landing snapshot is unchanged (no phone screen)", () => {
    expect(landingSnapshot([])).not.toContain('data-testid="mobile-landing"');
  });

  it("the phone snapshot carries the same classes as the live component, so the first paint does not jump", () => {
    renderAt(<MobileLanding />);
    const classesOf = (root: ParentNode) => new Set(Array.from(root.querySelectorAll("[class]")).flatMap(el => (el.getAttribute("class") ?? "").split(/\s+/)));
    const live = classesOf(document.body);
    const snap = classesOf(new DOMParser().parseFromString(mobileLandingSnapshot(), "text/html"));
    // Every layout class the snapshot paints exists on the live page (the
    // snapshot leaves out only hover states and the cookie bar).
    const missing = Array.from(snap).filter(cls => !live.has(cls) && cls !== "gdesk:hidden");
    expect(missing).toEqual([]);
  });

  it("the phone snapshot shows the same words, a no-JavaScript search and the referrer sign-in", () => {
    const doc = new DOMParser().parseFromString(mobileLandingSnapshot(), "text/html");
    const text = doc.body.textContent ?? "";
    for (const value of Object.values(landing.MOBILE_LANDING)) {
      if (value !== landing.MOBILE_LANDING.seekerPlaceholder && value !== landing.MOBILE_LANDING.seekerSubmit) expect(text, value).toContain(value);
    }
    const form = doc.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/explore");
    expect(form?.querySelector("input")?.getAttribute("name")).toBe("q");
    expect(form?.querySelector("button[type=submit]")?.getAttribute("aria-label")).toBe(landing.MOBILE_LANDING.seekerSubmit);
    expect(doc.querySelector(`a[href="${referrerSignInHref()}"]`)).toBeTruthy();
  });
});

describe("baseline events on the current landing (the comparison the switch waits on)", () => {
  it("records a search start and a referrer click", async () => {
    const { default: GoalLandingV9, LANDING_EVENTS } = await import("./GoalLandingV9");
    renderAt(<GoalLandingV9 />);
    fireEvent.click(screen.getByRole("button", { name: /Find your company/ }));
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith(LANDING_EVENTS.search);
    fireEvent.click(screen.getAllByRole("link", { name: /Join as a referrer/ })[0]);
    expect(clarity.trackClarityEvent).toHaveBeenCalledWith(LANDING_EVENTS.referrer);
  });
});
