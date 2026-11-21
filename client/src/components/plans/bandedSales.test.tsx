// @vitest-environment jsdom
// BANDED-ui: /plans sells only from the server's answer to
// GET /api/chargebee/banded/offer (never a client flag or a guess). Every
// checkout is stubbed: no real payment, no provider call.
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_FAMILY, type PlanFamilyId, type PlanPriceBook } from "@shared/planFamily";
import { BANDED_REFUSALS, bandedReferralQuote, bandedReferralCheckoutRequestSchema, bandedPlanCheckoutRequestSchema } from "@shared/subscriptionManagement";
import { REFERRER_PURCHASE_REFUSED_CODE } from "@shared/referrerPurchases";
import PlansV2 from "@/pages/PlansV2";
import { money } from "./format";
import { BANDED_OFFER_PATH, BANDED_PLAN_CHECKOUT_PATH, BANDED_REFERRAL_CHECKOUT_PATH, BANDED_REFUSAL_COPY, useBandedSales } from "./bandedSales";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: redirect }));

const auth = { isSignedIn: true, getToken: vi.fn(async () => "test-token"), openSignIn: vi.fn() };

function Harness({ book }: { book: PlanPriceBook }) {
  const sales = useBandedSales({ book, isSignedIn: auth.isSignedIn, getToken: auth.getToken, openSignIn: auth.openSignIn });
  return <PlansV2 book={book} sales={sales} />;
}

function show(book: PlanPriceBook = "INR") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Harness book={book} /></QueryClientProvider>);
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Places = Partial<Record<PlanFamilyId, number>>;
const onSale = (memberPlan: PlanFamilyId | null = null, places: Places = {}) => ({
  onSale: true,
  memberPlan,
  plans: PLAN_FAMILY.map(plan => ({ planId: plan.id, byApplication: plan.byApplication === true, foundingPlacesLeft: places[plan.id] ?? 37 })),
});
const HOSTED = { checkoutUrl: "https://skipwait-test.chargebee.com/pages/v4/synthetic/checkout", hostedPageId: "synthetic-hosted-page" };

