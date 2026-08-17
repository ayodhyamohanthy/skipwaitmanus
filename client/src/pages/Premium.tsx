import { ArrowLeft, Check, CreditCard, ShieldCheck } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
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
  const [status, setStatus] = useState<"idle" | "launching" | "pending" | "error">(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("payment") === "pending" ? "pending" : "idle");
  const [error, setError] = useState("");
  const selected = useMemo(() => packs.find(pack => pack.id === selectedId) ?? packs[0], [selectedId]);
  const returnPath = tokenReturnPath(role);
  const balance = readLocalBalance(role);

  const beginCheckout = async () => {
    if (!isAuthenticated) { startLogin(); return; }
    setError("");
    setStatus("launching");
    try {
      const response = await fetch("/api/chargebee/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ itemPriceId: selected.id, billingCountry: selected.billingCountry, role }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.checkoutUrl !== "string") throw new Error(body.error || "Unable to open secure checkout");
      openChargebeeCheckout(body.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open secure checkout");
      setStatus("error");
    }
  };

  if (status === "pending") return (
    <main data-skipwait-screen="premium" className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-xl"><div className="flex items-center"><Brand /></div>
        <section className="mt-20 rounded-2xl border border-slate-200 bg-white p-9 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-[#0B57D0]"><Check className="h-6 w-6" /></span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Payment received for verification</p>
          <h1 className="mt-3 text-3xl font-semibold">Your tokens will appear shortly.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Chargebee confirms payment to skipwait.me first. We add tokens only after the verified payment event reaches our server. Nothing is credited from this browser return.</p>
          <Link href={returnPath} className="mt-8 inline-flex rounded-lg bg-[#0B57D0] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0847AD]">Continue</Link>
        </section>
      </div>
    </main>
  );

  return (
    <main data-skipwait-screen="premium" className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-3xl"><div className="flex items-center"><Brand /></div>
        <Link href={returnPath} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back</Link>
        <section className="mt-6 grid gap-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">More {referrer ? "Referrer" : "application"} tokens</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.055em]">Choose how you pay.</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">You have <strong>{balance} {referrer ? "purchased" : "application"} token{balance === 1 ? "" : "s"}</strong> available. Your first 3 actions are included; add only what you need after that.</p>
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700"><strong className="text-[#0B57D0]">One token covers:</strong> {referrer ? "one approved referral action" : "one private referral request"}.</div>
            <fieldset className="mt-8"><legend className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Choose your billing currency</legend>
              <div className="mt-3 grid gap-2">{packs.map(pack => <button type="button" key={pack.id} onClick={() => setSelectedId(pack.id)} className={`flex items-center justify-between rounded-xl border p-4 text-left transition ${selected.id === pack.id ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}><span><span className="block text-sm font-semibold text-slate-900">{pack.currency === "INR" ? "₹99 INR" : "$1 USD"}</span><span className="mt-0.5 block text-xs text-slate-600">{pack.label} · {pack.audience}</span></span><strong className="text-sm text-slate-900">{pack.currency === "INR" ? "₹99" : "$1"}</strong></button>)}</div>
            </fieldset>
          </div>
          <aside className="rounded-xl bg-slate-900 p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-200">Secure checkout</p><div className="mt-6 flex justify-between text-sm"><span>{selected.tokens} action token{selected.tokens > 1 ? "s" : ""}</span><strong>{selected.currency === "INR" ? "₹99 INR" : "$1 USD"}</strong></div><div className="mt-4 rounded-lg bg-white/10 p-3"><p className="text-sm font-semibold">Chargebee hosted checkout</p><p className="mt-1 text-xs leading-5 text-slate-300">{selected.label} · {selected.audience}-secured payment via Chargebee. The server validates currency eligibility before checkout.</p></div><button disabled={status === "launching"} onClick={beginCheckout} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold hover:bg-[#0847AD] disabled:cursor-wait disabled:opacity-70"><CreditCard className="h-4 w-4" />{status === "launching" ? "Opening secure checkout…" : isAuthenticated ? `Continue to ${selected.currency === "INR" ? "₹99" : "$1"} checkout` : "Sign in to continue"}</button>{error && <p role="alert" className="mt-3 text-xs leading-5 text-red-300">{error}</p>}<div className="mt-5 flex gap-2 text-xs leading-5 text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />Tokens are credited only after a verified Chargebee payment event.</div></aside>
        </section>
      </div>
    </main>
  );
}
