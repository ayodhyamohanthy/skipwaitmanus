import { z } from "zod";
import { acceptedAskCostSchema, sameAcceptedAskCost, type AcceptedAskCost } from "../shared/acceptedAskCost";
import { LEVEL_DISPLAY_NAME, type SpendSource } from "../shared/planFamily";

export const skippieQuoteSchema = z.strictObject({
  level: z.number().int().min(1).max(10),
  cost: z.number().int().min(0),
  totalAvailable: z.number().int().min(0),
  shortfall: z.number().int().min(0),
  coverageStatus: z.enum(["covered", "waiting_for_company_coverage"]).optional(),
  acceptedCost: acceptedAskCostSchema.nullable().optional(),
});
export type SkippieQuote = z.infer<typeof skippieQuoteSchema>;

const SOURCE_LABEL: Record<SpendSource, string> = {
  included: "your included allowance",
  free: "your monthly free allowance",
  purchased: "your purchased referrals",
};

export function sameSkippieQuote(confirmed: SkippieQuote | undefined, fresh: SkippieQuote): boolean {
  if (!confirmed || confirmed.level !== fresh.level || confirmed.cost !== fresh.cost || confirmed.coverageStatus !== fresh.coverageStatus) return false;
  if (confirmed.acceptedCost === undefined && fresh.acceptedCost === undefined) return true;
  if (!confirmed.acceptedCost || !fresh.acceptedCost) return false;
  return sameAcceptedAskCost(confirmed.acceptedCost, fresh.acceptedCost);
}

export function quoteLine(quote: SkippieQuote): string {
  if (quote.coverageStatus === "waiting_for_company_coverage") return "This referral request waits at no cost until a verified employee can see it. Nothing is used now. Send it?";
  const band = quote.acceptedCost ? `${LEVEL_DISPLAY_NAME[quote.acceptedCost.band]} ` : "";
  const source = quote.acceptedCost?.source[0];
  const allocation = source ? ` from ${SOURCE_LABEL[source.bucket]}` : "";
  const cost = `This referral request uses ${quote.cost} ${band}referral${quote.cost === 1 ? "" : "s"}${allocation}. You have ${quote.totalAvailable} available.`;
  return quote.shortfall > 0
    ? `${cost} Add ${quote.shortfall} more on /plans first - Skippy never takes a payment.`
    : `${cost} Send it?`;
}

export function chargedReferralLine(chargedCost: AcceptedAskCost | undefined): string {
  if (!chargedCost) return "Track the request and your referral balance under My requests.";
  const source = chargedCost.source[0];
  if (!source) return "No referral was used.";
  return `${chargedCost.units} ${LEVEL_DISPLAY_NAME[chargedCost.band]} referral was used from ${SOURCE_LABEL[source.bucket]}.`;
}
