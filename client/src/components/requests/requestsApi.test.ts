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

  it("reads a malformed unclaimed-assignment flag as unset instead of dropping the list (P0-allocated-ask-stuck)", async () => {
    stubMine({ requests: [{ ...row, unclaimedAssignment: "yes" }, { ...row, id: 13, unclaimedAssignment: true }, { ...row, id: 14 }] });
    const { requests } = await fetchMyRequests(getToken);
    expect(requests.map(request => [request.id, request.unclaimedAssignment])).toEqual([[12, undefined], [13, true], [14, undefined]]);
  });

  it("accepts older mine rows without askInvite and preserves a valid safe invite payload", async () => {
    const invite = { state: "active", createdAt: "2026-10-22T12:00:00.000Z", expiresAt: "2026-10-29T12:00:00.000Z" };
    stubMine({ requests: [{ ...row }, { ...row, id: 13, askInvite: invite }] });
    const { requests } = await fetchMyRequests(getToken);
    expect(requests[0].askInvite).toBeUndefined();
    expect(requests[1].askInvite).toEqual(invite);
  });

  it("reads malformed askInvite data as unset without dropping the request", async () => {
    stubMine({ requests: [{ ...row, askInvite: { state: "unknown", createdAt: 42, expiresAt: null } }, { ...row, id: 13, askInvite: { state: "revoked", createdAt: "2026-10-22T12:00:00.000Z", expiresAt: "2026-10-29T12:00:00.000Z" } }] });
    const { requests } = await fetchMyRequests(getToken);
    expect(requests.map(request => [request.id, request.askInvite])).toEqual([[12, undefined], [13, { state: "revoked", createdAt: "2026-10-22T12:00:00.000Z", expiresAt: "2026-10-29T12:00:00.000Z" }]]);
  });
});
