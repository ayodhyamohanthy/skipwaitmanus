import { describe, expect, it } from "vitest";
import { askInviteActiveRequestKey, ASK_INVITE_TOKEN_PATTERN, ASK_INVITE_TTL_MS, ASK_INVITE_WEEKLY_CAP, ASK_INVITE_WEEKLY_WINDOW_MS, type AskInviteStatus } from "../shared/askInvites";
import {
  AskInviteCapReachedError,
  AskInviteLinkActiveError,
  AskInviteNotFoundError,
  AskInviteNotWaitingError,
  createAskInvite,
  hashAskInviteToken,
  listAskInvitesForRequests,
  revokeAskInvite,
  type AskInviteLinkRecord,
  type AskInviteRequestRecord,
  type AskInviteStore,
  type AskInviteTransaction,
} from "./askInvites";

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const OTHER = 8;
const REQUEST = 101;

const waitingAsk = (over: Partial<AskInviteRequestRecord> = {}): AskInviteRequestRecord => ({ id: REQUEST, jobSeekerId: SEEKER, status: "pending", waitingForCoverage: true, referrerId: null, ...over });
const inviteRow = (over: Partial<AskInviteLinkRecord> = {}): AskInviteLinkRecord => ({ id: 1, referralRequestId: REQUEST, createdByUserId: SEEKER, linkTokenHash: "0".repeat(64), status: "active", activeRequestKey: askInviteActiveRequestKey(REQUEST), createdAt: new Date(NOW), expiresAt: new Date(NOW + ASK_INVITE_TTL_MS), closedAt: null, ...over });

class MemoryAskInviteStore implements AskInviteStore {
  readonly asks = new Map<number, AskInviteRequestRecord>();
  readonly links: AskInviteLinkRecord[] = [];
  readonly calls: string[] = [];
  private nextId = 1;

  transaction<T>(run: (tx: AskInviteTransaction) => Promise<T>): Promise<T> {
    return run({
      getAskForUpdate: async requestId => { this.calls.push("ask"); return this.asks.get(requestId); },
      getActiveInviteForUpdate: async (requestId, userId) => {
        this.calls.push("active-link");
        return this.links.find(link => link.referralRequestId === requestId && link.createdByUserId === userId && link.status === "active" && link.activeRequestKey !== null);
      },
      getLiveClaimedInviteForUpdate: async (requestId, userId, now) => {
        this.calls.push("claimed-link");
        return this.links.find(link => link.referralRequestId === requestId && link.createdByUserId === userId && link.status === "claimed" && link.reservationExpiresAt instanceof Date && link.reservationExpiresAt > now);
      },
      getLatestInviteForUpdate: async (requestId, userId) => {
        this.calls.push("latest-link");
        return this.links.filter(link => link.referralRequestId === requestId && link.createdByUserId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
      },
      listLinksSince: async (userId, since) => {
        this.calls.push("recent-links");
        return this.links.filter(link => link.createdByUserId === userId && link.createdAt >= since).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(link => ({ createdAt: link.createdAt }));
      },
      insertInvite: async input => {
        this.calls.push("insert");
        const id = this.nextId++;
        this.links.push({ id, ...input });
        return id;
      },
      revokeInvite: async (linkId, closedAt) => {
        this.calls.push("revoke");
        const link = this.links.find(item => item.id === linkId);
        if (link) { link.status = "revoked"; link.activeRequestKey = null; link.closedAt = closedAt; }
      },
    });
  }

  async listForRequests(userId: number, requestIds: number[]) {
    this.calls.push("list");
    const allowed = new Set(requestIds);
    return this.links.filter(link => link.createdByUserId === userId && allowed.has(link.referralRequestId)).map(({ id, referralRequestId, createdByUserId, status, createdAt, expiresAt }) => ({ id, referralRequestId, createdByUserId, status, createdAt, expiresAt }));
  }
}

describe("D-090 ask invite create/revoke", () => {
  it("creates one waiting-ask link, stores only its SHA-256, and locks ask before link", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk());

    const created = await createAskInvite(SEEKER, REQUEST, NOW, store);
    expect(created.token).toMatch(ASK_INVITE_TOKEN_PATTERN);
    expect(created.token).toHaveLength(43);
    expect(created.expiresAt.getTime()).toBe(NOW + ASK_INVITE_TTL_MS);
    expect(store.links).toHaveLength(1);
    expect(store.links[0]).toMatchObject({
      id: created.id,
      referralRequestId: REQUEST,
      createdByUserId: SEEKER,
      linkTokenHash: hashAskInviteToken(created.token),
      status: "active",
      activeRequestKey: askInviteActiveRequestKey(REQUEST),
    });
    expect(JSON.stringify(store.links)).not.toContain(created.token);
    expect(store.calls.slice(0, 5)).toEqual(["ask", "active-link", "claimed-link", "recent-links", "insert"]);
  });

