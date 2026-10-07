import { AlertCircle, ArrowLeft, CheckCircle2, History, Link2, LoaderCircle, ShieldCheck, WalletCards } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import StatusBadge from "@/components/StatusBadge";
import { approvalStatusLabels, compactDateTime, displayPaymentRef, displayRef, formatAmount, historyLabels, type AdminApprovalQueueItem, type AdminApprovalQueueKind } from "@/lib/adminApproval";
import { readApiJson } from "@/lib/apiResponse";

type ReviewDecision = "approved" | "rejected";
type HistoryEvent = { id: string; label: string; actor: string; time: string | Date; note?: string };
type ActivityEvent = { id: number; action: string; outcome: "success" | "failure" | "denied"; resourceType: string | null; resourceId: string | null; metadata: string | null; createdAt: string | Date; actorName: string | null; actorEmail: string | null };

const activityResourceTypes: Record<AdminApprovalQueueKind, string[]> = { referral_request: ["referral_request"], referrer_enrollment: ["referrer_enrollment"], payment: ["payment_fulfillment"] };

function metadataNote(metadata: string | null, note: string | null | undefined): string | undefined {
  if (note) return String(note);
  if (!metadata) return undefined;
  try { const parsed = JSON.parse(metadata) as { note?: unknown }; return typeof parsed.note === "string" && parsed.note.trim() ? parsed.note : undefined; } catch { return undefined; }
}

function buildHistory(item: AdminApprovalQueueItem, activity: ActivityEvent[]): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const push = (key: string, label: string, actor: string, time: string | Date | null | undefined, note?: string) => { if (!time) return; events.push({ id: `${key}-${new Date(time).getTime()}`, label, actor, time, note }); };
  const recordEvents = activity.filter(event => event.resourceId === String(item.id) && activityResourceTypes[item.kind].includes(event.resourceType ?? ""));
  const presentActions = new Set(recordEvents.map(event => event.action));
  if (item.kind === "referral_request") {
    if (!presentActions.has("company_referral.created")) push("created", "Request created", item.meta.seekerName || "Job seeker", item.createdAt);
    push("credit", "1 credit reserved (monthly)", "System · credit reservation", item.createdAt);
    if (!presentActions.has("company_referral.claimed")) push("claim", "Claimed by verified referrer", item.meta.referrerName || "Verified referrer", item.meta.claimTime);
  }
  if (item.kind === "referrer_enrollment") push("otp", "Work email verified", item.meta.referrerName || item.meta.referrerEmail || "Referrer", item.meta.otpTime);
  if (item.kind === "payment") push("review", `Payment requires review${item.meta.reason ? ` — ${item.meta.reason}` : ""}`, item.meta.userEmail || "Credit pack", item.createdAt);
  for (const event of recordEvents) {
    const note = metadataNote(event.metadata, undefined);
    events.push({ id: `activity-${event.id}`, label: historyLabels[event.action] || event.action.replace(/\./g, " · "), actor: event.actorName || "System", time: event.createdAt, note: note || undefined });
  }
  // The same decision is logged by the resolver and the route request; keep one line.
  const deduped = events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()).filter((event, index, all) => index === 0 || event.label !== all[index - 1].label || Math.abs(new Date(event.time).getTime() - new Date(all[index - 1].time).getTime()) > 2_000);
  return deduped;
}

function RecordBlock({ icon: Icon, eyebrow, title, children }: { icon: React.ComponentType<{ className?: string }>; eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f5f5f5] text-black"><Icon className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#505050]">{eyebrow}</p><h2 className="text-sm font-bold text-black">{title}</h2></div></div><div className="mt-3 text-sm leading-6 text-[#505050]">{children}</div></section>;
}

