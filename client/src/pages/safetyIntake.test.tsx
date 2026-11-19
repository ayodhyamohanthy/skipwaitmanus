// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import SuggestCompany from "./SuggestCompany";
import "./goal/seeker-small/GoalSuggestCompany";

const { authState, go } = vi.hoisted(() => ({ authState: { isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token") }, go: vi.fn() }));

vi.mock("@/_core/auth", () => ({ useAuth: () => authState, SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/report", go],
}));

beforeEach(() => { authState.isSignedIn = true; go.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });

// The duplicate hint reads the server directory (GET /api/companies).
const DIRECTORY = { companies: LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true })), openCount: LAUNCH_COMPANY_SEED.length };
const renderSuggest = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SuggestCompany /></QueryClientProvider>);
const postsOf = (fetchMock: { mock: { calls: unknown[][] } }) => fetchMock.mock.calls.filter(call => (call[1] as RequestInit | undefined)?.method === "POST");

describe("SuggestCompany flow", () => {
  it("flags listed companies and submits new ones with role and limit errors", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.companyName === "Delta") return { ok: false, status: 400, json: async () => ({ error: "You can suggest up to 3 companies a day" }) };
        return ok({ suggestion: { id: 5, companyName: body.companyName } });
      }
      return url === "/api/companies" ? ok(DIRECTORY) : ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSuggest();
    await screen.findByRole("button", { name: "Submit for review" });
    expect(screen.queryByText(/DESIGN PREVIEW|NOTHING IS SUBMITTED/i)).toBeNull();
    const submit = () => screen.getByRole("button", { name: "Submit for review" });
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    // A partial name already flags the listed company.
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Wip" } });
    expect(await screen.findByText(/Wipro is already on skipwait.me/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/explore/wipro");
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Delta" } });
    // A website is required before Submit.
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByPlaceholderText("freshworks.com"), { target: { value: "delta.com" } });
    fireEvent.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("up to 3 companies a day");
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Acme Corp" } });
    fireEvent.change(screen.getByPlaceholderText("freshworks.com"), { target: { value: "not a site" } });
    expect(screen.queryByText(/Enter the company website/)).toBeNull();
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByPlaceholderText("freshworks.com"), { target: { value: "acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Working there now/ }));
    fireEvent.click(submit());
    expect(await screen.findByText(/Acme Corp is in review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Verify work email" }).getAttribute("href")).toBe("/verify");
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(posts[posts.length - 1]?.[1]?.body))).toEqual({ companyName: "Acme Corp", website: "https://acme.com", role: "employee" });
  });

  it("keeps a website the visitor typed with a scheme and offers an invite to seekers", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => (url === "/api/companies" ? ok(DIRECTORY) : ok({ suggestion: { id: 6, companyName: JSON.parse(String(init?.body)).companyName } })));
    vi.stubGlobal("fetch", fetchMock);
    renderSuggest();
    await screen.findByRole("button", { name: "Submit for review" });
    fireEvent.change(screen.getByPlaceholderText("e.g. Freshworks"), { target: { value: "Zerodha" } });
    fireEvent.change(screen.getByPlaceholderText("freshworks.com"), { target: { value: "http://zerodha.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText(/Zerodha is in review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite someone" }).getAttribute("href")).toBe("/invite?mode=invite");
    expect(JSON.parse(String((postsOf(fetchMock)[0]?.[1] as RequestInit | undefined)?.body))).toEqual({ companyName: "Zerodha", website: "http://zerodha.com", role: "seeker" });
  });

  it("asks signed-out visitors to sign in instead of showing the form", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn(async () => ok({}));
    vi.stubGlobal("fetch", fetchMock);
    renderSuggest();
    expect(await screen.findByRole("button", { name: /Sign in/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText("e.g. Freshworks")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
