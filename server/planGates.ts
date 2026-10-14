// Server-side plan gates that read the entitlement (shared/planEntitlements.ts):
// the typed errors routes map to 409 (showcase limits) or 402 (assistants).
// No db.ts import, so db.ts can use these inside its transactions without an
// import cycle.
import { ASSISTANT_PLAN_REQUIRED_MESSAGE } from "../shared/assistant";
import { SHOWCASE_HARD_CAP, type PlanEntitlements } from "../shared/planEntitlements";

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

/** Assistants, tokens, developer apps and OAuth need the assistant entitlement (Land, or legacy Max). */
export class AssistantPlanRequiredError extends Error {
  readonly code = "assistant_plan_required" as const;
  constructor() {
    super(ASSISTANT_PLAN_REQUIRED_MESSAGE);
    this.name = "AssistantPlanRequiredError";
  }
}
