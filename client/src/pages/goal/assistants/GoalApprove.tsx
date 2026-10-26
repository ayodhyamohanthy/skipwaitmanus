

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { GoalButton as Button, useOnlineStatus } from "@/components/goal";
import { AssistantLayout, NextStep, Section as Sheet } from "./AssistantLayout";
import { GoalApprovalCard as ApprovalCard } from "./GoalApprovalCard";
import type { AssistantApproval } from "@/components/assistants/format";

type CreditsSummary = { plan?: string; totalAvailable?: number; monthlyCreditsRemaining?: number; monthlyAllowance?: number };

const FOOTNOTE = "Unanswered approvals expire after 24 hours.";

export default function GoalApprove() {
  const { isSignedIn, isLoaded, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [approvals, setApprovals] = useState<AssistantApproval[]>([]);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState<{ id: number; message: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [result, setResult] = useState<{ approval: AssistantApproval; decision: "approved" | "declined" } | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | undefined> => {
    const token = await fetchToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [fetchToken]);

  const load = useCallback(async (): Promise<AssistantApproval[] | null> => {
    if (!isSignedIn || !isLoaded) return null;
    setLoading(true); setLoadError("");
    try {
      const [approvalsResponse, creditsResponse] = await Promise.all([
        fetch("/api/assistants/approvals", { credentials: "include", headers: await authHeaders() }),
        fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: await authHeaders() }),
      ]);
      const approvalsPayload = await readApiJson<{ approvals?: AssistantApproval[]; error?: string }>(approvalsResponse, "We could not load your approvals");
      if (!approvalsResponse.ok) throw new Error(approvalsPayload.error || "We could not load your approvals");
      const list = Array.isArray(approvalsPayload.approvals) ? approvalsPayload.approvals : [];
      setApprovals(list);
      if (creditsResponse.ok) {
        const creditsPayload = await readApiJson<{ summary?: CreditsSummary }>(creditsResponse, "");
        if (creditsPayload.summary) setCredits(creditsPayload.summary);
      }
      setLoaded(true);
      return list;
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "We could not load your approvals");
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, isLoaded, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (approval: AssistantApproval, decision: "approved" | "declined") => {
    if (workingId !== null || !online) return;
    setWorkingId(approval.id); setActionError(null);
    try {
      const response = await fetch(`/api/assistants/approvals/${approval.id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ decision, kind: approval.kind }),
      });
      const payload = await readApiJson<{ error?: string }>(response, "We could not record that decision");
      if (!response.ok) throw new Error(payload.error || "We could not record that decision");
      setEditingId(null);
      setResult({ approval, decision });
      await load();
    } catch (reason) {
      setActionError({ id: approval.id, message: reason instanceof Error ? reason.message : "We could not record that decision" });
      try {
        const fresh = await load();
        const updated = fresh?.find(a => a.id === approval.id);
        if (!updated || updated.status !== "pending") {
          setEditingId(null);
          setActionError(null);
          if (updated?.status === "approved" || updated?.status === "declined") {
            setResult({ approval: updated, decision: updated.status });
          }
        }
      } catch {
        // network or server error on load: actionError remains visible for retry
      }
    } finally {
      setWorkingId(null);
    }
  };

  const saveEdit = async (approval: AssistantApproval) => {
    if (!draftNote.trim() || workingId !== null || !online) return;
    setWorkingId(approval.id); setActionError(null);
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
      setActionError({ id: approval.id, message: reason instanceof Error ? reason.message : "We could not save that note" });
    } finally {
      setWorkingId(null);
    }
  };

  const shell = (content: ReactNode) => (
    <AssistantLayout screen="approve" title="Decide what your assistant can do" description="Review each ask or paid tool before anything is sent or credits are used.">
      {content}<p className="mt-6 text-g-meta text-g-ink-3">{FOOTNOTE}</p>
    </AssistantLayout>
  );

  if (!isLoaded) return shell(<p role="status">Checking sign-in...</p>);

  if (!isSignedIn) {
    return shell(
      <Sheet className="text-center">

        <h1 className="mt-3 text-g-heading">Sign in to review approvals</h1>
        <p className="mt-1 text-sm text-g-ink-2">Assistant actions wait for your decision.</p>
        <Button variant="primary" className="mt-4" onClick={() => openSignIn()}>Sign in</Button>
      </Sheet>,
    );
  }

  const pending = approvals.filter(approval => approval.status === "pending");

  if (result) {
    return shell(<NextStep><h2 className="text-g-heading">{result.decision === "approved" ? "Decision recorded" : "Declined"}</h2><p className="mt-2 text-g-body">{result.decision === "approved" ? "Your approval was recorded. Check your asks for the latest status." : "This action was declined."}</p><Button className="mt-3" onClick={() => setResult(null)}>Back to approvals</Button><a className="ml-4 underline" href="/requests">Open requests</a></NextStep>);
  }

  if (!loaded && loading) {
    return shell(<p role="status">Loading approvals...</p>);
  }

  if (!loaded && loadError) {
    return shell(
      <Sheet className="text-center">
        <h1 className="mt-1 text-g-heading">Approvals didn&apos;t load</h1>
        <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-g-ink-2">{loadError}</p>
        <p className="mt-1 text-sm text-g-ink-2">Nothing was sent. Your assistants keep waiting.</p>
        <Button className="mt-4" disabledReason={loading ? "Loading approvals" : undefined} onClick={() => { void load(); }}>{loading ? "Trying again…" : "Try again"}</Button>
      </Sheet>,
    );
  }

  const balance = credits && typeof credits.totalAvailable === "number" ? credits.totalAvailable : null;

  return shell(
    <>
      {loadError ? <p role="alert" className="mb-4 text-sm font-semibold text-g-ink">{loadError} <Button variant="ghost" className="h-auto p-0" disabledReason={loading ? "Loading approvals" : undefined} onClick={() => { void load(); }}>Try again</Button></p> : null}
      {pending.length === 0 ? (
        <Sheet className="text-center">

          <h1 className="mt-3 text-g-heading">Nothing waiting for you</h1>
          <p className="mt-1 text-sm text-g-ink-2">When an assistant prepares an ask or a paid tool, it shows up here first.</p>
        </Sheet>
      ) : (
        <div className="space-y-4">
          {pending.length > 1 ? <nav aria-label="Choose an approval" className="mb-5 flex flex-wrap gap-2">{pending.map(item => <Button key={item.id} variant="outline" aria-pressed={item.id === (selectedId ?? pending[0]?.id)} onClick={() => { setSelectedId(item.id); setEditingId(null); }}>{item.role ?? item.companyDomain ?? `Approval ${item.id}`}</Button>)}</nav> : null}
          {pending.filter(item => item.id === (selectedId !== null && pending.some(row => row.id === selectedId) ? selectedId : pending[0]?.id)).map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              balance={balance}
              primary
              handlers={{
                editing: editingId === approval.id,
                draftNote,
                working: workingId === approval.id,
                actionError: actionError?.id === approval.id ? actionError.message : "",
                onDraftChange: setDraftNote,
                onStartEdit: () => { setEditingId(approval.id); setDraftNote(approval.note ?? ""); },
                onSaveEdit: () => { void saveEdit(approval); },
                onDecide: decision => { void decide(approval, decision); },
              }}
            />
          ))}
        </div>
      )}
    </>,
  );
}
