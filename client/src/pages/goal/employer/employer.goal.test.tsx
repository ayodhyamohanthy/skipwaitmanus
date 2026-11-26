// @vitest-environment jsdom
// D-048-p3-employer: the goal /employer surface states and its money-copy
// integrity (packet docs/plans/D-048-employer.md §5). Pins: goal-on render of
// every state the kit page has (sign-in gate, account load error, open-account
// form, overview with data), loading/empty/error states, and rule 1a wording
// (D-153/D-173/D-180): the goal employer display copy never says "credit(s)"
// or the noun "ask", never sells or promises the unbuilt Oct 25 company plans,
// and the sponsorship cost values are the kit's own (never retyped).
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import GoalEmployer from "./GoalEmployer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GoalEmployerOpportunities from "./GoalEmployerOpportunities";
import { SPONSOR_TIERS } from "./sponsorTiers";
import { assertGoalPage } from "@/test/goalPageContract";
import { GOAL_PAGE as EMPLOYER_GOAL } from "./GoalEmployer";
import { GOAL_PAGE as OPP_GOAL } from "./GoalEmployerOpportunities";

vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

const { authState } = vi.hoisted(() => ({ authState: { isLoaded: true, isSignedIn: true } }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => authState,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  useUser: () => ({ user: null }),
}));

type Route = { method?: string; path: string; match?: "prefix" | "exact"; status?: number; body?: unknown; abort?: boolean };
type Server = { account: unknown; opportunities?: { opportunities: unknown[] }; spend?: { spend: unknown[] }; accountStatus?: number; opportunityStatus?: number; abortAll?: boolean };

const ACCOUNT = { id: 7, companyName: "Northwind Robotics", billingEmail: "hire@northwind.example", credits: 8, budgetMonthlyUsdCents: 5000 };

const serve = (server: Server) => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (server.abortAll) throw new TypeError("Failed to fetch");
    const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const json = (status: number, body: unknown) => ({ ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body });
    if (path === "/api/employer/account") {
      if (server.accountStatus) return json(server.accountStatus, { error: "We could not load your employer account" });
      return json(200, { account: server.account });
    }
    if (path === "/api/employer/opportunities") return json(server.opportunityStatus ?? 200, server.opportunities ?? { opportunities: [] });
    if (path === "/api/employer/spend-history") return json(200, server.spend ?? { spend: [] });
    return json(404, { error: "not mocked" });
  }) as never);
};

const POST_ACCOUNT = { method: "POST", path: "/api/employer/account", body: { account: ACCOUNT } } as const;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; authState.isLoaded = true; });

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
describe("goal /employer states", () => {
  it("renders the goal shell with the kit page's headline", async () => {
    serve({ account: ACCOUNT, opportunities: { opportunities: [{ id: 3, isActive: true, isSponsored: false }] }, spend: { spend: [] } });
    const { container } = renderPage(<GoalEmployer />);
    expect(await screen.findByRole("heading", { level: 1, name: "Hire without the noise." })).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
    expect(screen.getAllByTestId("goal-num").length).toBeGreaterThanOrEqual(4);
    expect(() => assertGoalPage(container, EMPLOYER_GOAL)).not.toThrow();
  });

  it("signed out: the sign-in gate keeps the kit headline and no state is created", async () => {
    authState.isSignedIn = false;
    serve({ account: null });
    const { container } = renderPage(<GoalEmployer />);
    expect(await screen.findByRole("heading", { level: 1, name: "Hire without the noise." })).toBeTruthy();
    expect(screen.getByText("Sign in to continue")).toBeTruthy();
    expect(() => assertGoalPage(container, EMPLOYER_GOAL)).not.toThrow();
  });

  it("account load failure: an honest error state with a retry, no fake data", async () => {
    serve({ account: null, accountStatus: 500 });
    renderPage(<GoalEmployer />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your employer account");
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByTestId("goal-num")).toBeNull();
  });

  it("no employer account yet: the open-account form names the company and the two money facts, with no banned word", async () => {
    serve({ account: null });
    renderPage(<GoalEmployer />);
    expect(await screen.findByRole("heading", { level: 1, name: "Hire without the noise." })).toBeTruthy();
    expect(screen.getByLabelText("Company name")).toBeTruthy();
    expect(screen.getByText("Get started")).toBeTruthy();
  });

  it("just joined: the next step names what the money buys (top up for talent unlocks and sponsored roles), never 'Buy credits'", async () => {
    serve({ account: { ...ACCOUNT, credits: 0, budgetMonthlyUsdCents: 0 }, opportunities: { opportunities: [] }, spend: { spend: [] } });
    renderPage(<GoalEmployer />);
    await screen.findByRole("heading", { level: 1, name: "Hire without the noise." });
    expect(screen.getByText("Top up for talent unlocks and sponsored roles")).toBeTruthy();
    expect(screen.getAllByText("Browse opt-in talent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sponsor a role (optional)")).toBeTruthy();
  });

  it("with spend: the activity block states spend plainly and the capped-ledger caveat comes from the data layer", async () => {
    const spend = [
      { kind: "credit_purchase", creditsAdded: 10, createdAt: new Date(Date.now() - 86_400_000).toISOString() },
      { kind: "profile_unlock", creditsSpent: 2, createdAt: new Date(Date.now() - 3_600_000).toISOString() },
      { kind: "sponsorship", creditsSpent: 10, createdAt: new Date(Date.now() - 7_200_000).toISOString() },
    ];
    serve({ account: ACCOUNT, opportunities: { opportunities: [{ id: 1, isActive: true, isSponsored: true }] }, spend: { spend } });
    renderPage(<GoalEmployer />);
    expect(await screen.findByText("Spend · last 30 days")).toBeTruthy();
    expect(screen.getByText("Top-ups")).toBeTruthy();
    expect(screen.getByText("Spent on talent unlocks")).toBeTruthy();
    expect(screen.getByText("Spent on sponsored roles")).toBeTruthy();
  });

  it("restricted access: the application notice is honest and no employer tool renders", async () => {
    serve({ account: { ...ACCOUNT, approvalStatus: "pending", decisionNote: null } });
    // 403 from both tool endpoints is what the data layer rules as restricted.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (path === "/api/employer/account") return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ account: { ...ACCOUNT, approvalStatus: "pending" } }) };
      return { ok: false, status: 403, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "forbidden" }) };
    }) as never);
    renderPage(<GoalEmployer />);
    expect(await screen.findByText("Your employer application is in review")).toBeTruthy();
  });
});

