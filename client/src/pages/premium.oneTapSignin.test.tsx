// @vitest-environment jsdom
// D-095 one-tap: signed-out Pay sends a job seeker to the in-app /sign-in (all providers) and back to the exact pack.
// Flag off (shipped state, D-097): the old AuthKit redirect is untouched.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const flag = vi.hoisted(() => ({ on: true }));
const openSignIn = vi.hoisted(() => vi.fn());
vi.mock("@/lib/oneTap", () => ({ get ONE_TAP_PAY_SIGNIN() { return flag.on; } }));
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: vi.fn(async () => null), openSignIn }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
import Premium from "./Premium";

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function stubAssign() { const assign = vi.fn(); vi.stubGlobal("location", { ...window.location, assign, search: window.location.search, href: window.location.href, origin: window.location.origin, pathname: window.location.pathname, hash: "" }); return assign; }

describe("Premium signed-out Pay (one-tap sign-in)", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); openSignIn.mockClear(); flag.on = true; });

  it("flag on: a seeker goes to /sign-in with the pack kept in returnTo", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&quantity=7");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const assign = stubAssign();
    render(<Premium />);
    fireEvent.click(await screen.findByRole("button", { name: /Sign in to pay/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    const target = new URL(String(assign.mock.calls[0][0]), "https://x.test");
    expect(target.pathname).toBe("/sign-in");
    const back = target.searchParams.get("returnTo") ?? "";
    expect(back.startsWith("/premium?")).toBe(true);
    expect(back).toContain("quantity=7");
    expect(back).toContain("role=job_seeker");
    expect(openSignIn).not.toHaveBeenCalled();
  });

  it("flag off: the existing AuthKit redirect is used, nothing else changes", async () => {
    flag.on = false;
    window.history.pushState({}, "", "/premium?role=job_seeker&quantity=7");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const assign = stubAssign();
    render(<Premium />);
    fireEvent.click(await screen.findByRole("button", { name: /Sign in to pay/ }));
    await waitFor(() => expect(openSignIn).toHaveBeenCalledTimes(1));
    expect(assign).not.toHaveBeenCalled();
  });
});
