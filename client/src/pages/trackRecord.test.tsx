// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import TrackRecord from "./TrackRecord";

const authState = vi.hoisted(() => ({ isSignedIn: false }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

type Stub = { ok: boolean; status?: number; json: () => Promise<unknown> };

const emptyReliability = { totalRequests: 0, withdrawnBeforeClaim: 0, reviewsReceived: 0, approvalsReceived: 0, introductions: 0, interviews: 0, offers: 0, completionRate: null };
const emptyReputation = { decisions: 0, approvals: 0, declines: 0, approvalRate: null, introductions: 0, interviews: 0, offers: 0, interviewHitRate: null, offerRate: null, medianResponseHours: null };

function stubFetch(handler: (url: string) => Stub) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => handler(String(input))));
}

beforeEach(() => { authState.isSignedIn = false; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TrackRecord", () => {
  it("asks signed-out visitors to sign in without revealing any numbers", () => {
    render(<TrackRecord />);
    expect(document.querySelector('[data-skipwait-screen="track-record-sign-in"]')).toBeTruthy();
    expect(screen.getByText("See your referral track record")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secure sign in" })).toBeTruthy();
    expect(screen.queryByText(/As a Referrer/)).toBeNull();
  });

  it("keeps the referrer half closed when the work email is not verified, and still shows the seeker half", async () => {
    authState.isSignedIn = true;
    stubFetch(url => {
      if (url.endsWith("/api/reputation/referrer/me")) return { ok: false, status: 403, json: async () => ({ error: "Verify your company email to view your referral track record" }) };
      return { ok: true, json: async () => ({ reliability: { ...emptyReliability, totalRequests: 2, reviewsReceived: 1 } }) };
    });
    render(<TrackRecord />);

    expect(await screen.findByText("Verify your work email to unlock this half")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/referrer?setup=work-email");
    // A 403 on the referrer endpoint is a setup state, not a page failure.
    expect(document.querySelector('[data-skipwait-screen="track-record-error"]')).toBeNull();
    expect(screen.getByText("Requests sent")).toBeTruthy();
  });

  it("never renders an unproven rate as 0% and shows the honest empty state", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/reputation/referrer/me")
      ? { ok: true, json: async () => ({ reputation: emptyReputation }) }
      : { ok: true, json: async () => ({ reliability: emptyReliability }) });

    render(<TrackRecord />);
    expect(await screen.findByText("Your record starts with your first real decision")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("renders real referrer numbers and leaves null rates blank instead of zero", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/reputation/referrer/me")
      ? { ok: true, json: async () => ({ reputation: { decisions: 3, approvals: 2, declines: 1, approvalRate: 2 / 3, introductions: 2, interviews: 1, offers: 0, interviewHitRate: 0.5, offerRate: null, medianResponseHours: 4 } }) }
      : { ok: true, json: async () => ({ reliability: emptyReliability }) });

    render(<TrackRecord />);

    expect(await screen.findByText("Decisions")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("4 h")).toBeTruthy();
    // offerRate is null because no introduction has reached an offer yet.
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Needs one accepted request")).toBeTruthy();
  });

  it("renders seeker reliability counts with an explicit withdrawn count", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/reputation/referrer/me")
      ? { ok: false, status: 403, json: async () => ({ error: "Verify your company email to view your referral track record" }) }
      : { ok: true, json: async () => ({ reliability: { totalRequests: 5, withdrawnBeforeClaim: 2, reviewsReceived: 3, approvalsReceived: 2, introductions: 1, interviews: 1, offers: 0, completionRate: 0.5 } }) });

    render(<TrackRecord />);

    expect(await screen.findByText("Requests sent")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Withdrawn")).toBeTruthy();
    expect(screen.getByText("Pulled back before anyone claimed them")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("offers a retry when the primary track record fails to load", async () => {
    authState.isSignedIn = true;
    stubFetch(() => ({ ok: false, status: 500, json: async () => ({ error: "We could not load your track record" }) }));

    render(<TrackRecord />);
    await waitFor(() => expect(document.querySelector('[data-skipwait-screen="track-record-error"]')).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("isolates a referrer-side failure so the seeker record still renders", async () => {
    authState.isSignedIn = true;
    stubFetch(url => url.endsWith("/api/reputation/referrer/me")
      ? { ok: false, status: 500, json: async () => ({ error: "We could not load your referral track record" }) }
      : { ok: true, json: async () => ({ reliability: { ...emptyReliability, totalRequests: 1 } }) });

    render(<TrackRecord />);

    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(document.querySelector('[data-skipwait-screen="track-record-error"]')).toBeNull();
    expect(screen.getByText("Requests sent")).toBeTruthy();
  });
});
