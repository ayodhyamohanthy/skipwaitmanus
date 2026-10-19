/**
 * The billing account's payment methods (0096). SkipWait never sees or stores
 * card data: this lists the labels the provider holds, and every add, replace or
 * removal happens on a Chargebee hosted page.
 *
 * It is also the one place the "payment method on file" fact is confirmed, so it
 * is what makes a Free seeker month grant its credits (server/creditCycles.ts).
 * A provider failure never clears that fact — only a successful read that finds
 * no usable source does, because "we could not ask" is not "they have no card".
 */
import type { Express, Request } from "express";
import { paymentMethodSessionRequestSchema, type PaymentMethod, type PaymentMethodsResponse } from "../shared/billingAccount";
import { createCustomer, createManagePaymentSourcesPage, listPaymentSources, paymentMethodFromSource, retrieveCustomer, type ProviderPaymentSource } from "./chargebeeAccountApi";
import type { ChargebeeCredentials } from "./chargebeeApi";
import { resolveChargebeeRuntime, type ChargebeeRuntime } from "./chargebeeEnvironment";

type TokenRole = "job_seeker" | "referrer";

export type BillingAccountIdentity = { account: { id: number; email?: string | null; name?: string | null }; primaryEmail?: { emailAddress?: string | null } | null };

export type BillingAccountRouteDeps = {
  resolveIdentity: (req: Request) => Promise<BillingAccountIdentity | undefined>;
  resolveRuntime?: (host: string | undefined) => ChargebeeRuntime;
  findCustomer?: (input: { userId: number; role: TokenRole; provider: string; site: "test" | "live" }) => Promise<string | undefined>;
  saveCustomer?: (input: { userId: number; role: TokenRole; provider: string; site: "test" | "live"; providerCustomerId: string }) => Promise<void>;
  setPaymentMethodOnFile?: (userId: number, role: TokenRole, at: Date | null) => Promise<void>;
  listSources?: (credentials: ChargebeeCredentials, customerId: string) => Promise<ProviderPaymentSource[]>;
  retrieveProviderCustomer?: (credentials: ChargebeeCredentials, customerId: string) => Promise<{ id: string; primaryPaymentSourceId: string | null } | null>;
  createProviderCustomer?: (credentials: ChargebeeCredentials, input: { email?: string; firstName?: string; lastName?: string }) => Promise<string>;
  createManagePage?: (credentials: ChargebeeCredentials, input: { customerId: string; redirectUrl: string }) => Promise<string>;
  recordActivity?: (input: { actorUserId: number; action: string; outcome: "success" | "failure"; resourceType: string; resourceId?: string; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<unknown>;
};

const PROVIDER = "chargebee";

function roleFromQuery(value: unknown): TokenRole {
  return value === "referrer" ? "referrer" : "job_seeker";
}

function isChargebeeNotConfigured(error: unknown): boolean {
  return error instanceof Error && /Chargebee API key(?:\/site)? is not configured/.test(error.message);
}

function nameParts(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const [first, ...rest] = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: first || undefined, lastName: rest.join(" ") || undefined };
}

/** The rows the kit renders: provider labels only, the default flagged from the customer record. */
export function paymentMethodsFromSources(sources: ProviderPaymentSource[], primarySourceId: string | null): PaymentMethod[] {
  return sources.map(source => paymentMethodFromSource(source, primarySourceId));
}

export function registerBillingAccountRoutes(app: Express, deps: BillingAccountRouteDeps) {
  const runtime = (req: Request) => (deps.resolveRuntime ?? resolveChargebeeRuntime)(req.hostname);
  const record = (input: Parameters<NonNullable<BillingAccountRouteDeps["recordActivity"]>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };

  app.get("/api/billing/payment-methods", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your payment methods" });
      const role = roleFromQuery(req.query.role);
      const credentials = runtime(req);
      const site = credentials.environment;
      const customerId = await (deps.findCustomer ?? (async () => undefined))({ userId: identity.account.id, role, provider: PROVIDER, site });
      if (!customerId) {
        // No billing customer: this member has never checked out, so there is no
        // saved source to find. Recording null keeps the eligibility flag honest.
        await (deps.setPaymentMethodOnFile ?? (async () => undefined))(identity.account.id, role, null);
        return res.json({ methods: [], customer: false } satisfies PaymentMethodsResponse);
      }
      const [sources, customer] = await Promise.all([
        (deps.listSources ?? listPaymentSources)(credentials, customerId),
        (deps.retrieveProviderCustomer ?? retrieveCustomer)(credentials, customerId),
      ]);
      const methods = paymentMethodsFromSources(sources, customer?.primaryPaymentSourceId ?? null);
      await (deps.setPaymentMethodOnFile ?? (async () => undefined))(identity.account.id, role, methods.length > 0 ? new Date() : null);
      res.set("Cache-Control", "private, no-store");
      return res.json({ methods, customer: true } satisfies PaymentMethodsResponse);
    } catch (error) {
      console.error("[Billing] payment methods read failed", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Card payments are not available right now" });
      return res.status(502).json({ error: "We could not reach the payment provider. Try again in a moment." });
    }
  });

  app.post("/api/billing/payment-methods/session", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage your payment methods" });
      const parsed = paymentMethodSessionRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "That payment step is not available" });
      const role = roleFromQuery(req.query.role);
      const credentials = runtime(req);
      const site = credentials.environment;
      let customerId = await (deps.findCustomer ?? (async () => undefined))({ userId: identity.account.id, role, provider: PROVIDER, site });
      if (!customerId) {
        // A member who has never checked out still needs somewhere for the card
        // to be saved, so the provider customer is created first.
        const email = identity.primaryEmail?.emailAddress ?? identity.account.email ?? undefined;
        customerId = await (deps.createProviderCustomer ?? createCustomer)(credentials, { email, ...nameParts(identity.account.name) });
        await (deps.saveCustomer ?? (async () => undefined))({ userId: identity.account.id, role, provider: PROVIDER, site, providerCustomerId: customerId });
      }
      const origin = `${req.protocol}://${req.get("host")}`;
      const url = await (deps.createManagePage ?? createManagePaymentSourcesPage)(credentials, {
        customerId,
        redirectUrl: `${origin}/billing?payment=${parsed.data.returnTo === "payment" ? "payment" : "methods"}`,
      });
      record({ actorUserId: identity.account.id, action: "billing.payment_method_session_started", outcome: "success", resourceType: "billing_customer", resourceId: customerId, metadata: { role, site } });
      return res.json({ url });
    } catch (error) {
      console.error("[Billing] payment method session failed", error);
      if (isChargebeeNotConfigured(error)) return res.status(503).json({ error: "Card payments are not available right now" });
      return res.status(502).json({ error: "We could not open the secure card page. Try again in a moment." });
    }
  });
}
