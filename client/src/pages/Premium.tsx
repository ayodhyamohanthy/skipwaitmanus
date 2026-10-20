import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useAuth } from "@/_core/auth";
import { ArrowLeft, ArrowRight, Check, CreditCard, LoaderCircle, Minus, Plus } from "lucide-react";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";
import { recoveryCopy, savePendingCheckout, usePendingCheckoutRecovery } from "@/lib/pendingCheckout";
import { alternatePaymentRoute, browserPaymentRoute, paymentRouteDetails, type PaymentRoute } from "@/lib/paymentRoute";
import { CREDIT_PACKS_ON_SALE, SINGLE_CREDIT_RETIRED_CODE } from "@shared/planCatalog";
import { packOnSale, usePlansCatalog } from "@/components/plans/plansCatalogApi";
import { tokenReturnPath, type TokenRole } from "@/lib/tokens";
import { applySeo } from "@/lib/seo";
import { ASK_COST_SENTENCE } from "@shared/moneyCopy";
import { REFERRERS_NEVER_PAY, REFERRER_PURCHASES_ENABLED } from "@shared/referrerPurchases";

type Pack = { id: "skipwait_token_1-INR" | "skipwait_token_1-USD"; price: number; currency: PaymentRoute };

const packs: Pack[] = [{ id: "skipwait_token_1-INR", price: 99, currency: "INR" }, { id: "skipwait_token_1-USD", price: 1, currency: "USD" }];

// D-036 / ruling 4.6: once a currency's credit packs are buyable the server
// refuses the single credit there with 410 and this sentence (never retried).
const retiredRefusalSchema = z.object({ code: z.literal(SINGLE_CREDIT_RETIRED_CODE), error: z.string().min(1) });

// The summary a credited recovery sends back: the same fields the page reads on load.
const recoveredSummarySchema = z.object({
  totalAvailable: z.number(),
  ledger: z.object({ buckets: z.object({ purchased: z.number().optional().catch(undefined) }).optional().catch(undefined) }).nullish().catch(undefined),
  promoCreditsRemaining: z.number().optional().catch(undefined),
  promoExpiresAt: z.string().optional().catch(undefined),
  promoStatus: z.string().optional().catch(undefined),
  promoOfferActive: z.boolean().optional().catch(undefined),
});

function money(value: number, route: PaymentRoute) { return route === "INR" ? `₹${value.toLocaleString("en-IN")}` : `$${value.toLocaleString("en-US")}`; }

