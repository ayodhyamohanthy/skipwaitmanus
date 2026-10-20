import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { ASK_COST_SENTENCE, CREDIT_RULE, PAID_PLANS_SENTENCE } from "@shared/moneyCopy";
import { REFERRERS_NEVER_PAY } from "@shared/referrerPurchases";
import { currencyForRegion, type BillingRegion } from "@shared/billingRegion";
import { Button } from "@/components/kit/button";
import { paymentRouteDetails } from "@/lib/paymentRoute";
import { readApiJson } from "@/lib/apiResponse";
import { readPendingCheckout, recoveryCopy, usePendingCheckoutRecovery } from "@/lib/pendingCheckout";
import { applySeo } from "@/lib/seo";
import type { TokenRole } from "@/lib/tokens";
import { failureMessage, parseSummary, type CreditSummary } from "@/components/plans/billingApi";
import { CreditCta, CreditsSection, UsagePanel } from "@/components/plans/PlansCredits";
import { SeekerCreditsCard } from "@/components/SeekerCreditsCard";
import { FairBand, PlansReference } from "@/components/plans/PlansReference";
import { PlanCards } from "@/components/plans/PlanCards";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";
import { activePaidPlan } from "@/components/plans/planCatalog";
import { CatalogSections } from "@/components/plans/CatalogSections";
import { CoverageBlock } from "@/components/plans/CoverageBlock";
import { useKitCheckout } from "@/components/plans/kitCheckoutApi";
import { packOnSale, usePlansCatalog } from "@/components/plans/plansCatalogApi";
import type { BuyControls } from "@/components/plans/PackCards";

// /plans: Free and the account's own plan, coverage at the seeker's companies,
// then credit packs and passes exactly as GET /api/plans/catalog sells them
// (GO-LIVE-1, D-046, D-084): every amount, term and availability comes from the
// one catalog response on screen, in its currency, and a Buy press posts the
// kit checkout body built from it. Passes read "Not on sale yet" until
// GO-LIVE-1b. A trusted referrer account is never shown a purchase (D-055):
// referring is never charged.

const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** ?currency=INR|USD asks that region's catalog; otherwise the edge decides. */
function regionFromAddress(currency: string | null): BillingRegion | undefined {
  return currency === "INR" ? "IN" : currency === "USD" ? "INTL" : undefined;
}

