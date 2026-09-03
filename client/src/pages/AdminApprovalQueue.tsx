import { AlertCircle, CheckSquare, ChevronDown, ListFilter, LoaderCircle, ShieldCheck } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import StatusBadge from "@/components/StatusBadge";
import { approvalStatusLabels, compactDate, compactDateTime, displayPaymentRef, displayRef, formatAmount, itemKey, openApprovalStatuses, type AdminApprovalQueueItem, type AdminApprovalQueueKind, type AdminApprovalQueueStatus } from "@/lib/adminApproval";
import { readApiJson } from "@/lib/apiResponse";

type StatusFilter = "all" | AdminApprovalQueueStatus;
type KindFilter = "all" | AdminApprovalQueueKind;
type RangeFilter = "all" | "24h" | "7d" | "30d";
type ItemDecision = "approved" | "rejected";

const rangeCutoffs: Record<RangeFilter, number> = { all: 0, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };

function rowContext(item: AdminApprovalQueueItem) {
  if (item.kind === "referral_request") return `${item.companyDomain} · opened ${compactDate(item.createdAt)} · ${item.meta.claimTime ? `claimed ${compactDateTime(item.meta.claimTime)}` : item.meta.waitingForCoverage ? "awaiting company coverage" : "awaiting claim"}`;
  if (item.kind === "referrer_enrollment") return `${item.companyDomain} · OTP verified ${item.meta.otpTime ? compactDateTime(item.meta.otpTime) : "—"}`;
  return `${item.provider || item.meta.role || "Payment"} · ${formatAmount(item.amount ?? 0, item.currency ?? "")} · ${compactDate(item.createdAt)}`;
}

function metaChips(item: AdminApprovalQueueItem) {
  if (item.kind === "referral_request") return <>{item.meta.targetRoleUrl ? <a href={item.meta.targetRoleUrl} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e] hover:border-blue-200 hover:bg-blue-50 hover:text-[#0B57D0]">Role link</a> : null}<span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e]">1 credit reserved</span>{item.meta.waitingForCoverage && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">Waiting for coverage</span>}</>;
  if (item.kind === "referrer_enrollment") return <><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e]">Work email verified</span>{item.meta.referrerEmail ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e]">{item.meta.referrerEmail}</span> : null}</>;
  return <><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e]">{item.meta.tokenCount ?? 0} token{(item.meta.tokenCount ?? 0) === 1 ? "" : "s"}</span>{item.meta.reason ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">{item.meta.reason}</span> : <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-[#57534e]">{item.meta.userEmail || `User #${item.id}`}</span>}</>;
}

