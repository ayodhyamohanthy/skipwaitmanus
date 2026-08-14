import { Activity, AlertCircle, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/react";
import { Brand } from "@/components/Brand";

type ActivityEvent = { id: number; action: string; outcome: "success" | "failure" | "denied"; resourceType: string | null; resourceId: string | null; companyDomain: string | null; metadata: string | null; createdAt: string | Date; actorName: string | null; actorEmail: string | null };

export default function AdminActivity() {
  const { isSignedIn, getToken } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (action = filter) => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "250" }); if (action.trim()) params.set("action", action.trim());
      const response = await fetch(`/api/admin/activity?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "We could not load operational activity");
      setEvents(payload.events || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load operational activity"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(""); }, [isSignedIn]);
  if (!isSignedIn) return <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-7 w-7 text-[#0B57D0]" /><h1 className="mt-4 text-2xl font-semibold">Administrator activity</h1><p className="mt-2 text-sm leading-6 text-slate-600">Sign in with an administrator account to view privacy-safe operational diagnostics.</p><SignInButton mode="modal"><button type="button" className="mt-5 rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between gap-4"><Brand /><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Administrator diagnostics</span></header><section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Operational activity</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Diagnose the referral journey.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Events are metadata-only: no document contents, OTPs, tokens, or referral-email text are recorded.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><Activity className="h-4 w-4 text-[#0B57D0]" />Most recent 250 events</span></div><form onSubmit={event => { event.preventDefault(); void load(); }} className="mt-7 flex gap-2"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Filter activity by action" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter actions, e.g. document or company_referral" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0B57D0]" /></label><button type="submit" disabled={loading} className="rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "Filter"}</button></form>{error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}{loading ? <div className="mt-8 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading operational activity…</div> : <div className="mt-7 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-[.12em] text-slate-500"><tr><th className="pb-3 pr-4">Time</th><th className="pb-3 pr-4">Actor</th><th className="pb-3 pr-4">Action</th><th className="pb-3 pr-4">Context</th><th className="pb-3">Outcome</th></tr></thead><tbody>{events.map(item => <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="py-4 pr-4 whitespace-nowrap text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</td><td className="py-4 pr-4"><p className="font-semibold text-slate-800">{item.actorName || "System"}</p><p className="mt-0.5 text-xs text-slate-500">{item.actorEmail || ""}</p></td><td className="py-4 pr-4 font-mono text-xs text-[#0B57D0]">{item.action}</td><td className="py-4 pr-4 text-xs text-slate-600"><p>{item.companyDomain || item.resourceType || "—"}{item.resourceId ? ` · #${item.resourceId}` : ""}</p><p className="mt-0.5 max-w-64 truncate text-slate-400">{item.metadata || ""}</p></td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.outcome === "success" ? "bg-emerald-50 text-emerald-700" : item.outcome === "denied" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{item.outcome}</span></td></tr>)}{!events.length && <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-500">No matching operational activity yet.</td></tr>}</tbody></table></div>}</section></div></main>;
}