type Handler = (init: RequestInit | undefined, call: number) => Response | Promise<Response>;
function routes(table: Record<string, Handler>) {
  const counts: Record<string, number> = {};
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = Object.keys(table).find(key => url.startsWith(key));
    if (!path) throw new Error(`unexpected fetch ${url}`);
    counts[path] = (counts[path] ?? 0) + 1;
    return table[path](init, counts[path]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const posts = (fetchMock: ReturnType<typeof routes>, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === path && init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
const card = (label: string) => screen.getByRole("region", { name: label });
const buyIn = (label: string) => within(card(label)).queryByRole("button", { name: /^Buy / });

beforeEach(() => {
  auth.isSignedIn = true;
  auth.openSignIn.mockClear();
  redirect.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("BANDED-ui: the offer decides what /plans sells", () => {
  it("off: the server says not on sale, so every card keeps the honest not-on-sale state and nothing can be bought", async () => {
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, { onSale: false }) });
    show();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Checkout not switched on yet").length).toBe(PLAN_FAMILY.length));
    expect(screen.queryAllByRole("button", { name: /^Buy / })).toEqual([]);
    expect(screen.queryByRole("link", { name: /Apply/ })).toBeNull();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("off: a 409 not_on_sale answer from the offer route is the same off state, not an error", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(409, { code: BANDED_REFUSALS.notOnSale, error: "These plans are not on sale yet." }) });
    show();
    await waitFor(() => expect(screen.getAllByText("Checkout not switched on yet").length).toBe(PLAN_FAMILY.length));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loading: while the offer is checked no card offers a button", () => {
    routes({ [BANDED_OFFER_PATH]: () => new Promise<Response>(() => undefined) });
    show();
    expect(screen.getAllByText("Checking whether this plan is on sale…").length).toBe(PLAN_FAMILY.length);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("error: an unavailable offer shows a plain error with a retry that loads the live offer", async () => {
    routes({ [BANDED_OFFER_PATH]: (_init, call) => (call === 1 ? json(503, { error: "Plan checkout is not available right now." }) : json(200, onSale())) });
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t check whether these plans are on sale.");
    expect(screen.queryAllByRole("button", { name: /^Buy / })).toEqual([]);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("network failure: a thrown fetch says so in plain words and offers a retry", async () => {
    routes({ [BANDED_OFFER_PATH]: () => { throw new TypeError("Failed to fetch"); } });
    show();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t reach skipwait.me. Check your connection and try again.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("on sale: plan cards buy, Senior to Executive shows Apply with no checkout, places left come from the offer", async () => {
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, onSale(null, { early_to_mid: 412, mid_to_senior: 9, senior_to_executive: 3 })) });
    show();
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    expect(buyIn("Mid to Senior")).toBeTruthy();
    expect(buyIn("Senior to Executive")).toBeNull();
    const apply = within(card("Senior to Executive")).getByRole("link", { name: "Apply" });
    expect(apply.getAttribute("href")).toMatch(/^mailto:/);
    expect(within(card("Early to Mid")).getByTestId("places-left-early_to_mid").textContent).toBe("412");
    expect(within(card("Mid to Senior")).getByTestId("places-left-mid_to_senior").textContent).toBe("9");
    expect(within(card("Senior to Executive")).getByTestId("places-left-senior_to_executive").textContent).toBe("3");
    expect(screen.queryAllByText("Checkout not switched on yet")).toEqual([]);
    // One black commit on the page (DESIGN.md rule 1).
    expect(document.querySelectorAll("[data-g-primary]").length).toBe(1);
    expect(posts(fetchMock, BANDED_PLAN_CHECKOUT_PATH)).toEqual([]);
  });

  it("cap full: a band with no founding places left says so, with no buy", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale(null, { mid_to_senior: 0 })) });
    show();
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    expect(within(card("Mid to Senior")).getByText("Founding places for this plan are taken")).toBeTruthy();
    expect(buyIn("Mid to Senior")).toBeNull();
    expect(within(card("Mid to Senior")).queryByTestId("places-left-mid_to_senior")).toBeNull();
    expect(document.querySelectorAll("[data-g-primary]").length).toBe(1);
  });

  it("Buy posts the plan checkout with a fresh key and the billing country, then opens the hosted page", async () => {
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()), [BANDED_PLAN_CHECKOUT_PATH]: () => json(200, HOSTED) });
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "older-legacy-page", role: "job_seeker", kind: "plan" }));
    show("INR");
    await waitFor(() => expect(buyIn("Mid to Senior")).toBeTruthy());
    fireEvent.click(buyIn("Mid to Senior")!);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(HOSTED.checkoutUrl));
    const [body] = posts(fetchMock, BANDED_PLAN_CHECKOUT_PATH);
    expect(bandedPlanCheckoutRequestSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({ planId: "mid_to_senior", billingCountry: "IN" });
    // The legacy pass recovery must not run against a banded hosted page on return.
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("USD prices buy on the international billing route", async () => {
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()), [BANDED_PLAN_CHECKOUT_PATH]: () => json(200, HOSTED) });
    show("USD");
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    fireEvent.click(buyIn("Early to Mid")!);
    await waitFor(() => expect(redirect).toHaveBeenCalled());
    expect(posts(fetchMock, BANDED_PLAN_CHECKOUT_PATH)[0]).toMatchObject({ planId: "early_to_mid", billingCountry: "INTL" });
  });

  it("a network retry reuses the same key; a refused attempt starts the next one with a new key", async () => {
    const fetchMock = routes({
      [BANDED_OFFER_PATH]: () => json(200, onSale()),
      [BANDED_PLAN_CHECKOUT_PATH]: (_init, call) => {
        if (call === 1) throw new TypeError("Failed to fetch");
        if (call === 2) return json(409, { code: BANDED_REFUSALS.checkoutKeyUsed, error: "This checkout was already started." });
        return json(200, HOSTED);
      },
    });
    show();
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    fireEvent.click(buyIn("Early to Mid")!);
    expect(await within(card("Early to Mid")).findByText(/Check your connection/)).toBeTruthy();
    fireEvent.click(buyIn("Early to Mid")!);
    expect(await within(card("Early to Mid")).findByText(BANDED_REFUSAL_COPY.checkout_key_used)).toBeTruthy();
    fireEvent.click(buyIn("Early to Mid")!);
    await waitFor(() => expect(redirect).toHaveBeenCalled());
    const keys = posts(fetchMock, BANDED_PLAN_CHECKOUT_PATH).map(body => body.idempotencyKey);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("signed out: Buy opens seeker sign-in and posts nothing", async () => {
    auth.isSignedIn = false;
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()) });
    show();
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    fireEvent.click(buyIn("Early to Mid")!);
    expect(auth.openSignIn).toHaveBeenCalledTimes(1);
    expect(posts(fetchMock, BANDED_PLAN_CHECKOUT_PATH)).toEqual([]);
  });

  it("a member sees their plan named and no plan checkout anywhere", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale("early_to_mid")) });
    show();
    expect(await within(card("Early to Mid")).findByText("Your plan")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Buy (Early|Mid|Senior) to / })).toEqual([]);
    expect(within(card("Mid to Senior")).getByText("You already have a plan")).toBeTruthy();
  });

  it("a founding_full refusal refreshes the offer so the card shows the real cap state", async () => {
    routes({
      [BANDED_OFFER_PATH]: (_init, call) => json(200, onSale(null, call === 1 ? {} : { mid_to_senior: 0 })),
      [BANDED_PLAN_CHECKOUT_PATH]: () => json(409, { code: BANDED_REFUSALS.foundingFull, error: "Founding places are taken." }),
    });
    show();
    await waitFor(() => expect(buyIn("Mid to Senior")).toBeTruthy());
    fireEvent.click(buyIn("Mid to Senior")!);
    expect(await within(card("Mid to Senior")).findByText("Founding places for this plan are taken")).toBeTruthy();
    expect(buyIn("Mid to Senior")).toBeNull();
  });
});

