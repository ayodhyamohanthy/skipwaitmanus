import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { ASK_COST_SENTENCE, CREDIT_RULE, PAID_PLANS_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { REFERRERS_NEVER_PAY } from "@shared/referrerPurchases";
import type { CatalogCurrency } from "@shared/planCatalog";
import { Button } from "@/components/kit/button";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { failureMessage, parseSummary, type CreditSummary } from "@/components/plans/billingApi";
import { CreditCta, CreditsSection, UsagePanel } from "@/components/plans/PlansCredits";
import { SeekerCreditsCard } from "@/components/SeekerCreditsCard";
import { FairBand, PlansReference } from "@/components/plans/PlansReference";
import { PlanCards } from "@/components/plans/PlanCards";
import { PendingCheckoutReturn } from "@/components/plans/PendingCheckoutReturn";
import { CoverageBlock, PacksSection, PassesSection, useKitCheckout } from "@/components/plans/PlansKitSections";
import { PlansCatalogOfflineError, usePlansCatalog } from "@/components/plans/plansCatalogApi";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";
import { activePaidPlan } from "@/components/plans/planCatalog";

// /plans: Free, the account's own plan when it holds one, credits, usage and the
// fairness promise. D-067 removed the Pro/Max plans, their checkout and the gift
// flow; the D-046 passes are sold here in their own slice, so this screen opens
// no plan checkout at all (credits are bought on /premium). A trusted referrer
// account is never shown a purchase (D-055): referring is never charged.

const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export default function Plans() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const isReferrer = params.get("role") === "referrer";
  const payment = params.get("payment");
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const currency = route as CatalogCurrency;
  const routeDetails = paymentRouteDetails(route);
  // Live prices, packs and passes; referrers never see a purchase (D-055).
  const catalogQuery = usePlansCatalog(!isReferrer);
  const catalog = catalogQuery.data ?? null;
  const packsOnSale = catalog !== null && catalog.packs.some(pack => pack.available);
  const creditsHref = packsOnSale ? "/plans#packs" : `/premium?role=${isReferrer ? "referrer" : "job_seeker"}`;
  const activePlan = activePaidPlan(summary);
  const checkout = useKitCheckout({ role: isReferrer ? "referrer" : "job_seeker", currency, isSignedIn, getToken, openSignIn });

  useEffect(() => {
    applySeo({ title: "Plans and credits", description: PAID_PLANS_SENTENCE, path: "/plans" });
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/credits/summary?role=${isReferrer ? "referrer" : "job_seeker"}`, { credentials: "include", headers: authHeaders(await getToken()) });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not refresh your plan details");
        const parsed = parseSummary(payload);
        if (active && response.ok && parsed) setSummary(parsed);
      } catch {
        // The page still compares the free allowance if the account summary retries.
      }
    })();
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn, isReferrer]);


  // QA review (#359 finding 1): until a pass is proven fixed-term on the provider
  // side, an active subscription keeps its cancel-renewal control.
  const scheduleCancellation = async () => {
    if (!isSignedIn || summary?.subscriptionStatus !== "active") return;
    setCancelError("");
    setCancelling(true);
    try {
      const response = await fetch("/api/chargebee/subscription-cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(await getToken()) },
        body: JSON.stringify({ role: isReferrer ? "referrer" : "job_seeker" }),
      });
      const payload = await readApiJson<{ currentTermEnd?: string; error?: string }>(response, "We could not schedule your cancellation");
      if (!response.ok) throw new Error(payload.error || "We could not schedule your cancellation");
      setSummary(current => current ? { ...current, subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: payload.currentTermEnd ?? current.subscriptionCurrentTermEnd } : current);
    } catch (reason) {
      setCancelError(failureMessage(reason, "We could not schedule your cancellation"));
    } finally {
      setCancelling(false);
    }
  };

  if (payment === "pending") {
    return <main data-skipwait-screen="plans" className="page-content plans-page"><PendingCheckoutReturn role={isReferrer ? "referrer" : "job_seeker"} getToken={getToken} /></main>;
  }

  return <main data-skipwait-screen="plans" className="page-content plans-page">
    <div className="page-heading"><div><span className="eyebrow">PLANS · <Link href="/billing" className="underline">Manage plan</Link></span><h1>Choose how much help you need<span className="brand-dot">.</span></h1><p>Everyone starts free — no card needed. {ASK_COST_SENTENCE} {isReferrer ? `${REFERRERS_NEVER_PAY} Reviewing requests is free, and skipwait.me never pays a referrer.` : REFERRER_MONEY_SENTENCE} Queue position never changes.</p></div>{isReferrer ? null : <CreditCta summary={summary} currency={currency} href={creditsHref} />}</div>

    {payment === "cancelled" ? <p role="status" className="plan-grid-note font-semibold">Checkout was cancelled. Nothing was charged.</p> : null}

    {isReferrer
      ? <section className="plans-section" aria-label="Referrers never pay"><span className="eyebrow">REFERRING</span><h2>{REFERRERS_NEVER_PAY}</h2><p>Reviewing requests, accepting one and building your verified track record cost you nothing — there is no plan to buy and no credit to spend. Referrers keep the same queue and the same rules whatever a seeker has paid for.</p><Button asChild variant="outline" className="brand-button"><Link href="/referrer">Referrer workspace<ArrowRight /></Link></Button></section>
      : <>
        <PlanCards
          currency={currency}
          activePlan={activePlan}
          endsAt={summary?.subscriptionCurrentTermEnd ?? null}
          renewing={summary?.subscriptionStatus === "active"}
          cancelRenewal={{ confirming: confirmingCancel, cancelling, onAsk: () => setConfirmingCancel(true), onConfirm: () => { void scheduleCancellation(); setConfirmingCancel(false); }, onKeep: () => setConfirmingCancel(false) }}
        />
        {isSignedIn ? <CoverageBlock isSignedIn={isSignedIn} getToken={getToken} /> : null}
        {catalog ? <PacksSection catalog={catalog} checkout={checkout} /> : null}
        {catalog ? <PassesSection catalog={catalog} activePlan={activePlan} checkout={checkout} /> : null}
        {catalogQuery.isError ? <p role="alert" className="plan-grid-note font-semibold text-destructive">{catalogQuery.error instanceof PlansCatalogOfflineError ? catalogQuery.error.message : "We could not load live prices. Check your connection and try again."} <button type="button" className="underline underline-offset-4" onClick={() => void catalogQuery.refetch()}>Try again</button></p> : null}
        <p className="plan-grid-note">Every account starts on the free tier, and tracking every request is free. {CREDIT_RULE}</p>
        <p className="plan-grid-note">{routeDetails.gateway} · {routeDetails.gatewayDescriptor}. <button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="font-semibold text-foreground underline underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></p>
        {cancelError ? <p role="alert" className="plan-grid-note font-semibold text-destructive">{cancelError}</p> : null}

        {summary?.freeCreditsLocked ? (
          // D-079: a locked free seeker must be able to reach card validation from the
          // place the no-credits error points to. The card renders the provider-owned
          // "Validate your card" flow; nothing is charged.
          <SeekerCreditsCard credits={{
            plan: summary.plan,
            monthlyAllowance: summary.monthlyAllowance,
            monthlyCreditsRemaining: summary.monthlyCreditsRemaining,
            purchasedCreditsRemaining: summary.purchasedCreditsRemaining ?? 0,
            totalAvailable: summary.totalAvailable,
            cycleKey: summary.cycleKey ?? "",
            subscriptionStatus: summary.subscriptionStatus,
            subscriptionCurrentTermEnd: summary.subscriptionCurrentTermEnd,
            cardValidated: summary.cardValidated,
            freeCreditsLocked: summary.freeCreditsLocked,
          }} />
        ) : null}
        <CreditsSection summary={summary} currency={currency} creditsHref={creditsHref} />
        {summary ? <UsagePanel summary={summary} /> : null}
        {summary ? <UpgradeMoments moments={upgradeMoments(summary, new Date(), creditsHref)} /> : null}
      </>}
    <FairBand />
    <PlansReference />
  </main>;
}
