// Kit v4 step "Upgrade to …": the kit's checkout-preview dialog, made real. It
// states the plan, the live price and the hosted gateway, then hands off to the
// Chargebee hosted page (or to sign-in first). Nothing is charged here; access
// starts only after the verified payment event reaches the server.
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Link } from "wouter";
import type { PaidSubscriptionPlan, SubscriptionCurrency, SubscriptionInterval } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { paymentRouteDetails } from "@/lib/paymentRoute";
import { KitDialog } from "./KitDialog";
import { kitPlanLabel, kitPlanPrice } from "./kitPlans";

type CheckoutDialogProps = {
  plan: PaidSubscriptionPlan;
  currency: SubscriptionCurrency;
  interval: SubscriptionInterval;
  signedIn: boolean;
  opening: boolean;
  error: string;
  onPay: () => void;
  onClose: () => void;
};

export function CheckoutDialog({ plan, currency, interval, signedIn, opening, error, onPay, onClose }: CheckoutDialogProps) {
  const price = kitPlanPrice(plan, currency, interval);
  const route = paymentRouteDetails(currency);
  return <KitDialog onClose={onClose} labelledBy="plan-checkout-title">
    <span className="preview-check"><Check /></span>
    <h2 id="plan-checkout-title">{kitPlanLabel(plan)} — secure checkout</h2>
    <p>Pay with {route.gateway}. {route.gatewayDescriptor}. Access starts only after the verified payment event reaches our server. Cancel anytime; paid access stays through the current cycle. <Link href="/refunds" className="font-semibold text-foreground underline underline-offset-2">Refund &amp; cancellation policy</Link>.</p>
    <Button data-autofocus className="brand-button" disabled={opening} onClick={onPay}>{opening ? <><LoaderCircle className="animate-spin" />Opening secure checkout…</> : <>{signedIn ? "Pay" : "Sign in to pay"} {price}<ArrowRight /></>}</Button>
    {error ? <p role="alert" className="mb-0 font-semibold text-destructive">{error}</p> : null}
  </KitDialog>;
}
