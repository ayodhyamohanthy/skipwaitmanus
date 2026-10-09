// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployerDashboard from "./EmployerDashboard";
import { creditActivity, isJustJoined } from "@/components/employer/employerData";

const { isSignedIn } = vi.hoisted(() => ({ isSignedIn: { value: true } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: isSignedIn.value }), SignInButton: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/components/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));

const NOW = new Date("2026-10-08T04:30:00.000Z").getTime();
const account = { id: 1, companyName: "Acme Robotics", billingEmail: "hiring@acme.com", credits: 25, budgetMonthlyUsdCents: 50000, approvalStatus: "approved" };
const roles = [{ id: 1, isActive: true, isSponsored: true }, { id: 2, isActive: true, isSponsored: false }, { id: 3, isActive: false, isSponsored: false }];
const spend = [
  { kind: "credit_purchase", creditsAdded: 25, pack: "starter", createdAt: "2026-10-01T10:00:00.000Z" },
  { kind: "profile_unlock", creditsSpent: 1, displayRef: "Access record", createdAt: "2026-10-05T10:00:00.000Z" },
  { kind: "sponsorship", creditsSpent: 5, tier: "featured", createdAt: "2026-10-02T10:00:00.000Z" },
  { kind: "profile_unlock", creditsSpent: 1, displayRef: "Access record", createdAt: "2026-08-01T10:00:00.000Z" },
];

type Reply = { status: number; body: unknown };
type Overrides = { account?: Reply; roles?: Reply; spend?: Reply };
const ok = (body: unknown): Reply => ({ status: 200, body });
const fetchMock = vi.fn();

function stubFetch(overrides: Overrides = {}) {
  const replies: Record<string, Reply> = {
    "/api/employer/account": overrides.account ?? ok({ account }),
    "/api/employer/opportunities": overrides.roles ?? ok({ opportunities: roles }),
    "/api/employer/spend-history": overrides.spend ?? ok({ spend }),
  };
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/employer/account" && init?.method === "POST") return { ok: true, status: 201, url, json: async () => ({ account: { ...account, companyName: "Globex", credits: 0, budgetMonthlyUsdCents: 0 } }) };
    const reply = replies[url] ?? ok({});
    return { ok: reply.status < 400, status: reply.status, url, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><EmployerDashboard /></QueryClientProvider>);
}