export default function AdminApprovalQueue() {
  const { isSignedIn, getToken } = useAuth();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<AdminApprovalQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, { message: string; decision: ItemDecision }>>({});

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setDenied(false);
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/approval-queue?limit=250", { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
      if (response.status === 403) { setDenied(true); setItems([]); return; }
      const payload = await readApiJson<{ items?: AdminApprovalQueueItem[]; error?: string }>(response, "We could not load the approval queue");
      if (!response.ok) throw new Error(payload.error || "We could not load the approval queue");
      setItems(payload.items || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the approval queue"); }
    finally { setLoading(false); }
  };

  const filteredItems = useMemo(() => {
    const cutoff = rangeFilter === "all" ? 0 : Date.now() - rangeCutoffs[rangeFilter];
    return items.filter(item => (statusFilter === "all" || item.status === statusFilter) && (kindFilter === "all" || item.kind === kindFilter) && new Date(item.updatedAt).getTime() >= cutoff);
  }, [items, statusFilter, kindFilter, rangeFilter]);
  const filtersApplied = statusFilter !== "all" || kindFilter !== "all" || rangeFilter !== "all";
  const openCount = filteredItems.filter(item => openApprovalStatuses.has(item.status)).length;

  const decide = async (item: AdminApprovalQueueItem, decision: ItemDecision) => {
    const key = itemKey(item);
    setWorkingKey(key); setRowErrors(current => { const next = { ...current }; delete next[key]; return next; });
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/approval-queue/${item.kind}/${item.id}/decision`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision }) });
      const payload = await readApiJson<{ ok?: boolean; status?: AdminApprovalQueueStatus; error?: string }>(response, "We could not record this approval decision");
      if (!response.ok) throw new Error(payload.error || "We could not record this approval decision");
      setItems(current => current.map(row => row.kind === item.kind && row.id === item.id ? { ...row, status: payload.status ?? (decision === "approved" ? "approved" : "declined") } : row));
    } catch (resolveError) { setRowErrors(current => ({ ...current, [key]: { message: resolveError instanceof Error ? resolveError.message : "We could not record this approval decision", decision } })); }
    finally { setWorkingKey(null); }
  };

  useEffect(() => { void load(); }, [isSignedIn]);
  if (!isSignedIn) return <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-7 w-7 text-[#0B57D0]" /><h1 className="mt-4 text-2xl font-semibold">Administrator approval queue</h1><p className="mt-2 text-sm leading-6 text-slate-600">Sign in with an administrator account to triage pending referral requests, referrer enrollments, and credit-pack payments.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  if (denied) return <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-7 w-7 text-[#0B57D0]" /><h1 className="mt-4 text-2xl font-semibold">Administrator access is required</h1><p className="mt-2 text-sm leading-6 text-slate-600">This queue is available only to the designated administrator account.</p><a href="/" className="mt-5 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50">Back to skipwait.me</a></section></div></main>;
  return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between gap-4"><Brand /><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Administrator diagnostics</span></header><section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Unified approval queue</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Triage every pending record.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Seeker requests under review, referrer enrollments awaiting a first action, and credit-pack payments needing reconciliation — one queue, one status vocabulary, one audit trail.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><ListFilter className="h-4 w-4 text-[#0B57D0]" />{items.length ? `${items.length} in queue` : "Queue"}</span></div><div className="mt-5 flex flex-wrap items-center gap-2"><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#78716c]" /><select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#57534e] outline-none focus:border-[#0B57D0]"><option value="all">Status: All</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="requires_review">Requires review</option><option value="approved">Approved</option><option value="declined">Declined</option></select></label><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#78716c]" /><select aria-label="Filter by role" value={kindFilter} onChange={event => setKindFilter(event.target.value as KindFilter)} className="appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#57534e] outline-none focus:border-[#0B57D0]"><option value="all">Role: All</option><option value="referral_request">Seeker request</option><option value="referrer_enrollment">Referrer enrollment</option><option value="payment">Credit pack</option></select></label><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#78716c]" /><select aria-label="Filter by date range" value={rangeFilter} onChange={event => setRangeFilter(event.target.value as RangeFilter)} className="appearance-none rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#57534e] outline-none focus:border-[#0B57D0]"><option value="all">Recent: Any time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>{filtersApplied && <span className="rounded-full border border-blue-100 bg-[#eef3fc] px-3 py-1.5 text-[11px] font-bold text-[#0B57D0]">{openCount} open</span>}</div>{error ? <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900">Retry</button></div> : loading ? <div className="mt-7 grid gap-3">{[0, 1, 2].map(index => <div key={index} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white p-4"><div className="h-4 w-40 rounded bg-slate-100" /><div className="mt-3 h-3 w-64 rounded bg-slate-100" /><div className="mt-2 h-3 w-5/6 rounded bg-slate-100" /><div className="mt-5 h-9 w-52 rounded-lg bg-blue-100" /></div>)}</div> : !filteredItems.length ? <div className="mt-7 rounded-xl border border-dashed border-slate-200 p-10 text-center"><p className="text-sm font-bold text-slate-800">Queue clear{filtersApplied ? " — No items match these filters" : ""}</p><p className="mt-1 text-sm text-slate-600">{filtersApplied ? "Widen the date range or clear filters." : "No items need an administrator decision right now."}</p></div> : <div className="mt-7 grid gap-3"><ul className="grid gap-3">{filteredItems.map(item => { const badge = approvalStatusLabels[item.status]; const key = itemKey(item); const rowError = rowErrors[key]; const working = workingKey === key; const resolved = item.status === "approved" || item.status === "declined"; return <li key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="truncate text-sm font-bold text-slate-900">{item.kind === "referral_request" ? displayRef(item.id) : item.kind === "payment" ? displayPaymentRef(item.id) : item.meta.referrerName || `Ref-ENR-${1000 + item.id}`}</h2><StatusBadge label={badge.label} tone={badge.tone} /></div><p className="mt-1 truncate text-[11px] text-[#78716c]">{rowContext(item)}</p><p className="mt-1 text-xs text-slate-600">{item.summary}</p><div className="mt-2 flex flex-wrap gap-1.5">{metaChips(item)}</div>{rowError ? <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><p>Decision failed to save — {rowError.message}. The record is unchanged and still in the queue. No notifications were sent.</p><button type="button" disabled={working} onClick={() => void decide(item, rowError.decision)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-800">Retry decision</button></div> : null}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => navigate(`/admin/approvals/${item.kind}/${item.id}`)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50"><CheckSquare className="mr-1.5 h-3.5 w-3.5 text-[#0B57D0]" />Open record</button><button type="button" disabled={working || resolved} onClick={() => void decide(item, "approved")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">{working ? "Recording…" : "Approve"}</button><button type="button" disabled={working || resolved} onClick={() => void decide(item, "rejected")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-rose-50 disabled:opacity-50">{working ? "Recording…" : "Reject"}</button></div></li>; })}</ul></div>}</section></div></main>;
}
