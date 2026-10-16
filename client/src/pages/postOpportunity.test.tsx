// @vitest-environment jsdom
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import PostOpportunity from "./PostOpportunity";

const { authState, go } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true }, go: vi.fn() }));
const getToken = vi.fn().mockResolvedValue("test-token");
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: "12", getToken }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ["/post-opportunity", go],
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); getToken.mockClear(); go.mockClear(); authState.isLoaded = true; authState.isSignedIn = true; });

const renderPost = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })}><PostOpportunity /></QueryClientProvider>);
const ACCESS_PATH = "/api/company-referrals/access";
const VERIFIED = { ok: true, status: 200, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" }) };

describe("verified employee opportunity post", () => {
  it("publishes a Hiring now opportunity only with the session token and confirms that the employee identity remains off-card", async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url === "/api/company-referrals/access" ? { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) } : { ok: true, json: async () => ({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Public job link/i), { target: { value: "https://careers.acme.com/jobs/design" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish privately" }));
    await waitFor(() => expect(screen.getByText("Your opportunity is live.")).toBeTruthy());
    expect(getToken).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/company-referrals/access");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/opportunities");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("Product Designer");
    expect(screen.queryByText("employee@acme.com")).toBeNull();
  });

  it("collects the optional pay range and submits it with the opportunity", async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url === "/api/company-referrals/access" ? { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) } : { ok: true, json: async () => ({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const compensationInput = await screen.findByLabelText("Compensation");
    expect(compensationInput).toBeTruthy();
    expect(compensationInput.getAttribute("placeholder")).toContain("₹12–18 LPA or $80k–$110k");
    expect(screen.getByText("One line for the public pay range. Leave blank if you prefer not to share.")).toBeTruthy();
    fireEvent.change(compensationInput, { target: { value: "₹12–18 LPA" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish privately" }));
    await waitFor(() => expect(screen.getByText("Your opportunity is live.")).toBeTruthy());
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain('"compensation":"₹12–18 LPA"');
  });

  it("requires a start time when the verified employee selects a Walk-in", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) })));
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.click(screen.getByRole("button", { name: "Walk-in" }));
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Walk-in hiring" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Starts at")).toBeTruthy();
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
  });

  it("routes signed-out employees to the company-email-only sign-in flow before collecting opportunity fields", async () => {
    authState.isSignedIn = false;
    renderPost();
    await screen.findByText("Verify your work email first.");
    fireEvent.click(screen.getByRole("button", { name: "Verify work email" }));
    expect(go).toHaveBeenCalledWith("/referrer?returnTo=%2Fpost-opportunity");
  });

  it("blocks a signed-in personal account before it can start the opportunity wizard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ verifiedCompanyAccess: false, workEmailDomain: null }) })));
    renderPost();
    await screen.findByText("Verify your work email first.");
    expect(screen.queryByLabelText("Role or job title")).toBeNull();
  });

  it("shows a checking state, never the gate, while the verification check runs", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    renderPost();
    expect(await screen.findByText("Checking your company access…")).toBeTruthy();
    expect(screen.queryByText("Verify your work email first.")).toBeNull();
    expect(screen.queryByLabelText("Role or job title")).toBeNull();
  });

  it("shows a failed verification check as a retryable error, never the gate, then opens the wizard on retry", async () => {
    let access: { ok: boolean; status: number; json: () => Promise<unknown> } = { ok: false, status: 500, json: async () => ({ error: "We could not check your company-email access" }) };
    const fetchMock = vi.fn(async (url: string) => (url === ACCESS_PATH ? access : { ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t check your company access");
    expect(alert.textContent).toContain("We could not check your company-email access");
    expect(alert.textContent).toContain("Nothing changed on your account.");
    expect(screen.queryByText("Verify your work email first.")).toBeNull();
    expect(screen.queryByLabelText("Role or job title")).toBeNull();
    access = VERIFIED;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Role or job title")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a malformed verification reply as an error, not as unverified", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ opportunities: [] }) })));
    renderPost();
    expect(await screen.findByText("We couldn’t check your company access")).toBeTruthy();
    expect(screen.queryByText("Verify your work email first.")).toBeNull();
  });

  it("lets the poster close one of their own openings and removes it from the list", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/company-referrals/access") return { ok: true, json: async () => ({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" }) };
      if (url === "/api/opportunities/mine") return { ok: true, json: async () => ({ opportunities: [{ id: 7, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }] }) };
      if (url === "/api/opportunities/7/close" && init?.method === "POST") return { ok: true, json: async () => ({ closed: true }) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.click(await screen.findByRole("button", { name: "Your openings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close Product Designer" }));
    await waitFor(() => expect(screen.getByText("You have no live openings.")).toBeTruthy());
    expect(fetchMock.mock.calls.some(call => call[0] === "/api/opportunities/7/close")).toBe(true);
  });
});
