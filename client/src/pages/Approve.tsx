import { Bot, Check } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { Button, buttonVariants } from "@/components/kit/button";
import { ApprovalCard, ApprovalResult, Sheet } from "@/components/assistants/ApprovalSheet";
import type { AssistantApproval } from "@/components/assistants/format";

type CreditsSummary = { plan?: string; totalAvailable?: number; monthlyCreditsRemaining?: number; monthlyAllowance?: number };

const FOOTNOTE = "Unanswered approvals expire after 24 hours.";

export default function Approve() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [approvals, setApprovals] = useState<AssistantApproval[]>([]);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState<{ id: number; message: string } | null>(null);
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
    setLoading(true); setLoadError("");
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
      setLoaded(true);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "We could not load your approvals");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (approval: AssistantApproval, decision: "approved" | "declined") => {
    if (workingId !== null) return;
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
    } finally {
      setWorkingId(null);
    }
  };

  const saveEdit = async (approval: AssistantApproval) => {
    if (!draftNote.trim() || workingId !== null) return;
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
    <main data-skipwait-screen="approve" className="page-content mx-auto max-w-lg">
      {content}
      <p className="mt-4 text-center text-xs text-muted-foreground">{FOOTNOTE}</p>
    </main>
  );

  if (!isSignedIn) {
    return shell(
      <Sheet className="text-center">
        <Bot className="mx-auto size-8" />
        <h1 className="mt-3 text-2xl font-semibold">Sign in to review approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Assistant actions wait for your decision.</p>
        <SignInButton><button type="button" className={buttonVariants({ className: "mt-4" })}>Sign in</button></SignInButton>
      </Sheet>,
    );
  }

  const pending = approvals.filter(approval => approval.status === "pending");

  if (result) {
    return shell(<ApprovalResult approval={result.approval} decision={result.decision} morePending={pending.some(item => item.id !== result.approval.id)} onBack={() => setResult(null)} />);
  }

  if (!loaded && loading) {
    return shell(<p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading approvals…</p>);
  }

  if (!loaded && loadError) {
    return shell(
      <Sheet className="text-center">
        <h1 className="mt-1 text-2xl font-semibold">Approvals didn&apos;t load</h1>
        <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{loadError}</p>
        <p className="mt-1 text-sm text-muted-foreground">Nothing was sent. Your assistants keep waiting.</p>
        <Button className="mt-4" disabled={loading} onClick={() => { void load(); }}>{loading ? "Trying again…" : "Try again"}</Button>
      </Sheet>,
    );
  }

  const balance = credits && typeof credits.totalAvailable === "number" ? credits.totalAvailable : null;

  return shell(
    <>
      {loadError ? <p role="alert" className="mb-4 text-sm font-semibold text-destructive">{loadError} <Button variant="link" className="h-auto p-0" disabled={loading} onClick={() => { void load(); }}>Try again</Button></p> : null}
      {pending.length === 0 ? (
        <Sheet className="text-center">
          <Check className="mx-auto size-8" />
          <h1 className="mt-3 text-2xl font-semibold">Nothing waiting for you</h1>
          <p className="mt-1 text-sm text-muted-foreground">When an assistant prepares an ask or a paid tool, it shows up here first.</p>
        </Sheet>
      ) : (
        <div className="space-y-4">
          {pending.map((approval, index) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              balance={balance}
              primary={index === 0}
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
