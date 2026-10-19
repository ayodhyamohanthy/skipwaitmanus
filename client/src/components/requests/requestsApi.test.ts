import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMyRequests } from "./requestsApi";

// GET /api/company-referrals/mine rows: the D-050 held flag says a personal-link ask still counts as unclaimed.
const row = { id: 12, companyDomain: "acme.com", status: "pending", referrerId: 77, queueStatus: "available_for_review", createdAt: "2026-10-16T12:00:00.000Z", updatedAt: "2026-10-16T12:00:00.000Z" };
const getToken = async () => "test-token";
const stubMine = (payload: Record<string, unknown>) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => payload })));

afterEach(() => { vi.unstubAllGlobals(); });

describe("the Requests list parser", () => {
  it("keeps the held flag and still accepts a payload from before it existed", async () => {
    stubMine({ requests: [{ ...row, heldForReferrer: true }, { ...row, id: 13, heldForReferrer: false }, { ...row, id: 14 }] });
    const { requests } = await fetchMyRequests(getToken);
    expect(requests.map(request => [request.id, request.heldForReferrer])).toEqual([[12, true], [13, false], [14, undefined]]);
  });

  it("reads a malformed held flag as not held instead of dropping the whole list", async () => {
    stubMine({ requests: [{ ...row, heldForReferrer: "yes" }, { ...row, id: 13, heldForReferrer: true }] });
    const { requests } = await fetchMyRequests(getToken);
    expect(requests.map(request => [request.id, request.heldForReferrer])).toEqual([[12, undefined], [13, true]]);
  });
});