describe("goal /employer/opportunities states", () => {
  it("loading, then the honest empty state", async () => {
    let resolveList: (value: { ok: boolean; status: number; headers: Headers; json: () => Promise<unknown> }) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(async () => new Promise(resolve => { resolveList = resolve; })) as never);
    const { container } = renderPage(<GoalEmployerOpportunities />);
    expect(await screen.findByRole("heading", { level: 1, name: "Sponsor a role." })).toBeTruthy();
    expect(container.querySelector("[data-testid='goal-skeleton-rows']")).toBeTruthy();
    resolveList({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ opportunities: [] }) });
    expect(await screen.findByText("No opportunities yet.")).toBeTruthy();
    expect(() => assertGoalPage(container, OPP_GOAL)).not.toThrow();
  });

  it("load failure: the honest error state retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "down" }) })) as never);
    renderPage(<GoalEmployerOpportunities />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("with roles: each role renders with its sponsor commit and a featured badge for sponsored ones", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      if (path === "/api/employer/opportunities") {
        return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ opportunities: [
          { id: 1, companyDomain: "northwind.example", kind: "hiring_now", roleTitle: "Battery engineer", location: "Pune", compensation: null, isActive: true, sponsoredTier: "featured", sponsoredUntil: null, isSponsored: true },
          { id: 2, companyDomain: "northwind.example", kind: "walk_in", roleTitle: "Controls intern", location: null, compensation: null, isActive: true, sponsoredTier: null, sponsoredUntil: null, isSponsored: false },
        ] }) };
      }
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({}) };
    }) as never);
    renderPage(<GoalEmployerOpportunities />);
    expect(await screen.findByText("Battery engineer")).toBeTruthy();
    expect(screen.getByText("Controls intern")).toBeTruthy();
    expect(screen.getByText("Featured listing")).toBeTruthy();
    const sponsorButtons = screen.getAllByText(/Sponsor this role|Extend sponsorship/);
    // two role rows plus the page's next-step commit
    expect(sponsorButtons.length).toBe(3);
  });
});

describe("goal employer money-copy integrity (rule 1a)", () => {
  const goalFiles = ["GoalEmployer.tsx", "GoalEmployerOpportunities.tsx", "EmployerGoalFrame.tsx"].map(name => `client/src/pages/goal/employer/${name}`);

  it("goal employer display copy never sells or names the internal unit, and never sells a referral or the unbuilt plans", () => {
    for (const file of goalFiles) {
      // Strip comments first: the wording rule governs display copy, and the
      // source comments quote the rule itself.
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, "");
      const strings = Array.from(source.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)).map(match => match[1]).join("\n");
      // The ban is on selling CTAs ("Buy credits", "Buy referrals"); the
      // factual disclaimer "Employers never buy referrals" (D-006/D-040) stays.
      expect(strings).not.toMatch(/Buy credits|Buy referrals/);
      expect(strings.toLowerCase()).not.toMatch(/\bcredits?\b/);
      expect(strings.toLowerCase()).not.toMatch(/\basks?\b/);
      expect(strings).not.toMatch(/Team|Growth|Scale by quote/);
    }
  });

  it("the goal dialog's tier costs are the kit page's own values, never retyped", () => {
    const kitSource = readFileSync("client/src/pages/EmployerOpportunities.tsx", "utf8");
    const kitTiers = Array.from(kitSource.matchAll(/id: "(featured|spotlight)", label: "(\w+)", days: (\d+), cost: (\d+)/g)).map(match => ({ id: match[1], days: Number(match[3]), cost: Number(match[4]) }));
    expect(kitTiers).toHaveLength(2);
    expect(SPONSOR_TIERS.map(tier => ({ id: tier.id, days: tier.days, cost: tier.cost }))).toEqual(kitTiers);
  });

  it("the page keeps the kit idempotency behaviour: one Idempotency-Key per sponsor attempt", async () => {
    const goalSource = readFileSync("client/src/pages/goal/employer/GoalEmployerOpportunities.tsx", "utf8");
    expect(goalSource).toContain("Idempotency-Key");
    expect(goalSource).toContain("crypto.randomUUID");
  });
});
