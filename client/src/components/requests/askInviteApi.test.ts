import { afterEach, describe, expect, it, vi } from "vitest";
import { AskInviteApiError, claimAskInvite, createAskInvite, fetchAskInviteLanding, revokeAskInvite } from "./askInviteApi";

const TOKEN = "a".repeat(43);
const URL = `https://skipwait.me/r/${TOKEN}`;
const expiresAt = "2026-10-30T12:00:00.000Z";
const getToken = vi.fn().mockResolvedValue("test-token");

function response(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, url: "https://skipwait.me/api/ask-invites/redacted", json: async () => body } as Response;
}

afterEach(() => { vi.unstubAllGlobals(); getToken.mockClear(); getToken.mockResolvedValue("test-token"); });

describe("askInviteApi", () => {
  it("creates a link, keeps the raw token inside the returned URL, and sends the user's session token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(201, { token: TOKEN, url: URL, expiresAt }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAskInvite(42, getToken)).resolves.toEqual({ url: URL, expiresAt });
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/42/invite-link", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    }));
  });

  it("rejects a malformed creation payload instead of displaying an untrusted URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(201, { token: TOKEN, url: "https://attacker.example/collect", expiresAt })));
    await expect(createAskInvite(42, getToken)).rejects.toMatchObject({ status: 0, code: "invalid_response" });
  });

  it("revoke is an authenticated idempotent POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { revoked: false }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeAskInvite(42, getToken)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/company-referrals/42/invite-link/revoke", expect.objectContaining({ method: "POST", credentials: "include" }));
  });

  it("loads public landing data anonymously and encodes the token as one path segment", async () => {
    const landing = { state: "open", companyName: "Acme", roleTitle: "Designer", jobFunction: null, workMode: null, location: null, note: null, lockedFileCount: null };
    const fetchMock = vi.fn().mockResolvedValue(response(200, { invite: landing }));
    vi.stubGlobal("fetch", fetchMock);
    getToken.mockResolvedValueOnce(null);
    await expect(fetchAskInviteLanding("a b", getToken)).resolves.toEqual(landing);
    expect(fetchMock).toHaveBeenCalledWith("/api/ask-invites/a%20b", expect.objectContaining({ method: "GET", credentials: "include", headers: {} }));
  });

  it("posts a claim and returns only a known delivery outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { outcome: "reserved" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(claimAskInvite(TOKEN, getToken)).resolves.toBe("reserved");
    expect(fetchMock).toHaveBeenCalledWith(`/api/ask-invites/${TOKEN}/claim`, expect.objectContaining({ method: "POST" }));
  });

  it("preserves fixed server error codes without copying the token into the error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(403, { error: "company_email_required" })));
    let caught: unknown;
    try { await claimAskInvite(TOKEN, getToken); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AskInviteApiError);
    expect(caught).toMatchObject({ status: 403, code: "company_email_required" });
    expect((caught as Error).message).not.toContain(TOKEN);
  });
});