describe("BANDED-ui: extra referrals inside the member's band", () => {
  it("a member can buy only at levels inside the band; the quote equals the POST body and opens the hosted page", async () => {
    const fetchMock = routes({ [BANDED_OFFER_PATH]: () => json(200, onSale("early_to_mid")), [BANDED_REFERRAL_CHECKOUT_PATH]: () => json(200, HOSTED) });
    show("INR");
    const extras = await screen.findByRole("region", { name: "Buy extra referrals" });
    expect(within(extras).getByLabelText("Early referral requests")).toBeTruthy();
    expect(within(extras).getByLabelText("Mid referral requests")).toBeTruthy();
    expect(within(extras).queryByLabelText("Senior referral requests")).toBeNull();
    expect(within(extras).queryByLabelText("Executive referral requests")).toBeNull();
    const buy = within(extras).getByRole("button", { name: /^Buy extra referrals/ });
    expect(buy.getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(within(extras).getByLabelText("Early referral requests"), { target: { value: "10" } });
    fireEvent.click(within(extras).getByRole("button", { name: "Add one Mid referral request" }));
    fireEvent.click(within(extras).getByRole("button", { name: "Add one Mid referral request" }));
    const quote = bandedReferralQuote([{ level: "early", quantity: 10 }, { level: "mid", quantity: 2 }], "INR");
    expect(quote.discountPct).toBeGreaterThan(0);
    expect(within(extras).getByTestId("extras-total").textContent).toBe(money(quote.total, "INR"));
    expect(within(extras).getByTestId("extras-discount").textContent).toBe(`${quote.discountPct}% · −${money(quote.discount, "INR")}`);
    expect(within(extras).getByTestId("extras-subtotal").textContent).toBe(money(quote.subtotal, "INR"));

    fireEvent.click(within(extras).getByRole("button", { name: /^Buy extra referrals/ }));
    await waitFor(() => expect(redirect).toHaveBeenCalledWith(HOSTED.checkoutUrl));
    const [body] = posts(fetchMock, BANDED_REFERRAL_CHECKOUT_PATH);
    expect(bandedReferralCheckoutRequestSchema.parse(body)).toEqual(body);
    expect(body.items).toEqual([{ level: "early", quantity: 10 }, { level: "mid", quantity: 2 }]);
    expect(body.billingCountry).toBe("IN");
    expect(bandedReferralQuote(body.items, "INR")).toEqual(quote);
  });

  it("a Senior to Executive member sees only Senior and Executive", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale("senior_to_executive")) });
    show("USD");
    const extras = await screen.findByRole("region", { name: "Buy extra referrals" });
    expect(within(extras).getByLabelText("Senior referral requests")).toBeTruthy();
    expect(within(extras).getByLabelText("Executive referral requests")).toBeTruthy();
    expect(within(extras).queryByLabelText("Early referral requests")).toBeNull();
  });

  it("a non-member is told extra referrals come with a plan, with no extras checkout", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()) });
    show();
    const extras = await screen.findByRole("region", { name: "Buy extra referrals" });
    expect(extras.textContent).toContain("Extra referrals are for plan members. Choose a plan first.");
    expect(within(extras).queryByRole("button", { name: /^Buy extra referrals/ })).toBeNull();
  });

  it("off: no extras checkout is offered", async () => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, { onSale: false }) });
    show();
    await waitFor(() => expect(screen.getAllByText("Checkout not switched on yet").length).toBe(PLAN_FAMILY.length));
    expect(screen.queryByRole("region", { name: "Buy extra referrals" })).toBeNull();
  });
});

