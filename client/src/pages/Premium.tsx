import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { ArrowLeft, Check, CreditCard, LoaderCircle } from "lucide-react";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { tokenReturnPath, type TokenRole } from "@/lib/tokens";

type Pack = { id: "skipwait_token_1-INR" | "skipwait_token_1-USD"; price: number; currency: PaymentRoute };
type PendingCheckout = { hostedPageId: string; role: TokenRole };
type RecoveryState = "checking" | "pending" | "credited" | "requires_review";

const packs: Pack[] = [{ id: "skipwait_token_1-INR", price: 99, currency: "INR" }, { id: "skipwait_token_1-USD", price: 1, currency: "USD" }];
const pendingCheckoutStorageKey = "skipwait.pending-chargebee-checkout";

function money(value: number, route: PaymentRoute) { return route === "INR" ? `₹${value.toLocaleString("en-IN")}` : `$${value.toLocaleString("en-US")}`; }
function savePendingCheckout(checkout: PendingCheckout) { if (typeof window !== "undefined") window.sessionStorage.setItem(pendingCheckoutStorageKey, JSON.stringify(checkout)); }
function readPendingCheckout(role: TokenRole): PendingCheckout | undefined { try { const value = typeof window === "undefined" ? null : window.sessionStorage.getItem(pendingCheckoutStorageKey); const parsed = value ? JSON.parse(value) as PendingCheckout : undefined; return parsed?.role === role && typeof parsed.hostedPageId === "string" && parsed.hostedPageId.length > 0 ? parsed : undefined; } catch { return undefined; } }
function clearPendingCheckout() { if (typeof window !== "undefined") window.sessionStorage.removeItem(pendingCheckoutStorageKey); }

