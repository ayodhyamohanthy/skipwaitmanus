// @vitest-environment jsdom
// D-048-p3-employer-billing: the goal /employer/billing surface (packet
// docs/plans/D-048-employer.md §3, §5). The kit page (client/src/pages/EmployerBilling.tsx)
// has no test file of its own, so these pins hold the behaviour the goal page
// must keep and the money contract the server actually enforces:
// - every state the kit page can be in: loading, load failure, signed out, no
//   employer account, restricted access, empty spend, and the spend record;
// - exactly one black commit, and it names what the money buys (§3: "Top up for
//   talent unlocks and sponsored roles"), never "Buy credits" (§4 rule 1a);
// - POST /api/employer/unlock-credits/purchase carries an Idempotency-Key the
//   route requires (/^[\x21-\x7E]{16,64}$/, else 428), one key per attempt, kept
//   across its retries and reset when a different pack is selected;
// - no success is claimed before the provider captures the payment, and the
//   ledger reloads when it does;
// - pack values are the kit page's own numbers, never retyped (§4.1).
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import GoalEmployerBilling, { GOAL_PAGE } from "./GoalEmployerBilling";
import { UNLOCK_PACKS, rupee } from "./unlockPacks";
import { assertGoalPage } from "@/test/goalPageContract";

vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

// SignInButton is deliberately NOT mocked: it renders its own <button> around any
// child that is not literally a "button" element, so wrapping a GoalButton in it
// nests interactive elements — invisible to a passthrough mock and only visible in
// a real-browser capture. The gate uses useAuth().openSignIn instead, and the
// signed-out test below pins the absence of nesting.
const { authState, openSignIn } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: true },
  openSignIn: vi.fn(),
}));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ ...authState, openSignIn: () => openSignIn() }),
  useUser: () => ({ user: null }),
}));

const PURCHASE_PATH = "/api/employer/unlock-credits/purchase";
const ACCOUNT = { id: 7, companyName: "Northwind Robotics", billingEmail: "hire@northwind.example", credits: 8, budgetMonthlyUsdCents: 5000, approvalStatus: "approved" };
const SPEND = [
  { kind: "sponsorship", creditsSpent: 10, opportunityId: 4, tier: "featured", createdAt: "2026-10-07T05:00:00.000Z" },
  { kind: "credit_purchase", creditsAdded: 50, pack: "growth", createdAt: "2026-10-06T05:00:00.000Z" },
  { kind: "profile_unlock", creditsSpent: 5, displayRef: "Access record", createdAt: "2026-10-05T05:00:00.000Z" },
];

type PurchaseReply = { status: number; body?: unknown };
type Server = {
  account?: unknown;
  accountStatus?: number;
  spend?: unknown[];
  spendStatus?: number;
  purchase?: PurchaseReply[];
  hang?: boolean;
};

type Call = { path: string; method: string; headers: Record<string, string>; body: string };
let calls: Call[] = [];

const json = (status: number, body: unknown, path: string) => ({ ok: status < 400, status, url: `http://localhost:3000${path}`, headers: new Headers({ "content-type": "application/json" }), json: async () => body });

const serve = (server: Server) => {
  calls = [];
  let purchaseIndex = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (path === PURCHASE_PATH) {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = String(init?.body ?? "");
      calls.push({ path, method: init?.method ?? "GET", headers, body });
      // The default reply describes the pack the request actually names, so a
      // test cannot pass on an order that belongs to a different selection.
      const requested = UNLOCK_PACKS.find(pack => pack.id === JSON.parse(body || "{}").pack) ?? UNLOCK_PACKS[0];
      const reply = server.purchase?.[Math.min(purchaseIndex, (server.purchase?.length ?? 1) - 1)]
        ?? { status: 200, body: { orderId: "order_test_1", amount: requested.amountInPaise, currency: "INR", keyId: "rzp_test_key", pack: requested.id, credits: requested.adds } };
      purchaseIndex += 1;
      return json(reply.status, reply.body ?? { error: "We could not start the Razorpay checkout. Try again shortly." }, path);
    }
    if (server.hang) return new Promise<never>(() => undefined);
    if (path === "/api/employer/account") {
      calls.push({ path, method: "GET", headers: {}, body: "" });
      if (server.accountStatus) return json(server.accountStatus, { error: "We could not load your employer account" }, path);
      return json(200, { account: server.account === undefined ? ACCOUNT : server.account }, path);
    }
    if (path === "/api/employer/spend-history") {
      calls.push({ path, method: "GET", headers: {}, body: "" });
      if (server.spendStatus === 403) return json(403, { error: "Employer access is required" }, path);
      return json(server.spendStatus ?? 200, { spend: server.spend ?? [] }, path);
    }
    return json(404, { error: "not mocked" }, path);
  }) as never);
};

