// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReferrerHome } from "./referrerData";

const row = { id: 1, companyDomain: "acme.com", jobFunction: null, status: "pending", createdAt: "2026-10-16T00:00:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const bundle = (over: Record<string, unknown> = {}) => ({
  access: { verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: "Acme", companyInitials: "A" },
  preferences: { referralCapacity: 4, paused: false },
  inboxNew: { requests: [row] }, inboxCompleted: { requests: [] },
  profile: { profile: { referralCapacity: 4 } }, impact: null, failed: [], ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("fetchReferrerHome", () => {
  it("uses a single request when the bundle answers", async () => {
    const fetchMock = vi.fn(async () => json(bundle()));
    vi.stubGlobal("fetch", fetchMock);
    const data = await fetchReferrerHome(async () => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data.access.verified).toBe(true);
    expect(data.fresh).toHaveLength(1);
    expect(data.preferences?.referralCapacity).toBe(4);
  });

  it("returns the verify gate without inbox data for an unverified account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(bundle({ access: { verifiedCompanyAccess: false }, preferences: null, inboxNew: null, inboxCompleted: null, profile: null }))));
    const data = await fetchReferrerHome(async () => null);
    expect(data.access.verified).toBe(false);
    expect(data.fresh).toEqual([]);
  });

  it("carries the private wall from the bundle, and reads a missing section as no data", async () => {
    const note = { id: 5, message: "You opened the door.", seekerName: "Kavya Menon", roleTitle: "Data Analyst", createdAt: "2026-10-10T09:00:00.000Z" };
    vi.stubGlobal("fetch", vi.fn(async () => json(bundle({ thankYous: { thankYous: [note], total: 4 } }))));
    const withWall = await fetchReferrerHome(async () => null);
    expect(withWall.thankYous).toEqual({ thankYous: [note], total: 4 });
    // A server that has not shipped the wall yet leaves the count unloaded, never zeroed.
    vi.stubGlobal("fetch", vi.fn(async () => json(bundle({ thankYous: null }))));
    expect((await fetchReferrerHome(async () => null)).thankYous).toBeNull();
  });

  it("falls back to the separate endpoints when the bundle is missing", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("home-bundle")) return json({ error: "Not found" }, 404);
      if (url.includes("company-referrals/access")) return json({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" });
      if (url.includes("referrer-preferences")) return json({ preferences: { referralCapacity: 3 } });
      if (url.includes("inbox")) return json({ requests: [] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await fetchReferrerHome(async () => null);
    expect(data.access.verified).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back when a required section failed server-side", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("home-bundle")) return json(bundle({ inboxNew: null, failed: ["inboxNew"] }));
      if (url.includes("company-referrals/access")) return json({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" });
      if (url.includes("referrer-preferences")) return json({ preferences: {} });
      if (url.includes("inbox")) return json({ requests: [row] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const data = await fetchReferrerHome(async () => null);
    expect(data.fresh).toHaveLength(1);
  });
});

describe("fetchReferrerHome with a prefetched bundle", () => {
  it("uses the page-load request once, without asking again", async () => {
    const fetchMock = vi.fn(async () => json(bundle()));
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as unknown as { __swHomeBundle?: unknown }).__swHomeBundle = { at: Date.now(), response: Promise.resolve(json(bundle())) };
    const data = await fetchReferrerHome(async () => null);
    expect(data.fresh).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await fetchReferrerHome(async () => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale or failed prefetch and asks again", async () => {
    const fetchMock = vi.fn(async () => json(bundle()));
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as unknown as { __swHomeBundle?: unknown }).__swHomeBundle = { at: Date.now() - 60_000, response: Promise.resolve(json(bundle())) };
    await fetchReferrerHome(async () => null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    (globalThis as unknown as { __swHomeBundle?: unknown }).__swHomeBundle = { at: Date.now(), response: Promise.resolve(json({ error: "Sign in" }, 401)) };
    await fetchReferrerHome(async () => null);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remembers a good bundle load so the page-load prefetch starts next time, and forgets it after a 401", async () => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => json(bundle())));
    await fetchReferrerHome(async () => null);
    expect(localStorage.getItem("sw-home-prefetch-ok")).toBe("1");
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Sign in" }, 401)));
    (globalThis as unknown as { __swHomeBundle?: unknown }).__swHomeBundle = { at: Date.now(), response: Promise.resolve(json({ error: "Sign in" }, 401)) };
    await fetchReferrerHome(async () => null).catch(() => undefined);
    expect(localStorage.getItem("sw-home-prefetch-ok")).toBeNull();
  });
});
