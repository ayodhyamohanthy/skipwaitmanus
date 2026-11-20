import { useCallback, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { ConversationSignInGate, SeekerConversation } from "./conversation/SeekerConversation";
import { ReferrerConversation } from "./conversation/ReferrerConversation";
import { ShareWinCard } from "@/components/thread/ShareWinCard";
import { canMessage, companyName, isAccepted } from "@/components/thread/threadModel";
import { usePersistFn } from "@/hooks/usePersistFn";
import { decideReview, confirmReferredBySeeker, extendReferredDeadline, loadConversation, loadThread, recordProgress, sendConversationMessage, stepBackFromReferral, withdrawThreadRequest, type ThreadMessage, type ThreadRequest, type ThreadRole } from "@/lib/threadApi";
import { trpc } from "@/lib/trpc";

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

export default function ReferralConversation(_props: { framed?: boolean } = {}) {
  const [, params] = useRoute("/conversation/:requestId");
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const requestId = Number(params?.requestId);
  const validId = Number.isInteger(requestId) && requestId > 0;
  const returnPath = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "inbox" ? "/inbox" : "/requests";
  const fetchToken = usePersistFn(getToken);

  const [role, setRole] = useState<ThreadRole | null>(null);
  const [request, setRequest] = useState<ThreadRequest | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passed, setPassed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const sendingRef = useRef(false);

  trpc.profile.mine.useQuery(undefined, { enabled: Boolean(isSignedIn) && role === "seeker", retry: false, staleTime: 60_000 });
  // The signed-in account, the same auth.me the auth layer already holds: the
  // referrer goal page offers a decision on a pending ask only when the ask is
  // unassigned or assigned to this account (#831 F1).
  // A partial tRPC client (the share-win harness) has no auth router; the
  // client is fixed for the module's lifetime, so the hook order never changes.
  const authMe = (trpc as { auth?: typeof trpc.auth }).auth?.me;
  const me = authMe?.useQuery(undefined, { enabled: Boolean(isSignedIn) && role !== null && role !== "seeker", retry: false, staleTime: 60_000 });
  const meId = (me?.data as { id?: unknown } | null | undefined)?.id;
  const viewerId: number | null | undefined = typeof meId === "number" ? meId : me?.data === null ? null : undefined;

  const reload = useCallback(async () => {
    if (!isSignedIn || !validId) return;
    setLoading(true); setError("");
    try {
      const thread = await loadThread(requestId, fetchToken);
      setRole(thread.role); setRequest(thread.request);
      if (!canMessage(thread.role, thread.request)) { setMessages([]); return; }
      try {
        const conversation = await loadConversation(requestId, fetchToken);
        setMessages(conversation.messages); setReferenceId(conversation.referenceId);
        setMessageError("");
      } catch (reason) { setMessageError(errorText(reason, "We could not load these private messages")); }
    } catch (reason) { setError(errorText(reason, "We could not open this private thread")); }
    finally { setLoading(false); }
  }, [fetchToken, isSignedIn, requestId, validId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!isSignedIn) return <ConversationSignInGate returnPath={returnPath} />;

  const send = async () => {
    const body = draft.trim();
    if (!body || sendingRef.current || !request) return;
    sendingRef.current = true; setSending(true); setMessageError("");
    try {
      await sendConversationMessage(request.id, body, fetchToken);
      setDraft("");
      setMessages((await loadConversation(request.id, fetchToken)).messages);
    } catch (reason) { setMessageError(errorText(reason, "We could not send this private message")); }
    finally { sendingRef.current = false; setSending(false); }
  };

  const failure = validId ? error : "This private thread link is invalid.";
  // Names are revealed only after the referrer accepts: the referrer sees their own name, the seeker the name the server returns (never before accept).
  const seekerSeesReferrer = request && role === "seeker" && isAccepted(request) && request.referrerName && !request.referrerName.includes("@") ? (request.referrerTitle ? `${request.referrerName} · ${request.referrerTitle}` : request.referrerName) : null;
  // Both sides use the released goal pages. Preserve the seeker loading frame
  // until the server response identifies which side owns this thread.
  if (role === null || role === "seeker") {
    return (
      <SeekerConversation
        request={request}
        failure={failure}
        loading={loading}
        onReload={() => { void reload(); }}
        returnPath={returnPath}
        referrerLabel={seekerSeesReferrer ?? "Referrer"}
        referrerName={seekerSeesReferrer}
        messages={messages}
        messageError={messageError}
        referenceId={referenceId}
        canMessage={Boolean(request) && canMessage("seeker", request!)}
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        onSend={() => { void send(); }}
        onWithdraw={async () => { await withdrawThreadRequest(request!.id, fetchToken); await reload(); }}
        onProgress={async status => { await recordProgress(request!.id, status, fetchToken); await reload(); }}
        onConfirmReferredEmail={async () => { await confirmReferredBySeeker(request!.id, fetchToken); await reload(); }}
        extra={request && isAccepted(request) ? <div className="mt-6"><ShareWinCard roleTitle={request.title} companyName={companyName(request)} status={request.status} /></div> : null}
      />
    );
  }

  return (
      <ReferrerConversation
        request={request}
        role={role}
        viewerId={viewerId}
        failure={failure}
        loading={loading}
        onReload={() => { void reload(); }}
        returnPath={returnPath}
        passed={passed}
        ownName={request && isAccepted(request) ? user?.fullName ?? null : null}
        messages={messages}
        messageError={messageError}
        referenceId={referenceId}
        canMessage={Boolean(request) && canMessage(role, request!)}
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        onSend={() => { void send(); }}
        onAccept={async () => { await decideReview(request!.id, "approved", undefined, fetchToken); await reload(); }}
        onPass={async (reason, passReason) => { await decideReview(request!.id, "declined", reason, fetchToken, passReason); setPassed(true); }}
        onMarkReferred={async reference => { await recordProgress(request!.id, "intro_made", fetchToken, reference); await reload(); }}
        onExtendReferredDeadline={async () => { await extendReferredDeadline(request!.id, fetchToken); await reload(); }}
        onStepBack={async () => { await stepBackFromReferral(request!.id, fetchToken); await reload(); }}
      />
  );
}