describe("BANDED-ui: every refusal code has one plain line", () => {
  const codes = Object.values(BANDED_REFUSALS);

  it("the copy table covers exactly the contract's codes and uses referral words only", () => {
    expect(Object.keys(BANDED_REFUSAL_COPY).sort()).toEqual([...codes, REFERRER_PURCHASE_REFUSED_CODE].sort());
    for (const line of Object.values(BANDED_REFUSAL_COPY)) {
      expect(line).not.toMatch(/\bcredits?\b|\basks?\b/i);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it.each(codes)("plan checkout refusal %s shows its line", async code => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()), [BANDED_PLAN_CHECKOUT_PATH]: () => json(code === BANDED_REFUSALS.applicationRequired ? 403 : 409, { code, error: "server words" }) });
    show();
    await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
    await act(async () => { fireEvent.click(buyIn("Early to Mid")!); });
    expect(await screen.findByText(BANDED_REFUSAL_COPY[code])).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(codes)("extra-referral refusal %s shows its line", async code => {
    routes({ [BANDED_OFFER_PATH]: () => json(200, onSale("mid_to_senior")), [BANDED_REFERRAL_CHECKOUT_PATH]: () => json(409, { code, error: "server words" }) });
    show();
    const extras = await screen.findByRole("region", { name: "Buy extra referrals" });
    fireEvent.click(within(extras).getByRole("button", { name: "Add one Senior referral request" }));
    await act(async () => { fireEvent.click(within(extras).getByRole("button", { name: /^Buy extra referrals/ })); });
    expect(await screen.findByText(BANDED_REFUSAL_COPY[code])).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("an outage, a rejected body and a provider failure each say nothing was charged", async () => {
    for (const [status, pattern] of [[503, /Payments are not available right now/], [400, /Refresh the page/], [502, /couldn’t open the secure checkout/]] as const) {
      routes({ [BANDED_OFFER_PATH]: () => json(200, onSale()), [BANDED_PLAN_CHECKOUT_PATH]: () => json(status, { error: "server words" }) });
      show();
      await waitFor(() => expect(buyIn("Early to Mid")).toBeTruthy());
      fireEvent.click(buyIn("Early to Mid")!);
      const line = await within(card("Early to Mid")).findByText(pattern);
      expect(line.textContent).toContain("Nothing has been charged.");
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
