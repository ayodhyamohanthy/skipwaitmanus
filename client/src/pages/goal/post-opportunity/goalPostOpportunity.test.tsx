// @vitest-environment jsdom
// D-048-p3-post: flag-off parity (kit wizard untouched) and flag-on goal
// rebuild for /post-opportunity. Mocks follow client/src/pages/postOpportunity.test.tsx.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PostOpportunity from "../../PostOpportunity";

const { authState, go, surfaces } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true }, go: vi.fn(), surfaces: { on: new Set<string>() } }));
const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: "12", getToken }), useUser: () => ({ user: null }) }));
vi.mock("@/hooks/useCreditBalance", () => ({ useCreditBalance: () => null }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: (id: string) => surfaces.on.has(id) }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/post-opportunity", go],
}));

const ACCESS_PATH = "/api/company-referrals/access";
const verified = { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" };
const unverified = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, json: unknown) => ({ ok: false, status, json: async () => json });
const renderPost = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })}><PostOpportunity /></QueryClientProvider>);

beforeEach(() => { surfaces.on = new Set(["post-opportunity"]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); go.mockClear(); authState.isLoaded = true; authState.isSignedIn = true; });

describe("Goal /post-opportunity flag gate", () => {
  it("renders the kit wizard untouched when the flag is off", async () => {
    surfaces.on = new Set();
    vi.stubGlobal("fetch", vi.fn(async () => ok(verified)));
    renderPost();
    expect(await screen.findByText("What are you sharing?")).toBeTruthy();
    expect(screen.queryByText("Share one useful signal.")).toBeNull();
  });
});

describe("Goal /post-opportunity access gate", () => {
  it("holds unverified employees at the work-email gate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(unverified)));
    renderPost();
    expect(await screen.findByText("Verify your work email first.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verify work email" }));
    expect(go).toHaveBeenCalledWith("/referrer?returnTo=%2Fpost-opportunity");
    expect(screen.queryByLabelText("Role or job title")).toBeNull();
  });

  it("holds signed-out visitors at the same gate", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn(async () => ok(unverified));
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    expect(await screen.findByText("Verify your work email first.")).toBeTruthy();
    expect(screen.queryByLabelText("Role or job title")).toBeNull();
  });

  it("shows a retryable error when the access check fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(503, { error: "We could not check your work-email verification." })));
    renderPost();
    expect(await screen.findByText("We couldn’t check your company access")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Verify your work email first.")).toBeNull();
  });
});

describe("Goal /post-opportunity wizard", () => {
  it("publishes a hiring-now opportunity privately and confirms", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ACCESS_PATH) return ok(verified);
      if (url === "/api/opportunities" && init?.method === "POST") return ok({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    expect(await screen.findByText("Share one useful signal.")).toBeTruthy();
    expect(screen.getByText(/STEP 1 OF 2/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Add useful details.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Public job link/i), { target: { value: "https://careers.acme.com/jobs/design" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish privately/ }));
    expect(await screen.findByText("Your opportunity is live.")).toBeTruthy();
    const post = fetchMock.mock.calls.find(call => call[0] === "/api/opportunities");
    expect(String(post?.[1]?.body)).toContain('"kind":"hiring_now"');
    expect(String(post?.[1]?.body)).toContain("Product Designer");
    expect(String(post?.[1]?.body)).not.toContain("showPosterFirstName");
    expect(screen.getByText(/Your identity is never shown/)).toBeTruthy();
    expect(screen.queryByText("employee@acme.com")).toBeNull();
  });

  it("keeps the poster first name off the payload unless opted in", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ACCESS_PATH) return ok(verified);
      if (url === "/api/opportunities" && init?.method === "POST") return ok({ opportunity: { companyDomain: "acme.com", roleTitle: "Analyst" } });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Analyst" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Show my first name/ }));
    fireEvent.click(screen.getByRole("button", { name: /Publish privately/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === "/api/opportunities")).toBeTruthy());
    const post = fetchMock.mock.calls.find(call => call[0] === "/api/opportunities");
    expect(String(post?.[1]?.body)).toContain('"showPosterFirstName":true');
  });

  it("pins compensation payload parity with the server contract", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ACCESS_PATH) return ok(verified);
      if (url === "/api/opportunities" && init?.method === "POST") return ok({ opportunity: { companyDomain: "acme.com", roleTitle: "Designer" } });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.change(await screen.findByLabelText("Compensation"), { target: { value: "30-40 LPA" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish privately/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === "/api/opportunities")).toBeTruthy());
    const post = fetchMock.mock.calls.find(call => call[0] === "/api/opportunities");
    expect(String(post?.[1]?.body)).toContain('"compensation":"30-40 LPA"');
  });

  it("omits the compensation key from the payload when the field is left blank", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ACCESS_PATH) return ok(verified);
      if (url === "/api/opportunities" && init?.method === "POST") return ok({ opportunity: { companyDomain: "acme.com", roleTitle: "Designer" } });
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Publish privately/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === "/api/opportunities")).toBeTruthy());
    const post = fetchMock.mock.calls.find(call => call[0] === "/api/opportunities");
    expect(String(post?.[1]?.body)).not.toContain('"compensation"');
  });

  it("labels the job link as required for hiring-now and optional for walk-in", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === ACCESS_PATH) return ok(verified);
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Add useful details.");
    expect(screen.getByText("Public job link", { exact: true })).toBeTruthy();
    expect(screen.queryByText("Public job link (optional)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Walk-in/ }));
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Add useful details.");
    expect(screen.getByText("Public job link (optional)", { exact: true })).toBeTruthy();
    expect(screen.getByText("Location", { exact: true })).toBeTruthy();
    expect(screen.queryByText("Location (optional)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2026-11-02T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Ends at", { exact: true });
    expect(screen.queryByText("Ends at (optional)")).toBeNull();
  });

  it("switches the privacy line when the first-name opt-in is ticked", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === ACCESS_PATH) return ok(verified);
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Designer" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    await screen.findByText("Add useful details.");
    expect(screen.getByText(/Your name and work email never appear on the card/)).toBeTruthy();
    expect(screen.queryByText(/Your first name appears on the card/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Show my first name/ }));
    expect(await screen.findByText(/Your first name appears on the card/)).toBeTruthy();
    expect(screen.queryByText(/Your name and work email never appear on the card/)).toBeNull();
  });

  it("requires a start time before a walk-in can reach timing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === ACCESS_PATH ? ok(verified) : ok({}))));
    renderPost();
    fireEvent.change(await screen.findByLabelText("Role or job title"), { target: { value: "Open house" } });
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText(/STEP 2 OF 3/)).toBeTruthy();
    expect(screen.getByLabelText("Starts at")).toBeTruthy();
  });
});
