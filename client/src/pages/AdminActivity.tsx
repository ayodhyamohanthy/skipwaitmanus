import { Activity, AlertCircle, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { readApiJson } from "@/lib/apiResponse";

type ActivityEvent = { id: number; action: string; outcome: "success" | "failure" | "denied"; resourceType: string | null; resourceId: string | null; companyDomain: string | null; metadata: string | null; createdAt: string | Date; actorName: string | null; actorEmail: string | null };

export default function AdminActivity() {
  const { isSignedIn, getToken } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [outcome, setOutcome] = useState<"" | ActivityEvent["outcome"]>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (query = filter, requestedOutcome = outcome) => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const params = new URLSearchParams({ limit: "250" }); if (query.trim()) params.set("query", query.trim()); if (requestedOutcome) params.set("outcome", requestedOutcome);
      const response = await fetch(`/api/admin/activity?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
      const payload = await readApiJson<{ events?: ActivityEvent[]; error?: string }>(response, "We could not load operational activity"); if (!response.ok) throw new Error(payload.error || "We could not load operational activity");
      setEvents(payload.events || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load operational activity"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(""); }, [isSignedIn]);
  if (!isSignedIn) return <main className="min-h-screen bg-[#F5F4EF] px-6 py-6 text-[#191713]"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#E2DDD2] bg-white p-8 shadow-sm"><ShieldCheck className="h-7 w-7 text-[#191713]" /><h1 className="mt-4 text-2xl font-semibold">Administrator activity</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">Sign in with an administrator account to view privacy-safe operational diagnostics.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  return <main className="min-h-screen bg-[#F5F4EF] px-5 py-6 text-[#191713] sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="activity" badge="Administrator diagnostics" /><section className="mt-10 rounded-2xl border border-[#E2DDD2] bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#191713]">Operational activity</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Diagnose the referral journey.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#625D52]">Every authenticated material workflow request is recorded with minimized metadata. No document contents or names, target URLs, OTPs, referral text, invite codes, or payment credentials are stored.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#625D52]"><Activity className="h-4 w-4 text-[#191713]" />Most recent 250 events</span></div><form onSubmit={event => { event.preventDefault(); void load(); }} className="mt-7 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#625D52]" /><input aria-label="Search activity" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search actor, action, company, or resource" className="w-full rounded-lg border border-[#E2DDD2] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#191713]" /></label><select aria-label="Filter activity by outcome" value={outcome} onChange={event => setOutcome(event.target.value as "" | ActivityEvent["outcome"])} className="rounded-lg border border-[#E2DDD2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#191713]"><option value="">All outcomes</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></select><button type="submit" disabled={loading} className="rounded-lg bg-[#191713] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "Search"}</button></form>{error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}{loading ? <div className="mt-8 flex items-center gap-2 text-sm text-[#625D52]"><LoaderCircle className="h-4 w-4 animate-spin" />Loading operational activity…</div> : <div className="mt-7 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[#E2DDD2] text-xs font-bold uppercase tracking-[.12em] text-[#625D52]"><tr><th className="pb-3 pr-4">Time</th><th className="pb-3 pr-4">Actor</th><th className="pb-3 pr-4">Action</th><th className="pb-3 pr-4">Context</th><th className="pb-3">Outcome</th></tr></thead><tbody>{events.map(item => <tr key={item.id} className="border-b border-[#ECE8DD] last:border-0"><td className="py-4 pr-4 whitespace-nowrap text-xs text-[#625D52]">{new Date(item.createdAt).toLocaleString()}</td><td className="py-4 pr-4"><p className="font-semibold text-[#2E2B25]">{item.actorName || "System"}</p><p className="mt-0.5 text-xs text-[#625D52]">{item.actorEmail || ""}</p></td><td className="py-4 pr-4 font-mono text-xs text-[#191713]">{item.action}</td><td className="py-4 pr-4 text-xs text-[#625D52]"><p>{item.companyDomain || item.resourceType || "—"}{item.resourceId ? ` · ${item.resourceId}` : ""}</p><p className="mt-0.5 max-w-80 truncate text-[#625D52]">{item.metadata || ""}</p></td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.outcome === "success" ? "bg-emerald-50 text-emerald-700" : item.outcome === "denied" ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>{item.outcome}</span></td></tr>)}{!events.length && <tr><td colSpan={5} className="py-12 text-center text-sm text-[#625D52]">No matching operational activity yet.</td></tr>}</tbody></table></div>}</section></div></main>;
}