export default function Plans() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const isReferrer = params.get("role") === "referrer";
  const role: TokenRole = isReferrer ? "referrer" : "job_seeker";
  const payment = params.get("payment");
  const { isLoaded, isSignedIn, userId, getToken, openSignIn } = useAuth();
  const [region, setRegion] = useState<BillingRegion | undefined>(() => regionFromAddress(params.get("currency")));
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelError, setCancelError] = useState("");
  // C6: a return with a stored intent for this role runs the shared credit recovery; without one the static copy stays.
  const [pendingIntent] = useState(() => payment === "pending" && readPendingCheckout(role) !== undefined);

  const catalogQuery = usePlansCatalog(region, { enabled: !isReferrer && payment !== "pending" });
  const catalog = catalogQuery.data ?? null;
  const checkout = useKitCheckout({ catalog, isLoaded, isSignedIn, getToken, openSignIn, onNotAvailable: () => { void catalogQuery.refetch(); } });
  const buy: BuyControls = { sending: checkout.sending, disabled: !isLoaded || checkout.sending !== null, failure: checkout.failure, onBuy: purchase => { void checkout.buy(purchase); } };
  const { recovery, creditedTokens } = usePendingCheckoutRecovery({
    enabled: pendingIntent,
    isSignedIn,
    role,
    getToken,
    onCredited: credited => { const parsed = parseSummary({ summary: credited }); if (parsed) setSummary(parsed); },
  });

  // The gateway line follows the catalog on screen, or the region the seeker asked
  // for while its catalog loads, so "Different billing country?" never vanishes.
  const shownRegion = catalog?.region ?? region;
  const routeDetails = shownRegion ? paymentRouteDetails(currencyForRegion(shownRegion)) : null;
  // "Add credits" scrolls to the packs on this page while one is on sale; otherwise /premium sells credits.
  const creditsHref = catalog && packOnSale(catalog) ? "#credits" : `/premium?role=${role}`;
  const activePlan = activePaidPlan(summary);

  useEffect(() => {
    applySeo({ title: "Plans and credits", description: PAID_PLANS_SENTENCE, path: "/plans" });
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: authHeaders(await getToken()) });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not refresh your plan details");
        const parsed = parseSummary(payload);
        if (active && response.ok && parsed) setSummary(parsed);
      } catch {
        // The page still compares the free allowance if the account summary retries.
      }
    })();
    return () => { active = false; };
  }, [getToken, isLoaded, isSignedIn, role]);

  const scheduleCancellation = async () => {
    if (!isSignedIn || summary?.subscriptionStatus !== "active") return;
    setCancelError("");
    setCancelling(true);
    try {
      const response = await fetch("/api/chargebee/subscription-cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(await getToken()) },
        body: JSON.stringify({ role }),
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
    const copy = pendingIntent ? recoveryCopy(recovery, creditedTokens) : { title: "We’re confirming your payment.", body: "Access starts only after the verified payment event reaches our server." };
    return <main data-skipwait-screen="plans" className="page-content plans-page"><section className="workspace-empty"><span className="empty-icon">{pendingIntent && recovery === "checking" ? <LoaderCircle className="motion-safe:animate-spin" /> : <Check />}</span><h2>{copy.title}</h2><p>{copy.body}</p><Button asChild className="brand-button"><Link href="/requests">View my requests<ArrowRight /></Link></Button></section></main>;
  }

  return <main data-skipwait-screen="plans" className="page-content plans-page">
    {/* C3: for a seeker, the fairness band below is the one place in the page body with the D-063 sentence. */}
    <div className="page-heading"><div><span className="eyebrow">PLANS · <Link href="/billing" className="underline">Manage plan</Link></span><h1>Choose how much help you need<span className="brand-dot">.</span></h1><p>Everyone starts free — no card needed. {isReferrer ? `${ASK_COST_SENTENCE} ${REFERRERS_NEVER_PAY} Reviewing requests is free, and SkipWait never pays a referrer. ` : ""}Queue position never changes.</p></div>{isReferrer ? null : <CreditCta summary={summary} href={creditsHref} />}</div>

    {payment === "cancelled" ? <p role="status" className="plan-grid-note font-semibold">Checkout was cancelled. Nothing was charged.</p> : null}

    {isReferrer
      ? <section className="plans-section" aria-label="Referrers never pay"><span className="eyebrow">REFERRING</span><h2>{REFERRERS_NEVER_PAY}</h2><p>Reviewing requests, accepting one and building your verified track record cost you nothing — there is no plan to buy and no credit to spend. Referrers keep the same queue and the same rules whatever a seeker has paid for.</p><Button asChild variant="outline" className="brand-button"><Link href="/referrer">Referrer workspace<ArrowRight /></Link></Button></section>
      : <>
        <PlanCards
          currency={catalog?.currency ?? null}
          activePlan={activePlan}
          renewing={summary?.subscriptionStatus === "active"}
          cancelRenewal={{ confirming: confirmingCancel, cancelling, onAsk: () => setConfirmingCancel(true), onConfirm: () => { void scheduleCancellation(); setConfirmingCancel(false); }, onKeep: () => setConfirmingCancel(false) }}
        />
        <p className="plan-grid-note">Every account starts on the free tier, and tracking every request is free. {CREDIT_RULE}</p>
        {shownRegion && routeDetails ? <p className="plan-grid-note">{routeDetails.gateway} · {routeDetails.gatewayDescriptor}. <button type="button" onClick={() => setRegion(shownRegion === "IN" ? "INTL" : "IN")} className="font-semibold text-foreground underline underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></p> : null}
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
        <CreditsSection summary={summary} creditsHref={creditsHref} />
        <CoverageBlock isLoaded={isLoaded} isSignedIn={isSignedIn} userId={userId} getToken={getToken} />
        <CatalogSections query={catalogQuery} buy={buy} />
        {summary ? <UsagePanel summary={summary} /> : null}
        {summary ? <UpgradeMoments moments={upgradeMoments(summary, new Date(), creditsHref)} /> : null}
      </>}
    <FairBand />
    <PlansReference />
  </main>;
}
