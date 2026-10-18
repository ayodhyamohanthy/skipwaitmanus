// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import ReferralQueue from "./ReferralQueue";

const state = vi.hoisted(() => ({ verified: true, search: "", navigate: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "u1", getToken: async () => null }) }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("@/hooks/useReferrerAccess", () => ({
  useReferrerAccess: () => (state.verified ? { status: "verified", access: { verified: true, domain: "example.com", companyName: "Example", companyInitials: "EX" } } : { status: "unverified", access: { verified: false, domain: "", companyName: null, companyInitials: null } }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/queue", state.navigate],
  useSearch: () => state.search,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
const row = (id: number, slug: string, visibleDaysAgo: number) => ({
  id, displayRef: `R-${id}XXXX`.slice(0, 7), targetRoleUrl: `https://example.com/jobs/${slug}`, companyDomain: "example.com", companyName: "Example", jobFunction: "Engineering",
  jobTitle: "Role from shared job link", status: "pending", coverageVisibleAt: iso(visibleDaysAgo), createdAt: iso(visibleDaysAgo), attachmentCount: 2,
  officialLinkIncluded: true, resumeAttached: true, askStrength: "good", expiresAt: null,
});
let rows: Array<Record<string, unknown>>;
let acceptStatus = 200;
const bodies: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  state.verified = true;
  state.search = "";
  state.navigate.mockClear();
  acceptStatus = 200;
  bodies.length = 0;
  localStorage.clear();
  rows = [row(11, "backend-engineer", 2), row(12, "site-reliability-engineer", 6), row(13, "data-platform-engineer", 4)];
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (init?.method === "POST") bodies.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    if (url.startsWith("/api/company-referrals/inbox?scope=new")) return json({ requests: rows });
    if (url.startsWith("/api/company-referrals/inbox?scope=saved")) return json({ requests: [] });
    const preview = /^\/api\/company-referrals\/(\d+)\/preview$/.exec(url);
    if (preview) return json({ request: { id: Number(preview[1]), displayRef: "R-P", targetRoleUrl: "https://example.com/jobs/x", companyDomain: "example.com", companyName: "Example", jobFunction: "Engineering", candidateMessage: "Built the payouts service.\nCut p99 latency by 41%.\nRan on-call for 14 services.", attachments: [{}, {}] } });
    if (url.endsWith("/one-click-review")) return acceptStatus === 409 ? json({ error: "no longer available" }, 409) : json({ status: "approved" });
    if (url === "/api/company-referrals/availability/open") return json({ availability: { allocatedCount: 2 } });
    if (url === "/api/referrer-fast-track/me") return json({ link: null });
    return json({ error: "not mocked" }, 404);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ReferralQueue /></QueryClientProvider>);
}

describe("Referral queue (goal UI)", () => {
  it("sends an unverified account to work-email verification only (D-030)", () => {
    state.verified = false;
    renderPage();
    expect(screen.getByRole("link", { name: "Verify work email" }).getAttribute("href")).toBe(referrerSignInHref("/queue"));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("lists asks soonest to close first and opens the first with its reasons and checks", async () => {
    renderPage();
    const rowsList = await screen.findAllByRole("button", { name: /left|Closes today/ });
    expect(rowsList.map(button => button.getAttribute("aria-label")?.split(",")[0])).toEqual(["Site Reliability Engineer", "Data Platform Engineer", "Backend Engineer"]);
    expect(await screen.findByText("Cut p99 latency by 41%.")).toBeTruthy();
    expect(screen.getByText("Specific proof of fit")).toBeTruthy();
    expect(screen.getByText("2 documents")).toBeTruthy();
    expect(document.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });

  it("accepts only after the ethics confirmation, with ethicsConfirmed in the body", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Cut p99 latency by 41%.");
    await user.click(screen.getByRole("button", { name: /Accept & connect/ }));
    const dialog = await screen.findByRole("dialog", { name: "Accept this request?" });
    const confirm = within(dialog).getByRole("button", { name: "Accept" });
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    await user.click(confirm);
    expect(bodies).toHaveLength(0);
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(confirm);
    await waitFor(() => expect(bodies).toEqual([{ url: "/api/company-referrals/12/one-click-review", body: { decision: "approved", ethicsConfirmed: true } }]));
    expect(await screen.findByText(/Accepted. You can message them privately now./)).toBeTruthy();
  });

  it("passes privately with the picked reason's code and legacy reason", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Cut p99 latency by 41%.");
    await user.click(screen.getByRole("button", { name: /Pass privately/ }));
    await user.click(await screen.findByRole("radio", { name: "Role is closed" }));
    await user.click(screen.getByRole("button", { name: "Pass" }));
    await waitFor(() => expect(bodies).toEqual([{ url: "/api/company-referrals/12/one-click-review", body: { decision: "declined", declineReason: "role_not_a_fit", passReason: "role_closed" } }]));
    expect(await screen.findByText(/You passed privately/)).toBeTruthy();
  });

  it("explains a lost race in plain words", async () => {
    const user = userEvent.setup();
    acceptStatus = 409;
    renderPage();
    await screen.findByText("Cut p99 latency by 41%.");
    await user.click(screen.getByRole("button", { name: /Accept & connect/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Another employee accepted this ask a moment earlier.")).toBeTruthy();
  });

  it("honours the ?request= deep link from referrer home", async () => {
    state.search = "request=11";
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Backend Engineer" })).toBeTruthy();
  });

  it("opens steps from keys and never commits", async () => {
    renderPage();
    await screen.findByText("Cut p99 latency by 41%.");
    act(() => { fireEvent.keyDown(window, { key: "a" }); });
    expect(await screen.findByRole("dialog", { name: "Accept this request?" })).toBeTruthy();
    expect(bodies).toHaveLength(0);
  });

  it("offers one more slot when the queue is empty", async () => {
    const user = userEvent.setup();
    rows = [];
    renderPage();
    expect(await screen.findByText("No asks right now.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open one more slot" }));
    await waitFor(() => expect(bodies).toEqual([{ url: "/api/company-referrals/availability/open", body: { slotCount: 1 } }]));
    expect(await screen.findByText("2 waiting asks are now in your queue.")).toBeTruthy();
  });
});
