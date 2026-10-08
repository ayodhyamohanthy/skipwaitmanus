import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { readApiJson } from "@/lib/apiResponse";
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS, type PaidSubscriptionPlan } from "@shared/subscriptionPlans";

/**
 * Kit v4 `/billing` (screens/web/…, app/src/routes/billing.tsx).
 *
 * THE KIT'S SCREEN NEEDED A SERVER ROUTE THAT DID NOT EXIST. It shows a current
 * plan, an allowance, a status (active / cancelling / payment issue / free) and
 * a receipt history. Chargebee was already wired for writes --
 * /api/chargebee/subscription-checkout, /subscription-cancel, /checkout -- but
 * nothing could READ the current subscription, and Deps.getUserSubscription sat
 * unused. Rather than invent a plan to display, this adds the missing GET
 * /api/chargebee/subscription and reads from it.
 *
 * THREE DEPARTURES FROM THE KIT:
 *
 * 1. NO INVENTED RECEIPTS. The kit lists three hard-coded rows including
 *    "Momentum · monthly · $20". There is no receipt source in this app; a
 *    billing history nobody can audit is worse than none.
 * 2. NO INVENTED PLAN NAMES. The kit says "Momentum"; this product sells Pro and
 *    Max (shared/subscriptionPlans.ts). Same error class as an invented price.
 * 3. NO PREVIEW STATE SWITCHER. The kit's StateChips row is design chrome.
 *
 * Payment method and invoices live in Chargebee, so "update payment" is a link
 * out rather than a card form -- the app never sees a card number.
 */

type SubscriptionResponse = {
  subscription: { plan: string | null; status: string; currentTermEnd: string | null } | null;
  credits: unknown;
  error?: string;
};

const STATUS_COPY: Record<string, string> = {
  active: "Renews automatically.",
  non_renewing: "Cancels at the end of the current term.",
  past_due: "Your last payment failed. Update your payment method to keep your plan credits.",
  cancelled: "This plan has ended.",
};

export default function Billing() {
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: ["chargebee", "subscription"],
    queryFn: async (): Promise<SubscriptionResponse> => {
      const response = await fetch("/api/chargebee/subscription", { credentials: "include" });
      return readApiJson<SubscriptionResponse>(response, "We could not load your plan");
    },
    retry: false,
  });

  const checkout = useMutation({
    mutationFn: async (plan: PaidSubscriptionPlan) => {
      const response = await fetch("/api/chargebee/subscription-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });
      const payload = await readApiJson<{ checkoutUrl?: string; error?: string }>(response, "Unable to open secure plan checkout");
      if (typeof payload.checkoutUrl !== "string") throw new Error(payload.error ?? "Unable to open secure plan checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/chargebee/subscription-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return readApiJson<{ status?: string; error?: string }>(response, "We could not schedule your cancellation");
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["chargebee", "subscription"] }); },
  });

  const subscription = data?.subscription ?? null;

  // Name the plan only when the server named it. The wallet carries
  // plan: "free" | "pro" | "max", and getUserSubscription returns undefined for
  // free, so null here means "no active paid plan" -- which is what Free is.
  // An earlier draft of this file defaulted to "pro" whenever any subscription
  // existed, which would have labelled a Max account as Pro. Guessing a plan is
  // the same error as guessing a price.
  const plan: PaidSubscriptionPlan | null =
    subscription?.plan === "pro" || subscription?.plan === "max" ? subscription.plan : null;
  const allowance = plan ? SUBSCRIPTION_PLANS[plan].monthlyAllowance : FREE_MONTHLY_ALLOWANCE;

  return (
    <main data-skipwait-screen="billing" className="page-content mx-auto max-w-3xl">
      <p className="eyebrow text-muted-foreground">Plans &amp; credits</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-4xl font-semibold">Manage plan</h1>
        <Link href="/plans" className="text-link inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
          Compare plans <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {isPending && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />Loading your plan…
        </p>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-muted p-5">
          <strong className="text-destructive">We couldn't load your plan.</strong>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}. Refresh to try again — nothing has changed on your account.</p>
        </div>
      )}

      {data && subscription?.status === "past_due" && (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-muted p-5">
          <strong className="text-destructive">Your last payment failed.</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            Update your payment method in Chargebee to avoid losing plan credits.
            {subscription.currentTermEnd ? ` Your current term ends ${new Date(subscription.currentTermEnd).toLocaleDateString()}.` : ""}
          </p>
        </div>
      )}

      {data && (
        <section className="mt-6 rounded-lg border border-border p-5">
          <span className="eyebrow text-muted-foreground">Current plan</span>
          <h2 className="mt-1 text-2xl font-semibold">{plan ? SUBSCRIPTION_PLANS[plan].label : "Free"}</h2>
          <p className="text-sm text-muted-foreground">
            {allowance} asks a month{plan ? "" : " · buy credits anytime"}
          </p>
          {subscription && (
            <p className="mt-2 text-sm text-muted-foreground">{STATUS_COPY[subscription.status] ?? subscription.status}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {!plan && (["pro", "max"] as const).map(id => (
              <button
                key={id}
                type="button"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {checkout.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Upgrade to {SUBSCRIPTION_PLANS[id].label} · {SUBSCRIPTION_PLANS[id].prices.INR.display}
              </button>
            ))}
            {plan && (
              <button
                type="button"
                disabled={cancel.isPending || subscription?.status === "non_renewing"}
                onClick={() => cancel.mutate()}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm font-semibold disabled:opacity-60"
              >
                {subscription?.status === "non_renewing" ? "Cancellation scheduled" : cancel.isPending ? "Scheduling…" : "Cancel plan"}
              </button>
            )}
          </div>

          {checkout.error && <p className="mt-3 text-sm text-destructive">{checkout.error.message}</p>}
          {cancel.error && <p className="mt-3 text-sm text-destructive">{cancel.error.message}</p>}
        </section>
      )}

      <section className="mt-4 rounded-lg bg-muted p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />Payments are handled by Chargebee
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          SkipWait never sees your card number. Payment methods, invoices and receipts live in Chargebee's secure checkout, which is also where plan changes take effect.
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CreditCard className="size-4" aria-hidden="true" />Receipts and payment history are in your Chargebee portal, not here.
        </p>
      </section>
    </main>
  );
}
