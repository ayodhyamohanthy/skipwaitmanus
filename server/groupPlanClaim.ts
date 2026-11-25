/**
 * GROUP-claim (§6.6, AHEAD build under D-315): the candidate claims a paid allocation with their
 * own exact verified alias and canonical person.
 *
 * Binding rules kept here, not only in copy:
 * - The ONLY identity evidence is the signed-in caller's verified aliases plus canonical person.
 *   An unverified email, a case/plus variant, a buyer or a second candidate never binds.
 * - Payment alone binds nothing: only `paid` is claimable, and a refund or cancellation refuses.
 * - A claim token is a locator for the email deep link, never login authority: the token holder
 *   must still sign in and pass the exact-verified-alias check.
 * - GET resolves for display and consumes nothing; the confirmed POST consumes the token once.
 * - The bind is one conditional update, so two racing claims leave exactly one winner.
 *
 * GROUP-payments owns the durable allocation row; this module depends on an injected store so the
 * rules are executable before that row lands. The adapter arrives with GROUP-payments and must keep
 * the same conditional-update semantics.
 */
import { createHash, randomBytes } from "node:crypto";

export const GROUP_CLAIM_TOKEN_PREFIX = "gpc_";
export const GROUP_CLAIM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GroupAllocationStatus = "pending_payment" | "paid" | "claimed" | "refunded" | "cancelled";

/** The allocation facts the claim needs. GROUP-payments stores these; no address is ever logged. */
export type GroupAllocationFacts = {
  id: number;
  groupPurchaseId: number;
  buyerUserId: number;
  recipientEmail: string;
  status: GroupAllocationStatus;
  canonicalPersonId: number | null;
  claimedByUserId: number | null;
  claimedAt: Date | null;
};

export type ClaimCaller = {
  userId: number;
  canonicalPersonId: number;
  /** The caller's own verified aliases, normalized. Unverified input must never be added here. */
  verifiedEmails: readonly string[];
};

export type GroupClaimStore = {
  /** Paid, unclaimed allocation whose exact normalized recipient address matches. */
  findAllocationByEmail: (email: string) => Promise<GroupAllocationFacts | undefined>;
  getById: (id: number) => Promise<GroupAllocationFacts | undefined>;
  /** One conditional update: false when another binder won or the row is not claimable. */
  bindClaim: (input: { allocationId: number; canonicalPersonId: number; userId: number; now: Date }) => Promise<boolean>;
  accountState: (canonicalPersonId: number, userId: number) => Promise<{ suspended: boolean; deleted: boolean }>;
  readToken?: (tokenHash: string) => Promise<{ allocationId: number; expiresAt: Date; consumedAt: Date | null } | undefined>;
  consumeToken?: (tokenHash: string, now: Date) => Promise<boolean>;
  recordEvent: (input: { action: string; outcome: "success" | "denied" | "failure"; allocationId?: number; canonicalPersonId?: number; detail?: string }) => Promise<void>;
};

export type ClaimRefusal =
  | "allocation_not_found"
  | "not_paid"
  | "account_unavailable"
  | "email_mismatch"
  | "buyer_cannot_claim"
  | "already_claimed"
  | "token_expired"
  | "token_used"
  | "token_unknown";

export type ClaimResult =
  | { ok: true; allocationId: number; canonicalPersonId: number; alreadyClaimed: boolean }
  | { ok: false; code: ClaimRefusal };

const deny = (code: ClaimRefusal): ClaimResult => ({ ok: false, code });

/** Trim and lowercase only: no plus-stripping, no provider canonicalization, no guessing. */
export const normalizeClaimEmail = (value: string) => value.trim().toLowerCase();

export const hashedClaimToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function mintClaimToken(): string {
  return `${GROUP_CLAIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

const lookupToken = async (token: string, store: GroupClaimStore, now: Date) => {
  if (!store.readToken) return deny("token_unknown");
  const row = await store.readToken(hashedClaimToken(token));
  if (!row) return deny("token_unknown");
  if (row.consumedAt) return deny("token_used");
  if (row.expiresAt.getTime() <= now.getTime()) return deny("token_expired");
  return { ok: true as const, allocationId: row.allocationId };
};

/** GET / the deep link: resolve the allocation for display. Nothing is consumed or bound. */
export async function readAllocationForToken(token: string, deps: { store: GroupClaimStore; now: Date }): Promise<{ ok: true; allocationId: number } | { ok: false; code: ClaimRefusal }> {
  return lookupToken(token, deps.store, deps.now);
}

/**
 * The confirmed claim. Refusal order is deliberate: the account must be usable, the allocation
 * must be paid, the caller must not be its buyer, and only then does identity bind.
 */
export async function claimAllocation(input: {
  allocationId: number;
  caller: ClaimCaller;
  now: Date;
  store: GroupClaimStore;
  token?: string;
}): Promise<ClaimResult> {
  const { allocationId, caller, now, store, token } = input;

  const account = await store.accountState(caller.canonicalPersonId, caller.userId);
  if (account.suspended || account.deleted) {
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "account_unavailable" });
    return deny("account_unavailable");
  }

  if (token) {
    const resolved = await lookupToken(token, store, now);
    if (!resolved.ok) {
      await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: resolved.code });
      return resolved;
    }
    if (resolved.allocationId !== allocationId) {
      await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "token_unknown" });
      return deny("token_unknown");
    }
  }

  const allocation = await store.getById(allocationId);
  if (!allocation) return deny("allocation_not_found");
  if (allocation.status !== "paid" && allocation.status !== "claimed") {
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "not_paid" });
    return deny("not_paid");
  }
  if (allocation.buyerUserId === caller.userId) {
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "buyer_cannot_claim" });
    return deny("buyer_cannot_claim");
  }

  const verified = new Set(caller.verifiedEmails.map(normalizeClaimEmail));
  if (!verified.has(normalizeClaimEmail(allocation.recipientEmail))) {
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "email_mismatch" });
    return deny("email_mismatch");
  }

  if (allocation.canonicalPersonId != null) {
    // The same person may re-open their own claim; anybody else is refused.
    if (allocation.canonicalPersonId === caller.canonicalPersonId) return { ok: true, allocationId, canonicalPersonId: caller.canonicalPersonId, alreadyClaimed: true };
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "already_claimed" });
    return deny("already_claimed");
  }

  const bound = await store.bindClaim({ allocationId, canonicalPersonId: caller.canonicalPersonId, userId: caller.userId, now });
  if (!bound) {
    // Lost the race, or the row changed under us. Re-read: the winner may be this same person.
    const current = await store.getById(allocationId);
    if (current?.canonicalPersonId === caller.canonicalPersonId) return { ok: true, allocationId, canonicalPersonId: caller.canonicalPersonId, alreadyClaimed: true };
    await store.recordEvent({ action: "group.claim.denied", outcome: "denied", allocationId, canonicalPersonId: caller.canonicalPersonId, detail: "already_claimed" });
    return deny("already_claimed");
  }

  // The confirmed claim consumes the token in the same step that binds; a replay finds it gone.
  if (token && store.consumeToken) await store.consumeToken(hashedClaimToken(token), now);
  await store.recordEvent({ action: "group.claim.bound", outcome: "success", allocationId, canonicalPersonId: caller.canonicalPersonId });
  return { ok: true, allocationId, canonicalPersonId: caller.canonicalPersonId, alreadyClaimed: false };
}
