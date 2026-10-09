// Kit v4 step "Upgrade to …": the kit's checkout-preview dialog, made real. It
// states the plan, the live price and the hosted gateway, then hands off to the
// Chargebee hosted page (or to sign-in first). Nothing is charged here; access
// starts only after the verified payment event reaches the server.
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Link } from "wouter";
import type { PaidSubscriptionPlan, SubscriptionCurrency } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { paymentRouteDetails } from "@/lib/paymentRoute";
import { KitDialog } from "./KitDialog";
import { planLabel, planPriceDisplay } from "./planCatalog";

type CheckoutDialogProps = {
  plan: PaidSubscriptionPlan;
  currency: SubscriptionCurrency;
  signedIn: boolean;
  opening: boolean;
  error: string;
  onPay: () => void;
  onClose: () => void;
};

export function CheckoutDialog({ plan, currency, signedIn, opening, error, onPay, onClose }: CheckoutDialogProps) {
  const price = planPriceDisplay(plan, currency);
  const route = paymentRouteDetails(currency);
  return <KitDialog onClose={onClose} labelledBy="plan-checkout-title">
    <span className="preview-check"><Check /></span>
    <h2 id="plan-checkout-title">{planLabel(plan)} — secure checkout</h2>
    <p>Pay with {route.gateway}. {route.gatewayDescriptor}. Access starts only after the verified payment event reaches our server. Cancel anytime; paid access stays through the current cycle. <Link href="/refunds" className="font-semibold text-foreground underline underline-offset-2">Refund &amp; cancellation policy</Link>.</p>
    <Button data-autofocus className="brand-button" disabled={opening} onClick={onPay}>{opening ? <><LoaderCircle className="animate-spin" />Opening secure checkout…</> : <>{signedIn ? "Pay" : "Sign in to pay"} {price}<ArrowRight /></>}</Button>
    {error ? <p role="alert" className="mb-0 font-semibold text-destructive">{error}</p> : null}
  </KitDialog>;
}
