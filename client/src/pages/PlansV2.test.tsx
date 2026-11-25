// @vitest-environment jsdom
// PlansV2 render for the FROZEN banded model (owner freeze Oct 25 2026,
// phonemsg-01M5SNVZEY1P8K169J48T2HGTJ). Number-to-config pins live in
// plansV2.config-guard.test.tsx; this file pins the page structure and the
// read-only checkout state.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BAND_LEVELS, LEVEL_DISPLAY_NAME, PLAN_FAMILY } from "@shared/planFamily";
import PlansV2 from "./PlansV2";
import PlansV2Connected from "./PlansV2Connected";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token", openSignIn: () => undefined }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ profile: { level: { invalidate: vi.fn() } } }),
  profile: { level: { useQuery: () => ({ data: null }) }, setLevel: { useMutation: () => ({ mutate: vi.fn() }) } },
} }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("PlansV2 frozen banded render", () => {
  it("opens with 'Choose your referrers.' and renders one card per frozen band", () => {
    render(<PlansV2 book="INR" />);
    expect(screen.getByRole("heading", { level: 1, name: "Choose your referrers." })).toBeTruthy();
    for (const plan of PLAN_FAMILY) {
      expect(screen.getByRole("region", { name: plan.label })).toBeTruthy();
    }
  });

  it("names the band's referrer levels on every card", () => {
    render(<PlansV2 book="INR" />);
    for (const plan of PLAN_FAMILY) {
      const row = screen.getByTestId(`band-${plan.id}`);
      for (const level of BAND_LEVELS[plan.id]) {
        expect(row.textContent).toContain(LEVEL_DISPLAY_NAME[level]);
      }
    }
  });

  it("renders the extra-referrals table with one price cell per level", () => {
    render(<PlansV2 book="INR" />);
    for (const level of ["early", "mid", "senior", "executive"] as const) {
      expect(screen.getByTestId(`topup-${level}`).textContent).toMatch(/^₹/);
    }
  });

  it("USD book renders dollar prices", () => {
    render(<PlansV2 book="USD" />);
    for (const level of ["early", "mid", "senior", "executive"] as const) {
      expect(screen.getByTestId(`topup-${level}`).textContent).toMatch(/^\$/);
    }
  });

  it("shows the founding-member terms (caps counted as issued, lock while active, lapse ends lock)", () => {
    render(<PlansV2 book="INR" />);
    const terms = screen.getByRole("region", { name: "Founding-member terms" });
    expect(terms.textContent).toContain("does not reopen its spot");
    expect(terms.textContent).toContain("continuously active");
    expect(terms.textContent).toContain("the lock ends");
    expect(terms.textContent).not.toMatch(/after the cap.*regular price/i);
  });

  it("read-only: every card shows a disabled non-transactional checkout state inline, no purchase CTA", () => {
    render(<PlansV2 book="INR" />);
    const off = screen.getAllByText("Checkout not switched on yet");
    expect(off.length).toBe(PLAN_FAMILY.length);
    for (const el of off) expect(el.getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryAllByRole("button").length).toBe(0);
    expect(document.body.textContent).not.toContain("checkoutUrl");
    expect(document.body.textContent).not.toMatch(/Start Early|Start Mid|Apply for/);
  });

  it("states queue-fairness: reach sets who you can ask, never your place in a queue (F2, D-006/D-040)", () => {
    render(<PlansV2 book="INR" />);
    expect(document.body.textContent).toContain("Reach sets who you can ask. It never changes your place in a queue.");
  });

  it("states that counts are referral requests that reach a verified employee and never guarantee acceptance (F1, D-219)", () => {
    render(<PlansV2 book="INR" />);
    expect(document.body.textContent).toMatch(/referral requests that reach a verified employee/i);
    expect(document.body.textContent).toMatch(/never promise or guarantee an accepted/i);
  });
});

describe("PlansV2Connected sells from the server's banded offer (BANDED-ui)", () => {
  const offer = { onSale: true, memberPlan: null, plans: PLAN_FAMILY.map(plan => ({ planId: plan.id, byApplication: plan.byApplication === true, foundingPlacesLeft: 5 })) };
  function stubFetch(body: unknown) {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(String(url).startsWith("/api/chargebee/banded/offer") ? body : { error: "offline" }), { status: String(url).startsWith("/api/chargebee/banded/offer") ? 200 : 503, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const renderConnected = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlansV2Connected /></QueryClientProvider>);

  it("turns the plan buttons on when the offer says on sale", async () => {
    window.history.pushState({}, "", "/plans?currency=INR");
    stubFetch(offer);
    renderConnected();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Buy / }).length).toBe(2));
    expect(screen.queryAllByText("Checkout not switched on yet")).toEqual([]);
  });

  it("keeps the not-on-sale state when the offer says off", async () => {
    window.history.pushState({}, "", "/plans?currency=INR");
    const fetchMock = stubFetch({ onSale: false });
    renderConnected();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/chargebee/banded/offer"))).toBe(true));
    expect(screen.getAllByText("Checkout not switched on yet").length).toBe(PLAN_FAMILY.length);
    expect(screen.queryAllByRole("button", { name: /^Buy / })).toEqual([]);
  });

  it("offers no purchase on the referrer role and never reads the offer (D-055)", async () => {
    window.history.pushState({}, "", "/plans?role=referrer");
    const fetchMock = stubFetch(offer);
    renderConnected();
    expect(screen.getAllByText("Checkout not switched on yet").length).toBe(PLAN_FAMILY.length);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/chargebee/"))).toBe(false);
    expect(screen.queryAllByRole("button", { name: /^Buy / })).toEqual([]);
  });
});
