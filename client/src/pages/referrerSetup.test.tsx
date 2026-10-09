// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReferrerSetup from "./ReferrerSetup";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, userId: "11", getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children, className }: { children?: React.ReactNode; className?: string }) => <button type="button" className={className}>{children ?? "Sign in"}</button> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/referrer-setup", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderSetup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ReferrerSetup /></QueryClientProvider>);
const PREFS = { preferAreas: [], preferLevels: [], referralCapacity: 3, referrerVisibility: "anon", notifyNewAsk: true, notifyDigest: false, paused: false };

function stubSetup(preferences: Record<string, unknown> = PREFS) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
    if (String(url).endsWith("/referrer-preferences")) return ok({ preferences });
    return ok({});
  }));
}

describe("ReferrerSetup", () => {
  it("gates setup behind verification without inventing state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ verifiedCompanyAccess: false, workEmailDomain: null })));
    renderSetup();
    expect(await screen.findByText("Verify first.")).toBeTruthy();
    expect(screen.queryByText("Which roles can you judge?")).toBeNull();
    expect(screen.getByRole("link", { name: /Verify work email/ }).getAttribute("href")).toBe("/verify");
  });

  it("seeds the steps from saved preferences and names the verified company", async () => {
    stubSetup({ ...PREFS, preferAreas: ["Design"], preferLevels: ["Mid-level", "Senior"] });
    renderSetup();
    expect(await screen.findByText("Verified at Wipro")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Design" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Senior" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Engineering" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText("How many asks a month?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back/ })).toBeTruthy();
  });

  it("walks areas to ready and persists real preferences", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (String(url).endsWith("/referrer-preferences") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({ referralCapacity: 5, referrerVisibility: "named", notifyNewAsk: false });
        expect(body.preferAreas).toEqual(["Design", "Product"]);
        expect(body.preferLevels).toEqual(["Mid-level", "Senior"]);
        return ok({ preferences: body });
      }
      if (String(url).endsWith("/referrer-preferences")) return ok({ preferences: PREFS });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSetup();
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    fireEvent.click(screen.getByRole("button", { name: "Mid-level" }));
    fireEvent.click(screen.getByRole("button", { name: "Senior" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(screen.getByLabelText("Monthly capacity"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Named on company pages/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Email when a new ask arrives/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText("You're open for asks.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Go to referrer home/ }).getAttribute("href")).toBe("/referrer-home");
    expect(fetchMock).toHaveBeenCalledWith("/api/referrer-preferences", expect.objectContaining({ method: "PUT" }));
  });

  it("does not claim you are open for asks while new asks are paused", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (init?.method === "PUT") return ok({ preferences: { ...PREFS, ...JSON.parse(String(init.body)), paused: true } });
      return ok({ preferences: { ...PREFS, preferAreas: ["Design"], paused: true } });
    }));
    renderSetup();
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText("Setup saved. New asks are paused.")).toBeTruthy();
    expect(screen.queryByText("You're open for asks.")).toBeNull();
  });

  it("keeps the steps and shows the server's reason when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (init?.method === "PUT") return fail(400, { error: "Capacity is 1 to 15 asks" });
      return ok({ preferences: { ...PREFS, preferAreas: ["Design"] } });
    }));
    renderSetup();
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    for (let i = 0; i < 3; i += 1) fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(await screen.findByText("Capacity is 1 to 15 asks")).toBeTruthy();
    expect(screen.getByText("When should we tell you?")).toBeTruthy();
  });

  it("requires at least one area before continuing", async () => {
    stubSetup();
    renderSetup();
    expect(await screen.findByText("Which roles can you judge?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Continue/ }).hasAttribute("disabled")).toBe(true);
  });

  it("shows a retryable error, not the verify gate, when settings cannot load", async () => {
    let failing = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).endsWith("/access")) return ok({ verifiedCompanyAccess: true, workEmailDomain: "wipro.com" });
      if (failing) throw new TypeError("Failed to fetch");
      return ok({ preferences: PREFS });
    }));
    renderSetup();
    expect(await screen.findByText("We could not load your setup.")).toBeTruthy();
    expect(screen.queryByText("Verify first.")).toBeNull();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Which roles can you judge?")).toBeTruthy());
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderSetup();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