/** A distinct printable-ASCII key per crypto.randomUUID() call, so the page's
 * attempt-scoping is observable rather than accidentally identical. */
let keySequence = 0;
const stubKeys = () => {
  keySequence = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `idem-${String(++keySequence).padStart(4, "0")}-${"a".repeat(24)}` });
};

/** The provider widget: the data module must find it already loaded, and the
 * options it is constructed with are the money facts sent to Razorpay. */
let widgetOptions: Record<string, unknown> = {};
let widgetOpened = 0;
const stubRazorpay = () => {
  widgetOptions = {};
  widgetOpened = 0;
  class Razorpay {
    constructor(options: Record<string, unknown>) { widgetOptions = options; }
    open() { widgetOpened += 1; }
  }
  (window as unknown as { Razorpay?: unknown }).Razorpay = Razorpay;
};

const purchaseCalls = () => calls.filter(call => call.path === PURCHASE_PATH);
const idempotencyKeys = () => purchaseCalls().map(call => call.headers["Idempotency-Key"]);

/** Serve a checked-in capture fixture verbatim. The browser harness
 * (scripts/kit-screens/capture.mjs) fulfils each route with the fixture's own
 * `body`, so a fixture with the wrong envelope renders a state the page never
 * claims; this helper makes that drift fail here instead of only in a capture. */
const serveFixture = (name: string) => {
  const fixture = JSON.parse(readFileSync(`design/goal-ui/captures/employer-billing/goal-employer-billing__${name}.json`, "utf8")) as {
    routes: Array<{ method?: string; path: string; match?: string; status?: number; body?: unknown }>;
  };
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ path, method, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") });
    const hit = fixture.routes.find(route => (route.method ?? "GET").toUpperCase() === method && (route.match === "prefix" ? path.startsWith(route.path) : path === route.path));
    if (!hit) return json(404, { error: "not mocked" }, path);
    return json(hit.status ?? 200, hit.body ?? {}, path);
  }) as never);
};

const renderPage = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  authState.isSignedIn = true;
  authState.isLoaded = true;
  openSignIn.mockClear();
});