export default function Premium() {
  const role: TokenRole = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "referrer" ? "referrer" : "job_seeker";
  // D-055: referrers never pay, so the referrer role gets no checkout here (shared/referrerPurchases.ts).
  const referrerPurchasesOff = role === "referrer" && !REFERRER_PURCHASES_ENABLED;
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [route, setRoute] = useState<PaymentRoute>(() => params.get("currency") === "INR" ? "INR" : params.get("currency") === "USD" ? "USD" : browserPaymentRoute());
  const [quantity, setQuantity] = useState(() => { const value = Number(params.get("quantity")); return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 10; });
  const [balance, setBalance] = useState<number | null>(null);
  // Credits you bought (the "purchased" bucket) are only part of the total; the monthly allowance and bonus credits are separate.
  const [purchased, setPurchased] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ remaining: number; expiresAt: string | null; status: string | null; offerActive: boolean } | undefined>(undefined);
  const promoDaysLeft = promo?.expiresAt ? Math.max(0, Math.ceil((new Date(promo.expiresAt).getTime() - Date.now()) / 86_400_000)) : null;
  const [status, setStatus] = useState<"idle" | "launching" | "pending" | "error">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [error, setError] = useState("");
  // The server's 410 sentence once it refused the single credit in this currency.
  const [retired, setRetired] = useState<string | null>(null);
  const selected = useMemo(() => packs.find(pack => pack.currency === route) ?? packs[1], [route]);
  const routeDetails = paymentRouteDetails(route);
  const returnPath = tokenReturnPath(role);
  const total = selected.price * quantity;
  const totalLabel = `${money(total, route)} ${route}`;
  const updateQuantity = (next: number) => setQuantity(Math.max(1, Math.min(1000, Number.isFinite(next) ? Math.round(next) : 1)));
  // C9: the catalog for this page's currency says whether a credit pack sells there. While it loads
  // or fails the legacy picker stays (the server is the gate); never asked on the pending or referrer screens.
  // An answer in another currency (an API that ignores ?region=) decides nothing, like a failed read.
  const catalogQuery = usePlansCatalog(route === "INR" ? "IN" : "INTL", { enabled: status !== "pending" && !referrerPurchasesOff && CREDIT_PACKS_ON_SALE });
  const packsOnSale = catalogQuery.data?.currency === route && packOnSale(catalogQuery.data);
  const switchRoute = () => { setRetired(null); setRoute(current => alternatePaymentRoute(current)); };

  useEffect(() => {
    applySeo({ title: "Buy referral credits", description: `${ASK_COST_SENTENCE} Buy credits anytime. Credits you buy never expire.`, path: "/premium" });
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
          setPurchased(typeof payload.summary?.ledger?.buckets?.purchased === "number" ? payload.summary.ledger.buckets.purchased : null);
          if (typeof payload.summary?.promoCreditsRemaining === "number") setPromo({ remaining: payload.summary.promoCreditsRemaining, expiresAt: typeof payload.summary?.promoExpiresAt === "string" ? payload.summary.promoExpiresAt : null, status: typeof payload.summary?.promoStatus === "string" ? payload.summary.promoStatus : null, offerActive: payload.summary?.promoOfferActive === true });
        }
      } catch { if (active) setBalance(null); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn, role]);

  const { recovery, creditedTokens } = usePendingCheckoutRecovery({
    enabled: status === "pending",
    isSignedIn,
    role,
    getToken,
    onCredited: summary => {
      const parsed = recoveredSummarySchema.safeParse(summary);
      if (!parsed.success) return;
      setBalance(parsed.data.totalAvailable);
      setPurchased(parsed.data.ledger?.buckets?.purchased ?? null);
      if (parsed.data.promoCreditsRemaining !== undefined) setPromo({ remaining: parsed.data.promoCreditsRemaining, expiresAt: parsed.data.promoExpiresAt ?? null, status: parsed.data.promoStatus ?? null, offerActive: parsed.data.promoOfferActive === true });
    },
  });

  const beginCheckout = async () => {
    if (!isLoaded || referrerPurchasesOff) return;
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
      const refusal = response.status === 410 ? retiredRefusalSchema.safeParse(body) : null;
      if (refusal?.success) { setRetired(refusal.data.error); setStatus("idle"); return; }
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
    const { title, body } = recoveryCopy(recovery, creditedTokens);
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f5f5f5] text-black">{recovery === "checking" ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Check className="h-6 w-6" />}</span><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">{title}</h1><p className="mt-4 text-sm leading-6 text-[#505050]">{body}</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">{confirmed ? "Use my credits" : "Continue"}</Link></footer></div></main>;
  }

  if (referrerPurchasesOff) {
    // Payment recovery above still finishes a referrer checkout started before the switch-off.
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex min-h-0 flex-1 flex-col justify-center"><h1 className="font-display text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">{REFERRERS_NEVER_PAY}</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Reviewing asks and referring are free, with nothing to buy. If you paid before and do not see your credits, open Support and we will check the payment.</p></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><Link href={returnPath} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">Back to referring</Link><Link href="/support" className="mt-3 block text-center text-sm font-semibold text-black">Contact Support</Link></footer></div></main>;
  }

  if (!CREDIT_PACKS_ON_SALE) {
    // Credit packs are off sale (shared/planCatalog.ts CREDIT_PACKS_ON_SALE). Payment recovery above still works for anyone mid-checkout.
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex min-h-0 flex-1 flex-col justify-center"><h1 className="font-display text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Credit packs are paused.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">We are not selling extra credits right now. If you paid recently and do not see your credits, open Support and we will check the payment.</p></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><Link href="/support" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">Contact Support</Link></footer></div></main>;
  }

  if (retired !== null || packsOnSale) {
    // C9: credit packs sell in this currency, so the single credit is retired here; the packs are on /plans.
    const packsHref = `/plans?role=job_seeker&currency=${route}#credits`;
    return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex min-h-0 flex-1 flex-col justify-center"><h1 className="font-display text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Credit packs replace single credits.</h1>{retired !== null ? <p role="alert" className="mt-4 text-sm leading-6 text-[#B91C1C]">{retired}</p> : <p className="mt-4 text-sm leading-6 text-[#505050]">Pick a credit pack on Plans, at the price shown there before you pay. Credits you buy never expire.</p>}<button type="button" onClick={switchRoute} className="mt-5 self-start text-sm font-semibold text-[#505050] underline decoration-[#cfcfcf] underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><Link href={packsHref} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white">See credit packs <ArrowRight className="h-4 w-4" /></Link></footer></div></main>;
  }

  return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="min-h-0 flex-1 overflow-hidden"><div className="flex h-full flex-col justify-center"><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Credits for {money(selected.price, route)} each. Never expire.</h1>{isSignedIn && balance !== null && <p className="mt-4 text-sm leading-6 text-[#505050]">{purchased !== null ? <>You have <strong>{purchased}</strong> pack credit{purchased === 1 ? "" : "s"}. <strong>{balance}</strong> credit{balance === 1 ? "" : "s"} available in total, including your free monthly credits.</> : <>You have <strong>{balance}</strong> credit{balance === 1 ? "" : "s"} available, including your free monthly credits.</>} Every credit is one private referral request.{promo && promo.remaining > 0 && <> Plus <strong>{promo.remaining}</strong> bonus credit{promo.remaining === 1 ? "" : "s"}{promoDaysLeft !== null ? <> expiring in {promoDaysLeft} day{promoDaysLeft === 1 ? "" : "s"}</> : null}.</>}</p>}{!isSignedIn && <p className="mt-4 text-sm leading-6 text-[#505050]">{ASK_COST_SENTENCE} Add credits any time — {money(selected.price, route)} each. They never expire.</p>}{isSignedIn && promo && promo.status === null && promo.offerActive && <p role="status" className="mt-5 rounded-xl border border-[#15803d]/30 bg-[#15803d]/10 p-3 text-sm text-black"><strong className="text-black">First verified payment earns 5 bonus credits.</strong><span className="block pt-1 text-xs text-[#505050]">They expire in 30 days and are used before monthly credits.</span></p>}<div role="status" className={`${isSignedIn && balance !== null ? "mt-5" : "mt-6"} rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3 text-sm text-black`}><strong className="text-black">Pay {money(selected.price, route)}</strong> with {routeDetails.gateway}.<span className="block pt-1 text-xs text-[#505050]">{routeDetails.gatewayDescriptor}.</span></div><div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#505050]">Credits to add</p><div className="mt-3 inline-flex items-center rounded-xl border border-[#e5e5e5] bg-white shadow-sm"><button type="button" aria-label="Remove one credit" onClick={() => updateQuantity(quantity - 1)} disabled={quantity <= 1} className="grid h-11 w-11 place-items-center text-[#505050]"><Minus className="h-4 w-4" /></button><label className="sr-only" htmlFor="token-quantity">Number of credits to add</label><input id="token-quantity" aria-label="Number of credits to add" type="number" min="1" max="1000" inputMode="numeric" enterKeyHint="done" value={quantity} onChange={event => updateQuantity(Number(event.target.value))} className="h-11 w-20 border-x border-[#e5e5e5] text-center text-base font-bold text-black outline-none focus:bg-[#f5f5f5]" /><button type="button" aria-label="Add one credit" onClick={() => updateQuantity(quantity + 1)} className="grid h-11 w-11 place-items-center text-black"><Plus className="h-4 w-4" /></button></div></div><button type="button" onClick={switchRoute} className="mt-5 text-sm font-semibold text-[#505050] underline decoration-[#cfcfcf] underline-offset-4">Different billing country? {routeDetails.alternateLabel}</button></div></section><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{quantity} referral credit{quantity === 1 ? "" : "s"}</span><strong>{totalLabel}</strong></div><button disabled={!isLoaded || status === "launching"} onClick={() => { void beginCheckout(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-70"><CreditCard className="h-4 w-4" />{!isLoaded ? "Checking sign-in…" : status === "launching" ? "Opening secure checkout…" : isSignedIn ? `Continue to pay ${totalLabel}` : `Sign in to pay ${totalLabel}`}</button>{error && <p role="alert" className="mt-3 text-xs leading-5 text-[#B91C1C]">{error}</p>}<p className="mt-2 text-center text-[11px] text-[#505050]">Credits are added only after verified payment. <Link href="/refunds" className="font-semibold text-[#505050] underline-offset-2 hover:underline">Refund policy</Link> · <Link href="/terms" className="font-semibold text-[#505050] underline-offset-2 hover:underline">Terms</Link></p></footer></div></main>;
}
