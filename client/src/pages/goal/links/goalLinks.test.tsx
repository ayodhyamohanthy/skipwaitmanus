// @vitest-environment jsdom
// D-048-p3-links (packet docs/plans/D-048-public.md): flag-off parity and the
// flag-on goal rebuild of the three signed-out link landings:
// /fast/:linkCode, /refer/:companySlug/:vanityAlias and /share-card/:token.
// Pins: kit untouched with the flag off; goal page contract with it on; the
// sign-in handoff keeps the link's intent exactly (D-153); expired, invalid and
// malformed links render an honest state with one way forward.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertGoalPage } from "@/test/goalPageContract";
import FastTrackLink from "../../FastTrackLink";
import VanityFastTrackLink from "../../VanityFastTrackLink";
import ShareCard from "../../ShareCard";

const { go, surfaces, route } = vi.hoisted(() => ({
  go: vi.fn(),
  surfaces: { on: new Set<string>() },
  route: { params: {} as Record<string, string> | undefined },
}));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: false, isLoaded: true, getToken: vi.fn() }) }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/", go],
  useRoute: () => [route.params !== undefined, route.params],
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const ACTIVE_LINK = { link: { companyDomain: "acme.example", isActive: true } };
const ACCEPTED_CARD = { card: { companyDomain: "acme.example", status: "accepted", inviteCode: "r1-deadbeef" } };

const setOnline = (value: boolean) => Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });

// Warm the lazily imported goal modules so the first render does not race findBy's timeout.
beforeAll(async () => { await import("./GoalPrivateLinkLanding"); await import("./GoalShareCard"); }, 30_000);
beforeEach(() => { surfaces.on = new Set(["links"]); setOnline(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); go.mockClear(); setOnline(true); });

describe("/fast/:linkCode", () => {
  beforeEach(() => { route.params = { linkCode: "abc123" }; });

  it("renders the kit landing untouched when the links flag is off", async () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok(ACTIVE_LINK)));
    render(<FastTrackLink />);
    expect(await screen.findByText("Request a referral at acme.example.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start private request/ })).toBeTruthy();
    expect(screen.queryByText("Get referred at acme.example.")).toBeNull();
    expect(document.querySelector("[data-g-primary]")).toBeNull();
  });

  it("opens with the goal and one commit that keeps the link through /start", async () => {
    const fetchMock = vi.fn(async () => ok(ACTIVE_LINK));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<FastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at acme.example." })).toBeTruthy();
    assertGoalPage(container, { goalLine: "Get referred at acme.example." });
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer-fast-track/abc123", expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByText(/identity stays private/i)).toBeTruthy();
    expect(screen.getByText(/does not bypass the employer’s application process or guarantee a referral/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start your referral request" }));
    expect(go).toHaveBeenCalledWith("/start?fast=abc123");
  });

  it("encodes the link code in the fetch and the handoff", async () => {
    route.params = { linkCode: "a b/c" };
    const fetchMock = vi.fn(async () => ok(ACTIVE_LINK));
    vi.stubGlobal("fetch", fetchMock);
    render(<FastTrackLink />);
    fireEvent.click(await screen.findByRole("button", { name: "Start your referral request" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer-fast-track/a%20b%2Fc", expect.anything());
    expect(go).toHaveBeenCalledWith("/start?fast=a%20b%2Fc");
  });

  it("keeps a 36-character company domain intact in the goal line and the body", async () => {
    const longDomain = "fabrikaminternationalholding.example";
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { companyDomain: longDomain, isActive: true } })));
    render(<FastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: `Get referred at ${longDomain}.` })).toBeTruthy();
    expect(screen.getByText(new RegExp(`A verified employee at ${longDomain} shared this link`))).toBeTruthy();
  });

  it("shows a loading state before the link answers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<FastTrackLink />);
    expect((await screen.findByRole("status")).getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("[data-g-primary]")).toBeNull();
  });

  it("says an expired link is unavailable, changes nothing, and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? fail(410, { error: "This private referral link has expired" }) : ok(ACTIVE_LINK);
    }));
    const { container } = render(<FastTrackLink />);
    expect((await screen.findByRole("alert")).textContent).toContain("This private referral link has expired");
    assertGoalPage(container, { goalLine: "This private link isn’t available." });
    expect(screen.getByText(/Nothing was changed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a referral request" }).getAttribute("href")).toBe("/start");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at acme.example." })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });

  it("treats a malformed answer as unavailable instead of loading forever", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ link: { isActive: true } })));
    render(<FastTrackLink />);
    expect((await screen.findByRole("alert")).textContent).toContain("This private referral link is unavailable");
    expect(screen.queryByRole("button", { name: "Start your referral request" })).toBeNull();
  });

  it("says when the visitor is offline", async () => {
    setOnline(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<FastTrackLink />);
    expect((await screen.findByRole("alert")).textContent).toContain("You’re offline");
  });
});