describe("goal /employer/billing states", () => {
  it("opens on the goal line with one commit that names what the money buys", async () => {
    serve({ account: ACCOUNT, spend: SPEND });
    const { container } = renderPage(<GoalEmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    // The goal line is present while the account and the ledger are still in
    // flight, so the loaded content is what marks this state as settled.
    expect(await screen.findByText("Talent unlock balance")).toBeTruthy();
    expect(container.querySelector("[data-goal-page='employer']")).toBeTruthy();
    expect(container.querySelector("[data-skipwait-screen='employer-billing']")).toBeTruthy();
    expect(screen.getByText("Monthly promotion budget: $50")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ })).toBeTruthy();
    expect(container.querySelector("button button, a button, button a")).toBeNull();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
  });

  it("loading: skeleton rows while the account and the ledger are in flight", async () => {
    serve({ hang: true });
    renderPage(<GoalEmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    expect(screen.getByTestId("goal-skeleton-rows")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Top up for talent unlocks/ })).toBeNull();
  });

  it("load failure: an honest alert, nothing changed, and the retry is the one commit", async () => {
    serve({ accountStatus: 500 });
    const { container } = renderPage(<GoalEmployerBilling />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We could not load your employer account");
    expect(alert.textContent).toContain("Nothing was changed");
    expect(screen.queryByTestId("goal-skeleton-rows")).toBeNull();
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(retry.hasAttribute("data-g-primary")).toBe(true);
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
    const before = calls.filter(call => call.path === "/api/employer/account").length;
    fireEvent.click(retry);
    await waitFor(() => expect(calls.filter(call => call.path === "/api/employer/account").length).toBeGreaterThan(before));
  });

  it("signed out: the sign-in gate keeps the goal line and starts no charge", async () => {
    authState.isSignedIn = false;
    serve({ account: ACCOUNT });
    const { container } = renderPage(<GoalEmployerBilling />);
    expect(await screen.findByRole("heading", { level: 1, name: "Control what you spend." })).toBeTruthy();
    const commit = screen.getByRole("button", { name: "Sign in to continue" });
    expect(commit.hasAttribute("data-g-primary")).toBe(true);
    expect(container.querySelector("button button, a button, button a")).toBeNull();
    fireEvent.click(commit);
    await waitFor(() => expect(openSignIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Top up for talent unlocks/ })).toBeNull();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
  });

  it("no employer account yet: the commit is inert and says what must happen first", async () => {
    // The real server answer for a signed-in user with no employer account: the
    // account route answers { account: null } and the approved-employer ledger
    // answers 403 (server/employerRoutes.ts requireEmployer). The page must name
    // the missing account, not the restricted-tools state that follows from it.
    serve({ account: null, spendStatus: 403 });
    const { container } = renderPage(<GoalEmployerBilling />);
    const commit = await screen.findByRole("button", { name: /Top up for talent unlocks/ });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Open your employer account first")).toBeTruthy();
    expect(screen.queryByText("Employer tools, including top-ups, are closed for this account.")).toBeNull();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    expect(purchaseCalls()).toHaveLength(0);
  });

  it("restricted access: the ledger notice is honest and the top-up commit cannot charge", async () => {
    serve({ account: { ...ACCOUNT, approvalStatus: "pending", decisionNote: null }, spendStatus: 403 });
    const { container } = renderPage(<GoalEmployerBilling />);
    expect(await screen.findByText("Employer tools, including top-ups, are closed for this account.")).toBeTruthy();
    const commit = screen.getByRole("button", { name: /Top up for talent unlocks/ });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Top-ups open when your employer access is active")).toBeTruthy();
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
    fireEvent.click(commit);
    expect(purchaseCalls()).toHaveLength(0);
  });

  it("the committed restricted fixture renders the account it carries, not the no-account state", async () => {
    // The capture harness serves this fixture's bodies verbatim, so its account
    // envelope must be the route's own `{ account }` (server/employerRoutes.ts:101).
    serveFixture("restricted");
    const { container } = renderPage(<GoalEmployerBilling />);
    expect(await screen.findByText("Employer tools, including top-ups, are closed for this account.")).toBeTruthy();
    expect(screen.getByText("Talent unlock balance")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Employer access is under review")).toBeTruthy();
    expect(screen.queryByText("No employer account yet.")).toBeNull();
    const commit = screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ });
    expect(commit.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(commit);
    expect(purchaseCalls()).toHaveLength(0);
    expect(() => assertGoalPage(container, GOAL_PAGE)).not.toThrow();
  });

  it("empty ledger: the honest empty state, not a fabricated record", async () => {
    serve({ account: ACCOUNT, spend: [] });
    renderPage(<GoalEmployerBilling />);
    expect(await screen.findByText("No spend yet.")).toBeTruthy();
    expect(screen.getByText(/top-ups, talent unlocks and sponsored roles appear here/)).toBeTruthy();
  });

  it("the spend record renders each ledger kind the server sends", async () => {
    serve({ account: ACCOUNT, spend: SPEND });
    renderPage(<GoalEmployerBilling />);
    expect(await screen.findByText("Sponsored a role · Featured listing")).toBeTruthy();
    expect(screen.getByText("Top-up added 50 to your balance · growth pack")).toBeTruthy();
    expect(screen.getByText("Talent unlock · Access record")).toBeTruthy();
    expect(screen.getByText("+50")).toBeTruthy();
    expect(screen.getByText("−10")).toBeTruthy();
  });

  it("a capped ledger only promises what it holds", async () => {
    serve({ account: ACCOUNT, spend: Array.from({ length: 50 }, (_, index) => ({ kind: "profile_unlock", creditsSpent: 5, displayRef: "Access record", createdAt: `2026-10-${String(index % 28 + 1).padStart(2, "0")}T05:00:00.000Z` })) });
    renderPage(<GoalEmployerBilling />);
    expect(await screen.findByText(/Showing your latest 50 entries/)).toBeTruthy();
  });
});

