import type { Express, Request } from "express";
import { basicAuthMatches, CHARGEBEE_TOKEN_PACKS, createChargebeeCheckout, isTokenPackId, isTokenQuantity, parsePaidPaymentEvent, tokenPackFromAmount } from "./chargebee";
import type { TokenRole } from "./chargebee";

export type ChargebeeIdentity = { account: { id: number; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };

type Deps = {
  resolveIdentity: (req: Request) => Promise<ChargebeeIdentity | undefined>;
  createCheckout?: typeof createChargebeeCheckout;
  createPaymentIntent: (input: { hostedPageId: string; checkoutIntentId: string; userId: number; role: TokenRole; tokenCount: number; amount: number; currency: string }) => Promise<unknown>;
  fulfillPayment: (input: { eventId: string; hostedPageId?: string; invoiceId?: string; passThruContent?: string; amount: number; currency: string }) => Promise<unknown>;
  resolveHostedPage?: (input: { invoiceId?: string; amount: number; currency: string }) => Promise<{ hostedPageId: string; invoiceId?: string; passThruContent?: string; amount?: number; currency?: string } | undefined>;
};

function roleFromBody(value: unknown): TokenRole {
  return value === "referrer" ? "referrer" : "job_seeker";
}

export function registerChargebeeRoutes(app: Express, deps: Deps) {
  app.post("/api/chargebee/checkout", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in before purchasing tokens" });
      const itemPriceId = req.body?.itemPriceId;
      if (!isTokenPackId(itemPriceId)) return res.status(400).json({ error: "Choose a supported token currency" });
      const billingCountry = req.body?.billingCountry;
      if (billingCountry !== "IN" && billingCountry !== "INTL") return res.status(400).json({ error: "Choose India or international billing" });
      const role = roleFromBody(req.body?.role);
      const quantity = req.body?.quantity ?? 1;
      if (!isTokenQuantity(quantity)) return res.status(400).json({ error: "Choose a whole number of tokens between 1 and 1,000" });
      const pack = CHARGEBEE_TOKEN_PACKS[itemPriceId];
      if ((billingCountry === "IN" && pack.currency !== "INR") || (billingCountry === "INTL" && pack.currency !== "USD")) {
        return res.status(400).json({ error: "That currency is not available for the selected billing route" });
      }
      const origin = `${req.protocol}://${req.get("host")}`;
      const checkout = await (deps.createCheckout ?? createChargebeeCheckout)({
        itemPriceId,
        quantity,
        email: identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined,
        firstName: identity.account.name?.split(" ")[0],
        lastName: identity.account.name?.split(" ").slice(1).join(" "),
        redirectUrl: `${origin}/premium?role=${role}&payment=pending`,
        cancelUrl: `${origin}/premium?role=${role}&payment=cancelled`,
      });
      await deps.createPaymentIntent({ hostedPageId: checkout.hostedPageId, checkoutIntentId: checkout.checkoutIntentId, userId: identity.account.id, role, tokenCount: pack.tokenCount * quantity, amount: pack.amount * quantity, currency: pack.currency });
      return res.json({ checkoutUrl: checkout.checkoutUrl, hostedPageId: checkout.hostedPageId });
    } catch (error) {
      console.error("[Chargebee] checkout error", error);
      return res.status(502).json({ error: "Unable to start Chargebee checkout" });
    }
  });

  app.post("/api/chargebee/webhook", async (req, res) => {
    const secret = process.env.CHARGEBEE_WEBHOOK_SECRET;
    if (!secret || !basicAuthMatches(req.header("authorization"), secret)) return res.status(401).send("Unauthorized");
    const parsed = parsePaidPaymentEvent(req.body);
    if (!parsed) return res.status(202).json({ received: true, ignored: true });
    if (!tokenPackFromAmount(parsed.amount, parsed.currency)) return res.status(202).json({ received: true, ignored: true });
    try {
      const resolvedHostedPage = (!parsed.hostedPageId || !parsed.passThruContent) && deps.resolveHostedPage
        ? await deps.resolveHostedPage({ invoiceId: parsed.invoiceId, amount: parsed.amount, currency: parsed.currency })
        : undefined;
      const result = await deps.fulfillPayment({
        ...parsed,
        hostedPageId: parsed.hostedPageId ?? resolvedHostedPage?.hostedPageId,
        passThruContent: parsed.passThruContent ?? resolvedHostedPage?.passThruContent,
      });
      return res.status(200).json({ received: true, result });
    } catch (error) {
      console.error("[Chargebee] fulfillment error", error);
      return res.status(500).json({ error: "Fulfillment retry required" });
    }
  });
}
