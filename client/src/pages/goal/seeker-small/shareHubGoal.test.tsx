// @vitest-environment jsdom
// Goal /share (D-048-p3-seeker-small, dark): goal line, one Copy commit,
// link lifecycle, flags-off kit control.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { isSignedIn: true };
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.isSignedIn }), SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
const flagState = { on: true };
vi.mock("@/lib/goalSurfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/goalSurfaces")>();
  return { ...actual, goalSurfaceOn: (id: string) => flagState.on && id === "share" };
});
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/Brand", () => ({ Brand: () => null }));

import ShareHub from "@/pages/ShareHub";

function stubInvite(code = "PAL-123", ok = true) {
  return vi.fn(async () => ok
    ? { ok: true, status: 200, json: async () => ({ invite: { inviteCode: code } }) } as Response
    : { ok: false, status: 500, json: async () => ({}) } as Response);
}

describe("goal share hub", () => {
  beforeEach(() => { authState.isSignedIn = true; flagState.on = true; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("opens on the goal with the copy commit once the link is ready", async () => {
    vi.stubGlobal("fetch", stubInvite());
    render(<ShareHub />);
    expect(await screen.findByTestId("goal-share-hub")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Help a friend find their next role." })).toBeTruthy();
    expect(await screen.findByText(/Your link is ready/)).toBeTruthy();
    expect(screen.getByText(/invite=PAL-123/)).toBeTruthy();
    // Referral-only reward copy (D-180/D-055): the unit is a referral, and the
    // reward is stated as pending until the next private referral request.
    expect(screen.getByText(/you each get 1 extra referral/)).toBeTruthy();
    expect(screen.getByText(/unlocks when you send your next private referral request/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/referral credit/i);
    const commit = screen.getByRole("button", { name: "Copy link" });
    expect(commit.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("offers Try again when the link cannot be created", async () => {
    vi.stubGlobal("fetch", stubInvite("PAL-123", false));
    render(<ShareHub />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("gates sharing behind sign-in", async () => {
    authState.isSignedIn = false;
    render(<ShareHub />);
    expect(await screen.findByTestId("goal-share-hub")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
  });

  it("flags off keeps the kit hub", async () => {
    flagState.on = false;
    vi.stubGlobal("fetch", stubInvite());
    render(<ShareHub />);
    expect(await screen.findByText(/You found an opportunity/)).toBeTruthy();
    expect(screen.queryByTestId("goal-share-hub")).toBeNull();
  });
});