export default function Premium() {
  const role: TokenRole = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "referrer" ? "referrer" : "job_seeker";
  const { isSignedIn, getToken } = useClerkAuth();
  const { openSignIn } = useClerk();
  const [route, setRoute] = useState<PaymentRoute>(browserPaymentRoute);
  const [quantity, setQuantity] = useState(10);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "launching" | "pending" | "error">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [recovery, setRecovery] = useState<RecoveryState>("checking");
  const [creditedTokens, setCreditedTokens] = useState(0);
  const [error, setError] = useState("");
  const selected = useMemo(() => packs.find(pack => pack.currency === route) ?? packs[1], [route]);
  const routeDetails = paymentRouteDetails(route);
  const returnPath = tokenReturnPath(role);
  const total = selected.price * quantity;
  const totalLabel = `${money(total, route)} ${route}`;
  const updateQuantity = (next: number) => setQuantity(Math.max(1, Math.min(1000, Number.isFinite(next) ? Math.round(next) : 1)));

  useEffect(() => {
    if (!isSignedIn) { setBalance(null); return; }
    let active = true;
    void (async () => {
      try {
        const clerkToken = await getToken();
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {} });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok && typeof payload.summary?.totalAvailable === "number") setBalance(payload.summary.totalAvailable);
      } catch { if (active) setBalance(null); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role]);

  useEffect(() => {
    if (status !== "pending" || !isSignedIn) return;
    const checkout = readPendingCheckout(role);
    if (!checkout) { setRecovery("pending"); return; }
    let active = true;
    let attempts = 0;
    const reconcile = async () => {
      if (!active || attempts >= 3) return;
      attempts += 1;
      try {
        const clerkToken = await getToken();
        const response = await fetch("/api/chargebee/credit-recovery", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, body: JSON.stringify({ hostedPageId: checkout.hostedPageId, role }) });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (payload.status === "credited") {
          setRecovery("credited");
          setCreditedTokens(Number.isInteger(payload.tokenCount) ? payload.tokenCount : 0);
          if (typeof payload.summary?.totalAvailable === "number") setBalance(payload.summary.totalAvailable);
          clearPendingCheckout();
          return;
        }
        setRecovery(payload.status === "requires_review" ? "requires_review" : "pending");
      } catch {
        if (active) setRecovery("pending");
      }
    };
    void reconcile();
    const secondAttempt = window.setTimeout(() => { void reconcile(); }, 2500);
    const thirdAttempt = window.setTimeout(() => { void reconcile(); }, 7500);
    const retryOnFocus = () => { void reconcile(); };
    window.addEventListener("focus", retryOnFocus);
    return () => { active = false; window.clearTimeout(secondAttempt); window.clearTimeout(thirdAttempt); window.removeEventListener("focus", retryOnFocus); };
  }, [getToken, isSignedIn, role, status]);

  const beginCheckout = async () => {
    if (!isSignedIn) { openSignIn(); return; }
    setError("");
    setStatus("launching");
    try {
      const clerkToken = await getToken();
      const response = await fetch("/api/chargebee/checkout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, body: JSON.stringify({ itemPriceId: selected.id, billingCountry: routeDetails.billingCountry, role, quantity }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.checkoutUrl !== "string" || typeof body.hostedPageId !== "string") throw new Error(body.error || "Unable to open secure checkout");
      savePendingCheckout({ hostedPageId: body.hostedPageId, role });
      openChargebeeCheckout(body.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open secure checkout");
      setStatus("error");
    }
  };

  if (status === "pending") {
    const confirmed = recovery === "credited";
    const needsReview = recovery === "requires_review";
    const title = confirmed ? `${creditedTokens || "Your"} referral credit${creditedTokens === 1 ? " is" : "s are"} ready.` : needsReview ? "We’re checking this payment securely." : "We’re confirming your payment.";
    const body = confirmed ? "Your verified payment is complete and your available credits are updated." : needsReview ? "Your transaction is protected. We will only add credits after the provider record matches your checkout." : "Nothing else is needed from you. We will add credits as soon as the provider’s verified record reaches our server.";
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-[#0B57D0]">{recovery === "checking" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}</span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">{confirmed ? "Credits added" : "Secure payment check"}</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">{title}</h1><p className="mt-4 text-sm leading-6 text-slate-600">{body}</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">{confirmed ? "Use my credits" : "Continue"}</Link></footer></div></main>;
  }

  return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="min-h-0 flex-1 overflow-hidden"><div className="flex h-full flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Add referral credits</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Choose only what you need.</h1>{isSignedIn && balance !== null && <p className="mt-4 text-sm leading-6 text-slate-600">You have <strong>{balance}</strong> available. Credit packs never expire.</p>}<div role="status" className={`${isSignedIn && balance !== null ? "mt-5" : "mt-6"} rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-slate-700`}><strong className="text-slate-900">Pay {money(selected.price, route)}</strong> with {routeDetails.gateway}.</div><div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Credits to add</p><div className="mt-3 inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm"><button type="button" aria-label="Remove one credit" onClick={() => updateQuantity(quantity - 1)} disabled={quantity <= 1} className="grid h-11 w-11 place-items-center text-xl font-semibold text-slate-600 disabled:opacity-35">−</button><label className="sr-only" htmlFor="token-quantity">Number of credits to add</label><input id="token-quantity" aria-label="Number of credits to add" type="number" min="1" max="1000" inputMode="numeric" enterKeyHint="done" value={quantity} onChange={event => updateQuantity(Number(event.target.value))} className="h-11 w-20 border-x border-slate-200 text-center text-base font-bold text-slate-950 outline-none focus:bg-blue-50" /><button type="button" aria-label="Add one credit" onClick={() => updateQuantity(quantity + 1)} className="grid h-11 w-11 place-items-center text-xl font-semibold text-[#0B57D0]">+</button></div></div><button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="mt-5 text-sm font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></div></section><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{quantity} referral credit{quantity === 1 ? "" : "s"}</span><strong>{totalLabel}</strong></div><button disabled={status === "launching"} onClick={() => { void beginCheckout(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-70"><CreditCard className="h-4 w-4" />{status === "launching" ? "Opening secure checkout…" : isSignedIn ? `Continue to pay ${totalLabel}` : `Sign in to pay ${totalLabel}`}</button>{error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p>}<Link href={`/plans?role=${role}`} className="mt-3 block text-center text-sm font-semibold text-[#0B57D0]">Need referrals every month? Compare Pro and Max</Link><p className="mt-2 text-center text-[11px] text-slate-500">Credits are added only after verified payment.</p></footer></div></main>;
}
