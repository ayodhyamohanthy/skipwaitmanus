// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Invite from "../../Invite";
// Warm the real chunk; the cases still mount the actual lazy route entrypoint.
import "./GoalInvite";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";

const { authState, search } = vi.hoisted(() => ({
  authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") },
  search: { value: "" },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children ?? "Sign in"}</button> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/invite", vi.fn()],
  useSearch: () => search.value,
}));
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
const DIRECTORY = { companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length };
const suggestionPosts = (fetchMock: { mock: { calls: unknown[][] } }) => fetchMock.mock.calls.filter(call => call[0] === "/api/company-suggestions");

beforeEach(() => { authState.isSignedIn = true; search.value = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("renders the released goal page without an Invite surface flag override", async () => {
  vi.stubEnv("VITE_GOAL_SURFACES", "");
  vi.stubGlobal("fetch", vi.fn(async () => ok(DIRECTORY)));
  renderWithQuery(<Invite />);
  expect(await screen.findByRole("heading", { name: "Name the company you want on skipwait.me." })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1, name: "Tell us where you want to work." })).toBeTruthy();
  expect(screen.getByText("YOUR NEXT STEP")).toBeTruthy();
  expect(document.querySelector(".invite-page")).toBeNull();
  expect(screen.queryByText(/Who should join/)).toBeNull();
});

describe("Goal /invite signed-out", () => {
  it("keeps both modes behind their own sign-in and fires no requests", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Sign in to send your request.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Invite someone inside/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Invite someone inside." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in with work email" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes invite-mode sign-in through the work-email OTP href only", async () => {
    authState.isSignedIn = false;
    search.value = "mode=invite";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    const link = await screen.findByRole("link", { name: "Sign in with work email" });
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
    expect(await screen.findByRole("heading", { level: 1, name: "Tell us where you want to work." })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("Name the company you want to see.")).toBeTruthy();
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(screen.getByText("We saved your request for Acme Labs. It does not create a referral request, and nothing is posted publicly.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker" }) }));
    expect(screen.getByRole("button", { name: "Try the other path" })).toBeTruthy();
  });

  it("sends the chosen work function and says when a duplicate request was already counted", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies"
      ? ok(DIRECTORY)
      : ok({ suggestion: { id: 7, companyName: "Acme Labs", jobFunction: "Design", alreadyRecorded: true } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    fireEvent.change(await screen.findByLabelText("Company name"), { target: { value: "Acme Labs" } });
    fireEvent.change(screen.getByLabelText("Work function"), { target: { value: "Design" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText(/You had already asked for Acme Labs, so your vote counts once/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/company-suggestions", expect.objectContaining({ method: "POST", body: JSON.stringify({ companyName: "Acme Labs", role: "seeker", jobFunction: "Design" }) }));
  });

  it("points a listed company to its door instead of filing a request", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies" ? ok(DIRECTORY) : fail(500, {})));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    const options = () => Array.from(document.querySelectorAll("#goal-launch-companies option"), option => option.getAttribute("value"));
    await waitFor(() => expect(options()).toEqual(["skipwait.me", "Wipro", "Neutrinos", "TCS", "Merkle"]));
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "wipro" } });
    expect(screen.getByText(/Wipro already has a door on skipwait.me/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/explore/wipro");
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(suggestionPosts(fetchMock)).toHaveLength(0);
  });

  it("still files a request when the company list cannot load", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/companies"
      ? fail(503, { error: "The company directory is unavailable right now" })
      : ok({ suggestion: { id: 8, companyName: "Wipro" } })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<Invite />);
    expect(await screen.findByText(/couldn’t load the companies already on skipwait.me/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Wipro" } });
    fireEvent.click(screen.getByRole("button", { name: "Send company request" }));
    expect(await screen.findByText("That’s the growth loop.")).toBeTruthy();
    expect(suggestionPosts(fetchMock)).toHaveLength(1);
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
    const panel = within(screen.getByRole("region", { name: "Personal invite link" }));
    expect(panel.getByRole("link", { name: "Email invite" }).getAttribute("href")).toMatch(/^mailto:/);
    expect(panel.queryByRole("button", { name: /^Share$/ })).toBeNull();
    expect(panel.queryByText(/One link per person/)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW/)).toBeNull();
  });

  it("opens directly from referrer home and shares the same link through the native share button", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, "share");
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      search.value = "mode=invite";
      vi.stubGlobal("fetch", vi.fn(async () => ok({ invite: { inviteCode: "r11-abcdef01" } })));
      renderWithQuery(<Invite />);
      expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to referrer home" }).getAttribute("href")).toBe("/referrer-home");
      fireEvent.click(screen.getByRole("button", { name: "Share invitation link" }));
      await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/verify?invite=r11-abcdef01` })));
    } finally {
      if (original) Object.defineProperty(navigator, "share", original);
      else Reflect.deleteProperty(navigator, "share");
    }
  });

  it("shows the invite-link error and can recover on retry", async () => {
    search.value = "mode=invite";
    let available = false;
    vi.stubGlobal("fetch", vi.fn(async () => available
      ? ok({ invite: { inviteCode: "r11-abcdef01" } })
      : fail(503, { error: "Personal invites are not available yet" })));
    renderWithQuery(<Invite />);
    expect(await screen.findByText("Personal invites are not available yet")).toBeTruthy();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/\/verify\?invite=r11-abcdef01/)).toBeTruthy();
  });
});
