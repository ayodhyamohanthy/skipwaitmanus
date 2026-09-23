import { ArrowLeft, ArrowRight, BadgeCheck, BarChart3, CreditCard, LoaderCircle, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo } from "@/lib/seo";

type EmployerAccount = { id: number; companyName: string; billingEmail: string; credits: number; budgetMonthlyUsdCents: number };

export default function EmployerDashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, go] = useLocation();
  const [account, setAccount] = useState<EmployerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const loadAccount = () => {
    if (!isSignedIn) { setLoading(false); return; }
    setLoading(true); setError("");
    void fetch("/api/employer/account", { credentials: "include" }).then(async response => {
      const payload = await readApiJson<{ account?: EmployerAccount | null; error?: string }>(response, "We could not load your employer account");
      if (!response.ok) throw new Error(payload.error || "We could not load your employer account");
      setAccount(payload.account ?? null);
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    if (!isSignedIn) { setLoading(false); return; }
    void fetch("/api/employer/account", { credentials: "include" }).then(async response => {
      const payload = await readApiJson<{ account?: EmployerAccount | null; error?: string }>(response, "We could not load your employer account");
      if (!response.ok) throw new Error(payload.error || "We could not load your employer account");
      if (active) setAccount(payload.account ?? null);
    }).catch((reason: Error) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isSignedIn]);

  useEffect(() => {
    // Public employer entry point: it keeps its own title instead of inheriting
    // whatever screen the visitor came from.
    applySeo({ title: "Hire on skipwait.me", description: "Sponsor roles to opt-in job seekers, unlock anonymized opt-in talent, and manage a self-serve promotion budget. The seeker-referrer loop stays free.", path: "/employer" });
  }, []);

  const startEmployerAccount = async () => {
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/employer/account", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyName: companyName.trim() }) });
      const payload = await readApiJson<{ account?: EmployerAccount; error?: string }>(response, "We could not open your employer account");
      if (!response.ok) throw new Error(payload.error || "We could not open your employer account");
      if (payload.account) setAccount(payload.account);
    } catch (startError) { setError(startError instanceof Error ? startError.message : "We could not open your employer account"); }
    finally { setStarting(false); }
  };

  if (!isLoaded) return <main data-skipwait-screen="employer-dashboard" className="h-dvh min-h-dvh bg-white px-5 py-4 text-black"><div className="mx-auto h-full max-w-xl animate-pulse rounded-2xl border border-[#e5e5e5] bg-white" /></main>;
  if (!isSignedIn) return <main data-skipwait-screen="employer-dashboard" className="min-h-dvh bg-white px-5 py-4 text-black"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Brand /></header><section className="flex flex-1 flex-col justify-center"><div className="rounded-2xl border border-[#e5e5e5] bg-white p-6"><h1 className="text-2xl font-semibold tracking-[-.04em]">Hire without the noise.</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Sign in to sponsor roles, discover opt-in talent, and manage your promotion budget.</p><SignInButton><button type="button" className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white">Sign in to continue</button></SignInButton></div></section></div></main>;
  return <main data-skipwait-screen="employer-dashboard" className="min-h-dvh bg-white px-5 py-4 text-black"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header>{loading ? <section className="flex flex-1 flex-col justify-center"><div className="h-64 animate-pulse rounded-2xl border border-[#e5e5e5] bg-white" /></section> : error && !account ? <section className="flex flex-1 flex-col justify-center"><div role="alert" className="rounded-2xl border border-[#B91C1C]/30 bg-[#B91C1C]/5 p-6"><h1 className="text-xl font-semibold tracking-[-.02em]">We could not load your employer account</h1><p className="mt-3 text-sm leading-6 text-[#505050]">{error}</p><p className="mt-2 text-sm leading-6 text-[#505050]">Nothing was changed. Check your connection and try again.</p><button type="button" onClick={loadAccount} className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-semibold text-white">Try again</button></div></section> : !account ? <section className="flex flex-1 flex-col justify-center"><div className="rounded-2xl border border-[#e5e5e5] bg-white p-6"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#ededff] text-black"><Sparkles className="h-5 w-5" /></span><h1 className="mt-5 text-[1.65rem] font-semibold leading-[.98] tracking-[-.02em]">Become an employer on skipwait.me</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Sponsor your open roles to the top of seeker feeds, unlock anonymized opt-in talent with credits, and keep the seeker-referrer loop free for everyone.</p><ul className="mt-4 space-y-2 text-sm text-black"><li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-black" />Priority placement in role feeds and search</li><li className="flex items-start gap-2"><UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-black" />Talent discovery — only seekers who opted in</li><li className="flex items-start gap-2"><BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-black" />Self-serve promotion budget, pay per unlock</li></ul><label className="mt-5 block text-sm font-semibold text-black">Company name<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Acme Robotics" className="mt-2 w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#0000ff] focus:ring-4 focus:ring-[#c2c2ff]" /></label>{error && <p role="alert" className="mt-3 rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-3 text-xs font-medium text-[#B91C1C]">{error}</p>}<button type="button" disabled={starting || !companyName.trim()} onClick={() => void startEmployerAccount()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-55">{starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Get started</button></div></section> : <section className="flex min-h-0 flex-1 flex-col"><h1 className="mt-6 text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">{account.companyName}</h1><p className="mt-3 text-sm leading-6 text-[#505050]">Your employer workspace. The seeker–referrer loop stays free; these tools are the paid layer.</p><div className="mt-5 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl border border-[#e5e5e5] bg-white p-4"><p className="text-2xl font-bold text-black">{account.credits}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#505050]">Unlock credits</p></div><div className="rounded-xl border border-[#e5e5e5] bg-white p-4"><p className="text-2xl font-bold text-black">${(account.budgetMonthlyUsdCents / 100).toFixed(0)}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#505050]">Monthly budget</p></div></div><nav aria-label="Employer tools" className="mt-5 grid gap-3 pb-8"><Link href="/employer/talent" className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white p-4 hover:border-[#0000ff]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#ededff] text-black"><UsersRound className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-black">Talent discovery</span><span className="block text-xs text-[#505050]">Browse anonymized, opt-in seekers</span></span></span><ArrowRight className="h-4 w-4 text-[#505050]" /></Link><Link href="/employer/opportunities" className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white p-4 hover:border-[#0000ff]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#ededff] text-black"><Sparkles className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-black">Sponsor a role</span><span className="block text-xs text-[#505050]">Priority placement in seeker feeds</span></span></span><ArrowRight className="h-4 w-4 text-[#505050]" /></Link><Link href="/employer/billing" className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white p-4 hover:border-[#0000ff]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#ededff] text-black"><CreditCard className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-black">Buy credits</span><span className="block text-xs text-[#505050]">Unlock packs and spend history</span></span></span><ArrowRight className="h-4 w-4 text-[#505050]" /></Link></nav></section>}</div></main>;
}
