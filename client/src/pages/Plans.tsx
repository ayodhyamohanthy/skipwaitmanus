import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/Brand";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";

type Plan = "pro" | "max";
type CreditSummary = { plan: "free" | Plan; monthlyAllowance: number; monthlyCreditsRemaining: number; totalAvailable: number; subscriptionStatus: string | null; subscriptionCurrentTermEnd: string | null };
type PlanPrice = { display: string; referencePrice?: string; savings?: string };

const plans: Record<Plan, { name: string; monthlyCredits: number; INR: PlanPrice; USD: PlanPrice }> = {
  pro: {
    name: "Pro",
    monthlyCredits: 10,
    INR: { display: "₹599/month", referencePrice: "₹833", savings: "28% lower" },
    USD: { display: "$10/month" },
  },
  max: {
    name: "Max",
    monthlyCredits: 30,
    INR: { display: "₹1,299/month", referencePrice: "₹1,666", savings: "22% lower" },
    USD: { display: "$20/month" },
  },
};

export default function Plans() {
  const role = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "referrer" ? "referrer" : "job_seeker";
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();
  const [selected, setSelected] = useState<Plan>("pro");
  const [route, setRoute] = useState<PaymentRoute>(browserPaymentRoute);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "opening" | "pending">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const selectedPrice = useMemo(() => plans[selected][route], [route, selected]);
  const price = selectedPrice.display;
  const routeDetails = paymentRouteDetails(route);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const clerkToken = await getToken();
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {} });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok && payload.summary) setSummary(payload.summary);
      } catch {
        // Keep comparison available if the secure account summary retries.
      }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role]);

  const startCheckout = async () => {
    if (!isSignedIn) { openSignIn(); return; }
    if (summary?.plan !== "free" && (summary?.subscriptionStatus === "active" || summary?.subscriptionStatus === "non_renewing")) return;
    setError("");
    setStatus("opening");
    try {
      const clerkToken = await getToken();
      const response = await fetch("/api/chargebee/subscription-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) },
        body: JSON.stringify({ plan: selected, currency: route, billingCountry: routeDetails.billingCountry, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "Unable to open secure plan checkout");
      openChargebeeCheckout(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open secure plan checkout");
      setStatus("idle");
    }
  };

  const scheduleCancellation = async () => {
    if (!isSignedIn || summary?.subscriptionStatus !== "active") return;
    setError("");
    setCancelling(true);
    try {
      const clerkToken = await getToken();
      const response = await fetch("/api/chargebee/subscription-cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "We could not schedule your cancellation");
      setSummary(current => current ? { ...current, subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: payload.currentTermEnd ?? current.subscriptionCurrentTermEnd } : current);
    } catch (cancellationError) {
      setError(cancellationError instanceof Error ? cancellationError.message : "We could not schedule your cancellation");
    } finally {
      setCancelling(false);
    }
  };

  if (status === "pending") {
    return <main data-skipwait-screen="plans" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Brand /></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-[#0B57D0]"><Check className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Plan payment received</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">We’re activating your monthly credits.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Access starts only after the verified payment event reaches our server.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href="/requests" className="inline-flex w-full items-center justify-center rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">View my requests</Link></footer></div></main>;
  }

  const hasActivePlan = summary?.plan !== "free" && (summary?.subscriptionStatus === "active" || summary?.subscriptionStatus === "non_renewing");

  return <main data-skipwait-screen="plans" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><Brand /><Link href={`/premium?role=${role}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="min-h-0 flex-1 overflow-hidden"><div className="flex h-full flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Your referral pace</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Keep choices simple.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Free includes 3 requests every month. Choose a plan only if you need a steady higher allowance.</p><div className="mt-5 grid grid-cols-2 gap-3">{(["pro", "max"] as const).map((plan) => { const planPrice = plans[plan][route]; return <button key={plan} type="button" aria-pressed={selected === plan} onClick={() => setSelected(plan)} className={`rounded-xl border p-4 text-left ${selected === plan ? "border-[#0B57D0] bg-blue-50" : "border-slate-200 bg-white"}`}><p className="text-sm font-bold">{plans[plan].name}</p><p className="mt-2 text-2xl font-semibold tracking-[-.05em]">{plans[plan].monthlyCredits}</p><p className="text-xs text-slate-600">requests/month</p><p className="mt-3 text-xs font-semibold text-[#0B57D0]">{planPrice.display}</p>{planPrice.referencePrice && <p className="mt-1 text-[10px] leading-4 text-slate-500"><span className="line-through">Global equivalent {planPrice.referencePrice}</span><span className="ml-1 font-semibold text-[#0B57D0]">India price · {planPrice.savings}</span></p>}</button>; })}</div><div role="status" className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-slate-700"><strong className="text-slate-900">Pay {price}</strong> with {routeDetails.gateway}.{selectedPrice.referencePrice && <span className="block pt-1 text-xs text-slate-600"><span className="line-through">Global equivalent {selectedPrice.referencePrice}/month</span> · India regional price, {selectedPrice.savings}.</span>}</div><p className="mt-4 text-xs leading-5 text-slate-500"><Check className="mr-1 inline h-3.5 w-3.5 text-[#0B57D0]" />Monthly credits reset with your plan cycle. Separately bought credit packs never expire. Cancel anytime; paid access stays through the current cycle.</p><button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="mt-3 text-left text-sm font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></div></section><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{hasActivePlan ? `${summary?.plan === "max" ? "Max" : "Pro"} is active` : `${plans[selected].name} · ${plans[selected].monthlyCredits} each month`}</span><strong>{hasActivePlan ? `${summary?.monthlyCreditsRemaining} left` : price}</strong></div><button type="button" onClick={() => { void startCheckout(); }} disabled={status === "opening" || Boolean(hasActivePlan)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">{status === "opening" ? <><LoaderCircle className="h-4 w-4 animate-spin" />Opening secure checkout…</> : hasActivePlan ? summary?.subscriptionStatus === "non_renewing" ? "Renewal is off" : "Your current plan is active" : isSignedIn ? `Choose ${plans[selected].name}` : `Sign in to pay ${price}`}<ArrowRight className="h-4 w-4" /></button>{summary?.subscriptionStatus === "active" && <button type="button" disabled={cancelling} onClick={() => { void scheduleCancellation(); }} className="mt-3 block w-full text-center text-sm font-semibold text-slate-600 disabled:opacity-50">{cancelling ? "Scheduling cancellation…" : "Cancel renewal"}</button>}{summary?.subscriptionStatus === "non_renewing" && <p className="mt-3 text-center text-xs leading-5 text-slate-600">Renewal is off. Your current allowance remains available through this paid cycle.</p>}{error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p>}<Link href={`/premium?role=${role}`} className="mt-3 block text-center text-sm font-semibold text-[#0B57D0]">Prefer flexibility? Add one-time credits</Link></footer></div></main>;
}
