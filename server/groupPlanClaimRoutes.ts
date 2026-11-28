/**
 * GROUP-claim routes (§6.6). Two endpoints and no more:
 *
 *   GET  /api/group/claim/:token   resolve the allocation for display. Consumes nothing.
 *   POST /api/group/claim/:token   the signed-in candidate confirms. Binds once, consumes the token.
 *
 * The token is never login authority and never reaches analytics or sign-in return parameters: the
 * client keeps it for the POST and the sign-in return path is token-free (`claimReturnPath`).
 */
import express, { type Express, type Request } from "express";
import type { ClaimCaller, ClaimResult, GroupClaimStore } from "./groupPlanClaim";
import { claimAllocation, readAllocationForToken } from "./groupPlanClaim";

export const CLAIM_PATH = "/claim";
export const CLAIM_RETURN_PATH = "/claim";

export type GroupClaimRouteDeps = {
  store: GroupClaimStore;
  /** The signed-in caller with their verified aliases; undefined when signed out. */
  resolveClaimCaller: (req: Request) => Promise<ClaimCaller | undefined>;
  now?: () => number;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string; metadata?: Record<string, string | number | boolean | null> }) => Promise<unknown>;
};

/** Errors carry the plain refusal, never the token or the address. */
const refusalMessage: Record<string, string> = {
  allocation_not_found: "This invitation could not be found",
  not_paid: "This seat is not active",
  account_unavailable: "This account cannot claim right now",
  email_mismatch: "Sign in with the address this seat was bought for",
  buyer_cannot_claim: "The buyer cannot claim a candidate's seat",
  already_claimed: "This seat is already claimed",
  token_expired: "This invitation expired. Sign in with your address to continue",
  token_used: "This invitation was already used",
  token_unknown: "This invitation could not be found",
};

export function registerGroupClaimRoutes(app: Express, deps: GroupClaimRouteDeps) {
  const now = () => new Date((deps.now ?? Date.now)());
  const noStore = (res: express.Response) => res.set("Cache-Control", "private, no-store");
  const tokenOf = (req: Request) => (typeof req.params.token === "string" ? req.params.token.slice(0, 128) : "");

  app.get("/api/group/claim/:token", async (req, res) => {
    const token = tokenOf(req);
    if (!token) return noStore(res).status(404).json({ error: refusalMessage.token_unknown });
    const resolved = await readAllocationForToken(token, { store: deps.store, now: now() });
    // Display only: the payload names ids, never the address, and carries no session or claim state.
    if (!resolved.ok) return noStore(res).status(404).json({ error: refusalMessage[resolved.code] });
    noStore(res).json({ allocationId: resolved.allocationId, returnPath: CLAIM_RETURN_PATH, signInRequired: true });
  });

  app.post("/api/group/claim/:token", express.json({ limit: "2kb" }), async (req, res) => {
    const token = tokenOf(req);
    if (!token) return noStore(res).status(404).json({ error: refusalMessage.token_unknown });
    let caller: ClaimCaller | undefined;
    try { caller = await deps.resolveClaimCaller(req); } catch { caller = undefined; }
    if (!caller) return noStore(res).status(401).json({ error: "Sign in with the address this seat was bought for", returnPath: CLAIM_RETURN_PATH });

    const resolved = await readAllocationForToken(token, { store: deps.store, now: now() });
    if (!resolved.ok) return noStore(res).status(404).json({ error: refusalMessage[resolved.code] });

    let result: ClaimResult;
    try {
      result = await claimAllocation({ allocationId: resolved.allocationId, caller, token, now: now(), store: deps.store });
    } catch {
      return noStore(res).status(500).json({ error: "We could not complete that" });
    }
    if (!result.ok) {
      void deps.recordActivity?.({ actorUserId: caller.userId, action: "group.claim.denied", outcome: "denied", resourceType: "group_allocation", resourceId: String(resolved.allocationId), metadata: { reason: result.code } }).catch(() => undefined);
      return noStore(res).status(409).json({ error: refusalMessage[result.code] ?? "This seat cannot be claimed", code: result.code });
    }
    void deps.recordActivity?.({ actorUserId: caller.userId, action: "group.claim.confirmed", outcome: "success", resourceType: "group_allocation", resourceId: String(result.allocationId), metadata: { alreadyClaimed: result.alreadyClaimed } }).catch(() => undefined);
    noStore(res).json({ ok: true, allocationId: result.allocationId, alreadyClaimed: result.alreadyClaimed });
  });
}