describe("goal /employer/billing top-up money path", () => {
  it("sends the selected pack with a valid Idempotency-Key and opens the provider order", async () => {
    serve({ account: ACCOUNT, spend: SPEND });
    stubKeys();
    stubRazorpay();
    const { container } = renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 50 to your balance/ }));
    expect(screen.getByText(/₹129 one-time, adds 50 to your balance/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(1));
    const [call] = purchaseCalls();
    expect(call.body).toBe('{"pack":"growth"}');
    expect(call.headers["Idempotency-Key"]).toMatch(/^[\x21-\x7E]{16,64}$/);
    await waitFor(() => expect(widgetOpened).toBe(1));
    expect(widgetOptions).toMatchObject({ key: "rzp_test_key", amount: 12900, currency: "INR", order_id: "order_test_1" });
    expect(typeof widgetOptions.handler).toBe("function");
    expect(container.querySelectorAll("[data-g-primary]")).toHaveLength(1);
  });

  it("claims nothing before the payment is captured, and reloads the ledger when it is", async () => {
    serve({ account: ACCOUNT, spend: SPEND });
    stubKeys();
    stubRazorpay();
    renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 10 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(widgetOpened).toBe(1));
    const said = vi.mocked(toast).mock.calls.map(args => String(args[0])).join(" ");
    expect(said).not.toMatch(/captured|added to your account/i);
    expect(said).toMatch(/Razorpay/);
    const ledgerBefore = calls.filter(call => call.path === "/api/employer/spend-history").length;
    (widgetOptions.handler as () => void)();
    await waitFor(() => expect(calls.filter(call => call.path === "/api/employer/spend-history").length).toBeGreaterThan(ledgerBefore));
  });

  it("one key per attempt: a failed checkout retries with the same key, and a new pack starts a new one", async () => {
    serve({
      account: ACCOUNT,
      spend: SPEND,
      purchase: [
        { status: 502, body: { error: "We could not start the Razorpay checkout. Try again shortly." } },
        { status: 200, body: { orderId: "order_test_2", amount: 12900, currency: "INR", keyId: "rzp_test_key", pack: "growth", credits: 50 } },
      ],
    });
    stubKeys();
    stubRazorpay();
    renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 50 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(widgetOpened).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(2));
    const [first, second] = idempotencyKeys();
    expect(second).toBe(first);
    await waitFor(() => expect(widgetOpened).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /Adds 200 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(3));
    expect(idempotencyKeys()[2]).not.toBe(first);
    expect(purchaseCalls()[2].body).toBe('{"pack":"scale"}');
  });

  it("a checkout still being prepared is stated as such, with no order opened", async () => {
    serve({ account: ACCOUNT, spend: SPEND, purchase: [{ status: 202, body: { status: "creating", retryAfterSeconds: 5 } }] });
    stubKeys();
    stubRazorpay();
    renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 10 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(1));
    expect((await screen.findByRole("alert")).textContent).toMatch(/preparing your checkout/i);
    expect(widgetOpened).toBe(0);
  });

  it("the order the page opens belongs to the pack the employer selected", async () => {
    serve({ account: ACCOUNT, spend: SPEND });
    stubKeys();
    stubRazorpay();
    renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 200 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(widgetOpened).toBe(1));
    const scale = UNLOCK_PACKS.find(pack => pack.id === "scale");
    expect(scale).toBeTruthy();
    expect(purchaseCalls()[0].body).toBe('{"pack":"scale"}');
    expect(widgetOptions.amount).toBe(scale?.amountInPaise);
    expect(widgetOptions.amount).toBe(39900);
  });

  it("opens matched checkout for starter, growth, and scale packs", async () => {
    for (const pack of UNLOCK_PACKS) {
      cleanup();
      serve({ account: ACCOUNT, spend: SPEND });
      stubKeys();
      stubRazorpay();
      renderPage(<GoalEmployerBilling />);
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Adds ${pack.adds} to your balance`) }));
      fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
      await waitFor(() => expect(widgetOpened).toBe(1));
      expect(purchaseCalls()[0].body).toBe(JSON.stringify({ pack: pack.id }));
      expect(widgetOptions).toMatchObject({
        key: "rzp_test_key",
        amount: pack.amountInPaise,
        currency: "INR",
        order_id: "order_test_1",
      });
    }
  });

  it("rejects an order whose returned pack does not match the selection before opening checkout", async () => {
    serve({
      account: ACCOUNT,
      spend: SPEND,
      purchase: [{
        status: 200,
        body: { orderId: "order_mismatched", amount: 12900, currency: "INR", keyId: "rzp_test_key", pack: "growth", credits: 50 },
      }],
    });
    stubKeys();
    stubRazorpay();
    renderPage(<GoalEmployerBilling />);
    fireEvent.click(await screen.findByRole("button", { name: /Adds 10 to your balance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
    await waitFor(() => expect(purchaseCalls()).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(purchaseCalls()[0].body).toBe('{"pack":"starter"}');
    expect(widgetOpened).toBe(0);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/We could not start the Razorpay checkout/);
  });

  it("rejects returned orders with incompatible amount, currency, or units", async () => {
    const invalidReplies = [
      { orderId: "order_bad_amt", amount: 9999, currency: "INR", keyId: "rzp_test_key", pack: "starter", credits: 10 },
      { orderId: "order_bad_cur", amount: 2900, currency: "USD", keyId: "rzp_test_key", pack: "starter", credits: 10 },
      { orderId: "order_bad_units", amount: 2900, currency: "INR", keyId: "rzp_test_key", pack: "starter", credits: 50 },
    ];
    for (const reply of invalidReplies) {
      cleanup();
      serve({ account: ACCOUNT, spend: SPEND, purchase: [{ status: 200, body: reply }] });
      stubKeys();
      stubRazorpay();
      renderPage(<GoalEmployerBilling />);
      fireEvent.click(await screen.findByRole("button", { name: /Adds 10 to your balance/ }));
      fireEvent.click(screen.getByRole("button", { name: /Top up for talent unlocks and sponsored roles/ }));
      await waitFor(() => expect(purchaseCalls()).toHaveLength(1));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(widgetOpened).toBe(0);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/We could not start the Razorpay checkout/);
    }
  });
});

describe("goal employer billing money-copy integrity (rule 1a)", () => {
  const displayFiles = ["client/src/pages/goal/employer-billing/GoalEmployerBilling.tsx", "client/src/pages/goal/employer-billing/unlockPacks.ts"];

  /** Every quoted or templated literal in the display files, comments stripped:
   * the rule governs employer-facing copy, and the internal identifiers
   * (account.credits, creditsAdded, the purchase path) live in the data module. */
  const displayStrings = (file: string) => {
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, "");
    return Array.from(source.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g))
      .map(match => match[1] ?? match[2] ?? match[3] ?? "")
      .join("\n");
  };

  it("no employer-facing string says the internal unit or the noun for a request", () => {
    for (const file of displayFiles) {
      const strings = displayStrings(file);
      expect(strings).not.toMatch(/Buy credits|Buy referrals/);
      expect(strings.toLowerCase()).not.toMatch(/\bcredits?\b/);
      expect(strings.toLowerCase()).not.toMatch(/\basks?\b/);
    }
  });

  it("nothing sells a referral or the unbuilt Oct 25 company plans", () => {
    for (const file of displayFiles) {
      expect(displayStrings(file)).not.toMatch(/Team|Growth|Scale by quote/);
    }
    expect(displayStrings(displayFiles[0])).toMatch(/Employers never buy referrals/);
  });

  it("the pack values are the kit page's own numbers, never retyped", () => {
    const kitSource = readFileSync("client/src/pages/EmployerBilling.tsx", "utf8");
    const kitPacks = Array.from(kitSource.matchAll(/id: "(starter|growth|scale)", credits: (\d+), priceInr: (\d+), amountInPaise: (\d+)/g))
      .map(match => ({ id: match[1], adds: Number(match[2]), priceInr: Number(match[3]), amountInPaise: Number(match[4]) }));
    expect(kitPacks).toHaveLength(3);
    expect(UNLOCK_PACKS.map(pack => ({ id: pack.id, adds: pack.adds, priceInr: pack.priceInr, amountInPaise: pack.amountInPaise }))).toEqual(kitPacks);
  });

  it("the rupee label comes from the pack table, so a price change cannot drift", () => {
    expect(rupee(UNLOCK_PACKS[0].amountInPaise)).toBe(`₹${UNLOCK_PACKS[0].priceInr}`);
    expect(UNLOCK_PACKS.every(pack => pack.priceInr === pack.amountInPaise / 100)).toBe(true);
  });

  it("the checkout contract stays where the route enforces it", () => {
    // The key is attempt-scoped, so it is born on the page; the header itself is
    // set by the data module, which owns the route.
    expect(readFileSync("client/src/pages/goal/employer-billing/GoalEmployerBilling.tsx", "utf8")).toContain("crypto.randomUUID");
    expect(readFileSync("client/src/pages/goal/employer-billing/employerBillingData.ts", "utf8")).toContain("Idempotency-Key");
  });
});

describe("goal employer billing at phone width (capture checklist)", () => {
  // Measured in Chromium at 390px on 2026-11-06: a single-column grid whose
  // track is left as `auto` takes its min-content width from a nowrap child
  // (the truncated ledger label), so the page scrolled to 486px and the capture
  // reported horizontalOverflowPx: 96. Declaring each grid's track as
  // minmax(0, 1fr) — Tailwind's grid-cols-1 — keeps the page at 390px. The
  // browser measurement lives in the PR; this pin stops the class being dropped.
  it("every single-column grid declares its track so a long ledger label cannot widen the page", () => {
    const source = readFileSync("client/src/pages/goal/employer-billing/GoalEmployerBilling.tsx", "utf8");
    const grids = Array.from(source.matchAll(/className="([^"]*\bgrid\b[^"]*)"/g)).map(match => match[1]);
    expect(grids.length).toBeGreaterThan(0);
    expect(grids.every(classes => /\bgrid-cols-1\b/.test(classes))).toBe(true);
  });
});
