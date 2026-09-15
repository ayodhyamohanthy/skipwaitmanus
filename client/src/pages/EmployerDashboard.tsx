import { ArrowLeft, ArrowRight, BadgeCheck, BarChart3, CreditCard, LoaderCircle, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";

type EmployerAccount = { id: number; companyName: string; billingEmail: string; credits: number; budgetMonthlyUsdCents: number };

export default function EmployerDashboard() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, go] = useLocation();
  const [account, setAccount] = useState<EmployerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!isSignedIn) { setLoading(false); return; }
    let active = true;
    void fetch("/api/employer/account", { credentials: "include" }).then(async response => {
      const payload = await readApiJson<{ account?: EmployerAccount | null; error?: string }>(response, "We could not load your employer account");
      if (!response.ok) throw new Error(payload.error || "We could not load your employer account");
      if (active) setAccount(payload.account ?? null);
    }).catch((reason: Error) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isSignedIn]);

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

  if (!isLoaded) return <main data-skipwait-screen="employer-dashboard" className="h-dvh min-h-dvh bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto h-full max-w-xl animate-pulse rounded-2xl border border-[#E2DDD2] bg-white shadow-sm" /></main>;
  if (!isSignedIn) return <main data-skipwait-screen="employer-dashboard" className="min-h-dvh bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Brand /></header><section className="flex flex-1 flex-col justify-center"><div className="rounded-2xl border border-[#E2DDD2] bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold tracking-[-.04em]">Hire without the noise.</h1><p className="mt-3 text-sm leading-6 text-[#625D52]">Sign in to sponsor roles, discover opt-in talent, and manage your promotion budget.</p><SignInButton><button type="button" className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#191713] px-5 py-3 text-sm font-semibold text-white">Sign in to continue</button></SignInButton></div></section></div></main>;
  return <main data-skipwait-screen="employer-dashboard" className="min-h-dvh bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex min-h-dvh max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-semibold text-[#625D52]"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header>{loading ? <section className="flex flex-1 flex-col justify-center"><div className="h-64 animate-pulse rounded-2xl border border-[#E2DDD2] bg-white" /></section> : !account ? <section className="flex flex-1 flex-col justify-center"><div className="rounded-2xl border border-[#E2DDD2] bg-white p-6 shadow-sm"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#F9E4DE] text-[#191713]"><Sparkles className="h-5 w-5" /></span><h1 className="mt-5 text-[1.65rem] font-semibold leading-[.98] tracking-[-.02em]">Become an employer on skipwait.me</h1><p className="mt-3 text-sm leading-6 text-[#625D52]">Sponsor your open roles to the top of seeker feeds, unlock anonymized opt-in talent with credits, and keep the seeker-referrer loop free for everyone.</p><ul className="mt-4 space-y-2 text-sm text-[#3F3B33]"><li className="flex items-start gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#191713]" />Priority placement in role feeds and search</li><li className="flex items-start gap-2"><UsersRound className="mt-0.5 h-4 w-4 shrink-0 text-[#191713]" />Talent discovery — only seekers who opted in</li><li className="flex items-start gap-2"><BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-[#191713]" />Self-serve promotion budget, pay per unlock</li></ul><label className="mt-5 block text-sm font-semibold text-[#2E2B25]">Company name<input value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Acme Robotics" className="mt-2 w-full rounded-xl border border-[#E2DDD2] bg-white px-4 py-3 text-sm font-normal outline-none focus:border-[#191713] focus:ring-4 focus:ring-[#F9E4DE]" /></label>{error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{error}</p>}<button type="button" disabled={starting || !companyName.trim()} onClick={() => void startEmployerAccount()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-55">{starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}Get started</button></div></section> : <section className="flex min-h-0 flex-1 flex-col"><h1 className="mt-6 text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">{account.companyName}</h1><p className="mt-3 text-sm leading-6 text-[#625D52]">Your employer workspace. The seeker–referrer loop stays free; these tools are the paid layer.</p><div className="mt-5 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-[#191713]">{account.credits}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#625D52]">Unlock credits</p></div><div className="rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm"><p className="text-2xl font-bold text-[#191713]">${(account.budgetMonthlyUsdCents / 100).toFixed(0)}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.14em] text-[#625D52]">Monthly budget</p></div></div><nav aria-label="Employer tools" className="mt-5 grid gap-3 pb-8"><Link href="/employer/talent" className="flex items-center justify-between rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm hover:border-[#EAC0B2]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F9E4DE] text-[#191713]"><UsersRound className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[#191713]">Talent discovery</span><span className="block text-xs text-[#625D52]">Browse anonymized, opt-in seekers</span></span></span><ArrowRight className="h-4 w-4 text-[#625D52]" /></Link><Link href="/employer/opportunities" className="flex items-center justify-between rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm hover:border-[#EAC0B2]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F9E4DE] text-[#191713]"><Sparkles className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[#191713]">Sponsor a role</span><span className="block text-xs text-[#625D52]">Priority placement in seeker feeds</span></span></span><ArrowRight className="h-4 w-4 text-[#625D52]" /></Link><Link href="/employer/billing" className="flex items-center justify-between rounded-xl border border-[#E2DDD2] bg-white p-4 shadow-sm hover:border-[#EAC0B2]"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F9E4DE] text-[#191713]"><CreditCard className="h-5 w-5" /></span><span><span className="block text-sm font-bold text-[#191713]">Buy credits</span><span className="block text-xs text-[#625D52]">Unlock packs and spend history</span></span></span><ArrowRight className="h-4 w-4 text-[#625D52]" /></Link></nav></section>}</div></main>;
}
