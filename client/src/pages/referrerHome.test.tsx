// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerHome from "./ReferrerHome";
import Invite from "./Invite";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-home", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const NEW_ASKS = [
  { id: 31, companyDomain: "wipro.com", status: "pending", savedAt: null, createdAt: "2026-09-01T08:00:00Z", updatedAt: "2026-09-02T08:00:00Z", isClaimedByYou: false, unreadMessageCount: 0 },
  { id: 32, companyDomain: "wipro.com", status: "pending", savedAt: null, createdAt: "2026-09-01T08:00:00Z", updatedAt: "2026-09-02T08:00:00Z", isClaimedByYou: false, unreadMessageCount: 0 },
];

function stubHome(overrides: { verified?: boolean; reviewed?: number; verifiedAt?: string | null } = {}) {
  const verified = overrides.verified ?? true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: verified, workEmailDomain: verified ? "wipro.com" : null });
    if (String(url).endsWith("/profile/me")) return ok({ profile: { workEmailVerifiedAt: overrides.verifiedAt ?? "2026-08-01T00:00:00Z", referralCapacity: 3 } });
    if (String(url).endsWith("/referrer-impact/me")) return ok({ summary: { reviewed: overrides.reviewed ?? 2, approved: 1, introductions: 1, interviews: 0, offers: 0 } });
    if (String(url).includes("scope=new")) return ok({ requests: NEW_ASKS });
    if (String(url).includes("scope=completed")) return ok({ requests: [] });
    return ok({});
  }));
}

describe("ReferrerHome", () => {
  it("shows real new asks, capacity, and private record for verified referrers", async () => {
    stubHome();
    render(<ReferrerHome />);
    expect(await screen.findByText("Verified · wipro.com")).toBeTruthy();
    expect(screen.getByText("New asks waiting")).toBeTruthy();
    expect(screen.getByText("Your record · Private")).toBeTruthy();
    expect(screen.queryByText(/Asha/)).toBeNull();
    expect((await screen.findByRole("link", { name: /Private ask · Ref-1031/ })).getAttribute("href")).toBe("/conversation/31?from=inbox");
  });

  it("flags at-capacity from real review load", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (String(url).endsWith("/profile/me")) return ok({ profile: { workEmailVerifiedAt: "2026-08-01T00:00:00Z", referralCapacity: 1 } });
      if (String(url).endsWith("/referrer-impact/me")) return ok({ summary: { reviewed: 3, approved: 2, introductions: 1, interviews: 0, offers: 0 } });
      if (String(url).includes("scope=new")) return ok({ requests: NEW_ASKS });
      if (String(url).includes("scope=completed")) return ok({ requests: [{ id: 40, companyDomain: "wipro.com", status: "approved", isClaimedByYou: true, unreadMessageCount: 0, createdAt: "2026-09-01T08:00:00Z", updatedAt: "2026-09-02T08:00:00Z" }] });
      return ok({});
    }));
    render(<ReferrerHome />);
    expect(await screen.findByText("You've hit your capacity.")).toBeTruthy();
  });

  it("shows the verify gate without fabricating referrer state", async () => {
    stubHome({ verified: false });
    render(<ReferrerHome />);
    expect(await screen.findByText("Verify a work email to begin.")).toBeTruthy();
    expect(screen.queryByText("New asks waiting")).toBeNull();
  });

  it("warns when re-verification approaches, driven by the real verified date", async () => {
    const old = new Date(Date.now() - 80 * 86400000).toISOString();
    stubHome({ verifiedAt: old });
    render(<ReferrerHome />);
    expect(await screen.findByText(/Re-verify your wipro.com email soon/)).toBeTruthy();
  });
});

describe("Invite colleagues", () => {
  it("issues the real personal invite link with copy and share", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
    render(<Invite />);
    expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("keeps invites behind sign-in", () => {
    authState.isSignedIn = false;
    render(<Invite />);
    expect(screen.getByText("Invite someone inside.")).toBeTruthy();
  });
});
