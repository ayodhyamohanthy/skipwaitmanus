// @vitest-environment jsdom
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const publicJobLink = screen.getByLabelText("Public job link") as HTMLInputElement;
    expect(publicJobLink.closest("label")?.textContent).toContain("(required)");
    expect(publicJobLink.required).toBe(true);
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
    fireEvent.change(screen.getByLabelText("Public job link"), { target: { value: "https://careers.acme.com/jobs/design" } });
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
    const publicJobLink = screen.getByLabelText("Public job link") as HTMLInputElement;
    expect(publicJobLink.closest("label")?.textContent).toContain("(optional)");
    expect(publicJobLink.required).toBe(false);
    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
  });

  it("keeps the card anonymous by default and publishes without a name choice", async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url === ACCESS_PATH ? VERIFIED : { ok: true, status: 201, json: async () => ({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const toggle = (await screen.findByLabelText(/Show my first name/)) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    const footerCopy = screen.getByText(/Your company is confirmed only when you publish/).textContent ?? "";
    expect(footerCopy).toContain("Your name and work email never appear on the card.");
    expect(footerCopy).not.toContain("Your first name appears on the card.");
    fireEvent.change(screen.getByLabelText("Public job link"), { target: { value: "https://careers.acme.com/jobs/design" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish privately" }));
    await waitFor(() => expect(screen.getByText("Your opportunity is live.")).toBeTruthy());
    expect(String(fetchMock.mock.calls[1][1]?.body)).not.toContain("showPosterFirstName");
    expect(screen.getByText(/Your identity is never shown/)).toBeTruthy();
  });

  it("shows the first name on the card only after the poster opts in", async () => {
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => url === ACCESS_PATH ? VERIFIED : { ok: true, status: 201, json: async () => ({ opportunity: { companyDomain: "acme.com", roleTitle: "Product Designer" } }) });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.change(screen.getByLabelText("Role or job title"), { target: { value: "Product Designer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByLabelText(/Show my first name/));
    const footerCopy = screen.getByText(/Your company is confirmed only when you publish/).textContent ?? "";
    expect(footerCopy).toContain("Your first name appears on the card. Your last name and work email never appear.");
    expect(footerCopy).not.toContain("Your name and work email never appear on the card.");
    fireEvent.change(screen.getByLabelText("Public job link"), { target: { value: "https://careers.acme.com/jobs/design" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish privately" }));
    await waitFor(() => expect(screen.getByText("Your opportunity is live.")).toBeTruthy());
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ showPosterFirstName: true });
    expect(screen.getByText(/Your first name is shown on the card/)).toBeTruthy();
    expect(screen.getByText(/Your last name and work email never appear/)).toBeTruthy();
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

});

describe("poster's openings list", () => {
  const ownerPost = (over: Record<string, unknown> = {}) => ({ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-01T09:00:00.000Z", expiresAt: "2026-11-01T09:00:00.000Z", poster: { kind: "anonymous" }, isActive: true, expired: false, renewable: false, ...over });

  it("opens Your openings, renews a lapsed role and closes it in one tap", async () => {
    let mineCall = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === ACCESS_PATH) return VERIFIED;
      if (url === "/api/opportunities/mine") {
        mineCall += 1;
        const opportunities = [mineCall === 1 ? ownerPost({ expired: true, renewable: true, expiresAt: "2026-10-11T09:00:00.000Z" }) : mineCall === 2 ? ownerPost() : ownerPost({ isActive: false, renewable: true })];
        return { ok: true, status: 200, json: async () => ({ opportunities }) };
      }
      if (url === "/api/opportunities/91/renew") return { ok: true, status: 200, json: async () => ({ renewed: true, id: 91, expiresAt: "2026-11-16T09:00:00.000Z" }) };
      if (url === "/api/opportunities/91/close") return { ok: true, status: 200, json: async () => ({ closed: true, id: 91 }) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.click(screen.getByRole("button", { name: "Your openings" }));
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.getByText(/^Lapsed /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Renew Product Designer 30 days" }));
    await waitFor(() => expect(screen.getByText(/^Live until /)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Close Product Designer" }));
    await waitFor(() => expect(screen.getByText("Closed")).toBeTruthy());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/opportunities/mine")).toHaveLength(3);
  });

  it("shows a failed openings read and a failed action honestly, retrying only on request", async () => {
    let failList = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === ACCESS_PATH) return VERIFIED;
      if (url === "/api/opportunities/mine") {
        if (failList) return { ok: false, status: 500, json: async () => ({ error: "We could not load your openings" }) };
        return { ok: true, status: 200, json: async () => ({ opportunities: [ownerPost({ expired: true, renewable: true })] }) };
      }
      if (url === "/api/opportunities/91/renew") return { ok: false, status: 500, json: async () => ({ error: "We could not renew this opening" }) };
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    await screen.findByLabelText("Role or job title");
    fireEvent.click(screen.getByRole("button", { name: "Your openings" }));
    const alert = await screen.findByRole("alert", undefined, { timeout: 5000 });
    expect(alert.textContent).toContain("We couldn’t load your openings");
    expect(alert.textContent).toContain("We could not load your openings");
    failList = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Renew Product Designer 30 days" }));
    const actionAlert = await screen.findByRole("alert");
    expect(actionAlert.textContent).toContain("We could not renew this opening");
    // The failed action never removes the list behind it.
    expect(screen.getByText("Product Designer")).toBeTruthy();
  });

  // Re-added from the pre-merge #304 pin (Instinct Agent): same guarantee — the
  // owner closes one of their own openings and the refreshed server list no
  // longer carries it. The row is the full owner contract, and the list renders
  // from the reloaded payload rather than from local filtering.
  it("lets the poster close one of their own openings and removes it from the list", async () => {
    let closed = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === ACCESS_PATH) return VERIFIED;
      if (url === "/api/opportunities/mine") return { ok: true, status: 200, json: async () => ({ opportunities: closed ? [] : [ownerPost({ id: 7 })] }) };
      if (url === "/api/opportunities/7/close" && init?.method === "POST") { closed = true; return { ok: true, status: 200, json: async () => ({ closed: true, id: 7 }) }; }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPost();
    fireEvent.click(await screen.findByRole("button", { name: "Your openings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close Product Designer" }));
    await waitFor(() => expect(screen.getByText("No roles yet.")).toBeTruthy());
    expect(fetchMock.mock.calls.some(call => call[0] === "/api/opportunities/7/close")).toBe(true);
  });
});