describe("/refer/:companySlug/:vanityAlias", () => {
  beforeEach(() => { route.params = { companySlug: "acme", vanityAlias: "jordan" }; });

  it("renders the kit landing untouched when the links flag is off", async () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok(ACTIVE_LINK)));
    render(<VanityFastTrackLink />);
    expect(await screen.findByText("Request a referral at acme.example.")).toBeTruthy();
    expect(screen.queryByText("Get referred at acme.example.")).toBeNull();
    expect(document.querySelector("[data-g-primary]")).toBeNull();
  });

  it("opens with the goal and keeps company and alias through /start", async () => {
    const fetchMock = vi.fn(async () => ok(ACTIVE_LINK));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<VanityFastTrackLink />);
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at acme.example." })).toBeTruthy();
    assertGoalPage(container, { goalLine: "Get referred at acme.example." });
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer-fast-track/vanity/acme/jordan", expect.objectContaining({ cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: "Start your referral request" }));
    expect(go).toHaveBeenCalledWith("/start?referCompany=acme&referAlias=jordan");
  });

  it("says an invalid link is unavailable and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? fail(404, {}) : ok(ACTIVE_LINK);
    }));
    const { container } = render(<VanityFastTrackLink />);
    expect((await screen.findByRole("alert")).textContent).toContain("This private referral link is unavailable");
    assertGoalPage(container, { goalLine: "This private link isn’t available." });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Get referred at acme.example." })).toBeTruthy();
    expect(attempts).toBe(2);
  });
});

describe("/share-card/:token", () => {
  const TOKEN = "c".repeat(32);
  beforeEach(() => { route.params = { token: TOKEN }; });

  it("renders the kit card untouched when the links flag is off", async () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok(ACCEPTED_CARD)));
    render(<ShareCard />);
    expect(await screen.findByText("Accepted at acme.example")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get your own referral" }).getAttribute("href")).toBe("/start?invite=r1-deadbeef");
    expect(document.querySelector("[data-g-primary]")).toBeNull();
  });

  it("opens with the visitor's goal, states only the fact, and keeps the sharer's invite", async () => {
    const fetchMock = vi.fn(async () => ok(ACCEPTED_CARD));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ShareCard />);
    expect(await screen.findByRole("heading", { level: 1, name: "Get your own referral." })).toBeTruthy();
    assertGoalPage(container, { goalLine: "Get your own referral." });
    expect(fetchMock).toHaveBeenCalledWith(`/api/referral-share-cards/public/${TOKEN}`, expect.objectContaining({ credentials: "omit" }));
    expect(screen.getByText(/A private referral request was accepted at/)).toBeTruthy();
    expect(screen.getByText("Shared voluntarily. No hiring outcome is implied.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start your referral request" }).getAttribute("href")).toBe("/start?invite=r1-deadbeef");
  });

  it("falls back to a plain /start when the card carries no invite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ card: { companyDomain: "acme.example", status: "accepted" } })));
    render(<ShareCard />);
    expect((await screen.findByRole("link", { name: "Start your referral request" })).getAttribute("href")).toBe("/start");
  });

  it("says a removed card is unavailable and recovers through Try again", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? fail(404, {}) : ok(ACCEPTED_CARD);
    }));
    const { container } = render(<ShareCard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    assertGoalPage(container, { goalLine: "This share card isn’t available." });
    expect(screen.getByRole("link", { name: "Start a referral request" }).getAttribute("href")).toBe("/start");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Get your own referral." })).toBeTruthy());
    expect(attempts).toBe(2);
  });

  it("treats a card that is not accepted as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ card: { companyDomain: "acme.example", status: "pending" } })));
    render(<ShareCard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/was accepted at/)).toBeNull();
  });

  it("fetches nothing without a token", async () => {
    route.params = { token: "" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ShareCard />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
