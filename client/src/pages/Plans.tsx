import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowRight, Check } from "lucide-react";
import type { PaidSubscriptionPlan } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";
import { parseGifts, parseSummary, failureMessage, type ClaimableGift, type CreditSummary, type SentGift } from "@/components/plans/billingApi";
import { CheckoutDialog } from "@/components/plans/CheckoutDialog";
import { GiftNotices, SentGifts } from "@/components/plans/GiftNotices";
import { PlanCards } from "@/components/plans/PlanCards";
import { CreditCta, CreditsSection, UsagePanel } from "@/components/plans/PlansCredits";
import { FairBand, PlansReference } from "@/components/plans/PlansReference";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";
import { activePaidPlan } from "@/components/plans/planCatalog";

// Gift checkout stays hidden until the flow is verified end to end on the
// Chargebee TEST site (#77/#78). Build with VITE_GIFT_CHECKOUT_ENABLED=true to show it.
const giftCheckoutEnabled = () => import.meta.env.VITE_GIFT_CHECKOUT_ENABLED === "true";

const authHeaders = (token: string | null | undefined): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export default function Plans() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const role = params.get("role") === "referrer" ? "referrer" : "job_seeker";
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const [selected] = useState<PaidSubscriptionPlan>(() => params.get("plan") === "max" ? "max" : "pro");
  const [checkoutPlan, setCheckoutPlan] = useState<PaidSubscriptionPlan | null>(null);
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "opening" | "pending">(params.get("payment") === "pending" ? "pending" : "idle");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [giftStatus, setGiftStatus] = useState<"idle" | "opening">("idle");
  const [giftError, setGiftError] = useState("");
  const [sentGifts, setSentGifts] = useState<SentGift[]>([]);
  const [claimableGifts, setClaimableGifts] = useState<ClaimableGift[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedPlan, setClaimedPlan] = useState("");
  const [summaryKey, setSummaryKey] = useState(0);
  const giftReturn = params.get("gift");
  const routeDetails = paymentRouteDetails(route);
  const creditsHref = `/premium?role=${role}`;

  useEffect(() => {
    applySeo({ title: "Monthly referral plans", description: "Pro and Max monthly plans add referral credits each month on top of the free allowance. Cancel any time.", path: "/plans" });
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: authHeaders(await getToken()) });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not refresh your plan details");
        const parsed = parseSummary(payload);
        if (active && response.ok && parsed) setSummary(parsed);
      } catch {
        // Keep comparison available if the secure account summary retries.
      }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role, summaryKey]);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/chargebee/gifts/mine", { credentials: "include", headers: authHeaders(await getToken()) });
        const payload = await readApiJson<Record<string, unknown>>(response, "We could not load your gifts");
        if (!active || !response.ok) return;
        const gifts = parseGifts(payload);
        setSentGifts(gifts.sent);
        setClaimableGifts(gifts.claimable);
      } catch {
        // Gifts stay hidden until the next successful load; buying still works.
      }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const activePlan = activePaidPlan(summary);
  const hasActivePlan = activePlan !== null;

  const signInFor = (plan: PaidSubscriptionPlan) => {
    const destination = new URL(window.location.href);
    destination.searchParams.set("role", role);
    destination.searchParams.set("plan", plan);
    destination.searchParams.set("currency", route);
    openSignIn({ returnTo: `${destination.pathname}${destination.search}${destination.hash}` });
  };

  const openCheckout = (plan: PaidSubscriptionPlan) => { setCheckoutError(""); setCheckoutPlan(plan); };

  const startCheckout = async (plan: PaidSubscriptionPlan) => {
    if (!isLoaded) return;
    if (!isSignedIn) { signInFor(plan); return; }
    if (hasActivePlan) return;
    setCheckoutError("");
    setStatus("opening");
    try {
      const response = await fetch("/api/chargebee/subscription-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(await getToken()) },
        body: JSON.stringify({ plan, currency: route, billingCountry: routeDetails.billingCountry, role }),
      });
      const payload = await readApiJson<{ checkoutUrl?: string; error?: string }>(response, "Unable to open secure plan checkout");
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "Unable to open secure plan checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    } catch (reason) {
      setCheckoutError(failureMessage(reason, "Unable to open secure plan checkout"));
      setStatus("idle");
    }
  };

  const startGiftCheckout = async (plan: PaidSubscriptionPlan) => {
    if (!isLoaded) return;
    if (!isSignedIn) { signInFor(plan); return; }
    setGiftError("");
    setGiftStatus("opening");
    try {
      const response = await fetch("/api/chargebee/gift-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(await getToken()) },
        body: JSON.stringify({ plan, currency: route, billingCountry: routeDetails.billingCountry }),
      });
      const payload = await readApiJson<{ checkoutUrl?: string; error?: string }>(response, "Unable to open the gift checkout");
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "Unable to open the gift checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    } catch (reason) {
      setGiftError(failureMessage(reason, "Unable to open the gift checkout"));
      setGiftStatus("idle");
    }
  };

  const claimGift = async (giftId: string) => {
    if (!isSignedIn) return;
    setClaimingId(giftId);
    setGiftError("");
    try {
      const response = await fetch("/api/chargebee/gifts/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(await getToken()) },
        body: JSON.stringify({ giftId }),
      });
      const payload = await readApiJson<{ status?: string; error?: string }>(response, "We could not claim this gift");
      if (!response.ok) throw new Error(payload.error || "We could not claim this gift");
      const claimed = claimableGifts.find(gift => gift.giftId === giftId);
      setClaimableGifts(current => current.filter(gift => gift.giftId !== giftId));
      setClaimedPlan(claimed?.plan === "max" ? "Max" : "Pro");
      setSummaryKey(key => key + 1);
    } catch (reason) {
      setGiftError(failureMessage(reason, "We could not claim this gift"));
    } finally {
      setClaimingId(null);
    }
  };

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

  if (status === "pending") {
    return <main data-skipwait-screen="plans" className="page-content plans-page"><section className="workspace-empty"><span className="empty-icon"><Check /></span><h2>We’re activating your monthly credits.</h2><p>Access starts only after the verified payment event reaches our server.</p><Button asChild className="brand-button"><Link href="/requests">View my requests<ArrowRight /></Link></Button></section></main>;
  }

  return <main data-skipwait-screen="plans" className="page-content plans-page">
    <div className="page-heading"><div><span className="eyebrow">INDIVIDUAL PLANS · <Link href="/billing" className="underline">Manage plan</Link></span><h1>Choose how much help you need<span className="brand-dot">.</span></h1><p>Everyone starts free — no card needed. Upgrade when your search grows. Referrals stay free on every plan, and queue position never changes.</p></div><CreditCta summary={summary} href={creditsHref} /></div>
    <GiftNotices giftReturn={giftReturn} claimedPlan={claimedPlan} claimable={claimableGifts} claimingId={claimingId} onClaim={giftId => { void claimGift(giftId); }} />

    <PlanCards
      currency={route}
      featured={activePlan ?? selected}
      activePlan={activePlan}
      renewing={summary?.subscriptionStatus === "active"}
      isLoaded={isLoaded}
      onUpgrade={openCheckout}
      cancelRenewal={{ confirming: confirmingCancel, cancelling, onAsk: () => setConfirmingCancel(true), onConfirm: () => { void scheduleCancellation(); setConfirmingCancel(false); }, onKeep: () => setConfirmingCancel(false) }}
      gift={{ enabled: giftCheckoutEnabled(), opening: giftStatus === "opening", isLoaded, onGift: plan => { void startGiftCheckout(plan); } }}
    />
    <p className="plan-grid-note">Every account starts on the free tier — asking for referrals and tracking every request cost nothing, ever. Upgrading only adds more requests each month.</p>
    <p className="plan-grid-note">{routeDetails.gateway} · {routeDetails.gatewayDescriptor}. <button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="font-semibold text-foreground underline underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></p>
    {cancelError ? <p role="alert" className="plan-grid-note font-semibold text-destructive">{cancelError}</p> : null}
    <SentGifts sent={sentGifts} error={giftError} />

    <CreditsSection summary={summary} currency={route} creditsHref={creditsHref} />
    {summary ? <UsagePanel summary={summary} /> : null}
    {summary ? <UpgradeMoments moments={upgradeMoments(summary, new Date(), creditsHref, openCheckout)} /> : null}
    <FairBand />
    <PlansReference currency={route} />

    {checkoutPlan ? <CheckoutDialog plan={checkoutPlan} currency={route} signedIn={Boolean(isSignedIn)} opening={status === "opening"} error={checkoutError} onPay={() => { void startCheckout(checkoutPlan); }} onClose={() => setCheckoutPlan(null)} /> : null}
  </main>;
}