export default function AdminApprovalRecord() {
  const { isSignedIn, getToken } = useAuth();
  const [match, params] = useRoute<{ kind: string; id: string }>("/admin/approvals/:kind/:id");
  const kind = (match ? params.kind : "") as AdminApprovalQueueKind;
  const itemId = Number(match ? params.id : 0);
  const [item, setItem] = useState<AdminApprovalQueueItem | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [workingDecision, setWorkingDecision] = useState<ReviewDecision | null>(null);
  const [decisionError, setDecisionError] = useState<{ message: string; decision: ReviewDecision } | null>(null);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setDenied(false);
    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [queueResponse, activityResponse] = await Promise.all([fetch("/api/admin/approval-queue?limit=250", { headers, credentials: "include" }), fetch("/api/admin/activity?limit=250", { headers, credentials: "include" })]);
      if (queueResponse.status === 403) { setDenied(true); return; }
      const queuePayload = await readApiJson<{ items?: AdminApprovalQueueItem[]; error?: string }>(queueResponse, "We could not load the approval record");
      const activityPayload = await readApiJson<{ events?: ActivityEvent[]; error?: string }>(activityResponse, "We could not load the record history");
      if (!queueResponse.ok) throw new Error(queuePayload.error || "We could not load the approval record");
      if (!activityResponse.ok) throw new Error(activityPayload.error || "We could not load the record history");
      const record = (queuePayload.items || []).find(row => row.kind === kind && row.id === itemId) || null;
      setItem(record);
      setEvents(record ? buildHistory(record, activityPayload.events || []) : []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the approval record"); }
    finally { setLoading(false); }
  };

  const decide = async (decision: ReviewDecision) => {
    if (!item || !kind) return;
    setWorkingDecision(decision); setDecisionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/approval-queue/${kind}/${item.id}/decision`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision, note: note.trim() || undefined }) });
      const payload = await readApiJson<{ ok?: boolean; status?: string; error?: string }>(response, "We could not record this approval decision");
      if (!response.ok) throw new Error(payload.error || "We could not record this approval decision");
      const nextStatus = (payload.status ?? (decision === "approved" ? "approved" : "declined")) as AdminApprovalQueueItem["status"];
      const now = new Date();
      setItem(current => current ? { ...current, status: nextStatus, meta: { ...current.meta, approvalNote: note.trim() || current.meta.approvalNote } } : current);
      setEvents(current => [...current.filter(event => event.label !== (decision === "approved" ? "Approved by admin" : "Rejected by admin")), { id: `local-decision-${now.getTime()}`, label: decision === "approved" ? "Approved by admin" : "Rejected by admin", actor: "You (administrator)", time: now, note: note.trim() || undefined }].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));
    } catch (resolveError) { setDecisionError({ message: resolveError instanceof Error ? resolveError.message : "We could not record this approval decision", decision }); }
    finally { setWorkingDecision(null); }
  };

  useEffect(() => { void load(); }, [isSignedIn, kind, itemId]);
  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator record</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to view and decide this record.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  if (denied) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator access is required</h1><p className="mt-2 text-sm leading-6 text-[#505050]">This record is available only to the designated administrator account.</p><a href="/admin/approvals" className="mt-5 inline-flex items-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-3 text-sm font-semibold text-[#505050] hover:border-[#141414] hover:bg-[#f5f5f5]">Back to approvals</a></section></div></main>;
  const badge = item ? approvalStatusLabels[item.status] : null;
  return <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-3xl"><AdminNav current="approvals" badge="Administrator diagnostics" /><a href="/admin/approvals" className="mt-8 inline-flex items-center gap-1.5 text-xs font-bold text-black hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to approvals</a>{error ? <section role="alert" className="mt-6 rounded-2xl border border-[#b45309]/30 bg-[#b45309]/10 p-4"><div className="flex items-start justify-between gap-3 text-sm text-[#B45309]"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#B45309]">Retry</button></div></section> : loading ? <div className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5"><div className="h-5 w-52 animate-pulse rounded bg-[#f0f0f0]" /><div className="mt-4 h-24 animate-pulse rounded-xl bg-[#f0f0f0]" /><div className="mt-3 h-32 animate-pulse rounded-xl bg-[#f0f0f0]" /></div> : !item ? <section className="mt-6 rounded-2xl border border-dashed border-[#e5e5e5] p-10 text-center"><p className="text-sm font-bold text-black">Record not found</p><p className="mt-1 text-sm text-[#505050]">This record is no longer listed in the approval queue.</p><a href="/admin/approvals" className="mt-5 inline-flex items-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-2.5 text-xs font-bold text-[#505050] hover:border-[#141414] hover:bg-[#f5f5f5]">Back to approvals</a></section> : <><section className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Administrator record</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{item.kind === "referral_request" ? displayRef(item.id) : item.kind === "payment" ? displayPaymentRef(item.id) : item.meta.referrerName || `Ref-ENR-${1000 + item.id}`}</h1><p className="mt-1 text-xs text-[#505050]">{item.companyDomain || item.provider || "Credit pack"} · {compactDateTime(item.createdAt)}</p></div>{badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}</div></section><div className="mt-5 grid gap-3">{item.kind === "referral_request" ? <><div className="grid gap-3 sm:grid-cols-2"><RecordBlock icon={CheckCircle2} eyebrow="Seeker" title={item.meta.seekerName || "Job seeker"}><p className="text-xs text-[#505050]">{item.meta.seekerEmail || "Email hidden"}</p><p className="mt-2 text-xs leading-5 text-[#505050]">“{item.meta.pitch || item.summary}”</p></RecordBlock><RecordBlock icon={ShieldCheck} eyebrow="Referrer" title={item.meta.referrerName || "Awaiting claim"}><p className="text-xs text-[#505050]">{item.meta.referrerEmail || "No verified referrer claimed this request"}</p><p className="mt-2 text-xs leading-5 text-[#505050]">{item.meta.claimTime ? `Claimed ${compactDateTime(item.meta.claimTime)}` : "Claimed by a verified employee updates this block."}</p></RecordBlock></div><RecordBlock icon={Link2} eyebrow="Role link" title={item.meta.roleTitle || "Role from shared job link"}><p className="text-xs text-[#505050]">{item.companyDomain}{item.meta.waitingForCoverage ? " · waiting for company coverage" : ""}</p>{item.meta.targetRoleUrl ? <a href={item.meta.targetRoleUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#141414] bg-[#f5f5f5] px-3 py-1.5 text-[11px] font-bold text-black hover:bg-[#f0f0f0]">Open job link</a> : null}</RecordBlock><RecordBlock icon={WalletCards} eyebrow="Credit movement" title="1 credit reserved"><p className="text-xs leading-5 text-[#505050]">Reserved when the request was created. Returned on withdraw, consumed on accept, never consumed on decline.</p></RecordBlock></> : item.kind === "referrer_enrollment" ? <><RecordBlock icon={ShieldCheck} eyebrow="Referrer enrollment" title={item.meta.referrerName || "Verified referrer"}><p className="text-xs text-[#505050]">{item.meta.referrerEmail || "Email hidden"} · work email verified for {item.companyDomain}</p><p className="mt-2 text-xs leading-5 text-[#505050]">Work email OTP verified {item.meta.otpTime ? compactDateTime(item.meta.otpTime) : "—"}. The referrer has not yet claimed or reviewed a request.</p></RecordBlock><RecordBlock icon={WalletCards} eyebrow="Credit movement" title="No credit movement yet"><p className="text-xs leading-5 text-[#505050]">Verification grants nothing. Invite credits unlock after the first accepted referral.</p></RecordBlock></> : <><RecordBlock icon={WalletCards} eyebrow="Credit pack payment" title={item.provider || "Payment"}><p className="text-xs text-[#505050]">{item.meta.userEmail || "User email hidden"} · {item.meta.role?.replace("_", " ") || "credit pack"}</p><p className="mt-2 text-xs leading-5 text-[#505050]">{item.amount != null ? `${formatAmount(item.amount, item.currency || "")} for ${item.meta.tokenCount ?? 0} token${(item.meta.tokenCount ?? 0) === 1 ? "" : "s"}` : `${item.meta.tokenCount ?? 0} token${(item.meta.tokenCount ?? 0) === 1 ? "" : "s"}`}{item.meta.reason ? ` · ${item.meta.reason}` : ""}</p></RecordBlock><RecordBlock icon={WalletCards} eyebrow="Credit movement" title="Pending token credit">{item.status === "approved" ? <p className="text-xs leading-5 text-[#505050]">Tokens were credited to the wallet when this payment was approved.</p> : item.status === "declined" ? <p className="text-xs leading-5 text-[#505050]">No tokens were granted; the payment row closed without crediting.</p> : <p className="text-xs leading-5 text-[#505050]">{item.meta.tokenCount ?? 0} token{(item.meta.tokenCount ?? 0) === 1 ? "" : "s"} are held until an administrator approves this payment.</p>}</RecordBlock></>}</div><section className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#505050]">Decision</p><h2 className="text-sm font-bold text-black">Record a decision on this item.</h2></div>{item.status === "approved" || item.status === "declined" ? <span className="rounded-full bg-[#f5f5f5] px-3 py-1.5 text-[11px] font-bold text-black">Already resolved</span> : null}</div><label htmlFor="decision-note" className="mt-3 block text-[11px] font-bold uppercase tracking-[.12em] text-[#505050]">Decision note (optional, recorded on the item)</label><textarea id="decision-note" value={note} onChange={event => setNote(event.target.value)} placeholder="Operational context for the audit trail" rows={2} className="mt-1 w-full resize-none rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm outline-none focus:border-[#141414]" />{decisionError ? <div role="alert" className="mt-2 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2 text-xs font-semibold text-[#B91C1C]"><p>Decision failed to save — {decisionError.message}. The record is unchanged and still in the queue. No notifications were sent.</p><button type="button" disabled={workingDecision !== null} onClick={() => void decide(decisionError.decision)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#b91c1c]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#B91C1C]">Retry decision</button></div> : null}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={workingDecision !== null || item.status === "approved" || item.status === "declined"} onClick={() => void decide("approved")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#15803d] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803d]/85">{workingDecision === "approved" ? "Saving…" : "Approve"}</button><button type="button" disabled={workingDecision !== null || item.status === "approved" || item.status === "declined"} onClick={() => void decide("rejected")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#b91c1c]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-[#b91c1c]/10">{workingDecision === "rejected" ? "Saving…" : "Reject"}</button></div></section><section className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f5f5f5] text-black"><History className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#505050]">History</p><h2 className="text-sm font-bold text-black">Ordered events with actor and timestamp.</h2></div></div>{events.length ? <ol className="mt-4 space-y-4">{events.map(event => <li key={event.id} className="flex gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.label === "Approved by admin" || event.label === "Approved by referrer" ? "bg-[#15803d]" : event.label === "Rejected by admin" || event.label === "Rejected by referrer" ? "bg-[#b91c1c]" : "bg-[#141414]"}`} /><div><p className="text-sm font-semibold text-black">{event.label}</p><p className="mt-0.5 text-[11px] text-[#505050]">{event.actor} · {compactDateTime(event.time)}</p>{event.note ? <p className="mt-1 text-xs text-[#505050]">Note: {event.note}</p> : null}</div></li>)}</ol> : <p className="mt-4 text-sm text-[#505050]">No history events are recorded for this item yet.</p>}</section></>}</div></main>;
}
