import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Minus, Plus } from "lucide-react";
import { GoalButton, GoalNextStep, GoalNum, GoalStatus, useOnlineStatus } from "@/components/goal";
import { usePlansCatalog } from "@/components/plans/plansCatalogApi";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails } from "@/lib/paymentRoute";
import { LEGACY_PREMIUM_PACKS, premiumMoney } from "@/lib/premiumPurchase";
import { applySeo } from "@/lib/seo";
import { tokenReturnPath } from "@/lib/tokens";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { MONEY_SENTENCE_SHORT } from "@shared/moneyCopy";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { REFERRERS_NEVER_PAY, REFERRER_PURCHASES_ENABLED } from "@shared/referrerPurchases";
import { useLocationSearch } from "../sign-in/useLocationSearch";
import { usePremiumPayment } from "./usePremiumPayment";
import type { PaymentRoute } from "@/lib/paymentRoute";
import type { TokenRole } from "@/lib/tokens";

export const GOAL_PAGE = { goalLine: "Get more referral requests." } as const;
const LINK = "inline-flex min-h-11 items-center text-g-label text-g-ink underline underline-offset-4";

export default function GoalPremium() {
  const search = useLocationSearch();
  return <PremiumFlow key={search} search={search} />;
}

function PremiumFlow({ search }: { search: string }) {
  const params = new URLSearchParams(search);
  const role: TokenRole = params.get("role") === "referrer" ? "referrer" : "job_seeker";
  const pending = params.get("payment") === "pending";
  const referrerOff = role === "referrer" && !REFERRER_PURCHASES_ENABLED;
  const online = useOnlineStatus();
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [quantity, setQuantity] = useState(() => {
    const value = Number(params.get("quantity"));
    return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 10;
  });
  const catalog = usePlansCatalog(!referrerOff && CREDIT_PACKS_ON_SALE && !pending);
  const retired = catalog.data?.packs.some(pack => pack.available) === true;
  const catalogFailed = catalog.isError;
  const catalogLoading = catalog.isPending && catalog.data === undefined;
  const canBuy = CREDIT_PACKS_ON_SALE && !referrerOff && !pending && !retired && !catalogFailed && !catalogLoading && online;
  const { auth, balance, checkout, checkoutBusy, begin, recovery } = usePremiumPayment(role, pending, route, quantity, canBuy);
  const selected = LEGACY_PREMIUM_PACKS.find(pack => pack.currency === route) ?? LEGACY_PREMIUM_PACKS[1];
  const totalLabel = `${premiumMoney(selected.price * quantity, route)} ${route}`;
  const routeDetails = paymentRouteDetails(route);
  const back = tokenReturnPath(role);
  const updateQuantity = (value: number) => setQuantity(Math.max(1, Math.min(1000, Number.isFinite(value) ? Math.round(value) : 1)));
  useEffect(() => { applySeo({ title: "Get more referral requests", description: MONEY_SENTENCE_SHORT, path: "/premium" }); }, []);

  let label = "Choose your referral requests";
  let reason = "Choose how many referral requests to add. Your selected total is shown before checkout.";
  let action = <GoalButton variant="primary" className="mt-4 w-full gdesk:w-auto" busy={checkoutBusy} busyLabel="Opening secure checkout…" disabledReason={!auth.isLoaded ? "Checking sign-in…" : !online ? "Reconnect before opening checkout." : undefined} onClick={begin}>{!auth.isLoaded ? "Checking sign-in…" : auth.isSignedIn ? `Continue to pay ${totalLabel}` : `Sign in to pay ${totalLabel}`}</GoalButton>;
  if (pending) {
    label = !auth.isLoaded ? "Checking sign-in…" : !auth.isSignedIn ? "Sign in to confirm your payment." : recovery.state === "credited" ? `${recovery.count} referral request${recovery.count === 1 ? " is" : "s are"} ready.` : recovery.state === "requires_review" ? "This payment needs a review." : recovery.state === "error" ? "We could not confirm this payment." : recovery.state === "missing" ? "This browser has no matching checkout to confirm." : "We’re confirming your payment.";
    reason = !auth.isSignedIn ? "Use the account that started checkout. Signing in does not start another purchase." : recovery.state === "credited" ? "Your verified payment is complete. Your available referral requests are updated." : recovery.state === "requires_review" ? "Support can check the provider record. Do not pay again for this purchase." : recovery.state === "error" || recovery.state === "missing" ? "Your payment is not confirmed here. Keep your receipt and contact Support; do not pay again." : "We will update your balance only after the server confirms the provider’s payment record. Do not pay again.";
    const needsHelp = recovery.state === "requires_review" || recovery.state === "error" || recovery.state === "missing";
    action = !auth.isLoaded ? <GoalButton variant="primary" className="mt-4" disabledReason="Checking sign-in…">Checking sign-in…</GoalButton> : !auth.isSignedIn ? role === "referrer" ? <GoalButton variant="primary" asChild className="mt-4"><Link href={referrerSignInHref(`/premium${search}`)}>Sign in to confirm payment</Link></GoalButton> : <GoalButton variant="primary" className="mt-4" onClick={() => auth.openSignIn({ returnTo: `/premium${search}` })}>Sign in to confirm payment</GoalButton> : <GoalButton variant="primary" asChild className="mt-4"><Link href={needsHelp ? "/support" : back}>{needsHelp ? "Get help with this payment" : recovery.state === "credited" ? "Use my referral requests" : "Continue"}</Link></GoalButton>;
  } else if (referrerOff) {
    label = REFERRERS_NEVER_PAY;
    reason = "Review referral requests and refer through your company’s process, with nothing to buy.";
    action = <GoalButton variant="primary" asChild className="mt-4"><Link href={back}>Back to referring</Link></GoalButton>;
  } else if (!CREDIT_PACKS_ON_SALE) {
    label = "Extra referral requests are paused.";
    reason = "We are not selling extra referral requests right now. Referral requests already in your account still work.";
    action = <GoalButton variant="primary" asChild className="mt-4"><Link href={back}>Back to my referral request</Link></GoalButton>;
  } else if (catalogFailed || !online) {
    label = !online ? "You’re offline." : "Live prices did not load.";
    reason = "Reconnect and try again before choosing a purchase. Nothing has been charged.";
    action = <GoalButton variant="primary" className="mt-4" disabledReason={!online ? "Reconnect to retry." : undefined} onClick={() => { void catalog.refetch(); }}>Retry live prices</GoalButton>;
  } else if (catalogLoading) {
    label = "Checking live prices…";
    reason = "Wait for current availability before choosing a purchase.";
    action = <GoalButton variant="primary" className="mt-4" disabledReason="Loading live prices.">Checking live prices…</GoalButton>;
  } else if (retired) {
    label = "Choose a referral pack.";
    reason = "Single referral requests have been replaced by packs. Compare the available packs on the plans page.";
    action = <GoalButton variant="primary" asChild className="mt-4"><Link href="/plans#packs">See referral packs</Link></GoalButton>;
  }

  return (
    <main data-skipwait-screen="premium" data-goal-page="premium" className="g-scope mx-auto w-full max-w-[760px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <Link href={back} className={LINK}>Back</Link>
      <h1 className="mt-5 text-g-display text-balance">{GOAL_PAGE.goalLine}</h1>
      <div className="mt-4" role="status"><GoalStatus status={pending && recovery.state !== "credited" ? "waiting" : "queue_new"} label={label} className="whitespace-normal" /></div>
      <div className="mt-6"><GoalNextStep reason={reason}>
        {canBuy ? <div className="mt-5 border-y border-g-hairline py-4">
          <p className="text-g-heading">Pay {totalLabel}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">{routeDetails.gateway}. {routeDetails.gatewayDescriptor}.</p>
          <label htmlFor="goal-premium-quantity" className="mt-5 block text-g-label">Referral requests to add</label>
          <div className="mt-2 inline-flex items-center gap-2">
            <GoalButton aria-label="Remove one referral request" variant="outline" disabledReason={quantity <= 1 ? "Minimum one referral request." : undefined} onClick={() => updateQuantity(quantity - 1)}><Minus aria-hidden="true" className="size-4" /></GoalButton>
            <input id="goal-premium-quantity" type="number" min="1" max="1000" inputMode="numeric" value={quantity} onChange={event => updateQuantity(Number(event.target.value))} className="h-11 w-24 rounded-g-control border border-g-control-edge bg-g-surface text-center font-g-mono text-g-body" />
            <GoalButton aria-label="Add one referral request" variant="outline" disabledReason={quantity >= 1000 ? "Maximum 1,000 referral requests." : undefined} onClick={() => updateQuantity(quantity + 1)}><Plus aria-hidden="true" className="size-4" /></GoalButton>
          </div>
          <GoalButton className="mt-3 block whitespace-normal text-left" onClick={() => setRoute(alternatePaymentRoute(route))}>Different billing country? {routeDetails.alternateLabel}</GoalButton>
        </div> : null}
        {action}
        {checkout.isError ? <p role="alert" className="mt-3 text-g-meta text-g-ink">Checkout did not open. Check your connection and try again; do not pay again if you already completed this purchase.</p> : null}
      </GoalNextStep></div>
      {auth.isLoaded && auth.isSignedIn && !referrerOff && !pending ? <section aria-label="Your referral request balance" className="mt-8 border-t border-g-hairline pt-5">
        <h2 className="text-g-heading">Your referral requests</h2>
        {balance.isPending ? <p className="mt-2 text-g-body text-g-ink-2">Checking your balance…</p> : balance.isError || !balance.data ? <div className="mt-2"><p className="text-g-body">Your balance did not load.</p><GoalButton onClick={() => { void balance.refetch(); }}>Retry balance</GoalButton></div> : <>
          <p className="mt-3 text-g-body"><GoalNum>{balance.data.totalAvailable}</GoalNum> referral requests left</p>
          {balance.data.ledger ? <p className="mt-2 text-g-meta text-g-ink-2"><GoalNum>{balance.data.ledger.buckets.purchased}</GoalNum> from purchases, included in your total.</p> : null}
          {CREDIT_PACKS_ON_SALE && balance.data.promoOfferActive && balance.data.promoStatus === null ? <p className="mt-3 text-g-meta text-g-ink-2">First verified payment earns <GoalNum>5</GoalNum> bonus referral requests. They expire after <GoalNum>30</GoalNum> days and are used before your monthly allowance.</p> : null}
          {balance.data.promoCreditsRemaining ? <p className="mt-2 text-g-meta text-g-ink-2"><GoalNum>{balance.data.promoCreditsRemaining}</GoalNum> bonus referral requests{balance.data.promoExpiresAt ? <> · ends <GoalNum>{new Date(balance.data.promoExpiresAt).toLocaleDateString("en-US")}</GoalNum></> : null}.</p> : null}
        </>}
      </section> : null}
      <footer className="mt-8 border-t border-g-hairline pt-4">
        {canBuy ? <p className="mb-3 flex flex-wrap justify-between gap-2 text-g-label"><span><GoalNum>{quantity}</GoalNum> referral requests</span><GoalNum>{totalLabel}</GoalNum></p> : null}
        <p className="text-g-meta leading-6 text-g-ink-2">{MONEY_SENTENCE_SHORT}</p>
        <div className="mt-3 flex flex-wrap gap-x-5"><Link href="/support" className={LINK}>Contact Support</Link><Link href="/refunds" className={LINK}>Refund policy</Link><Link href="/terms" className={LINK}>Terms</Link></div>
      </footer>
    </main>
  );
}
