import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowLeft, ArrowRight, Check, Gift, LoaderCircle } from "lucide-react";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";

type Plan = "pro" | "max";
type CreditSummary = { plan: "free" | Plan; monthlyAllowance: number; monthlyCreditsRemaining: number; totalAvailable: number; subscriptionStatus: string | null; subscriptionCurrentTermEnd: string | null };
type PlanPrice = { display: string; referencePrice?: string; savings?: string };

const plans: Record<Plan, { name: string; monthlyCredits: number; INR: PlanPrice; USD: PlanPrice }> = {
  pro: {
    name: "Pro",
    monthlyCredits: 10,
    INR: { display: "₹599/month" },
    USD: { display: "$7/month" },
  },
  max: {
    name: "Max",
    monthlyCredits: 30,
    INR: { display: "₹1,299/month" },
    USD: { display: "$15/month" },
  },
};

// Gift checkout stays hidden until the flow is verified end to end on the
// Chargebee TEST site (#77/#78). Build with VITE_GIFT_CHECKOUT_ENABLED=true to show it.
const giftCheckoutEnabled = () => import.meta.env.VITE_GIFT_CHECKOUT_ENABLED === "true";

export default function Plans() {
  const role = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "referrer" ? "referrer" : "job_seeker";
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [selected, setSelected] = useState<Plan>(() => params.get("plan") === "max" ? "max" : "pro");
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "opening" | "pending">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState("");
  const [giftStatus, setGiftStatus] = useState<"idle" | "opening">("idle");
  const [giftError, setGiftError] = useState("");
  const [sentGifts, setSentGifts] = useState<Array<{ giftId: string; plan: string | null; receiverEmail: string | null; providerStatus: string | null; fulfillmentStatus: string }>>([]);
  const [claimableGifts, setClaimableGifts] = useState<Array<{ giftId: string; plan: string | null; receiverEmail: string | null }>>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedPlan, setClaimedPlan] = useState("");
  const [summaryKey, setSummaryKey] = useState(0);
  const giftReturn = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("gift") : null;
  const selectedPrice = useMemo(() => plans[selected][route], [route, selected]);
  const price = selectedPrice.display;
  const routeDetails = paymentRouteDetails(route);

  useEffect(() => {
    applySeo({ title: "Monthly referral plans", description: "Pro and Max monthly plans add referral credits each month on top of the free allowance. Cancel any time.", path: "/plans" });
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const sessionToken = await getToken();
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
        const payload = await readApiJson<{ summary?: CreditSummary }>(response, "We could not refresh your plan details");
        if (active && response.ok && payload.summary) setSummary(payload.summary);
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
        const sessionToken = await getToken();
        const response = await fetch("/api/chargebee/gifts/mine", { credentials: "include", headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
        const payload = await readApiJson<{ sent?: typeof sentGifts; claimable?: typeof claimableGifts }>(response, "We could not load your gifts");
        if (!active || !response.ok) return;
        setSentGifts(Array.isArray(payload.sent) ? payload.sent : []);
        setClaimableGifts(Array.isArray(payload.claimable) ? payload.claimable : []);
      } catch {
        // Gifts stay hidden until the next successful load; buying still works.
      }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const startCheckout = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      const destination = new URL(window.location.href);
      destination.searchParams.set("role", role);
      destination.searchParams.set("plan", selected);
      destination.searchParams.set("currency", route);
      openSignIn({ returnTo: `${destination.pathname}${destination.search}${destination.hash}` });
      return;
    }
    if (summary?.plan !== "free" && (summary?.subscriptionStatus === "active" || summary?.subscriptionStatus === "non_renewing")) return;
    setError("");
    setStatus("opening");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/chargebee/subscription-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify({ plan: selected, currency: route, billingCountry: routeDetails.billingCountry, role }),
      });
      const payload = await readApiJson<{ checkoutUrl?: string; error?: string }>(response, "Unable to open secure plan checkout");
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "Unable to open secure plan checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open secure plan checkout");
      setStatus("idle");
    }
  };

  const startGiftCheckout = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      const destination = new URL(window.location.href);
      destination.searchParams.set("role", role);
      destination.searchParams.set("plan", selected);
      destination.searchParams.set("currency", route);
      openSignIn({ returnTo: `${destination.pathname}${destination.search}${destination.hash}` });
      return;
    }
    setGiftError("");
    setGiftStatus("opening");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/chargebee/gift-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify({ plan: selected, currency: route, billingCountry: routeDetails.billingCountry }),
      });
      const payload = await readApiJson<{ checkoutUrl?: string; error?: string }>(response, "Unable to open the gift checkout");
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "Unable to open the gift checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    } catch (checkoutError) {
      setGiftError(checkoutError instanceof Error ? checkoutError.message : "Unable to open the gift checkout");
      setGiftStatus("idle");
    }
  };

  const claimGift = async (giftId: string) => {
    if (!isSignedIn) return;
    setClaimingId(giftId);
    setGiftError("");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/chargebee/gifts/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify({ giftId }),
      });
      const payload = await readApiJson<{ status?: string; error?: string }>(response, "We could not claim this gift");
      if (!response.ok) throw new Error(payload.error || "We could not claim this gift");
      const claimed = claimableGifts.find(gift => gift.giftId === giftId);
      setClaimableGifts(current => current.filter(gift => gift.giftId !== giftId));
      setClaimedPlan(claimed?.plan === "max" ? "Max" : "Pro");
      setSummaryKey(key => key + 1);
    } catch (claimError) {
      setGiftError(claimError instanceof Error ? claimError.message : "We could not claim this gift");
    } finally {
      setClaimingId(null);
    }
  };

  const scheduleCancellation = async () => {
    if (!isSignedIn || summary?.subscriptionStatus !== "active") return;
    setError("");
    setCancelling(true);
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/chargebee/subscription-cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
        body: JSON.stringify({ role }),
      });
      const payload = await readApiJson<{ currentTermEnd?: string; error?: string }>(response, "We could not schedule your cancellation");
      if (!response.ok) throw new Error(payload.error || "We could not schedule your cancellation");
      setSummary(current => current ? { ...current, subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: payload.currentTermEnd ?? current.subscriptionCurrentTermEnd } : current);
    } catch (cancellationError) {
      setError(cancellationError instanceof Error ? cancellationError.message : "We could not schedule your cancellation");
    } finally {
      setCancelling(false);
    }
  };

  if (status === "pending") {
    return <main data-skipwait-screen="plans" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Link href="/requests" className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f5f5f5] text-black"><Check className="h-6 w-6" /></span><h1 className="font-display mt-3 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">We’re activating your monthly credits.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Access starts only after the verified payment event reaches our server.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href="/requests" className="inline-flex w-full items-center justify-center rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">View my requests</Link></footer></div></main>;
  }

  const hasActivePlan = summary?.plan !== "free" && (summary?.subscriptionStatus === "active" || summary?.subscriptionStatus === "non_renewing");

  return <main data-skipwait-screen="plans" className="page-content bg-white text-black"><div className="mx-auto flex max-w-2xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={`/premium?role=${role}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex-1"><div className="flex flex-col"><h1 className="font-display mt-3 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Keep choices simple.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Free includes 3 referral requests every month — for seekers and referrers alike. Plans raise that monthly allowance; a $1 credit pack is always available for occasional extra requests.</p>{giftReturn === "done" ? <p role="status" className="mt-4 rounded-xl border border-[#15803d]/30 bg-[#15803d]/10 p-3 text-sm text-[#15803d]">Gift checkout complete. Your recipient gets an email to claim their plan.</p> : null}
{giftReturn === "cancelled" ? <p role="status" className="mt-4 rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm text-[#505050]">Gift checkout was cancelled. Nothing was charged.</p> : null}
{claimedPlan ? <p role="status" className="mt-4 rounded-xl border border-[#15803d]/30 bg-[#15803d]/10 p-3 text-sm text-[#15803d]">Your gifted {claimedPlan} plan is active. Monthly credits are on your balance.</p> : null}
{claimableGifts.length ? <div role="alert" className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-4 text-left"><p className="flex items-center gap-2 text-sm font-bold text-black"><Gift className="h-4 w-4" />You received a gift</p>{claimableGifts.map(gift => <div key={gift.giftId} className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-black">{gift.plan === "max" ? "Max" : "Pro"} plan · monthly credits included</p><button type="button" disabled={claimingId === gift.giftId} onClick={() => { void claimGift(gift.giftId); }} className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[#141414] px-4 py-2 text-xs font-bold text-white">{claimingId === gift.giftId ? "Claiming…" : "Claim gift"}</button></div>)}</div> : null}
<div className="mt-5 grid grid-cols-2 gap-3">{(["pro", "max"] as const).map((plan) => { const planPrice = plans[plan][route]; return <button key={plan} type="button" aria-pressed={selected === plan} onClick={() => setSelected(plan)} className={`rounded-xl border p-4 text-left ${selected === plan ? "border-[#141414] bg-[#f5f5f5]" : "border-[#e5e5e5] bg-white"}`}><p className="text-sm font-bold">{plans[plan].name}</p><p className="mt-2 text-2xl font-semibold tracking-[-.02em]">{plans[plan].monthlyCredits}</p><p className="text-xs text-[#505050]">requests/month</p><p className="mt-3 text-xs font-semibold text-black">{planPrice.display}</p>{planPrice.referencePrice && <p className="mt-1 text-[10px] leading-4 text-[#505050]"><span className="line-through">Global equivalent {planPrice.referencePrice}</span><span className="ml-1 font-semibold text-black">India price · {planPrice.savings}</span></p>}</button>; })}</div><div role="status" className="mt-5 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3 text-sm text-black"><strong className="text-black">Pay {price}</strong> with {routeDetails.gateway}.<span className="block pt-1 text-xs text-[#505050]">{routeDetails.gatewayDescriptor}.</span>{selectedPrice.referencePrice && <span className="block pt-1 text-xs text-[#505050]"><span className="line-through">Global equivalent {selectedPrice.referencePrice}/month</span> · India regional price, {selectedPrice.savings}.</span>}</div><p className="mt-4 text-xs leading-5 text-[#505050]"><Check className="mr-1 inline h-3.5 w-3.5 text-black" />Monthly credits reset with your plan cycle. Separately bought credit packs never expire. Cancel anytime; paid access stays through the current cycle. <Link href="/refunds" className="font-semibold text-[#505050] underline-offset-2 hover:underline">Refund & cancellation policy</Link>.</p><button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="mt-3 text-left text-sm font-semibold text-[#505050] underline decoration-[#cfcfcf] underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></div></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{hasActivePlan ? `${summary?.plan === "max" ? "Max" : "Pro"} is active` : `${plans[selected].name} · ${plans[selected].monthlyCredits} each month`}</span><strong>{hasActivePlan ? `${summary?.monthlyCreditsRemaining} left` : price}</strong></div><button type="button" onClick={() => { void startCheckout(); }} disabled={!isLoaded || status === "opening" || Boolean(hasActivePlan)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">{!isLoaded ? "Checking sign-in…" : status === "opening" ? <><LoaderCircle className="h-4 w-4 animate-spin" />Opening secure checkout…</> : hasActivePlan ? summary?.subscriptionStatus === "non_renewing" ? "Renewal is off" : "Your current plan is active" : isSignedIn ? `Choose ${plans[selected].name}` : `Sign in to pay ${price}`}<ArrowRight className="h-4 w-4" /></button>{summary?.subscriptionStatus === "active" && (confirmingCancel ? <div className="mt-3 rounded-xl border border-[#e5e5e5] bg-white p-3 text-center"><p className="text-xs leading-5 text-[#505050]">Cancel at the end of this paid cycle? Your allowance stays until then.</p><div className="mt-2 flex justify-center gap-3"><button type="button" disabled={cancelling} onClick={() => { void scheduleCancellation(); setConfirmingCancel(false); }} className="inline-flex min-h-11 items-center rounded-lg bg-black px-4 text-xs font-bold text-white">{cancelling ? "Scheduling…" : "Yes, cancel renewal"}</button><button type="button" onClick={() => setConfirmingCancel(false)} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#505050]">Keep plan</button></div></div> : <button type="button" onClick={() => setConfirmingCancel(true)} className="mt-3 block w-full text-center text-sm font-semibold text-[#505050]">Cancel renewal</button>)}{summary?.subscriptionStatus === "non_renewing" && <p className="mt-3 text-center text-xs leading-5 text-[#505050]">Renewal is off. Your current allowance remains available through this paid cycle.</p>}{giftCheckoutEnabled() && <button type="button" onClick={() => { void startGiftCheckout(); }} disabled={!isLoaded || giftStatus === "opening"} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-5 py-3 text-sm font-semibold text-black">{!isLoaded ? "Preparing gift options…" : giftStatus === "opening" ? <><LoaderCircle className="h-4 w-4 animate-spin" />Preparing gift checkout…</> : <><Gift className="h-4 w-4" />Gift {plans[selected].name} · {price}</>}</button>}
{giftError ? <p role="alert" className="mt-3 text-xs leading-5 text-[#B91C1C]">{giftError}</p> : null}
{sentGifts.length ? <details className="mt-3 rounded-xl border border-[#e5e5e5] bg-white p-3 text-left"><summary className="cursor-pointer text-xs font-bold text-black">Gifts you have sent ({sentGifts.length})</summary><ul className="mt-2 space-y-1.5">{sentGifts.map(gift => <li key={gift.giftId} className="text-xs leading-5 text-[#505050]">{gift.plan === "max" ? "Max" : "Pro"} → {gift.receiverEmail || "recipient"} · {gift.fulfillmentStatus === "credited" ? "claimed" : gift.fulfillmentStatus === "pending" ? "waiting for claim" : gift.fulfillmentStatus}</li>)}</ul></details> : null}
{error && <p role="alert" className="mt-3 text-xs leading-5 text-[#B91C1C]">{error}</p>}<Link href={`/premium?role=${role}`} className="mt-3 block text-center text-sm font-semibold text-black">Prefer flexibility? Add one-time credits</Link></footer></div></main>;
}
