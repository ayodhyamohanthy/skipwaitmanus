import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { ArrowLeft, Check, CreditCard, LoaderCircle, Minus, Plus } from "lucide-react";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { tokenReturnPath, type TokenRole } from "@/lib/tokens";
import { applySeo } from "@/lib/seo";

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
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [quantity, setQuantity] = useState(() => { const value = Number(params.get("quantity")); return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 10; });
  const [balance, setBalance] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ remaining: number; expiresAt: string | null; status: string | null; offerActive: boolean } | undefined>(undefined);
  const promoDaysLeft = promo?.expiresAt ? Math.max(0, Math.ceil((new Date(promo.expiresAt).getTime() - Date.now()) / 86_400_000)) : null;
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
    applySeo({ title: "Buy referral credits for $1 each", description: "Every account gets free referral requests each month. Extra credits cost $1 each (₹99 in India), never expire, and are returned if you withdraw before pickup.", path: "/premium" });
  }, []);

  useEffect(() => {
    if (!isSignedIn) { setBalance(null); return; }
    let active = true;
    void (async () => {
      try {
        const sessionToken = await getToken();
        const response = await fetch(`/api/credits/summary?role=${role}`, { credentials: "include", headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {} });
        const payload = await response.json().catch(() => ({}));
        if (active && response.ok && typeof payload.summary?.totalAvailable === "number") {
          setBalance(payload.summary.totalAvailable);
          if (typeof payload.summary?.promoCreditsRemaining === "number") setPromo({ remaining: payload.summary.promoCreditsRemaining, expiresAt: typeof payload.summary?.promoExpiresAt === "string" ? payload.summary.promoExpiresAt : null, status: typeof payload.summary?.promoStatus === "string" ? payload.summary.promoStatus : null, offerActive: payload.summary?.promoOfferActive === true });
        }
      } catch { if (active) setBalance(null); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role]);

  useEffect(() => {
    if (status !== "pending" || !isSignedIn || recovery === "credited") return;
    const checkout = readPendingCheckout(role);
    if (!checkout) { setRecovery("pending"); return; }
    let active = true;
    let attempts = 0;
    const reconcile = async () => {
      if (!active || attempts >= 3) return;
      attempts += 1;
      try {
        const sessionToken = await getToken();
        const response = await fetch("/api/chargebee/credit-recovery", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }, body: JSON.stringify({ hostedPageId: checkout.hostedPageId, role }) });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (payload.status === "credited") {
          setRecovery("credited");
          setCreditedTokens(Number.isInteger(payload.tokenCount) ? payload.tokenCount : 0);
          if (typeof payload.summary?.totalAvailable === "number") {
            setBalance(payload.summary.totalAvailable);
            if (typeof payload.summary?.promoCreditsRemaining === "number") setPromo({ remaining: payload.summary.promoCreditsRemaining, expiresAt: typeof payload.summary?.promoExpiresAt === "string" ? payload.summary.promoExpiresAt : null, status: typeof payload.summary?.promoStatus === "string" ? payload.summary.promoStatus : null, offerActive: payload.summary?.promoOfferActive === true });
          }
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
  }, [getToken, isSignedIn, recovery, role, status]);

  const beginCheckout = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      const destination = new URL(window.location.href);
      destination.searchParams.set("role", role);
      destination.searchParams.set("quantity", String(quantity));
      destination.searchParams.set("currency", route);
      openSignIn({ returnTo: `${destination.pathname}${destination.search}${destination.hash}` });
      return;
    }
    setError("");
    setStatus("launching");
    try {
      const sessionToken = await getToken();
      const response = await fetch("/api/chargebee/checkout", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }, body: JSON.stringify({ itemPriceId: selected.id, billingCountry: routeDetails.billingCountry, role, quantity }) });
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
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#ededff] text-black">{recovery === "checking" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}</span><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">{title}</h1><p className="mt-4 text-sm leading-6 text-[#505050]">{body}</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white">{confirmed ? "Use my credits" : "Continue"}</Link></footer></div></main>;
  }

  return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="min-h-0 flex-1 overflow-hidden"><div className="flex h-full flex-col justify-center"><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Credits for $1 each. Never expire.</h1>{isSignedIn && balance !== null && <p className="mt-4 text-sm leading-6 text-[#505050]">You have <strong>{balance}</strong> pack credit{balance === 1 ? "" : "s"} available, on top of your monthly free allowance. Every credit is one private referral request.{promo && promo.remaining > 0 && <> Plus <strong>{promo.remaining}</strong> bonus credit{promo.remaining === 1 ? "" : "s"}{promoDaysLeft !== null ? <> expiring in {promoDaysLeft} day{promoDaysLeft === 1 ? "" : "s"}</> : null}.</>}</p>}{!isSignedIn && <p className="mt-4 text-sm leading-6 text-[#505050]">Every account gets <strong>3 free referral requests every month</strong>. Add pack credits any time — $1 each globally (₹99 in India). They never expire.</p>}{isSignedIn && promo && promo.status === null && promo.offerActive && <p role="status" className="mt-5 rounded-xl border border-[#15803d]/30 bg-[#15803d]/10 p-3 text-sm text-black"><strong className="text-black">First verified payment earns 5 bonus credits.</strong><span className="block pt-1 text-xs text-[#505050]">They expire in 30 days and are used before monthly credits.</span></p>}<div role="status" className={`${isSignedIn && balance !== null ? "mt-5" : "mt-6"} rounded-xl border border-[#c2c2ff] bg-[#ededff] p-3 text-sm text-black`}><strong className="text-black">Pay {money(selected.price, route)}</strong> with {routeDetails.gateway}.<span className="block pt-1 text-xs text-[#505050]">{routeDetails.gatewayDescriptor}.</span></div><div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#505050]">Credits to add</p><div className="mt-3 inline-flex items-center rounded-xl border border-[#e5e5e5] bg-white shadow-sm"><button type="button" aria-label="Remove one credit" onClick={() => updateQuantity(quantity - 1)} disabled={quantity <= 1} className="grid h-11 w-11 place-items-center text-[#505050]"><Minus className="h-4 w-4" /></button><label className="sr-only" htmlFor="token-quantity">Number of credits to add</label><input id="token-quantity" aria-label="Number of credits to add" type="number" min="1" max="1000" inputMode="numeric" enterKeyHint="done" value={quantity} onChange={event => updateQuantity(Number(event.target.value))} className="h-11 w-20 border-x border-[#e5e5e5] text-center text-base font-bold text-black outline-none focus:bg-[#ededff]" /><button type="button" aria-label="Add one credit" onClick={() => updateQuantity(quantity + 1)} className="grid h-11 w-11 place-items-center text-black"><Plus className="h-4 w-4" /></button></div></div><button type="button" onClick={() => setRoute(current => alternatePaymentRoute(current))} className="mt-5 text-sm font-semibold text-[#505050] underline decoration-[#cfcfcf] underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></div></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{quantity} referral credit{quantity === 1 ? "" : "s"}</span><strong>{totalLabel}</strong></div><button disabled={!isLoaded || status === "launching"} onClick={() => { void beginCheckout(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-70"><CreditCard className="h-4 w-4" />{!isLoaded ? "Checking sign-in…" : status === "launching" ? "Opening secure checkout…" : isSignedIn ? `Continue to pay ${totalLabel}` : `Sign in to pay ${totalLabel}`}</button>{error && <p role="alert" className="mt-3 text-xs leading-5 text-[#B91C1C]">{error}</p>}<Link href={`/plans?role=${role}`} className="mt-3 block text-center text-sm font-semibold text-black">Or Checkout Pro and Max Subscriptions</Link><p className="mt-2 text-center text-[11px] text-[#505050]">Credits are added only after verified payment. <Link href="/refunds" className="font-semibold text-[#505050] underline-offset-2 hover:underline">Refund policy</Link> · <Link href="/terms" className="font-semibold text-[#505050] underline-offset-2 hover:underline">Terms</Link></p></footer></div></main>;
}
