// @vitest-environment jsdom
// D-132 audit item 3 (option a): the ONE shared composer quote for /ask, the
// explore drawer and the company door. The composer owns the fetch (one per
// validated link, signed-in only), the cost line goes by-level from the
// server's numbers, and a shortfall swaps Send for the one-tap top-up the
// bridge page already proves. Flag off or a pending/failed quote keeps the
// flat one-credit line exactly as before.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import Ask from "@/pages/Ask";
import Explore from "@/pages/Explore";

const { go, searchState, authState, accessState, signIn } = vi.hoisted(() => ({
  go: vi.fn(),
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
  signIn: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
  useSearch: () => searchState.value,
  useRoute: () => [false, null],
}));
vi.mock("@/pages/explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("@/pages/explore/signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const company = (slug: string, openToReferrals = true): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const directoryOf = (companies: PublicCompany[]): CompanyDirectoryResponse => ({ companies, openCount: companies.filter(item => item.openToReferrals).length });
const ALL_OPEN = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const LINK = "https://careers.wipro.com/jobs/1234567-product-designer";
type QuoteBody = { level: number; cost: number; totalAvailable: number; shortfall: number };

function stub(options: { quote?: { status: number; body: QuoteBody | { error: string } } | (() => Promise<unknown>); send?: { status: number; body: unknown } | (() => unknown); directory?: CompanyDirectoryResponse | (() => CompanyDirectoryResponse) } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, typeof options.directory === "function" ? options.directory() : options.directory ?? ALL_OPEN);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 3 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/work-items") return json(200, { items: [] });
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path.startsWith("/api/company-referrals/quote")) {
      if (typeof options.quote === "function") return options.quote();
      const reply = options.quote ?? { status: 200, body: { level: 1, cost: 1, totalAvailable: 3, shortfall: 0 } };
      return json(reply.status, reply.body);
    }
    if (path === "/api/company-referrals" && method === "POST") {
      if (typeof options.send === "function") return options.send();
      const reply = options.send ?? { status: 200, body: { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } } };
      return json(reply.status, reply.body);
    }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (element: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
const quoteCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/company-referrals/quote"));

const typeLink = async (scope: HTMLElement | typeof document.body = document.body) => {
  const field = within(scope as HTMLElement).getByLabelText(/job link/i);
  fireEvent.change(field, { target: { value: LINK } });
  fireEvent.blur(field);
};

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  searchState.value = "";
  sessionStorage.clear();
  signIn.mockReset();
  go.mockReset();
  window.history.replaceState(null, "", "/ask");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("shared composer quote (D-132 item 3)", () => {
  it("flag on, short of credits: the line states cost, balance and gap, and Send swaps for the top-up link", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const fetchMock = stub({ quote: { status: 200, body: { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("This ask costs 5 credits. You have 3. Add 2 more."));
    const topUp = screen.getByRole("link", { name: "Add credits" }) as HTMLAnchorElement;
    expect(topUp.getAttribute("href")).toBe("/plans#packs");
    expect(screen.queryByRole("button", { name: /send ask/i })).toBeNull();
    expect(quoteCalls(fetchMock).length).toBeGreaterThan(0);
  });

  it("flag on, enough credits: the line uses the quote's numbers and Send stays", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    stub({ quote: { status: 200, body: { level: 2, cost: 2, totalAvailable: 3, shortfall: 0 } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 2 of your 3 credits"));
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    expect(screen.getByRole("button", { name: /send ask/i })).toBeTruthy();
  });

  it("flag on, failed quote: no false 1-credit line - the price failure shows and Send is blocked", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    stub({ quote: { status: 500, body: { error: "We could not price this ask" } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("We could not price this ask"));
    expect(screen.getByTestId("goal-ask-cost").textContent).not.toContain("1 credit");
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    const sendButton = screen.getByRole("button", { name: /send ask/i });
    expect(sendButton.getAttribute("aria-disabled")).toBe("true");
  });

  it("flag on, pending quote: Send waits instead of sending against an unknown price", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    const fetchMock = stub({ quote: () => gate.then(() => json(200, { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 })) });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Pricing this ask…"));
    const sendButton = screen.getByRole("button", { name: /send ask/i });
    expect(sendButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(sendButton); // inert GoalButton swallows activation (preventDefault/stopPropagation)
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST")).toBe(false);
    release(null);
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("This ask costs 5 credits. You have 3. Add 2 more."));
  });

  it("flag on, link edited after a quote: the old target's price never shows against the new link", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const bodies: Record<string, QuoteBody> = {
      "1234567": { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 },
      "7654321": { level: 2, cost: 2, totalAvailable: 3, shortfall: 0 },
    };
    stub({ quote: () => {
      const url = new URL(vi.mocked(fetch).mock.calls.at(-1)?.[0] as string, "http://x").searchParams.get("url") ?? "";
      const key = Object.keys(bodies).find(k => url.includes(k)) ?? "1234567";
      return Promise.resolve(json(200, bodies[key]));
    } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("This ask costs 5 credits. You have 3. Add 2 more."));
    const field = screen.getByLabelText(/job link/i);
    fireEvent.change(field, { target: { value: "https://careers.wipro.com/jobs/7654321-senior-designer" } });
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Pricing this ask…"));
    expect(screen.getByTestId("goal-ask-cost").textContent).not.toContain("5 credit");
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 2 of your 3 credits"), { timeout: 3000 });
  });

  it("flag on: editing inside a valid link debounces to one fetch per settled target", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const fetchMock = stub({ quote: { status: 200, body: { level: 2, cost: 2, totalAvailable: 3, shortfall: 0 } } });
    renderPage(<Ask />);
    const field = screen.getByLabelText(/job link/i);
    fireEvent.change(field, { target: { value: LINK } });
    fireEvent.change(field, { target: { value: LINK.replace("1234567", "1234568") } });
    fireEvent.change(field, { target: { value: LINK.replace("1234567", "1234569") } });
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(quoteCalls(fetchMock)).toHaveLength(1);
    expect(String(quoteCalls(fetchMock)[0][0])).toContain("1234569");
  });

  it("flag on, balance short at commit (HTTP 400 per the route contract): the server's refusal shows and the composer re-prices", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const fetchMock = stub({
      quote: { status: 200, body: { level: 2, cost: 2, totalAvailable: 3, shortfall: 0 } },
      send: { status: 400, body: { error: "This ask costs 2 credits and your balance is lower. Add credits in Plans & credits to send it now, or wait for your included credits to renew." } }, // the route maps the insufficient-credits refusal to 400 (message matches /credit/i in the POST catch); a genuine 5xx falls to the generic send error
    });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 2 of your 3 credits"));
    fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
    fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
    fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
    const before = quoteCalls(fetchMock).length;
    fireEvent.click(screen.getByRole("button", { name: /send ask/i }));
    // A ready quote was accepted, so the commit carries it as a binding precondition.
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String((post![1] as RequestInit).body)).expectedCost).toBe(2);
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent ?? "").toContain("This ask costs 2 credits and your balance is lower"));
    await waitFor(() => expect(quoteCalls(fetchMock).length).toBeGreaterThan(before));
  });

  it("flag off: no quote fetch and the flat one-credit line stays", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "false");
    const fetchMock = stub({ quote: { status: 200, body: { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 1 of your 3 credits"));
    expect(quoteCalls(fetchMock)).toHaveLength(0);
  });

  it("flag on, invalid link: no quote fetch", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const fetchMock = stub({ quote: { status: 200, body: { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 } } });
    renderPage(<Ask />);
    const field = screen.getByLabelText(/job link/i);
    fireEvent.change(field, { target: { value: "not a url" } });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(quoteCalls(fetchMock)).toHaveLength(0);
  });

  it("flag on, signed out: no quote fetch and the flat line stays", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    authState.isSignedIn = false;
    const fetchMock = stub({ quote: { status: 200, body: { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 1 credit"));
    expect(quoteCalls(fetchMock)).toHaveLength(0);
  });

  it("the explore drawer runs the same quote and the same top-up swap", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    stub({ quote: { status: 200, body: { level: 4, cost: 4, totalAvailable: 3, shortfall: 1 } } });
    window.history.replaceState(null, "", "/explore");
    renderPage(<Explore />);
    const card = await screen.findAllByText("Wipro");
    fireEvent.click(card[0]);
    const drawer = await screen.findByRole("dialog");
    await typeLink(drawer);
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("This ask costs 4 credits. You have 3. Add 1 more."));
    const topUp = within(drawer).getByRole("link", { name: "Add credits" }) as HTMLAnchorElement;
    expect(topUp.getAttribute("href")).toBe("/plans#packs");
    expect(within(drawer).queryByRole("button", { name: /send ask/i })).toBeNull();
  });

  it("drawer keyboard: Cmd+Enter during a pending quote sends nothing", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    const fetchMock = stub({ quote: () => gate.then(() => json(200, { level: 4, cost: 4, totalAvailable: 3, shortfall: 1 })) });
    window.history.replaceState(null, "", "/explore");
    renderPage(<Explore />);
    const card = await screen.findAllByText("Wipro");
    fireEvent.click(card[0]);
    const drawer = await screen.findByRole("dialog");
    await typeLink(drawer);
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("Pricing this ask…"));
    const content = drawer.querySelector(".contents");
    expect(content).toBeTruthy();
    fireEvent.keyDown(content as Element, { key: "Enter", metaKey: true });
    fireEvent.keyDown(content as Element, { key: "Enter", ctrlKey: true });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST")).toBe(false);
    release(null);
  });

  it("flag on, company not open: the ask waits for free - no top-up swap and Send stays (QA contract: 201 waiting, no debit)", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const WIPRO_CLOSED = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro")));
    stub({ directory: WIPRO_CLOSED, quote: { status: 200, body: { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 } } });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it"));
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    const sendButton = screen.getByRole("button", { name: /send ask/i });
    expect(sendButton.getAttribute("aria-disabled")).toBeNull();
  });

  it("flag on, company not open, wallet short: the ask actually submits into free waiting - nothing spent", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const WIPRO_CLOSED = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro")));
    const fetchMock = stub({
      directory: WIPRO_CLOSED,
      quote: { status: 200, body: { level: 6, cost: 6, totalAvailable: 0, shortfall: 6 } },
      send: { status: 201, body: { requestId: 777, companyDomain: "wipro.com", coverageStatus: "waiting_for_company_coverage", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } } },
    });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it"));
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
    fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
    fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
    fireEvent.click(screen.getByRole("button", { name: /send ask/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.getByText(/nothing was spent/i)).toBeTruthy());
  });

  it("coverage opens between compose and send: 409, nothing created or charged, re-priced to the covered line", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    let open = false;
    const WIPRO_FLIP = () => directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro" ? true : open)));
    const fetchMock = stub({
      directory: WIPRO_FLIP,
      quote: { status: 200, body: { level: 6, cost: 6, totalAvailable: 2, shortfall: 4 } },
      send: { status: 409, body: { error: "This company just opened up to referrals, so sending now uses its cost in credits. Nothing was sent and nothing was charged - check the live price and send again if it works for you.", code: "company_coverage_changed", companyDomain: "wipro.com" } },
    });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it"));
    fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
    fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
    fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
    open = true; // the company opens up before the commit lands
    fireEvent.click(screen.getByRole("button", { name: /send ask/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST");
      expect(post).toBeTruthy();
      expect(String(JSON.parse(String((post![1] as RequestInit).body)).expectedCoverage)).toBe("waiting_for_company_coverage");
      expect(Number(JSON.parse(String((post![1] as RequestInit).body)).expectedCost)).toBe(6);
    });
    // Nothing was created: the refusal copy shows, no sent view.
    await screen.findByText(/Nothing was sent and nothing was charged/);
    expect(screen.queryByText(/nothing was spent/i)).toBeNull();
    // Directory + quote invalidated: the covered cost line and top-up are live for a conscious re-send.
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("This ask costs 6 credits. You have 2. Add 4 more."));
    const flipTopUp = screen.getByRole("link", { name: "Add credits" }) as HTMLAnchorElement;
    expect(flipTopUp.href).toContain("/plans#packs");
  });

  it("coverage flip 409: the stale free-waiting line is dropped and Send stays gated until the refreshed quote lands; the second send binds the new price once", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    let open = false;
    let quoteCount = 0;
    let sendCount = 0;
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    const WIPRO_FLIP = () => directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro" ? true : open)));
    const fetchMock = stub({
      directory: WIPRO_FLIP,
      quote: () => {
        quoteCount += 1;
        // The refetch after the 409 hangs until released: nothing stale may
        // stay on screen (or stay sendable) in between.
        if (quoteCount > 1) return gate.then(() => json(200, { level: 6, cost: 6, totalAvailable: 12, shortfall: 0 }));
        return Promise.resolve(json(200, { level: 6, cost: 6, totalAvailable: 12, shortfall: 0 }));
      },
      send: () => {
        sendCount += 1;
        if (sendCount === 1) return json(409, { error: "This company just opened up to referrals, so sending now uses its cost in credits. Nothing was sent and nothing was charged - check the live price and send again if it works for you.", code: "company_coverage_changed", companyDomain: "wipro.com" });
        return json(201, { requestId: 888, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } });
      },
    });
    renderPage(<Ask />);
    await typeLink();
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it"));
    fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
    fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
    fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
    open = true; // the company opens up before the commit lands
    fireEvent.click(screen.getByRole("button", { name: /send ask/i }));
    await screen.findByText(/Nothing was sent and nothing was charged/);
    // The stale free-waiting terms are gone and Send is gated while the fresh
    // quote is still in flight: a second click here cannot authorize terms the
    // seeker never saw.
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Pricing this ask…"));
    expect(screen.getByRole("button", { name: /send ask/i }).getAttribute("aria-disabled")).toBe("true");
    release(null);
    // The refreshed covered line is the server's own numbers; Send unlocks
    // only now, visibly against the new price.
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Uses 6 of your 12 credits"));
    expect(screen.getByRole("button", { name: /send ask/i }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /send ask/i }));
    await screen.findByText(/can see it now/i);
    const posts = fetchMock.mock.calls.filter(([u, i]) => String(u) === "/api/company-referrals" && (i as RequestInit | undefined)?.method === "POST");
    expect(posts.length).toBe(2);
    const secondBody = JSON.parse(String((posts[1][1] as RequestInit).body));
    expect(Number(secondBody.expectedCost)).toBe(6);
    expect("expectedCoverage" in secondBody).toBe(false);
  });

  it("flag on, company not open and quote still pending: Send waits for the price - a free-waiting ask still debits its cost at delivery, never unseen", async () => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const WIPRO_CLOSED = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro")));
    let release!: (value: unknown) => void;
    const gate = new Promise(resolve => { release = resolve; });
    stub({ directory: WIPRO_CLOSED, quote: () => gate.then(() => json(200, { level: 5, cost: 5, totalAvailable: 3, shortfall: 2 })) });
    renderPage(<Ask />);
    await typeLink();
    // While the price loads, no free-waiting line and no sendable state: the
    // delivery-time debit must never be authorized at a cost the seeker never saw.
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("Pricing this ask…"));
    expect(screen.getByRole("button", { name: /send ask/i }).getAttribute("aria-disabled")).toBe("true");
    release(null);
    // Once the price is in, the free-waiting line shows and Send unlocks.
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it"));
    expect(screen.getByRole("button", { name: /send ask/i }).getAttribute("aria-disabled")).toBeNull();
  });
});
