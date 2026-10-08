import { ArrowLeft, BadgeCheck, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { SignInButton, useAuth, useUser } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { ReferrerPanel, SeekerPanel } from "@/components/thread/ThreadDecisionPanels";
import { ThreadMain } from "@/components/thread/ThreadMain";
import { canMessage, companyName, isAccepted } from "@/components/thread/threadModel";
import { usePersistFn } from "@/hooks/usePersistFn";
import { decideReview, loadConversation, loadThread, recordProgress, sendConversationMessage, withdrawThreadRequest, type ThreadMessage, type ThreadRequest, type ThreadRole } from "@/lib/threadApi";
import { trpc } from "@/lib/trpc";

const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/**
 * The claimed-detail endpoint omits the role title and pitch. Keep what this
 * session already loaded for the same request (e.g. the preview right before
 * accepting) instead of blanking the thread after a state change.
 */
function keepKnown(previous: ThreadRequest | null, next: ThreadRequest): ThreadRequest {
  if (!previous || previous.id !== next.id) return next;
  return { ...next, title: next.title ?? previous.title, pitch: next.pitch ?? previous.pitch, targetRoleUrl: next.targetRoleUrl ?? previous.targetRoleUrl };
}

export default function ReferralConversation() {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passed, setPassed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messageError, setMessageError] = useState("");
  const lastRequest = useRef<ThreadRequest | null>(null);
  const sendingRef = useRef(false);

  const profile = trpc.profile.mine.useQuery(undefined, { enabled: Boolean(isSignedIn) && role === "seeker", retry: false, staleTime: 60_000 });

  const reload = useCallback(async () => {
    if (!isSignedIn || !validId) return;
    setLoading(true); setError("");
    try {
      const thread = await loadThread(requestId, fetchToken);
      const next = keepKnown(lastRequest.current, thread.request);
      lastRequest.current = next;
      setRole(thread.role); setRequest(next);
      if (!canMessage(thread.role, next)) { setMessages([]); return; }
      try {
        setMessages((await loadConversation(requestId, fetchToken)).messages);
        setMessageError("");
      } catch (reason) { setMessageError(errorText(reason, "We could not load these private messages")); }
    } catch (reason) { setError(errorText(reason, "We could not open this private thread")); }
    finally { setLoading(false); }
  }, [fetchToken, isSignedIn, requestId, validId]);

  useEffect(() => { void reload(); }, [reload]);

  const back = <Link href={returnPath} className="text-link flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />All requests</Link>;

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referral-conversation-sign-in" className="page-content">
        {back}
        <section className="mt-6 max-w-xl">
          <h1 className="text-3xl font-semibold">Continue securely.</h1>
          <p className="mt-3 text-sm text-muted-foreground">Sign in to access your accepted referral conversation.</p>
          <div className="mt-6"><SignInButton><button type="button" className={buttonVariants({ className: "w-full sm:w-auto" })}>Secure sign in</button></SignInButton></div>
        </section>
      </main>
    );
  }

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
  // The seeker is never told who the referrer is; a referrer who accepted sees their own name here.
  const referrerLabel = request && role !== "seeker" && isAccepted(request) && user?.fullName ? user.fullName : request ? `Someone at ${companyName(request.companyDomain)}` : "";

  return (
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
              <span className="eyebrow">{role === "seeker" ? "YOUR NEXT STEP" : "YOUR DECISION"}</span>
              {role === "seeker" ? (
                <SeekerPanel
                  request={request}
                  onWithdraw={async () => { await withdrawThreadRequest(request.id, fetchToken); await reload(); }}
                  onProgress={async status => { await recordProgress(request.id, status, fetchToken); await reload(); }}
                />
              ) : (
                <ReferrerPanel
                  request={request}
                  role={role}
                  passed={passed}
                  returnPath={returnPath}
                  onAccept={async () => { await decideReview(request.id, "approved", undefined, fetchToken); await reload(); }}
                  // A pass leaves the request in the queue for other verified
                  // employees and out of this referrer's reach, so there is
                  // nothing further to reload for this account.
                  onPass={async reason => { await decideReview(request.id, "declined", reason, fetchToken); setPassed(true); }}
                  onMarkReferred={async () => { await recordProgress(request.id, "intro_made", fetchToken); await reload(); }}
                />
              )}
            </div>
            <div className="rounded-3xl bg-muted p-5 text-sm">
              <span className="eyebrow">REFERRER</span>
              <p className="mt-2 flex items-center gap-2 font-medium">{referrerLabel}<BadgeCheck className="size-4 text-primary" /></p>
              <p className="text-muted-foreground">Verified via work email</p>
            </div>
            <div className="rounded-3xl border border-border p-5 text-sm text-muted-foreground">
              <ShieldCheck className="mb-2 size-5 text-primary" />Referrals are free. Never pay or accept money for a referral. <Link href="/report" className="text-link">Report or block</Link>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
