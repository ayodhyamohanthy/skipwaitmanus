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
