import { Bot, Check, CheckCircle2, Coins, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ActionErrorCard } from "@/components/ActionErrorCard";

type AssistantApproval = {
  id: number;
  kind: "ask_send" | "credit_spend";
  status: "pending" | "approved" | "declined" | "expired";
  provider: string;
  companyDomain: string | null;
  role: string | null;
  note: string | null;
  creditCount: number | null;
  slotCount: number | null;
  createdAt: string;
  expiresAt: string;
};

type CreditsSummary = { plan?: string; totalAvailable?: number; monthlyCreditsRemaining?: number; monthlyAllowance?: number };

function timeUntil(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "expired";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} h left`;
  return `${Math.max(1, Math.floor(ms / 60000))} min left`;
}

export default function Approve() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [approvals, setApprovals] = useState<AssistantApproval[]>([]);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [result, setResult] = useState<{ approval: AssistantApproval; decision: "approved" | "declined" } | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const load = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const [approvalsResponse, creditsResponse] = await Promise.all([
        fetch("/api/assistants/approvals", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: await authHeaders() }),
      ]);
      const approvalsPayload = await readApiJson<{ approvals?: AssistantApproval[]; error?: string }>(approvalsResponse, "We could not load your approvals");
      if (!approvalsResponse.ok) throw new Error(approvalsPayload.error || "We could not load your approvals");
      setApprovals(Array.isArray(approvalsPayload.approvals) ? approvalsPayload.approvals : []);
      if (creditsResponse.ok) {
        const creditsPayload = await readApiJson<{ summary?: CreditsSummary }>(creditsResponse, "");
        if (creditsPayload.summary) setCredits(creditsPayload.summary);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not load your approvals");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (approval: AssistantApproval, decision: "approved" | "declined") => {
    setWorkingId(approval.id);
    try {
      const response = await fetch(`/api/assistants/approvals/${approval.id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ decision }),
      });
      const payload = await readApiJson<{ error?: string }>(response, "We could not record that decision");
      if (!response.ok) throw new Error(payload.error || "We could not record that decision");
      setResult({ approval, decision });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not record that decision");
    } finally {
      setWorkingId(null);
    }
  };

  const saveEdit = async (approval: AssistantApproval) => {
    if (!draftNote.trim() || workingId === approval.id) return;
    setWorkingId(approval.id);
    try {
      const response = await fetch(`/api/assistants/approvals/${approval.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ note: draftNote.trim() }),
      });
      const payload = await readApiJson<{ error?: string }>(response, "We could not save that note");
      if (!response.ok) throw new Error(payload.error || "We could not save that note");
      setEditingId(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not save that note");
    } finally {
      setWorkingId(null);
    }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-xl">
          <Bot className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Sign in to review approvals</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Assistant actions wait for your decision.</p>
        </div>
      </main>
    );
  }

  if (result) {
    return (
      <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
          {result.decision === "approved" ? (
            <div className="py-4 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--primary)]/10"><CheckCircle2 className="size-8 text-[var(--primary)]" /></span>
              <h1 className="mt-3 text-2xl font-semibold">Done</h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{result.approval.provider} has been told. Track it in Requests.</p>
              <Link href="/requests" className="brand-button mt-4 inline-block">Open requests</Link>
            </div>
          ) : (
            <div className="py-4 text-center">
              <X className="mx-auto size-8" />
              <h1 className="mt-3 text-2xl font-semibold">Declined</h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Nothing was sent and no credits were used.</p>
              <button type="button" onClick={() => setResult(null)} className="brand-button mt-4 inline-block">Back to approvals</button>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">Shown as a push notification and in Alerts. Unanswered approvals expire after 24 hours.</p>
      </main>
    );
  }

  const pending = approvals.filter(approval => approval.status === "pending");

  return (
    <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
      <span className="eyebrow">Review</span>
      <h1 className="mt-2 text-4xl font-semibold">Approvals<span className="brand-dot">.</span></h1>
      <p className="mt-2 text-[var(--muted-foreground)]">Approve, edit or decline an ask or paid tool that your assistant prepared.</p>

      {loading ? <div className="mt-6"><LoadingSkeleton title="Loading approvals…" caption="Checking what your assistants prepared." /></div> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error} <button type="button" className="font-bold underline" onClick={() => { void load(); }}>Try again</button></p> : null}

      {!loading && !error && pending.length === 0 ? (
        <section className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--muted)] p-8 text-center">
          <Check className="mx-auto mb-3 size-8" />
          <h2 className="text-lg font-semibold">Nothing waiting for you</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">When an assistant prepares an ask or a paid tool, it shows up here first.</p>
        </section>
      ) : null}

      {!loading && !error && pending.map(approval => {
        const slotsFull = approval.kind === "ask_send" && approval.slotCount === 0;
        const balance = credits && typeof credits.totalAvailable === "number" ? credits.totalAvailable : null;
        const creditsAfter = balance !== null && approval.creditCount !== null ? Math.max(0, balance - approval.creditCount) : null;
        const spendLine = balance !== null && creditsAfter !== null ? `You have ${balance} · ${creditsAfter} after this` : "The cost shows before anything is spent";
        return (
          <div key={approval.id} className="mt-6 rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl sm:p-6">
            <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><Bot className="size-4" />{approval.provider} · {timeUntil(approval.expiresAt)}</p>

            {approval.kind === "ask_send" && !slotsFull ? (
              <>
                <h2 className="mt-2 text-2xl font-semibold">Send this ask to {approval.companyDomain ?? "this company"}?</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{approval.role ?? "Role"} · uses 1 of your open slots</p>
                {editingId === approval.id ? (
                  <label className="mt-4 block"><span className="sr-only">Ask note</span>
                    <textarea value={draftNote} onChange={event => setDraftNote(event.target.value)} className="min-h-40 w-full rounded-2xl border border-[var(--input)] bg-[var(--background)] p-4 text-base" />
                  </label>
                ) : (
                  <p className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4 text-sm leading-6 whitespace-pre-wrap">{approval.note}</p>
                )}
                <ul className="mt-3 space-y-1 text-sm">
                  <li className="flex gap-2"><Check className="size-4 text-[var(--primary)]" />Assistants draft — you send</li>
                  <li className="flex gap-2"><Check className="size-4 text-[var(--primary)]" />The referrer sees “Sent with {approval.provider}”</li>
                  <li className="flex gap-2"><Check className="size-4 text-[var(--primary)]" />Same open-request limits as you</li>
                </ul>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <button type="button" disabled={workingId === approval.id} onClick={() => { void decide(approval, "declined"); }} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-xl border border-[var(--border)] text-sm font-semibold"><X className="size-4" />Decline</button>
                  {editingId === approval.id ? (
                    <button type="button" disabled={workingId === approval.id || !draftNote.trim()} onClick={() => { void saveEdit(approval); }} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-xl border border-[var(--primary)] text-sm font-semibold"><Pencil className="size-4" />Done</button>
                  ) : (
                    <button type="button" onClick={() => { setEditingId(approval.id); setDraftNote(approval.note ?? ""); }} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-xl border border-[var(--border)] text-sm font-semibold"><Pencil className="size-4" />Edit</button>
                  )}
                  <button type="button" disabled={workingId === approval.id} onClick={() => { void decide(approval, "approved"); }} className="brand-button inline-flex min-h-12 items-center justify-center gap-1"><Check className="size-4" />Send</button>
                </div>
              </>
            ) : null}

            {approval.kind === "ask_send" && slotsFull ? (
              <>
                <h2 className="mt-2 text-2xl font-semibold">All your slots are in use</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{approval.provider} saved this ask as a draft for {approval.companyDomain ?? "this company"}. It can be sent when a request is answered or you withdraw one.</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Link href="/requests" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-semibold">Manage requests</Link>
                  <button type="button" disabled={workingId === approval.id} onClick={() => { void decide(approval, "declined"); }} className="brand-button inline-flex min-h-12 items-center justify-center">Keep as draft</button>
                </div>
              </>
            ) : null}

            {approval.kind === "credit_spend" ? (
              <>
                <h2 className="mt-2 text-2xl font-semibold">Run this paid tool?</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">For {approval.role ?? approval.companyDomain ?? "your ask"}</p>
                <p className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4"><Coins className="size-6" /><span className="flex-1"><strong className="block">{approval.creditCount ?? 1} credits</strong><small className="text-[var(--muted-foreground)]">{spendLine}</small></span></p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button type="button" disabled={workingId === approval.id} onClick={() => { void decide(approval, "declined"); }} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--border)] text-sm font-semibold">Not now</button>
                  <button type="button" disabled={workingId === approval.id} onClick={() => { void decide(approval, "approved"); }} className="brand-button inline-flex min-h-12 items-center justify-center">Use {approval.creditCount ?? 1} credits</button>
                </div>
              </>
            ) : null}
          </div>
        );
      })}

      <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">Shown as a push notification and in Alerts. Unanswered approvals expire after 24 hours.</p>

      {!loading && error ? (
        <div className="mt-6"><ActionErrorCard title="Approvals didn&apos;t load" detail={error} reassurance="Nothing was sent. Your assistants keep waiting." retryLabel="Try again" onRetry={() => { void load(); }} /></div>
      ) : null}
    </main>
  );
}
