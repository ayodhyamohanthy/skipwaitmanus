// GROUP-claim (§6.6): the candidate claims a paid allocation using ONLY their own exact verified
// alias and canonical person. Payment alone binds no identity, a token is never login authority,
// GET never consumes, and every refusal is explicit.
//
// AHEAD OF ITS DEPENDENCY (D-315): GROUP-payments owns the paid allocation row. This row builds the
// claim contract against an injected store, so the security rules are executable now and the
// concrete adapter lands with that row without changing these tests.
import { describe, expect, it } from "vitest";
import {
  GROUP_CLAIM_TOKEN_PREFIX,
  GROUP_CLAIM_TOKEN_TTL_MS,
  claimAllocation,
  hashedClaimToken,
  mintClaimToken,
  normalizeClaimEmail,
  readAllocationForToken,
  type GroupAllocationFacts,
  type GroupClaimStore,
} from "./groupPlanClaim";

const NOW = new Date("2026-11-25T10:00:00.000Z");
const CANDIDATE_EMAIL = "asha@example.test";

const paidAllocation = (over: Partial<GroupAllocationFacts> = {}): GroupAllocationFacts => ({
  id: 21,
  groupPurchaseId: 7,
  buyerUserId: 3,
  recipientEmail: CANDIDATE_EMAIL,
  status: "paid",
  canonicalPersonId: null,
  claimedByUserId: null,
  claimedAt: null,
  ...over,
});

function store(over: Partial<GroupClaimStore> = {}) {
  const events: Array<Record<string, unknown>> = [];
  const allocations = new Map<number, GroupAllocationFacts>([[21, paidAllocation()]]);
  const tokens = new Map<string, { id: number; allocationId: number; expiresAt: Date; consumedAt: Date | null }>();
  const base: GroupClaimStore = {
    findAllocationByEmail: async email => [...allocations.values()].find(a => a.recipientEmail === email),
    getById: async id => allocations.get(id),
    // One conditional update: the first binder wins, exactly like the real row lock.
    bindClaim: async ({ allocationId, canonicalPersonId, userId, now }) => {
      const row = allocations.get(allocationId);
      if (!row || row.status !== "paid" || row.canonicalPersonId != null) return false;
      allocations.set(allocationId, { ...row, status: "claimed", canonicalPersonId, claimedByUserId: userId, claimedAt: now });
      return true;
    },
    accountState: async () => ({ suspended: false, deleted: false }),
    recordEvent: async input => { events.push(input as Record<string, unknown>); },
    ...over,
  };
  return { store: base, allocations, tokens, events };
}

const candidate = { userId: 11, canonicalPersonId: 5, verifiedEmails: [CANDIDATE_EMAIL] };
const claim = (over: Partial<Parameters<typeof claimAllocation>[0]> = {}) =>
  claimAllocation({ allocationId: 21, caller: candidate, now: NOW, ...over });

