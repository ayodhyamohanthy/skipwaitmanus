// @vitest-environment jsdom
// Task 13: pinned work rides with the ask (D-022 row 13). The pieces a seeker
// pins to a request are the evidence a referrer decides on, so the picker has
// to live in the ONE composer both surfaces send through — /ask and the
// directory drawer — and both have to put the same `workItemIds` on the same
// POST body. These cases pin that, plus the plan-cap recovery a downgraded
// wallet can hit.
//
// The red-first history: before the review fix, the picker lived on the kit
// /ask page that D-048 phase 3 W2 replaced, so neither surface could send it.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { MAX_ASK_WORK_ITEMS } from "@shared/askWorkItems";
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
const CREATED = { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };

/** Two showcase pieces: one the seeker already pins, one they do not. */
const WORK_ITEMS = {
  items: [
    { id: 11, title: "Checkout redesign", kind: "case_study", source: "Portfolio", url: "https://ada.example.com/checkout", pinned: true, visibleOnProfile: true },
    { id: 12, title: "Design system", kind: "project", source: "GitHub", url: "https://github.com/ada/system", pinned: false, visibleOnProfile: true },
  ],
};
const LINK = "https://careers.wipro.com/jobs/1234567-product-designer";
type Reply = { status: number; body: unknown };

function stub(options: { send?: () => Reply; work?: () => Reply } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, ALL_OPEN);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/work-items") { const reply = options.work?.() ?? { status: 200, body: WORK_ITEMS }; return json(reply.status, reply.body); }
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path === "/api/company-referrals" && method === "POST") { const reply = options.send?.() ?? { status: 200, body: CREATED }; return json(reply.status, reply.body); }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (element: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{element}</QueryClientProvider>);
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/company-referrals" && (init as RequestInit | undefined)?.method === "POST");
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
const chips = (scope: HTMLElement) => within(scope).getAllByTestId("goal-filter-chip");
const pressed = (scope: HTMLElement) => chips(scope).filter(chip => chip.getAttribute("aria-pressed") === "true").map(chip => chip.textContent ?? "");