beforeEach(() => { isSignedIn.value = true; fetchMock.mockReset(); stubFetch(); vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("EmployerDashboard", () => {
  it("shows the sign-in gate for signed-out visitors", () => {
    isSignedIn.value = false;
    renderPage();
    expect(screen.getByText("Hire without the noise.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the kit overview from the live account, roles and credit ledger", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Your hiring, warmer.")).toBeTruthy());
    expect(screen.getByText("EMPLOYER · ACME ROBOTICS")).toBeTruthy();
    expect(screen.getByText("ACME ROBOTICS ON SKIPWAIT")).toBeTruthy();
    const stat = (label: string) => screen.getByText(label).parentElement?.querySelector("strong")?.textContent;
    expect(stat("Unlock credits")).toBe("25");
    expect(stat("Monthly budget")).toBe("$500");
    expect(stat("Live roles")).toBe("2");
    expect(stat("Sponsored now")).toBe("1");
    expect(screen.getByText("Credit activity · last 30 days")).toBeTruthy();
    // The August unlock is outside the 30-day window.
    expect(screen.getByText("Spent on profile unlocks").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("FROM YOUR CREDIT LEDGER")).toBeTruthy();
    expect(screen.queryByText(/EXAMPLE NUMBERS|Verified referrers|Asks received/)).toBeNull();
  });

  it("keeps every live employer tool reachable from the workspace nav", async () => {
    renderPage();
    const nav = await screen.findByRole("navigation", { name: "Employer tools" });
    const hrefs = within(nav).getAllByRole("link").map(link => link.getAttribute("href"));
    expect(hrefs).toEqual(["/employer", "/employer/talent", "/employer/opportunities", "/employer/billing"]);
    expect(screen.getByRole("link", { name: /For companies/ }).getAttribute("href")).toBe("/for-companies");
  });

  it("shows the just-joined checklist when nothing has happened yet", async () => {
    stubFetch({ account: ok({ account: { ...account, credits: 0, budgetMonthlyUsdCents: 0 } }), roles: ok({ opportunities: [] }), spend: ok({ spend: [] }) });
    renderPage();
    await waitFor(() => expect(screen.getByText("Welcome. Let's open your first doors.")).toBeTruthy());
    expect(screen.getByRole("link", { name: /Buy unlock credits/ }).getAttribute("href")).toBe("/employer/billing");
    expect(screen.getByRole("link", { name: /Browse opt-in talent/ }).getAttribute("href")).toBe("/employer/talent");
    expect(screen.getByRole("link", { name: /Sponsor a role \(optional\)/ }).getAttribute("href")).toBe("/employer/opportunities");
    expect(screen.queryByText("Credit activity · last 30 days")).toBeNull();
  });

  it("explains a pending application instead of linking into tools that would refuse", async () => {
    stubFetch({ account: ok({ account: { ...account, credits: 0, budgetMonthlyUsdCents: 0, approvalStatus: "pending" } }), roles: { status: 403, body: { error: "Employer access is required" } }, spend: { status: 403, body: { error: "Employer access is required" } } });
    renderPage();
    await waitFor(() => expect(screen.getByText("Your employer application is in review")).toBeTruthy());
    expect(screen.getByText("Live roles").parentElement?.querySelector("strong")?.textContent).toBe("—");
    expect(screen.queryByText("Get started")).toBeNull();
  });

  it("shows a retryable error when the activity lookup fails, without hiding the account", async () => {
    stubFetch({ spend: { status: 500, body: { error: "We could not load your spend history" } } });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("We could not load your employer activity")).toBeTruthy();
    expect(screen.getByText("Unlock credits")).toBeTruthy();
    stubFetch();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Credit activity · last 30 days")).toBeTruthy());
  });

  it("shows the become-an-employer upsell and opens an account with Get started", async () => {
    stubFetch({ account: ok({ account: null }) });
    renderPage();
    await waitFor(() => expect(screen.getByText("Become an employer on skipwait.me")).toBeTruthy());
    expect(screen.getByText("Talent discovery — only seekers who opted in")).toBeTruthy();
    const input = screen.getByPlaceholderText("Acme Robotics");
    expect((screen.getByRole("button", { name: "Get started" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "Globex" } });
    const button = screen.getByRole("button", { name: "Get started" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("EMPLOYER · GLOBEX")).toBeTruthy());
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ companyName: "Globex" });
  });

  it("renders an error state with a retry when the account lookup fails", async () => {
    stubFetch({ account: { status: 500, body: { error: "boom" } } });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("boom")).toBeTruthy();
    stubFetch();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Your hiring, warmer.")).toBeTruthy());
  });

  it("renders the loading skeleton before fetch resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });
});

describe("employer activity derivation", () => {
  const parsedSpend = spend.map(({ kind, createdAt, creditsSpent, creditsAdded }) => ({ kind: kind as "profile_unlock" | "sponsorship" | "credit_purchase", createdAt, creditsSpent, creditsAdded }));

  it("sums only the last 30 days and flags a ledger that may be cut off", () => {
    expect(creditActivity(parsedSpend, NOW).rows.map(row => row.value)).toEqual([25, 1, 5]);
    expect(creditActivity(parsedSpend, NOW).truncated).toBe(false);
    const full = Array.from({ length: 50 }, () => ({ kind: "profile_unlock" as const, creditsSpent: 1, createdAt: "2026-10-07T00:00:00.000Z" }));
    expect(creditActivity(full, NOW).truncated).toBe(true);
  });

  it("treats any credits, budget, role or ledger entry as not just joined", () => {
    const fresh = { id: 1, companyName: "Acme", billingEmail: "a@acme.com", credits: 0, budgetMonthlyUsdCents: 0 };
    expect(isJustJoined(fresh, { access: "open", opportunities: [], spend: [] })).toBe(true);
    expect(isJustJoined({ ...fresh, credits: 3 }, { access: "open", opportunities: [], spend: [] })).toBe(false);
    expect(isJustJoined(fresh, { access: "open", opportunities: [{ id: 1, isActive: true, isSponsored: false }], spend: [] })).toBe(false);
    expect(isJustJoined(fresh, { access: "open", opportunities: [], spend: parsedSpend })).toBe(false);
    expect(isJustJoined(fresh, undefined)).toBe(false);
  });
});
