// @vitest-environment jsdom
// Referrer-side sample-filled empty state on /referrer-home (owner override,
// Oct 21 11:35 PM, verified phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS). Pins the hard
// boundary: the two SAMPLE rows teach the accept/pass anatomy, but they can
// NEVER touch capacity, counts, credits or any route - and they only render
// for a verified first-timer the server says has never claimed or passed
// (hasEverReviewed === false) with an empty waiting list.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitingAsks } from "./WaitingAsks";
import { deriveReferrerHome, type ReferrerHomeData } from "./referrerData";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const ACCESS = { verified: true, domain: "example.com", companyName: "Example", companyInitials: "E" };

function data(overrides: Partial<ReferrerHomeData> = {}): ReferrerHomeData {
  return { access: ACCESS, preferences: null, verifiedAt: "2026-10-01T00:00:00.000Z", profileCapacity: 3, impact: null, thankYous: null, fresh: [], completed: [], hasEverReviewed: false, ...overrides };
}

afterEach(cleanup);

describe("referrer-home sample empty state", () => {
  it("renders the inert sample zone for a verified first-timer with an empty queue", () => {
    const view = deriveReferrerHome(data(), Date.now());
    expect(view.showSamples).toBe(true);
    render(<WaitingAsks view={view} nowMs={Date.now()} />);
    expect(screen.getByTestId("goal-referrer-sample-rows")).toBeTruthy();
    expect(screen.getByText("SAMPLE · NOT REAL ASKS")).toBeTruthy();
    expect(screen.getAllByText("SAMPLE")).toHaveLength(2);
    const zone = screen.getByTestId("goal-referrer-sample-rows");
    expect(zone.querySelectorAll("a, button, [tabindex], [role='button']")).toHaveLength(0);
    expect(zone.querySelector("ul")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(/never counted and disappear after your first real ask/)).toBeTruthy();
  });

  it("keeps the honest empty panel for a returning referrer (hasEverReviewed true)", () => {
    const view = deriveReferrerHome(data({ hasEverReviewed: true }), Date.now());
    expect(view.showSamples).toBe(false);
    render(<WaitingAsks view={view} nowMs={Date.now()} />);
    expect(screen.queryByTestId("goal-referrer-sample-rows")).toBeNull();
  });

  it("fails closed when the server predates the flag (hasEverReviewed null)", () => {
    const view = deriveReferrerHome(data({ hasEverReviewed: null }), Date.now());
    expect(view.showSamples).toBe(false);
    render(<WaitingAsks view={view} nowMs={Date.now()} />);
    expect(screen.queryByTestId("goal-referrer-sample-rows")).toBeNull();
  });

  it("never shows samples over real waiting asks or when unverified", () => {
    const waitingRow = { id: 7, companyDomain: "example.com", jobFunction: null, status: "pending" as const, createdAt: "2026-10-20T00:00:00.000Z", isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 0, expiresAt: null, waitingForCoverage: false, coverageVisibleAt: null, jobTitle: "Analyst", askStrength: null };
    const withWaiting = deriveReferrerHome(data({ fresh: [waitingRow] }), Date.now());
    expect(withWaiting.showSamples).toBe(false);
    const unverified = deriveReferrerHome(data({ access: { ...ACCESS, verified: false } }), Date.now());
    expect(unverified.showSamples).toBe(false);
  });
});
