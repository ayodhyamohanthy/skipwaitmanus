import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { ReferrerPanel } from "@/components/thread/ThreadDecisionPanels";
import { ThreadMain } from "@/components/thread/ThreadMain";
import { AppShell } from "@/components/AppShell";
import { ConversationSignInGate, SeekerConversation } from "./conversation/SeekerConversation";
import { ReferrerConversation } from "./conversation/ReferrerConversation";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import { ShareWinCard } from "@/components/thread/ShareWinCard";
import { canMessage, companyName, isAccepted } from "@/components/thread/threadModel";
import { usePersistFn } from "@/hooks/usePersistFn";
import { authedFetch, decideReview, confirmReferredBySeeker, extendReferredDeadline, loadConversation, loadThread, recordProgress, sendConversationMessage, stepBackFromReferral, withdrawThreadRequest, type ThreadMessage, type ThreadRequest, type ThreadRole } from "@/lib/threadApi";
import { trpc } from "@/lib/trpc";

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

export default function ReferralConversation({ framed = false }: { framed?: boolean } = {}) {
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

  const profile = trpc.profile.mine.useQuery(undefined, { enabled: Boolean(isSignedIn) && role === "seeker", retry: false, staleTime: 60_000 });
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
      // #831 F2: the unclaimed preview answers first even for an ask allocated
      // to this referrer, and it carries no decision-due time. On the goal page
      // the claimed detail (which only ever serves an ask assigned to this
      // account) supplies the server's decisionDueAt; a 404 means unassigned.
      if (goalSurfaceOn("conversation") && thread.role === "referrer-pending" && !thread.request.decisionDueAt) {
        try {
          const detail = (await authedFetch(`/api/company-referrals/${requestId}`, fetchToken)).request as { status?: unknown; referrerId?: unknown; decisionDueAt?: unknown } | undefined;
          if (detail && detail.status === "pending" && typeof detail.referrerId === "number") {
            thread.request = { ...thread.request, referrerId: detail.referrerId, decisionDueAt: typeof detail.decisionDueAt === "string" ? detail.decisionDueAt : null };
          }
        } catch { /* not assigned to this account: the preview stands */ }
      }
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

  const back = <Link href={returnPath} className="text-link flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />All requests</Link>;

  const wrap = (node: React.ReactElement) => (framed ? <AppShell>{node}</AppShell> : node);

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
  const seekerName = user?.fullName ?? null;
  const headline = profile.data?.headline ?? profile.data?.currentTitle ?? null;
  // Names are revealed only after the referrer accepts: the referrer sees their own name, the seeker the name the server returns (never before accept).
  const seekerSeesReferrer = request && role === "seeker" && isAccepted(request) && request.referrerName && !request.referrerName.includes("@") ? (request.referrerTitle ? `${request.referrerName} · ${request.referrerTitle}` : request.referrerName) : null;
  const referrerLabel = seekerSeesReferrer ?? (request && isAccepted(request) && user?.fullName ? user.fullName : request ? `Someone at ${companyName(request)}` : "");

  // The seeker's side is a goal page (W2). While the role is still loading the
  // seeker frame shows, since the seeker is by far the common viewer; referrers
  // keep the kit page until W4.
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

  // The referrer's side is the goal page behind goalSurfaceOn("conversation")
  // (D-048-p3-conversation); off, it stays the kit page below unchanged.
  if (goalSurfaceOn("conversation")) {
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

  return wrap(
    <main data-skipwait-screen="referral-conversation" className="page-content">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{back}</div>
      {loading && !request ? <p className="mt-10 text-center text-sm text-muted-foreground">Opening this private thread…</p> : null}
      {failure && !request ? (
        <section className="mx-auto mt-10 max-w-xl text-center">
          <h1 className="text-2xl font-semibold">This thread isn&apos;t available.</h1>
          <p role="alert" className="mt-2 text-sm text-muted-foreground">{failure}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {validId ? <Button onClick={() => { void reload(); }} disabled={loading}>Try again</Button> : null}
            <Button variant={validId ? "ghost" : "default"} asChild><Link href={returnPath}>Back to requests</Link></Button>
          </div>
        </section>
      ) : null}
      {failure && request ? (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted p-4 text-sm">
          <span>{failure}</span>
          <Button variant="ghost" size="sm" onClick={() => { void reload(); }} disabled={loading}>Try again</Button>
        </div>
      ) : null}
      {request && role ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ThreadMain
            request={request}
            role={role}
            seekerIdentity={{ name: seekerName, headline }}
            passed={passed}
            messages={messages}
            draft={draft}
            setDraft={setDraft}
            sending={sending}
            sendError={messageError}
            onSend={() => { void send(); }}
          />
          <aside className="space-y-4">
            <div className="rounded-3xl border border-border p-5">
              <span className="eyebrow">YOUR DECISION</span>
              {(
                <ReferrerPanel
                  request={request}
                  role={role}
                  passed={passed}
                  returnPath={returnPath}
                  onAccept={async () => { await decideReview(request.id, "approved", undefined, fetchToken); await reload(); }}
                  // A pass leaves the request in the queue for other verified
                  // employees and out of this referrer's reach, so there is
                  // nothing further to reload for this account.
                  onPass={async (reason, passReason) => { await decideReview(request.id, "declined", reason, fetchToken, passReason); setPassed(true); }}
                  onMarkReferred={async reference => { await recordProgress(request.id, "intro_made", fetchToken, reference); await reload(); }}
                  onExtendReferredDeadline={async () => { await extendReferredDeadline(request.id, fetchToken); await reload(); }}
                  onStepBack={async () => { await stepBackFromReferral(request.id, fetchToken); await reload(); }}
                />
              )}
            </div>
            <div className="rounded-3xl bg-muted p-5 text-sm">
              <span className="eyebrow">REFERRER</span>
              <p className="mt-2 flex items-center gap-2 font-medium">{referrerLabel}<BadgeCheck className="size-4 text-primary" /></p>
              <p className="text-muted-foreground">Verified via work email</p>
              {referenceId ? <p className="mt-2 font-medium">Referred! Reference ID {referenceId}</p> : null}
            </div>
            <div className="rounded-3xl border border-border p-5 text-sm text-muted-foreground">
              <ShieldCheck className="mb-2 size-5 text-primary" />Referrers are never paid and never ask for money. Never pay or accept money for a referral. <Link href="/report" className="text-link">Report or block</Link>
            </div>
          </aside>
        </div>
      ) : null}
    </main>,
  );
}
