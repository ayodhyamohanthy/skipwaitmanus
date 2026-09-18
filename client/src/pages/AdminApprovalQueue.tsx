import { AlertCircle, CheckSquare, ChevronDown, ListFilter, LoaderCircle, ShieldCheck } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { useSlowLoad } from "@/hooks/useSlowLoad";
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
  if (item.kind === "referral_request") return <>{item.meta.targetRoleUrl ? <a href={item.meta.targetRoleUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050] hover:border-[#0000ff] hover:bg-[#ededff] hover:text-black">Role link</a> : null}<span className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050]">1 credit reserved</span>{item.meta.waitingForCoverage && <span className="rounded-full border border-[#b45309]/30 bg-[#b45309]/10 px-2.5 py-1 text-[10px] font-bold text-[#B45309]">Waiting for coverage</span>}</>;
  if (item.kind === "referrer_enrollment") return <><span className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050]">Work email verified</span>{item.meta.referrerEmail ? <span className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050]">{item.meta.referrerEmail}</span> : null}</>;
  return <><span className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050]">{item.meta.tokenCount ?? 0} token{(item.meta.tokenCount ?? 0) === 1 ? "" : "s"}</span>{item.meta.reason ? <span className="rounded-full border border-[#b45309]/30 bg-[#b45309]/10 px-2.5 py-1 text-[10px] font-bold text-[#B45309]">{item.meta.reason}</span> : <span className="rounded-full border border-[#e5e5e5] bg-white px-2.5 py-1 text-[10px] font-bold text-[#505050]">{item.meta.userEmail || `User #${item.id}`}</span>}</>;
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
  const { showSkeleton, isSlow } = useSlowLoad(loading);

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
  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator approval queue</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to triage pending referral requests, referrer enrollments, and credit-pack payments.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#0000ff] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  if (denied) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator access is required</h1><p className="mt-2 text-sm leading-6 text-[#505050]">This queue is available only to the designated administrator account.</p><a href="/" className="mt-5 inline-flex items-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-3 text-sm font-semibold text-[#505050] hover:border-[#0000ff] hover:bg-[#ededff]">Back to skipwait.me</a></section></div></main>;
  return <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="approvals" badge="Administrator diagnostics" /><section className="mt-10 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Unified approval queue</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Triage every pending record.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Seeker requests under review, referrer enrollments awaiting a first action, and credit-pack payments needing reconciliation — one queue, one status vocabulary, one audit trail.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#505050]"><ListFilter className="h-4 w-4 text-black" />{items.length ? `${items.length} in queue` : "Queue"}</span></div><div className="mt-5 flex flex-wrap items-center gap-2"><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#505050]" /><select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className="appearance-none rounded-full border border-[#e5e5e5] bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#505050] outline-none focus:border-[#0000ff]"><option value="all">Status: All</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="requires_review">Requires review</option><option value="approved">Approved</option><option value="declined">Declined</option></select></label><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#505050]" /><select aria-label="Filter by record type" value={kindFilter} onChange={event => setKindFilter(event.target.value as KindFilter)} className="appearance-none rounded-full border border-[#e5e5e5] bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#505050] outline-none focus:border-[#0000ff]"><option value="all">Role: All</option><option value="referral_request">Seeker request</option><option value="referrer_enrollment">Referrer enrollment</option><option value="payment">Credit pack</option></select></label><label className="relative inline-flex items-center"><ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#505050]" /><select aria-label="Filter by date range" value={rangeFilter} onChange={event => setRangeFilter(event.target.value as RangeFilter)} className="appearance-none rounded-full border border-[#e5e5e5] bg-white py-1.5 pl-3 pr-8 text-[11px] font-bold text-[#505050] outline-none focus:border-[#0000ff]"><option value="all">Recent: Any time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>{filtersApplied && <span className="rounded-full border border-[#c2c2ff] bg-[#ededff] px-3 py-1.5 text-[11px] font-bold text-black">{openCount} open</span>}</div>{error ? <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#B45309]"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#B45309]">Retry</button></div> : showSkeleton ? <div className="mt-7 grid gap-3"><LoadingSkeleton title="Loading the approval queue…" caption="Pulling seeker requests, referrer enrollments, and payments into one list." slow={isSlow} slowMessage="This is taking longer than expected. The queue is read-only until it loads — nothing has been decided or notified." />{[0, 1].map(index => <div key={index} aria-hidden="true" className="h-32 animate-pulse rounded-xl border border-[#e5e5e5] bg-white p-4 motion-reduce:animate-none"><div className="h-4 w-40 rounded bg-[#f0f0f0]" /><div className="mt-3 h-3 w-64 rounded bg-[#f0f0f0]" /><div className="mt-2 h-3 w-5/6 rounded bg-[#f0f0f0]" /><div className="mt-5 h-9 w-52 rounded-lg bg-[#e0e0ff]" /></div>)}</div> : !filteredItems.length ? <div className="mt-7 rounded-xl border border-dashed border-[#e5e5e5] p-10 text-center"><p className="text-sm font-bold text-black">Queue clear{filtersApplied ? " — No items match these filters" : ""}</p><p className="mt-1 text-sm text-[#505050]">{filtersApplied ? "Widen the date range or clear filters." : "No items need an administrator decision right now."}</p>{filtersApplied ? <button type="button" onClick={() => { setStatusFilter("all"); setKindFilter("all"); setRangeFilter("all"); }} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-2.5 text-xs font-bold text-[#505050] hover:border-[#0000ff] hover:bg-[#ededff]">Clear filters</button> : null}</div> : <div className="mt-7 grid gap-3"><ul className="grid gap-3">{filteredItems.map(item => { const badge = approvalStatusLabels[item.status]; const key = itemKey(item); const rowError = rowErrors[key]; const working = workingKey === key; const resolved = item.status === "approved" || item.status === "declined"; return <li key={key} className="rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="flex items-start justify-between gap-3"><h2 className="truncate text-sm font-bold text-black">{item.kind === "referral_request" ? displayRef(item.id) : item.kind === "payment" ? displayPaymentRef(item.id) : item.meta.referrerName || `Ref-ENR-${1000 + item.id}`}</h2><StatusBadge label={badge.label} tone={badge.tone} /></div><p className="mt-1 truncate text-[11px] text-[#505050]">{rowContext(item)}</p><p className="mt-1 text-xs text-[#505050]">{item.summary}</p><div className="mt-2 flex flex-wrap gap-1.5">{metaChips(item)}</div>{rowError ? <div role="alert" className="mt-3 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2 text-xs font-semibold text-[#B91C1C]"><p>Decision failed to save — {rowError.message}. The record is unchanged and still in the queue. No notifications were sent.</p><button type="button" disabled={working} onClick={() => void decide(item, rowError.decision)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#b91c1c]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#B91C1C]">Retry decision</button></div> : null}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => navigate(`/admin/approvals/${item.kind}/${item.id}`)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-2.5 text-xs font-bold text-[#505050] hover:border-[#0000ff] hover:bg-[#ededff]"><CheckSquare className="mr-1.5 h-3.5 w-3.5 text-black" />Open record</button><button type="button" disabled={working || resolved} onClick={() => void decide(item, "approved")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#15803d]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#15803d] hover:bg-[#15803d]/10">{working ? "Recording…" : "Approve"}</button><button type="button" disabled={working || resolved} onClick={() => void decide(item, "rejected")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#b91c1c]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-[#b91c1c]/10">{working ? "Recording…" : "Reject"}</button></div></li>; })}</ul></div>}</section></div></main>;
}
