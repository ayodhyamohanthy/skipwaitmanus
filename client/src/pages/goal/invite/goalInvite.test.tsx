// @vitest-environment jsdom
// D-048-p3-invite: flag-off parity (kit renders untouched) and flag-on goal
// rebuild for /invite. Mocks follow client/src/pages/referrerHome.test.tsx.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Invite from "../../Invite";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";

const { authState, search, surfaces } = vi.hoisted(() => ({
  authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") },
  search: { value: "" },
  surfaces: { on: new Set<string>() },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children ?? "Sign in"}</button> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/invite", vi.fn()],
  useSearch: () => search.value,
}));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const DIRECTORY = { companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length };
const suggestionPosts = (fetchMock: { mock: { calls: unknown[][] } }) => fetchMock.mock.calls.filter(call => call[0] === "/api/company-suggestions");

beforeEach(() => { authState.isSignedIn = true; search.value = ""; surfaces.on = new Set(["invite"]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Goal /invite flag gate", () => {
  it("renders the kit page untouched when the surface flag is off", () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
    renderWithQuery(<Invite />);
    expect(screen.getByText(/Who should join/)).toBeTruthy();
    expect(document.querySelector(".invite-page")).toBeTruthy();
    expect(screen.queryByText("Name the company you want on skipwait.me.")).toBeNull();
    expect(screen.queryByText("YOUR NEXT STEP")).toBeNull();
  });

  it("swaps to the goal surface when the flag is on", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies" ? ok(DIRECTORY) : ok({ suggestion: { id: 7, companyName: "Acme Labs" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(await screen.findByText("Name the company you want on skipwait.me.")).toBeTruthy();
    expect(screen.getByText("Tell us where you want to work.")).toBeTruthy();
    expect(screen.getAllByText("YOUR NEXT STEP").length).toBeGreaterThan(0);
    expect(document.querySelector(".invite-page")).toBeNull();
    expect(screen.queryByText(/Who should join/)).toBeNull();
  });
});

describe("Goal /invite signed-out", () => {
  it("keeps request mode behind seeker sign-in and fires no requests", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Sign in to send your request.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes invite-mode sign-in through the work-email OTP href only", () => {
    authState.isSignedIn = false;
    search.value = "mode=invite";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    const link = screen.getByRole("link", { name: "Sign in with work email" });
    expect(link.getAttribute("href")).toBe(`/sign-in?intent=referrer&returnTo=${encodeURIComponent("/invite?mode=invite")}`);
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Goal /invite request panel", () => {
  it("files a real seeker-demand request and shows the saved state", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies" ? ok(DIRECTORY) : ok({ suggestion: { id: 7, companyName: "Acme Labs" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    fireEvent.click(await screen.findByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("Name the company you want to see.")).toBeTruthy();
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(screen.getByText(/We saved your request for Acme Labs/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker" }) }));
    expect(screen.getByRole("button", { name: "Try the other path" })).toBeTruthy();
  });

  it("points a listed company to its door instead of filing a request", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies" ? ok(DIRECTORY) : fail(500, {})));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    await waitFor(() => expect(document.querySelectorAll("#goal-launch-companies option").length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "wipro" } });
    expect(screen.getByText(/Wipro already has a door on skipwait.me/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/explore/wipro");
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
  });

  it("shows the server's reason when a request is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/companies" ? ok(DIRECTORY) : fail(400, { error: "You can suggest up to 3 companies a day" }))));
    renderWithQuery(<Invite />);
    fireEvent.change(await screen.findByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("You can suggest up to 3 companies a day")).toBeTruthy();
  });
});

describe("Goal /invite invite panel", () => {
  it("issues the real personal invite link with copy and email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
    renderWithQuery(<Invite />);
    fireEvent.click(await screen.findByRole("button", { name: /Invite someone inside/ }));
    expect(await screen.findByText("Send your personal link.")).toBeTruthy();
    expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy invitation link" }));
    expect(await screen.findByText("Copied")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Email invite/ }).getAttribute("href")).toMatch(/^mailto:/);
  });

  it("shows a retryable error when the invite link cannot be issued", async () => {
    search.value = "mode=invite";
    vi.stubGlobal("fetch", vi.fn(async () => fail(503, { error: "Personal invites are not available yet" })));
    renderWithQuery(<Invite />);
    expect(await screen.findByText("Personal invites are not available yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
