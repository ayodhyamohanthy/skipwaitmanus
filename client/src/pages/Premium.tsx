import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, CreditCard } from "lucide-react";
import { Brand } from "@/components/Brand";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { tokenReturnPath, type TokenRole } from "@/lib/tokens";
import { openChargebeeCheckout } from "@/lib/chargebeeCheckout";

type Pack = { id: "skipwait_token_1-INR" | "skipwait_token_1-USD"; tokens: number; price: number; currency: "INR" | "USD"; billingCountry: "IN" | "INTL"; label: string; audience: string };
const packs: Pack[] = [
  { id: "skipwait_token_1-INR", tokens: 1, price: 99, currency: "INR", billingCountry: "IN", label: "India billing", audience: "Razorpay Domestic" },
  { id: "skipwait_token_1-USD", tokens: 1, price: 1, currency: "USD", billingCountry: "INTL", label: "International billing", audience: "PayPal" },
];

function readLocalBalance(role: TokenRole) {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(role === "referrer" ? "bridge-referrer-paid-tokens" : "bridge-tokens") || 0);
}

export default function Premium() {
  const role: TokenRole = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("role") === "referrer" ? "referrer" : "job_seeker";
  const referrer = role === "referrer";
  const { isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<Pack["id"]>("skipwait_token_1-INR");
  const [quantity, setQuantity] = useState(1);
  const [showCustom, setShowCustom] = useState(false);
  const [status, setStatus] = useState<"idle" | "launching" | "pending" | "error">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [error, setError] = useState("");
  const selected = useMemo(() => packs.find(pack => pack.id === selectedId) ?? packs[0], [selectedId]);
  const returnPath = tokenReturnPath(role);
  const balance = readLocalBalance(role);
  const total = selected.price * quantity;
  const totalLabel = selected.currency === "INR" ? `₹${total.toLocaleString("en-IN")} INR` : `$${total.toLocaleString("en-US")} USD`;
  const updateQuantity = (next: number) => setQuantity(Math.max(1, Math.min(1000, Number.isFinite(next) ? Math.round(next) : 1)));
  const quickPacks = [1, 5, 10];

  const beginCheckout = async () => {
    if (!isAuthenticated) { startLogin(); return; }
    setError("");
    setStatus("launching");
    try {
      const response = await fetch("/api/chargebee/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ itemPriceId: selected.id, billingCountry: selected.billingCountry, role, quantity }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.checkoutUrl !== "string") throw new Error(body.error || "Unable to open secure checkout");
      openChargebeeCheckout(body.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open secure checkout");
      setStatus("error");
    }
  };

  if (status === "pending") return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><Brand /></header><section className="flex flex-1 flex-col justify-center text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-[#0B57D0]"><Check className="h-6 w-6" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Payment received for verification</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Your tokens will appear shortly.</h1><p className="mt-4 text-sm leading-6 text-slate-600">We add tokens only after the verified payment reaches our server.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white">Continue</Link></footer></div></main>;

  return <main data-skipwait-screen="premium" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><Brand /><Link href={returnPath} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="min-h-0 flex-1 overflow-hidden"><div className="flex h-full flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Add {referrer ? "Referrer" : "application"} tokens</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Choose your tokens.</h1><p className="mt-4 text-sm leading-6 text-slate-600">You have <strong>{balance}</strong> available. Add only what you need.</p><fieldset className="mt-6"><legend className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Billing country</legend><div className="mt-3 grid grid-cols-2 gap-2">{packs.map(pack => <button type="button" key={pack.id} onClick={() => setSelectedId(pack.id)} className={`rounded-xl border p-3 text-left transition ${selected.id === pack.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}><span className="block text-sm font-bold text-slate-900">{pack.currency === "INR" ? "India · INR" : "Outside India · USD"}</span><span className="mt-1 block text-xs text-slate-600">{pack.audience}</span></button>)}</div></fieldset><div className="mt-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Token packs</p><div className="mt-3 grid grid-cols-3 gap-2">{quickPacks.map(preset => { const presetTotal = selected.price * preset; const presetLabel = selected.currency === "INR" ? `₹${presetTotal.toLocaleString("en-IN")}` : `$${presetTotal.toLocaleString("en-US")}`; return <button type="button" key={preset} aria-pressed={quantity === preset} onClick={() => { updateQuantity(preset); setShowCustom(false); }} className={`rounded-xl border p-3 text-left transition ${quantity === preset && !showCustom ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}><span className="block text-sm font-bold text-slate-900">{preset} {preset === 1 ? "token" : "tokens"}</span><span className="mt-1 block text-xs font-semibold text-[#0B57D0]">{presetLabel}</span></button>; })}</div></div><div className="mt-4"><button type="button" onClick={() => setShowCustom(current => !current)} className="text-sm font-semibold text-[#0B57D0]">{showCustom ? "Hide custom quantity" : "Choose a custom quantity"}</button>{showCustom && <div className="mt-3 inline-flex items-center rounded-xl border border-slate-200 bg-white shadow-sm"><button type="button" aria-label="Remove one token" onClick={() => updateQuantity(quantity - 1)} disabled={quantity <= 1} className="grid h-11 w-11 place-items-center text-xl font-semibold text-slate-600 disabled:opacity-35">−</button><label className="sr-only" htmlFor="token-quantity">Number of tokens to add</label><input id="token-quantity" aria-label="Number of tokens to add" type="number" min="1" max="1000" inputMode="numeric" value={quantity} onChange={event => updateQuantity(Number(event.target.value))} className="h-11 w-20 border-x border-slate-200 text-center text-base font-bold text-slate-950 outline-none focus:bg-blue-50" /><button type="button" aria-label="Add one token" onClick={() => updateQuantity(quantity + 1)} className="grid h-11 w-11 place-items-center text-xl font-semibold text-[#0B57D0]">+</button></div>}</div></div></section><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4"><div className="mb-3 flex items-center justify-between text-sm"><span>{quantity} action token{quantity === 1 ? "" : "s"}</span><strong>{totalLabel}</strong></div><button disabled={status === "launching"} onClick={beginCheckout} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-70"><CreditCard className="h-4 w-4" />{status === "launching" ? "Opening secure checkout…" : isAuthenticated ? `Continue to ${totalLabel} checkout` : "Sign in to continue"}</button>{error && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{error}</p>}<p className="mt-3 text-center text-[11px] text-slate-500">Tokens are added only after verified payment.</p></footer></div></main>;
}
