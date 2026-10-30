// @vitest-environment jsdom
// Goal /share (D-048-p3-seeker-small, dark): goal line, one Copy commit,
// link lifecycle, flags-off kit control.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { Profiler } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import GoalShareHub from "@/pages/goal/seeker-small/GoalShareHub";

function stubInvite(code = "PAL-123", ok = true) {
  return vi.fn(async () => ok
    ? { ok: true, status: 200, json: async () => ({ invite: { inviteCode: code } }) } as Response
    : { ok: false, status: 500, json: async () => ({}) } as Response);
}

// Records the page text at every commit of the hub, before passive effects
// run, so a paint that says "ready" for one frame without a link is caught.
function Painted({ paints }: { paints: string[] }) {
  return <Profiler id="goal-share-hub" onRender={() => { paints.push(document.body.textContent ?? ""); }}><GoalShareHub /></Profiler>;
}

function claimsReadyWithoutLink(paints: string[]) {
  return paints.filter(text => text.includes("Your link is ready.") && !/invite=/.test(text));
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

  it("never says the link is ready before it exists (first paint, before any effect runs)", () => {
    // The lazy goal body can paint once before its load effect starts; that
    // paint said "Your link is ready." with no link (main red at dc7f71a8, eb0fd8cd).
    const html = renderToStaticMarkup(<GoalShareHub />);
    expect(html).toContain("Creating your link…");
    expect(html).not.toContain("Your link is ready.");
  });

  it("a locked account (invite null) never hears the link is ready and sees the unlock policy", async () => {
    // D-155: a locked account gets 200 { invite: null, locked: true }, never an error.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ invite: null, locked: true }) }) as Response));
    const paints: string[] = [];
    render(<Painted paints={paints} />);
    await waitFor(() => expect(document.body.textContent ?? "").not.toContain("Creating your link…"));
    expect(claimsReadyWithoutLink(paints)).toEqual([]);
    expect(document.body.textContent ?? "").not.toContain("Your link is ready.");
    expect(document.body.textContent ?? "").not.toMatch(/invite=/);
    expect(screen.getByText("Referrals unlock after your first paid invoice. Once you've made a payment, come back here to get your referral link.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    // Referral and policy wording stay exactly as they are.
    expect(screen.getByText(/When a friend joins with it, you each get 1 extra referral - it unlocks when you send your next private referral request\./)).toBeTruthy();
    expect(screen.getByText("Rewards apply once per verified new account. Self-invites and duplicate accounts are not eligible.")).toBeTruthy();
  });

  it("signing in on the same mount never paints ready before the link exists", async () => {
    authState.isSignedIn = false;
    let resolveInvite: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { resolveInvite = resolve; })));
    const paints: string[] = [];
    const view = render(<Painted paints={paints} />);
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
    authState.isSignedIn = true;
    view.rerender(<Painted paints={paints} />);
    expect(claimsReadyWithoutLink(paints)).toEqual([]);
    expect(screen.getByText(/Creating your link…/)).toBeTruthy();
    resolveInvite({ ok: true, status: 200, json: async () => ({ invite: { inviteCode: "PAL-123" }, locked: false }) } as Response);
    expect(await screen.findByText(/invite=PAL-123/)).toBeTruthy();
    expect(screen.getByText(/Your link is ready\./)).toBeTruthy();
    expect(claimsReadyWithoutLink(paints)).toEqual([]);
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
