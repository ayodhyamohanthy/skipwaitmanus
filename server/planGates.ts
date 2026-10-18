// Server-side plan gates that read the entitlement (shared/planEntitlements.ts):
// the open-ask predicate every slot count uses, and the typed errors routes map
// to 409 (slot cap, showcase limits) or 402 (assistants). No db.ts import, so
// db.ts can use these inside its transactions without an import cycle.
import { and, eq, gt, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { referralRequests } from "../drizzle/schema";
import { ASSISTANT_PLAN_REQUIRED_MESSAGE } from "../shared/assistant";
import { SLOT_CAP_REACHED, slotsFullCopy, type OpenAskSlots } from "../shared/openAskSlots";
import { SHOWCASE_HARD_CAP, type PlanEntitlements } from "../shared/planEntitlements";
import { ASK_TTL_MS } from "../shared/referral";
import { assignedAskNotHeldCondition } from "./heldAsk";

/**
 * The caller's open asks: pending and unexpired. Mirrors the expiry rules (D-061):
 * a waiting or held ask has reached no referrer and holds no slot; a visible
 * unclaimed ask holds one until 7 days after its first visibility
 * (coverageVisibleAt; pre-0095 rows: creation, computed from the JS clock, never
 * DB NOW()); an assigned ask holds its slot while it is not held — claimed,
 * queue-allocated or pre-history (D-050, server/heldAsk.ts). Always scoped to
 * the one seeker it is called for.
 */
export function openAskCondition(userId: number, nowMs: number): SQL {
  const cutoff = new Date(nowMs - ASK_TTL_MS);
  const condition = and(
    eq(referralRequests.jobSeekerId, userId),
    eq(referralRequests.status, "pending"),
    eq(referralRequests.waitingForCoverage, false),
    or(
      and(isNotNull(referralRequests.referrerId), assignedAskNotHeldCondition()),
      and(isNotNull(referralRequests.coverageVisibleAt), gt(referralRequests.coverageVisibleAt, cutoff)),
      and(isNull(referralRequests.coverageVisibleAt), gt(referralRequests.createdAt, cutoff)),
    ),
  );
  if (!condition) throw new Error("Open-ask condition could not be built");
  return condition;
}

/** Thrown before any side effect when a new ask would exceed the plan's open-ask cap. */
export class OpenAskSlotCapError extends Error {
  readonly code = SLOT_CAP_REACHED;
  readonly slots: OpenAskSlots;
  constructor(slots: OpenAskSlots) {
    const copy = slotsFullCopy(slots, true);
    super(`${copy.lead} ${copy.next}`);
    this.name = "OpenAskSlotCapError";
    this.slots = slots;
  }
}

export type PlanLimitKind = "showcase_pieces" | "showcase_pins";

/** A showcase change the plan does not include. Existing pieces and pins are never removed. */
export class PlanLimitError extends Error {
  readonly code = "plan_limit" as const;
  readonly limit: PlanLimitKind;
  readonly cap: number;
  constructor(limit: PlanLimitKind, cap: number, message: string) {
    super(message);
    this.name = "PlanLimitError";
    this.limit = limit;
    this.cap = cap;
  }
}

/**
 * The showcase change a plan refuses, or null. `owned` is the owner's other
 * pieces (excluding the one being pinned). Downgrades only block new pieces and
 * pins; nothing already shown is removed.
 */
export function showcaseLimitViolation(entitlements: PlanEntitlements, owned: ReadonlyArray<{ pinned: boolean }>, change: { adding: boolean; pinning: boolean }): PlanLimitError | null {
  const { pieces, pins } = entitlements.showcase;
  if (change.adding) {
    const cap = pieces ?? SHOWCASE_HARD_CAP;
    if (owned.length >= cap) {
      return new PlanLimitError("showcase_pieces", cap, pieces === null ? `Showcases hold up to ${cap} pieces of work.` : `Your ${entitlements.planLabel} plan holds ${cap} pieces of work. Compare plans to show more.`);
    }
  }
  if (change.pinning && owned.filter(item => item.pinned).length >= pins) {
    return new PlanLimitError("showcase_pins", pins, `Pin limit reached. Your ${entitlements.planLabel} plan pins ${pins} ${pins === 1 ? "piece" : "pieces"}; unpin one first.`);
  }
  return null;
}

/** Assistants, tokens, developer apps and OAuth need the assistant entitlement (the Land tier). */
export class AssistantPlanRequiredError extends Error {
  readonly code = "assistant_plan_required" as const;
  constructor() {
    super(ASSISTANT_PLAN_REQUIRED_MESSAGE);
    this.name = "AssistantPlanRequiredError";
  }
}
