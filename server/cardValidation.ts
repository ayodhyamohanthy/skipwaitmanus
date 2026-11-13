// D-079: provider-facing card validation for free credits. Chargebee owns the
// card check end to end (its hosted page and card verification, auto-voided);
// this module only creates the page and re-reads provider truth. Card numbers
// are never seen or logged here.
import { freeCreditsRequireCardValidation } from "./billingSettings";
import { createCustomer, createManagePaymentSourcesPage, listPaymentSources } from "./chargebeeAccountApi";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { getUserChargebeeCustomerId, markCardValidatedFromProvider, recordOperationalActivity, setUserChargebeeCustomerId } from "./db";

/** The hosted page where the seeker adds a card for validation. The Chargebee
 * customer is created once per user and reused by later provider flows (#35). */
export async function createCardValidationPageForUser(input: { userId: number; email?: string | null; name?: string | null; origin: string }): Promise<{ url: string }> {
  const runtime = resolveChargebeeRuntime(undefined);
  let customerId = await getUserChargebeeCustomerId(input.userId);
  if (!customerId) {
    const created = await createCustomer(runtime, {
      email: input.email ?? undefined,
      firstName: input.name?.split(" ")[0],
      lastName: input.name?.split(" ").slice(1).join(" ") || undefined,
    });
    await setUserChargebeeCustomerId(input.userId, created);
    customerId = (await getUserChargebeeCustomerId(input.userId)) ?? created;
  }
  const page = await createManagePaymentSourcesPage(runtime, { customerId, redirectUrl: `${input.origin}/plans?card-validation=return` });
  // Coverage: a card-validation page is a provider hosted page with no checkout
  // intent or fulfillment row (no money moves here). Recording its id lets
  // payment reconciliation tell these expected pages apart from anomalies.
  void recordOperationalActivity({ actorUserId: input.userId, action: "billing.card_validation_page_created", outcome: "success", resourceType: "chargebee_hosted_page", resourceId: page.hostedPageId }).catch(() => undefined);
  return { url: page.url };
}

/** Provider-truth re-read for the return path (webhook lag): a valid payment
 * source on the linked customer validates the wallet and grants the month. */
export async function reconcileCardValidationFromProvider(input: { userId: number }): Promise<{ checked: boolean; validated: boolean }> {
  if (!freeCreditsRequireCardValidation()) return { checked: false, validated: false };
  const customerId = await getUserChargebeeCustomerId(input.userId);
  if (!customerId) return { checked: false, validated: false };
  const runtime = resolveChargebeeRuntime(undefined);
  const sources = await listPaymentSources(runtime, customerId);
  if (!sources.some(source => source.status === "valid")) return { checked: true, validated: false };
  await markCardValidatedFromProvider(input.userId);
  return { checked: true, validated: true };
}
