// @vitest-environment jsdom
// /requests on the goal UI (D-048 phase 3). Every state here reads the live
// payloads only: no sample asks, no invented counts, no zero balance.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MyRequests from "./MyRequests";

const { go, getToken, auth, access } = vi.hoisted(() => ({
  go: vi.fn(),
  getToken: vi.fn().mockResolvedValue("test-token"),
  auth: { isLoaded: true, isSignedIn: true, openSignIn: vi.fn() },
  access: { status: "unverified" as "unverified" | "verified" | "signed-out" },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: auth.isLoaded, isSignedIn: auth.isSignedIn, userId: auth.isSignedIn ? 4106 : null, getToken, openSignIn: auth.openSignIn }),
  useUser: () => ({ user: auth.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => access }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/requests", go],
}));
vi.mock("sonner", () => ({ toast: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MyRequests /></QueryClientProvider>);
}

const day = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
// /mine rows carry the server directory identity: null outside it, "skipwait.me"/"SW" for skipwait.me.
const base = { targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", companyName: null, companyInitials: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, attachmentCount: 1 };
const openAsk = (id: number) => ({ ...base, id, title: "Product Designer", status: "pending", referrerId: null, createdAt: iso(Date.now() - day), updatedAt: iso(Date.now() - day) });
const declined = { ...base, id: 45, title: "Designer", companyDomain: "skipwait.me", companyName: "skipwait.me", companyInitials: "SW", status: "declined", referrerId: 503, referrerMessage: "Not my team", createdAt: iso(Date.now() - 9 * day), updatedAt: iso(Date.now() - 8 * day) };
const expired = { ...base, id: 46, title: "Analyst", status: "closed", referrerId: null, createdAt: iso(Date.now() - 12 * day), updatedAt: iso(Date.now() - 5 * day) };
// The server's open-ask slots payload (shared/openAskSlots.ts): open asks against the plan cap.
const slots = (open: number, extra: Record<string, unknown> = {}) => ({ plan: "free", planLabel: "Free", open, cap: 3, full: open >= 3, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 }, ...extra });

function stub(requests: unknown[], slotBody: unknown, credits: unknown = { summary: { totalAvailable: 4 } }) {
  const fetchMock = vi.fn(async (url: string) => String(url).includes("/api/credits/summary")
    ? { ok: true, status: 200, json: async () => credits }
    : { ok: true, status: 200, json: async () => ({ requests, slots: slotBody }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); go.mockClear(); auth.openSignIn.mockClear(); vi.unstubAllGlobals(); auth.isLoaded = true; auth.isSignedIn = true; access.status = "unverified"; });

describe("My asks on the goal shell", () => {
  it("keeps closed asks out of the next-step route and offers discovery instead", async () => {
    stub([{ ...openAsk(42), status: "closed" }], slots(0));
    renderPage();
    await screen.findByText("No open asks.");
    const next = screen.getByRole("region", { name: "Your next step" });
    expect(within(next).getByRole("link", { name: "Find a company" }).getAttribute("href")).toBe("/explore");
    expect(within(next).queryByRole("link", { name: "View ask" })).toBeNull();
    expect(document.querySelectorAll("main [data-g-primary]")).toHaveLength(1);
  });

  it("opens with the goal and a single next-step commit instead of a second header primary", async () => {
    stub([openAsk(42)], slots(1));
    renderPage();
    await screen.findByText("Product Designer");
    expect(screen.getByRole("heading", { name: "Get your asks answered." })).toBeTruthy();
    const next = screen.getByRole("region", { name: "Your next step" });
    expect(within(next).getByRole("link", { name: "View ask" }).getAttribute("href")).toBe("/conversation/42");
    expect(screen.getByRole("link", { name: "New ask" }).className).not.toContain("bg-g-primary");
    expect(document.querySelectorAll("main .bg-g-primary")).toHaveLength(1);
  });

  it("prioritizes the referred thread over waiting asks without pretending to confirm it here", async () => {
    stub([openAsk(42), { ...openAsk(43), title: "Research Lead", status: "intro_made", referrerId: 503 }], slots(2));
    renderPage();
    await screen.findByText("Research Lead");
    const next = screen.getByRole("region", { name: "Your next step" });
    expect(within(next).getByRole("link", { name: "Check referral update" }).getAttribute("href")).toBe("/conversation/43");
    expect(next.textContent).toContain("Open the conversation");
    expect(next.textContent).toContain("Research Lead");
    expect(screen.queryByRole("button", { name: "I got the referral email" })).toBeNull();
  });

  it("prioritizes an unread accepted conversation without changing a request or spending credits", async () => {
    const fetchMock = stub([openAsk(42), { ...openAsk(43), title: "Research Lead", status: "approved", referrerId: 503, unreadMessageCount: 2 }], slots(2));
    renderPage();
    await screen.findByText("Research Lead");
    const next = screen.getByRole("region", { name: "Your next step" });
    expect(within(next).getByRole("link", { name: "Read update" }).getAttribute("href")).toBe("/conversation/43");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("confirm-referred"))).toBe(true);
  });

  it("an empty list has one company-discovery next step and never invents a per-ask credit cost", async () => {
    stub([], slots(0));
    renderPage();
    await screen.findByText("No asks yet.");
    const next = screen.getByRole("region", { name: "Your next step" });
    expect(within(next).getByRole("link", { name: "Find a company" }).getAttribute("href")).toBe("/explore");
    expect(document.querySelectorAll("main .bg-g-primary")).toHaveLength(1);
    expect(next.textContent).not.toMatch(/0 referrals|1 referral/);
  });

  it("wraps the page in the goal shell with the live credit balance, not a placeholder", async () => {
    stub([openAsk(42)], slots(1));
    renderPage();
    expect(screen.getByTestId("goal-shell")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toBe("4 referrals"));
    const pill = screen.getAllByTestId("goal-credits-pill");
    expect(pill[0].getAttribute("href")).toBe("/plans");
    // My asks is the current destination; the avatar identifies the account.
    expect(screen.getAllByRole("link", { name: "My asks" }).some(link => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getAllByTestId("goal-avatar")[0].textContent).toBe("AB");
    // The list comes from one endpoint; the balance from the credits summary. Nothing else is fetched.
    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(urls).toContain("/api/company-referrals/mine");
    expect(urls).toContain("/api/credits/summary?role=job_seeker");
  });

  it("says the balance failed to load instead of drawing 0 credits, and retries it", async () => {
    let creditCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/credits/summary")) {
        creditCalls += 1;
        return creditCalls <= 2
          ? { ok: false, status: 500, json: async () => ({ error: "down" }) }
          : { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) };
      }
      return { ok: true, status: 200, json: async () => ({ requests: [openAsk(42)], slots: slots(1) }) };
    }));
    renderPage();
    const pill = (await screen.findAllByTestId("goal-credits-pill"))[0];
    await waitFor(() => expect(pill.textContent).toContain("Balance didn't load"), { timeout: 3000 });
    expect(pill.textContent).not.toMatch(/\b0\b/);
    fireEvent.click(within(pill).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toBe("4 referrals"));
  });

  it("a verified referrer keeps their queue and sees no credits pill", async () => {
    access.status = "verified";
    const fetchMock = stub([openAsk(42)], slots(1));
    renderPage();
    await screen.findAllByText("Product Designer");
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Queue" }).length).toBeGreaterThan(0);
    // D-055: the referrer surface never even asks for a seeker balance.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/credits/summary"))).toBe(false);
  });

  it("gates signed-out visitors behind a sign-in panel and never loads asks", () => {
    auth.isSignedIn = false;
    const fetchMock = stub([], slots(0));
    renderPage();
    expect(screen.getByRole("heading", { name: "See the real status." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Secure sign in" }));
    expect(auth.openSignIn).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not flash the sign-in gate while auth is still resolving", () => {
    auth.isLoaded = false; auth.isSignedIn = false;
    stub([], slots(0));
    renderPage();
    expect(screen.queryByRole("heading", { name: "See the real status." })).toBeNull();
    expect(document.querySelector('[data-skipwait-loading="true"]')).toBeTruthy();
  });

  it("meters open asks against the plan cap in the heading", async () => {
    stub([openAsk(42), openAsk(43), declined], slots(2));
    renderPage();
    const meter = await screen.findByTestId("asks-slots");
    expect(meter.textContent).toBe("Open asks 2 of 3 · Free plan");
    expect(screen.queryByText(/slots are in use/)).toBeNull();
  });

  it("shows the plan's own label and cap, and Concierge's cap of 75", async () => {
    stub([openAsk(42)], slots(12, { plan: "land_concierge", planLabel: "Land Concierge", cap: 75, full: false, nextPlan: null }));
    renderPage();
    expect((await screen.findByTestId("asks-slots")).textContent).toBe("Open asks 12 of 75 · Land Concierge plan");
  });

  it("says the slots did not load instead of drawing a fake count, and reloads them", async () => {
    const fetchMock = stub([openAsk(42)], { plan: "free", open: "two" });
    renderPage();
    expect(await screen.findByTestId("asks-slots-error")).toBeTruthy();
    expect(screen.getByText("Open asks didn’t load.")).toBeTruthy();
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    fetchMock.mockImplementation(async url => String(url).includes("/api/credits/summary")
      ? { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 4 } }) }
      : { ok: true, status: 200, json: async () => ({ requests: [openAsk(42)], slots: slots(1) }) });
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect((await screen.findByTestId("asks-slots")).textContent).toBe("Open asks 1 of 3 · Free plan");
  });

  it("renders each ask as one link row to its thread, with the goal status vocabulary", async () => {
    stub([openAsk(42), { ...openAsk(43), title: "Design Systems Lead", status: "approved", referrerId: 503, unreadMessageCount: 2 }, declined, expired], slots(2));
    renderPage();
    const row = (await screen.findByText("Product Designer")).closest("a");
    expect(row?.getAttribute("href")).toBe("/conversation/42");
    expect(within(row as HTMLElement).getByTestId("goal-status").textContent).toBe("Waiting");
    expect(row?.querySelector('[data-testid="goal-mini-stepper"]')).toBeTruthy();
    const accepted = screen.getByText("Design Systems Lead", { selector: "span" }).closest("a");
    expect(accepted?.getAttribute("href")).toBe("/conversation/43");
    expect(within(accepted as HTMLElement).getByTestId("goal-status").textContent).toBe("Accepted");
    // The referrer's private id and note stay out of the list.
    expect(document.querySelector("main")?.textContent).not.toContain("503");
    expect(screen.queryByLabelText("Referrer update")).toBeNull();
  });

  it("groups declined and expired asks under Closed with the company identity and the real reason", async () => {
    stub([openAsk(42), declined, expired], slots(1));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Active · 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Closed · 2" })).toBeTruthy();
    const declinedRow = screen.getByText("skipwait.me", { selector: "span" }).closest("a");
    expect(declinedRow?.getAttribute("href")).toBe("/conversation/45");
    expect(within(declinedRow as HTMLElement).getByTestId("goal-status").textContent).toBe("Declined");
    expect(declinedRow?.textContent).toContain("Not my team");
    expect(declinedRow?.textContent).not.toContain("Ref-");
    expect(screen.getByText("Analyst", { selector: "span" }).closest("a")?.textContent).toContain("Expired");
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("shows the closed empty note when nothing has closed yet", async () => {
    stub([openAsk(42)], slots(1));
    renderPage();
    await screen.findByText("Product Designer");
    expect(screen.getByRole("heading", { name: "Nothing closed yet." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Explore companies" })).toBeNull();
  });

  it("explains a dropped connection instead of showing zero asks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t reach skipwait.me. Check your connection and try again.");
    expect(screen.queryByText("No asks yet.")).toBeNull();
  });

  it("treats a malformed list payload as an error, never as data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ requests: [{ id: "x" }] }) })));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your referral requests");
  });
});