const fillReasons = (scope: HTMLElement) => {
  fireEvent.change(within(scope).getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(within(scope).getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(within(scope).getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("pinned work on the ask (task 13)", () => {
  it("preselects the seeker's pinned piece on /ask and sends it as workItemIds", async () => {
    const fetchMock = stub();
    renderPage(<Ask />);
    await waitFor(() => expect(screen.getByLabelText("Job link")).toBeTruthy());

    // The showcase arrives from the seeker's own work; the pinned one rides by default.
    await waitFor(() => expect(chips(document.body)).toHaveLength(2));
    expect(pressed(document.body)).toEqual(["Checkout redesign · Case study"]);
    // The count is honest about what travels, not about how many exist.
    expect(screen.getByRole("group", { name: "Pinned work" }).textContent).toContain("travel with this ask");

    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(bodyOf(posts(fetchMock)[0])).toMatchObject({
      targetRoleUrl: LINK,
      attachmentIds: [77],
      workItemIds: [11],
    });
  });

  it("adds and removes a piece, and sends them in the order the seeker chose", async () => {
    const fetchMock = stub();
    renderPage(<Ask />);
    await waitFor(() => expect(chips(document.body)).toHaveLength(2));

    fireEvent.click(chips(document.body)[1]);
    expect(pressed(document.body)).toEqual(["Checkout redesign · Case study", "Design system · Project"]);
    fireEvent.click(chips(document.body)[0]);
    expect(pressed(document.body)).toEqual(["Design system · Project"]);

    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(bodyOf(posts(fetchMock)[0]).workItemIds).toEqual([12]);
  });

  it("sends no workItemIds when the seeker unpins everything", async () => {
    const fetchMock = stub();
    renderPage(<Ask />);
    await waitFor(() => expect(chips(document.body)).toHaveLength(2));
    fireEvent.click(chips(document.body)[0]);
    expect(pressed(document.body)).toEqual([]);

    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(bodyOf(posts(fetchMock)[0])).not.toHaveProperty("workItemIds");
  });

  it("trims to the cap the server quotes when a downgrade left more pieces pinned, then sends the corrected ask", async () => {
    let call = 0;
    const fetchMock = stub({
      send: () => {
        call += 1;
        return call === 1
          ? { status: 409, body: { error: "Your Free plan puts 1 piece of work in front of a referrer. Choose the one that best proves this role.", code: "plan_limit", limit: "showcase_pins", cap: 1 } }
          : { status: 200, body: CREATED };
      },
    });
    renderPage(<Ask />);
    await waitFor(() => expect(chips(document.body)).toHaveLength(2));
    fireEvent.click(chips(document.body)[1]);
    expect(pressed(document.body)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));

    // The refusal is shown, the picker is trimmed to the plan's cap, and it says so.
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("puts 1 piece of work"));
    await waitFor(() => expect(pressed(document.body)).toEqual(["Checkout redesign · Case study"]));
    expect(screen.getByText(/Kept the first piece/)).toBeTruthy();

    // Nothing was created; the corrected send goes through with one piece.
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2));
    expect(bodyOf(posts(fetchMock)[1]).workItemIds).toEqual([11]);
    expect(await screen.findByText("Ask sent to Wipro.")).toBeTruthy();
  });

  it("shows a way out when the showcase is empty, and never blocks the ask", async () => {
    const fetchMock = stub({ work: () => ({ status: 200, body: { items: [] } }) });
    renderPage(<Ask />);
    await waitFor(() => expect(screen.getByText(/Nothing in your showcase yet/)).toBeTruthy());
    expect(screen.getByRole("link", { name: "Add a piece of work" }).getAttribute("href")).toBe("/work");

    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(bodyOf(posts(fetchMock)[0])).not.toHaveProperty("workItemIds");
  });

  it("keeps the ceiling at the transport maximum, not the plan's, until the server says otherwise", async () => {
    const many = { items: Array.from({ length: 8 }, (_, index) => ({ id: 100 + index, title: `Piece ${index + 1}`, kind: "project", source: null, url: null, pinned: true, visibleOnProfile: true })) };
    stub({ work: () => ({ status: 200, body: many }) });
    renderPage(<Ask />);
    await waitFor(() => expect(chips(document.body)).toHaveLength(8));
    // Every piece is pinned, so the default stops at what one request can carry.
    expect(pressed(document.body)).toHaveLength(MAX_ASK_WORK_ITEMS);
  });

  it("sends the same body from the directory drawer as from /ask", async () => {
    // /ask first, with the pinned piece left as it is.
    const pageFetch = stub();
    renderPage(<Ask />);
    await waitFor(() => expect(chips(document.body)).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(screen.getByLabelText("Job link"));
    fillReasons(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(pageFetch)).toHaveLength(1));
    const pageBody = bodyOf(posts(pageFetch)[0]);
    cleanup();

    // Then the drawer, opened from the company row, with the same inputs.
    const drawerFetch = stub();
    renderPage(<Explore />);
    fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
    const drawer = await screen.findByTestId("goal-drawer");
    await waitFor(() => expect(chips(drawer)).toHaveLength(2));
    expect(pressed(drawer)).toEqual(["Checkout redesign · Case study"]);
    fireEvent.change(within(drawer).getByLabelText("Job link"), { target: { value: LINK } });
    fireEvent.blur(within(drawer).getByLabelText("Job link"));
    fillReasons(drawer);
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));
    await waitFor(() => expect(posts(drawerFetch)).toHaveLength(1));

    // One body: the drawer adds nothing /ask does not, and drops nothing it does.
    expect(bodyOf(posts(drawerFetch)[0])).toEqual(pageBody);
    expect(pageBody.workItemIds).toEqual([11]);
  });
});