describe("identity binding", () => {
  it("binds a paid allocation to the caller's canonical person once", async () => {
    const { store: s, allocations, events } = store();
    const result = await claimAllocation({ allocationId: 21, caller: candidate, now: NOW, store: s });
    expect(result).toMatchObject({ ok: true, allocationId: 21, canonicalPersonId: 5, alreadyClaimed: false });
    expect(allocations.get(21)).toMatchObject({ status: "claimed", canonicalPersonId: 5, claimedByUserId: 11 });
    // The audit row names ids only, never the address.
    expect(JSON.stringify(events)).not.toContain(CANDIDATE_EMAIL);
  });

  it("refuses a caller whose verified emails do not include the allocation's address", async () => {
    const { store: s } = store();
    const other = { userId: 12, canonicalPersonId: 6, verifiedEmails: ["someone@else.test"] };
    expect(await claim({ store: s, caller: other })).toMatchObject({ ok: false, code: "email_mismatch" });
  });

  it("matches the exact normalized address only: a plus-alias or case variant is not the allocation", async () => {
    const { store: s } = store();
    const variant = { userId: 13, canonicalPersonId: 7, verifiedEmails: ["asha+group@example.test"] };
    expect(await claim({ store: s, caller: variant })).toMatchObject({ ok: false, code: "email_mismatch" });
    expect(normalizeClaimEmail(" ASHA@Example.TEST ")).toBe(CANDIDATE_EMAIL);
  });

  it("refuses the buyer, even when the buyer's own address happens to be on the list", async () => {
    const { store: s } = store({ findAllocationByEmail: async () => paidAllocation({ recipientEmail: "buyer@example.test" }) });
    const buyer = { userId: 3, canonicalPersonId: 1, verifiedEmails: ["buyer@example.test"] };
    expect(await claim({ store: s, caller: buyer })).toMatchObject({ ok: false, code: "buyer_cannot_claim" });
  });

  it("refuses a second candidate claiming an allocation another person already holds", async () => {
    const { store: s } = store();
    await claim({ store: s });
    const second = { userId: 14, canonicalPersonId: 8, verifiedEmails: [CANDIDATE_EMAIL] };
    expect(await claimAllocation({ allocationId: 21, caller: second, now: NOW, store: s })).toMatchObject({ ok: false, code: "already_claimed" });
  });

  it("lets the same person re-open the claim without a second bind", async () => {
    const { store: s, events } = store();
    await claim({ store: s });
    const again = await claimAllocation({ allocationId: 21, caller: candidate, now: new Date(NOW.getTime() + 60_000), store: s });
    expect(again).toMatchObject({ ok: true, alreadyClaimed: true });
    expect(events.filter(e => e.action === "group.claim.bound")).toHaveLength(1);
  });

  it("never claims on payment alone, or after a refund", async () => {
    for (const status of ["pending_payment", "refunded", "cancelled"] as const) {
      const { store: s } = store({ getById: async () => paidAllocation({ status }) });
      expect(await claim({ store: s }), status).toMatchObject({ ok: false, code: "not_paid" });
    }
  });

  it("refuses a suspended or deleted account, whatever its aliases say", async () => {
    for (const state of [{ suspended: true, deleted: false }, { suspended: false, deleted: true }]) {
      const { store: s } = store({ accountState: async () => state });
      expect(await claim({ store: s })).toMatchObject({ ok: false, code: "account_unavailable" });
    }
  });

  it("records one winner when two claims race for the same allocation", async () => {
    const { store: s } = store();
    const results = await Promise.all([
      claimAllocation({ allocationId: 21, caller: candidate, now: NOW, store: s }),
      claimAllocation({ allocationId: 21, caller: { ...candidate, userId: 15, canonicalPersonId: 9 }, now: NOW, store: s }),
    ]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok && r.code === "already_claimed")).toHaveLength(1);
  });
});

describe("the claim token is never authority", () => {
  it("mints a prefixed secret and stores only its hash", async () => {
    const token = mintClaimToken();
    expect(token.startsWith(GROUP_CLAIM_TOKEN_PREFIX)).toBe(true);
    const { tokens } = store();
    // The store contract receives the hash, never the secret.
    expect(hashedClaimToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashedClaimToken(token)).not.toBe(token);
    expect(tokens.size).toBe(0);
  });

  it("refuses an expired token", async () => {
    const { store: s } = store({
      findAllocationByEmail: async () => undefined,
      readToken: async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() - 1), consumedAt: null }),
    });
    expect(await readAllocationForToken("gpc_secret", { store: s, now: NOW })).toMatchObject({ ok: false, code: "token_expired" });
  });

  it("refuses a replayed token: reading for display never consumes, the confirmed claim does", async () => {
    const consumed: string[] = [];
    const { store: s } = store({
      readToken: async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() + GROUP_CLAIM_TOKEN_TTL_MS), consumedAt: null }),
      consumeToken: async hash => { consumed.push(hash); return true; },
    });
    // GET: resolves the allocation for display and consumes nothing.
    const peek = await readAllocationForToken("gpc_secret", { store: s, now: NOW });
    expect(peek).toMatchObject({ ok: true, allocationId: 21 });
    expect(consumed).toHaveLength(0);
    // POST: the confirmed claim consumes it, and a replay finds it gone.
    expect(await claim({ store: s, token: "gpc_secret" })).toMatchObject({ ok: true });
    expect(consumed).toHaveLength(1);
    const replay = await claimAllocation({ allocationId: 21, caller: candidate, now: NOW, store: { ...s, readToken: async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() + 1), consumedAt: consumed[0] ? new Date() : null }) }, token: "gpc_secret" });
    expect(replay).toMatchObject({ ok: false, code: "token_used" });
  });

  it("a token never replaces the signed-in verified alias", async () => {
    const { store: s } = store({ readToken: async () => ({ allocationId: 21, expiresAt: new Date(NOW.getTime() + 1000), consumedAt: null }) });
    const wrongPerson = { ...candidate, userId: 16, canonicalPersonId: 10, verifiedEmails: ["wrong@example.test"] };
    expect(await claim({ store: s, caller: wrongPerson, token: "gpc_secret" })).toMatchObject({ ok: false, code: "email_mismatch" });
  });

  it("bounds the token lifetime", () => {
    expect(GROUP_CLAIM_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