  it("rejects a second active link and any ask that is not waiting", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk());
    await createAskInvite(SEEKER, REQUEST, NOW, store);
    await expect(createAskInvite(SEEKER, REQUEST, NOW + 1, store)).rejects.toBeInstanceOf(AskInviteLinkActiveError);

    const visible = new MemoryAskInviteStore();
    visible.asks.set(REQUEST, waitingAsk({ waitingForCoverage: false }));
    await expect(createAskInvite(SEEKER, REQUEST, NOW, visible)).rejects.toBeInstanceOf(AskInviteNotWaitingError);
  });

  it("does not create a competing link while an insider reservation is live", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk());
    store.links.push(inviteRow({ id: 77, status: "claimed", activeRequestKey: null, claimedByUserId: OTHER, reservationExpiresAt: new Date(NOW + DAY) }));
    await expect(createAskInvite(SEEKER, REQUEST, NOW, store)).rejects.toBeInstanceOf(AskInviteLinkActiveError);
    expect(store.links).toHaveLength(1);
  });

  it("returns the same not-found error for a missing or another seeker's ask", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk({ jobSeekerId: OTHER }));
    await expect(createAskInvite(SEEKER, REQUEST, NOW, store)).rejects.toBeInstanceOf(AskInviteNotFoundError);
    await expect(createAskInvite(SEEKER, REQUEST + 1, NOW, store)).rejects.toBeInstanceOf(AskInviteNotFoundError);
  });

  it("allows five sequential creations, counts revoked/expired links, and frees the oldest rolling slot", async () => {
    const store = new MemoryAskInviteStore();
    const requestIds = [201, 202, 203, 204, 205, 206];
    for (let i = 0; i < ASK_INVITE_WEEKLY_CAP; i++) {
      const requestId = requestIds[i];
      store.asks.set(requestId, waitingAsk({ id: requestId }));
      const created = await createAskInvite(SEEKER, requestId, NOW - (6 - i) * DAY, store);
      expect(created.token).toMatch(ASK_INVITE_TOKEN_PATTERN);
    }
    store.links[0].status = "revoked";
    store.links[0].activeRequestKey = null;
    store.links[1].status = "expired";
    store.links[1].activeRequestKey = null;
    store.asks.set(requestIds[5], waitingAsk({ id: requestIds[5] }));

    let capError: unknown;
    try { await createAskInvite(SEEKER, requestIds[5], NOW, store); } catch (error) { capError = error; }
    expect(capError).toBeInstanceOf(AskInviteCapReachedError);
    expect((capError as AskInviteCapReachedError).nextSlotAt.getTime()).toBe(NOW + DAY);

    const afterOldestExpires = NOW + DAY + 1;
    const created = await createAskInvite(SEEKER, requestIds[5], afterOldestExpires, store);
    expect(created.token).toMatch(ASK_INVITE_TOKEN_PATTERN);
    expect(store.links.filter(link => link.createdByUserId === SEEKER && link.createdAt.getTime() >= afterOldestExpires - ASK_INVITE_WEEKLY_WINDOW_MS)).toHaveLength(5);
  });

  it("revokes only the owner's live link, clears the active key, and is idempotent", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk());
    store.links.push(inviteRow({ id: 55 }));

    const first = await revokeAskInvite(SEEKER, REQUEST, NOW, store);
    const second = await revokeAskInvite(SEEKER, REQUEST, NOW + 1, store);
    expect(first).toEqual({ revoked: true, linkId: 55 });
    expect(second).toEqual(first);
    expect(store.links[0]).toMatchObject({ status: "revoked", activeRequestKey: null, closedAt: new Date(NOW) });

    await expect(revokeAskInvite(OTHER, REQUEST, NOW, store)).rejects.toBeInstanceOf(AskInviteNotFoundError);
  });

  it("returns a latest-row My asks allow-list with no token or claimer data", async () => {
    const store = new MemoryAskInviteStore();
    store.asks.set(REQUEST, waitingAsk());
    store.links.push(inviteRow({ id: 20, status: "active", createdAt: new Date(NOW - DAY), linkTokenHash: "secret-hash" }));
    store.links.push(inviteRow({ id: 21, status: "revoked", activeRequestKey: null, createdAt: new Date(NOW), claimedByUserId: 999 } as Partial<AskInviteLinkRecord>));

    const result = await listAskInvitesForRequests(SEEKER, [REQUEST, 404], NOW, store);
    expect(result.get(REQUEST)).toEqual({ state: "revoked", createdAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + ASK_INVITE_TTL_MS).toISOString() });
    expect(result.has(404)).toBe(false);
    expect(JSON.stringify([...result.values()])).not.toMatch(/token|hash|claimer|999/);
  });
});
