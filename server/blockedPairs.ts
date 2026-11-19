// P0-block-delivery: a block (userBlocks, either direction counts) keeps a
// seeker's ask away from that referrer on every path that delivers or assigns
// it: the in-app notice and review-email grant at creation, the email/Slack
// dispatch, a new employee's waiting-ask notice, the first look and its
// release, and queue allocation. The read routes already deny a blocked pair
// (privateReferralRoutes.ts isRequestBlocked, blocksRoutes.ts).
//
// Fail-open policy, the same as the read routes: if the block lookup itself
// fails (for example the userBlocks table is missing in an environment), the
// path carries on as if nothing were blocked, so a broken lookup never stops
// asks from reaching anyone. That failure is never silent: it is logged and
// sent to Sentry with the path that skipped the check.
//
// No db.ts import, so db.ts can call these inside its queries and transactions
// without an import cycle (the heldAsk.ts / planGates.ts pattern).
import { and, eq, inArray, or } from "drizzle-orm";
import { userBlocks } from "../drizzle/schema";
import type { LedgerTx } from "./creditLedger";
import { captureServerError } from "./sentry";

/** The words an inactive personal link gets (D-017). A blocked link owner gets the same, so a block is never revealed. */
export const PERSONAL_LINK_UNAVAILABLE = "This private referral link is no longer active";

/** A personal-link ask refused because the seeker and the link owner are blocked (either way). Thrown before any credit moves. */
export class BlockedPersonalLinkError extends Error {
  constructor() { super(PERSONAL_LINK_UNAVAILABLE); this.name = "BlockedPersonalLinkError"; }
}

/** Candidates per query, so a large company never builds an unbounded IN list. */
const BLOCK_LOOKUP_CHUNK = 200;

/**
 * The subset of `candidateIds` blocked with `userId`, in either direction. Bounded per chunk and scoped to these
 * candidates (never a global row cap that could hide the pair). Throws when the lookup fails; callers on a delivery
 * path use blockedCounterpartsFailOpen.
 */
export async function selectBlockedCounterparts(db: Pick<LedgerTx, "select">, userId: number, candidateIds: readonly number[]): Promise<Set<number>> {
  const blocked = new Set<number>();
  const ids = Array.from(new Set(candidateIds.filter(id => Number.isInteger(id) && id > 0 && id !== userId)));
  for (let offset = 0; offset < ids.length; offset += BLOCK_LOOKUP_CHUNK) {
    const chunk = ids.slice(offset, offset + BLOCK_LOOKUP_CHUNK);
    const rows = await db.select({ blockerUserId: userBlocks.blockerUserId, blockedUserId: userBlocks.blockedUserId }).from(userBlocks).where(or(
      and(eq(userBlocks.blockerUserId, userId), inArray(userBlocks.blockedUserId, chunk)),
      and(eq(userBlocks.blockedUserId, userId), inArray(userBlocks.blockerUserId, chunk)),
    ));
    for (const row of rows) blocked.add(row.blockerUserId === userId ? row.blockedUserId : row.blockerUserId);
  }
  return blocked;
}

/** selectBlockedCounterparts under the fail-open policy above: a failed lookup blocks nobody and is reported under `area`. */
export async function blockedCounterpartsFailOpen(db: Pick<LedgerTx, "select">, userId: number, candidateIds: readonly number[], area: string): Promise<Set<number>> {
  try {
    return await selectBlockedCounterparts(db, userId, candidateIds);
  } catch (error) {
    console.warn("[blocks] delivery block check skipped (fail-open)", { area, name: error instanceof Error ? error.name : "unknown" });
    captureServerError(error, { area });
    return new Set();
  }
}
