import { ArrowLeft, CreditCard, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";

type Pack = { id: "starter" | "growth" | "scale"; credits: number; priceInr: number; amountInPaise: number };
const packs: Pack[] = [
  { id: "starter", credits: 10, priceInr: 29, amountInPaise: 2900 },
  { id: "growth", credits: 50, priceInr: 129, amountInPaise: 12900 },
  { id: "scale", credits: 200, priceInr: 399, amountInPaise: 39900 },
];
const money = (amountInPaise: number) => `₹${(amountInPaise / 100).toFixed(0)}`;

type SpendRow = { kind: "profile_unlock" | "sponsorship" | "credit_purchase"; creditsSpent?: number; creditsAdded?: number; displayRef?: string; tier?: string | null; pack?: string | null; opportunityId?: number | null; createdAt: string | Date };

// Razorpay checkout.js loaded on demand; resolves the order server-side first.
// Resolves only once the modal reports a real outcome: `handler` fires on a
// successful payment, `modal.ondismiss` when the user closes it. Previously this
// resolved as soon as the modal was *displayed*, so cancelling still showed a
// "payment captured" toast.
async function openRazorpayCheckout(input: { orderId: string; amount: number; keyId?: string; description: string }): Promise<"paid" | "dismissed"> {
  await new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Checkout is unavailable"));
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("We could not open the Razorpay checkout"));
    document.head.appendChild(script);
  });
  const RazorpayCtor = (window as unknown as { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }).Razorpay;
  if (!RazorpayCtor) throw new Error("We could not open the Razorpay checkout");
  return new Promise<"paid" | "dismissed">((resolve, reject) => {
    let settled = false;
    const settle = (outcome: "paid" | "dismissed") => { if (!settled) { settled = true; resolve(outcome); } };
    try {
      const razorpay = new RazorpayCtor({
        key: input.keyId,
        amount: input.amount,
        currency: "INR",
        name: "skipwait.me",
        description: input.description,
        order_id: input.orderId,
        theme: { color: "#0B57D0" },
        handler: () => settle("paid"),
        modal: { ondismiss: () => settle("dismissed") },
      });
      razorpay.open();
    } catch (openError) {
      reject(openError instanceof Error ? openError : new Error("We could not open the Razorpay checkout"));
    }
  });
}

export default function EmployerBilling() {
  const [, go] = useLocation();
  const [credits, setCredits] = useState<number | null>(null);
  const [budgetMonthlyUsdCents, setBudgetMonthlyUsdCents] = useState<number | null>(null);
  const [spend, setSpend] = useState<SpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState<Pack["id"] | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [accountResponse, historyResponse] = await Promise.all([fetch("/api/employer/account", { credentials: "include" }), fetch("/api/employer/spend-history", { credentials: "include" })]);
        const accountPayload = await readApiJson<{ account?: { credits: number; budgetMonthlyUsdCents: number } | null; error?: string }>(accountResponse, "We could not load your employer account");
        if (!accountResponse.ok) throw new Error(accountPayload.error || "Employer access is required");
        const historyPayload = await readApiJson<{ spend?: SpendRow[]; error?: string }>(historyResponse, "We could not load your spend history");
        if (active) { setCredits(accountPayload.account?.credits ?? 0); setBudgetMonthlyUsdCents(accountPayload.account?.budgetMonthlyUsdCents ?? 0); setSpend(historyPayload.spend ?? []); }
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : "We could not load your billing details"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const buyPack = async (pack: Pack) => {
    setBuying(pack.id); setError("");
    try {
      const response = await fetch("/api/employer/unlock-credits/purchase", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: pack.id }) });
      const payload = await readApiJson<{ orderId?: string; amount?: number; keyId?: string; error?: string }>(response, "We could not start the Razorpay checkout");
      if (!response.ok || !payload.orderId) throw new Error(payload.error || "We could not start the Razorpay checkout");
      const outcome = await openRazorpayCheckout({ orderId: payload.orderId, amount: payload.amount ?? pack.amountInPaise, keyId: payload.keyId, description: `${pack.credits} unlock credits` });
      // Only claim success on a real capture. Closing the Razorpay modal is a no-op.
      if (outcome === "dismissed") return;
      toast(`Payment captured. ${pack.credits} unlock credits are being added to your account.`);
    } catch (buyError) { setError(buyError instanceof Error ? buyError.message : "We could not start the Razorpay checkout"); }
    finally { setBuying(null); }
  };

  const describeSpend = (row: SpendRow) => {
    if (row.kind === "credit_purchase") return `Bought ${row.creditsAdded ?? 0} credits${row.pack ? ` · ${row.pack} pack` : ""}`;
    if (row.kind === "sponsorship") return `Sponsored a role${row.tier ? ` · ${row.tier}` : ""}`;
    return `Unlocked ${row.displayRef ?? "a profile"}`;
  };

  return <main data-skipwait-screen="employer-billing" className="min-h-dvh bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go("/employer")} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header><section className="mt-4 shrink-0"><h1 className="text-[1.65rem] font-semibold leading-[.98] tracking-[-.055em]">Credits and billing.</h1><p className="mt-2 text-sm leading-6 text-slate-600">Credits pay for talent unlocks and role sponsorships. They never expire.</p>{credits !== null && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-semibold text-slate-900">{credits} unlock credit{credits === 1 ? "" : "s"} available</p>{budgetMonthlyUsdCents !== null && <p className="mt-1 text-xs text-slate-600">Monthly promotion budget: ${(budgetMonthlyUsdCents / 100).toFixed(0)}</p>}</div>}</section>{error ? <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : loading ? <div className="mt-5 grid gap-3">{[0, 1, 2].map(index => <div key={index} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div> : <section className="mt-5 grid gap-3 pb-8"><h2 className="text-sm font-bold uppercase tracking-[.14em] text-slate-500">Buy credits</h2>{packs.map(pack => <div key={pack.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">{pack.credits} unlock credits</p><p className="mt-0.5 text-xs text-slate-600">{money(pack.amountInPaise)} one-time · never expires</p></div><button type="button" disabled={buying !== null} onClick={() => void buyPack(pack)} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"><CreditCard className="h-3.5 w-3.5" />{buying === pack.id ? "Opening…" : "Buy"}</button></div></div>)}<h2 className="mt-3 text-sm font-bold uppercase tracking-[.14em] text-slate-500">Spend history</h2>{spend.length ? <ul className="grid gap-2">{spend.map((row, index) => <li key={`${row.kind}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"><span className="flex min-w-0 items-center gap-2.5"><Receipt className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{describeSpend(row)}</span><span className="block text-[11px] text-slate-500">{new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span></span><span className="shrink-0 text-xs font-bold text-slate-700">{row.kind === "credit_purchase" ? `+${row.creditsAdded ?? 0}` : `−${row.creditsSpent ?? 0}`}</span></li>)}</ul> : <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><p className="text-sm font-bold text-slate-800">No spend yet.</p><p className="mt-1 text-sm text-slate-600">Buy a pack, unlock talent, or sponsor a role to get started.</p></div>}</section>}</div></main>;
}
