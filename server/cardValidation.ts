// D-079: provider-facing card validation for free credits. Chargebee owns the
// card check end to end (its hosted page and card verification, auto-voided);
// this module only creates the page and re-reads provider truth. Card numbers
// are never seen or logged here.
import { createCustomer, createManagePaymentSourcesPage, listPaymentSources } from "./chargebeeAccountApi";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { getUserChargebeeCustomerId, markCardValidatedFromProvider, setUserChargebeeCustomerId } from "./db";

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
  const url = await createManagePaymentSourcesPage(runtime, { customerId, redirectUrl: `${input.origin}/plans?card-validation=return` });
  return { url };
}

/** Provider-truth re-read for the return path (webhook lag): a valid payment
 * source on the linked customer validates the wallet and grants the month. */
export async function reconcileCardValidationFromProvider(input: { userId: number }): Promise<{ checked: boolean; validated: boolean }> {
  const customerId = await getUserChargebeeCustomerId(input.userId);
  if (!customerId) return { checked: false, validated: false };
  const runtime = resolveChargebeeRuntime(undefined);
  const sources = await listPaymentSources(runtime, customerId);
  if (!sources.some(source => source.status === "valid")) return { checked: true, validated: false };
  await markCardValidatedFromProvider(input.userId);
  return { checked: true, validated: true };
}
