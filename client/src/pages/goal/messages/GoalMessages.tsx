// Goal /messages (D-048-p3-messages; packet docs/plans/D-048-account.md).
// Same calls and send path as the kit page: GET /api/dms/threads, GET and
// POST /api/dms/threads/:id with the idempotent pending-send record
// (lib/idempotentSend, read-only). The pre-acceptance lock is the server's:
// a parsed sendBlock (on open, or a 403 on send) replaces the composer with
// the rule in the server's own words; nothing on the client guesses it. A
// failed load renders its error with a retry, never an empty inbox.
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, CircleAlert, LockKeyhole, Send, UserPlus } from "lucide-react";
import { DM_REFERRER_ACCEPTANCE_ERROR, parseDmFollowRequired, parseDmSendBlock, type DmFollowRequired, type DmSendBlock } from "@shared/directMessages";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep, GoalNum, useOnlineStatus } from "@/components/goal";
import { readApiJson } from "@/lib/apiResponse";
import { DM_SEND_WORKFLOW, beginPendingSend, clearPendingSend, normalizeMessageBody, readPendingSend } from "@/lib/idempotentSend";

type DmThreadSummary = { counterpartUserId: number; counterpartLabel: string; lastMessageBody: string; lastMessageIsMine: boolean; lastMessageAt: string; unreadCount: number };
type DmThreadMessage = { id: number; body: string; createdAt: string; isMine: boolean };
type DmThread = { counterpartUserId: number; counterpartLabel: string; messages: DmThreadMessage[] };

export const GOAL_PAGE = { goalLine: "Your chats." } as const;
const LIST_ERROR = "We could not load your direct messages";
const OPEN_ERROR = "We could not open this conversation";
const SEND_ERROR = "We could not send this direct message";
const NETWORK_ERROR = "We could not reach skipwait.me. Check your connection and try again.";

function relativeTime(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** A chat waits on you when it has unread messages or the other person spoke last. */
const waitingOnYou = (item: DmThreadSummary) => item.unreadCount > 0 || !item.lastMessageIsMine;

/** Waiting chats first, each group in the server's order (stable). */
export function orderChats(threads: readonly DmThreadSummary[]): DmThreadSummary[] {
  return [...threads.filter(waitingOnYou), ...threads.filter(item => !waitingOnYou(item))];
}

function Alert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 border border-g-hairline p-4">
      <p className="flex items-start gap-2 text-g-label text-g-ink"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{message}</p>
      {onRetry ? <GoalButton className="mt-3" size="sm" variant="outline" onClick={onRetry}>Try again</GoalButton> : null}
    </div>
  );
}

function OfflineNotice() {
  return (
    <p data-testid="goal-offline-state" role="status" className="mt-3 flex items-center gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-ink" />
      You're offline. Messages can't be sent until you reconnect.
    </p>
  );
}

/** The server's acceptance rule in place of a composer (kit ReferrerRuleCard behaviour). */
function AcceptanceRule({ block, unsent }: { block: DmSendBlock; unsent: string }) {
  const isReferrer = block.senderRole === "referrer";
  return (
    <section data-testid="goal-dm-rule" role="status" aria-labelledby="goal-dm-rule-title" className="border border-g-hairline p-4 gdesk:p-5">
      <h2 id="goal-dm-rule-title" className="flex items-center gap-2 text-g-heading text-g-ink"><LockKeyhole aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} />Messages open after acceptance</h2>
      <p className="mt-2 text-g-meta text-g-ink-2">{block.error} No plan or follow changes this.</p>
      {unsent ? (
        <div data-testid="goal-dm-unsent" className="mt-3">
          <p className="text-g-meta text-g-ink-2">Not sent. Copy your text if you want to keep it; it clears when you leave this chat.</p>
          <p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-g-control border border-g-hairline px-3 py-2.5 text-g-body text-g-ink">{unsent}</p>
        </div>
      ) : null}
      <div className="mt-4">
        <GoalButton variant="primary" touch="large" asChild><Link href={isReferrer ? "/inbox" : "/requests"}>{isReferrer ? "Open my company inbox" : "Go to My requests"}</Link></GoalButton>
      </div>
    </section>
  );
}

function FollowRule({ rule }: { rule: DmFollowRequired }) {
  return (
    <div data-testid="goal-dm-follow-rule" role="status" className="mb-3 border border-g-hairline p-4">
      <p className="flex items-center gap-2 text-g-label text-g-ink"><UserPlus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />Follow each other to message</p>
      <p className="mt-1 text-g-meta text-g-ink-2">{rule.error}</p>
    </div>
  );
}

function ChatRow({ item, onOpen }: { item: DmThreadSummary; onOpen: () => void }) {
  const waiting = waitingOnYou(item);
  return (
    <li data-testid="goal-chat-row">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover">
        <span aria-hidden="true" className={`row-span-2 size-(--g-dot) rounded-full ${waiting ? "bg-g-ink" : "border-[1.5px] border-g-control-edge"}`} />
        <span className="min-w-0 truncate text-g-label text-g-ink">{item.counterpartLabel}</span>
        <span className="justify-self-end whitespace-nowrap text-g-meta text-g-ink-3"><GoalNum>{relativeTime(item.lastMessageAt)}</GoalNum></span>
        <span className="col-span-2 min-w-0 truncate text-g-meta text-g-ink-2">
          {waiting ? <>Waiting on you{item.unreadCount > 0 ? <> · <GoalNum>{item.unreadCount}</GoalNum> unread</> : null} · </> : null}
          {item.lastMessageIsMine ? "you: " : ""}{item.lastMessageBody}
        </span>
      </button>
    </li>
  );
}

export default function GoalMessages() {
  const { isSignedIn, getToken } = useAuth();
  const online = useOnlineStatus();
  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [thread, setThread] = useState<DmThread | null>(null);
  const [openError, setOpenError] = useState<{ id: number; message: string } | null>(null);
  const [threadError, setThreadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [followRule, setFollowRule] = useState<DmFollowRequired | null>(null);
  const [sendBlock, setSendBlock] = useState<DmSendBlock | null>(null);
  const [unsent, setUnsent] = useState("");
  const composerRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  /** The conversation on screen, so a late answer for another one is not shown here. */
  const openCounterpartRef = useRef<number | null>(null);

  const authedFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    try {
      return await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    } catch { throw new Error(NETWORK_ERROR); }
  };

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setThreads(null); setListError("");
    void authedFetch("/api/dms/threads").then(async response => {
      const payload = await readApiJson<{ threads?: DmThreadSummary[]; error?: string }>(response, LIST_ERROR);
      if (!response.ok) throw new Error(payload.error || LIST_ERROR);
      if (active) setThreads(payload.threads ?? []);
    }).catch(reason => { if (active) setListError(reason instanceof Error ? reason.message : LIST_ERROR); });
    return () => { active = false; };
  }, [isSignedIn, listAttempt]);

  const resetChat = () => { setThreadError(""); setFollowRule(null); setSendBlock(null); setDraft(""); setUnsent(""); };

  const openThread = async (counterpartUserId: number) => {
    // A draft belongs to one conversation: never carry it into another.
    resetChat(); setOpenError(null);
    openCounterpartRef.current = counterpartUserId;
    try {
      const response = await authedFetch(`/api/dms/threads/${counterpartUserId}`);
      const payload = await readApiJson<{ thread?: DmThread; sendBlock?: unknown; error?: string }>(response, OPEN_ERROR);
      if (!response.ok) throw new Error(payload.error || OPEN_ERROR);
      if (openCounterpartRef.current !== counterpartUserId) return;
      setThread(payload.thread ?? null);
      setSendBlock(parseDmSendBlock(payload.sendBlock));
      const pending = readPendingSend(DM_SEND_WORKFLOW, { recipientKey: String(counterpartUserId) });
      if (pending) setDraft(current => (current === "" ? pending.body : current));
    } catch (reason) {
      if (openCounterpartRef.current === counterpartUserId) setOpenError({ id: counterpartUserId, message: reason instanceof Error ? reason.message : OPEN_ERROR });
    }
  };

  const closeThread = () => { openCounterpartRef.current = null; setThread(null); setOpenError(null); resetChat(); };

  const send = async () => {
    if (!thread || sending || inFlightRef.current || !online) return;
    const recipientUserId = thread.counterpartUserId;
    const normalized = normalizeMessageBody(draft);
    if (!normalized) return;
    inFlightRef.current = true;
    setSending(true); setThreadError(""); setFollowRule(null);
    try {
      const { record: attempt } = beginPendingSend({ workflow: DM_SEND_WORKFLOW, recipientKey: String(recipientUserId), body: normalized });
      const response = await authedFetch(`/api/dms/threads/${recipientUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.idempotencyKey },
        body: JSON.stringify({ body: normalized }),
      });
      const payload = await readApiJson<{ message?: { id?: number }; error?: string; retryAt?: string | number }>(response, SEND_ERROR);
      if (response.status === 201 || response.status === 200) {
        const acknowledgedId = typeof payload.message?.id === "number" ? payload.message.id : null;
        setThread(current => {
          if (!current || current.counterpartUserId !== recipientUserId) return current;
          if (acknowledgedId !== null && current.messages.some(message => message.id === acknowledgedId)) return current;
          return { ...current, messages: [...current.messages, { id: acknowledgedId ?? Date.now(), body: attempt.body, createdAt: new Date().toISOString(), isMine: true }] };
        });
        clearPendingSend(DM_SEND_WORKFLOW);
        if (openCounterpartRef.current === recipientUserId) { setDraft(""); composerRef.current?.focus(); }
        return;
      }
      const block = response.status === 403 ? parseDmSendBlock(payload) : null;
      if (block) {
        clearPendingSend(DM_SEND_WORKFLOW);
        if (openCounterpartRef.current === recipientUserId) { setUnsent(attempt.body); setDraft(""); setSendBlock(block); }
        return;
      }
      const memberRule = response.status === 403 ? parseDmFollowRequired(payload) : null;
      if (memberRule) { if (openCounterpartRef.current === recipientUserId) setFollowRule(memberRule); return; }
      if (response.status === 409) {
        clearPendingSend(DM_SEND_WORKFLOW);
        setThreadError("That send changed while retrying, so we kept your text and did not send a duplicate. Review it and send again to start a fresh attempt.");
        return;
      }
      if (response.status === 429) {
        const retryAt = payload.retryAt;
        const retryDate = typeof retryAt === "string" || typeof retryAt === "number" ? new Date(retryAt) : null;
        const suffix = retryDate && !Number.isNaN(retryDate.getTime()) ? ` Try again after ${retryDate.toLocaleString()}.` : " Try again in a few minutes.";
        setThreadError(`${payload.error || "You're sending messages too quickly."}${suffix}`);
        return;
      }
      throw new Error(payload.error || SEND_ERROR);
    } catch (reason) { setThreadError(reason instanceof Error ? reason.message : SEND_ERROR); }
    finally { inFlightRef.current = false; setSending(false); }
  };

  const shell = (children: React.ReactNode) => (
    <main data-skipwait-screen="messages" data-goal-page="messages" className="g-scope mx-auto flex w-full max-w-2xl flex-col bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-5 gdesk:py-7">
      {children}
    </main>
  );

  if (!isSignedIn) {
    return shell(<>
      <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">{DM_REFERRER_ACCEPTANCE_ERROR}</p>
      <div className="mt-5"><GoalNextStep reason="Sign in to see your messages.">
        <div className="mt-4"><SignInButton><GoalButton variant="primary" touch="large">Sign in</GoalButton></SignInButton></div>
      </GoalNextStep></div>
    </>);
  }

  if (thread) {
    return shell(<>
      <button type="button" onClick={closeThread} className="inline-flex min-h-11 items-center gap-1 self-start text-g-meta text-g-ink-2 hover:text-g-ink"><ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />All chats</button>
      <h1 className="mt-2 text-g-heading text-g-ink">{thread.counterpartLabel}</h1>
      {!online ? <OfflineNotice /> : null}
      <ol aria-label="Messages" className="mt-4 grid gap-2 pb-4" data-skipwait-thread="open">
        {thread.messages.map(message => (
          <li key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-g-tile px-3.5 py-2.5 text-g-body ${message.isMine ? "bg-g-primary text-g-on-primary" : "border border-g-hairline text-g-ink"}`}>
              {message.body}
            </p>
          </li>
        ))}
      </ol>
      {followRule ? <FollowRule rule={followRule} /> : null}
      {threadError ? <p role="alert" className="mb-3 flex items-start gap-2 text-g-meta text-g-crimson"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{threadError}</p> : null}
      {sendBlock ? <AcceptanceRule block={sendBlock} unsent={unsent} /> : (
        <form className="sticky bottom-0 flex items-center gap-2 border-t border-g-hairline bg-g-canvas pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="goal-dm-draft">Message</label>
          <input ref={composerRef} id="goal-dm-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message" maxLength={3000}
            className="h-12 min-w-0 flex-1 rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3" />
          <GoalButton type="submit" variant="primary" touch="large" aria-label="Send message" busy={sending}
            disabledReason={!online ? "You're offline" : draft.trim() === "" ? "Write a message first" : undefined}><Send aria-hidden="true" className="size-4" strokeWidth={1.75} /></GoalButton>
        </form>
      )}
    </>);
  }

  const ordered = threads ? orderChats(threads) : [];
  const next = ordered.find(waitingOnYou) ?? null;
  return shell(<>
    <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
    <p className="mt-2 text-g-meta text-g-ink-2">{DM_REFERRER_ACCEPTANCE_ERROR} Referral-request conversations stay in <Link href="/requests" className="text-g-ink underline underline-offset-[3px] hover:no-underline">My requests</Link>.</p>
    {!online ? <OfflineNotice /> : null}

    {openError ? <Alert message={openError.message} onRetry={() => { void openThread(openError.id); }} /> : null}

    {listError ? <Alert message={listError} onRetry={() => setListAttempt(count => count + 1)} /> : threads === null ? (
      <div className="mt-6" aria-busy="true">
        <p role="status" className="text-g-meta text-g-ink-2">Loading your chats…</p>
        <div aria-hidden="true" className="mt-3 grid gap-2"><div className="h-14 rounded-g-tile bg-g-surface-hover" /><div className="h-14 rounded-g-tile bg-g-surface-hover" /></div>
      </div>
    ) : ordered.length === 0 ? (
      <div className="mt-5"><GoalNextStep reason="A referrer can message you once they accept your referral request.">
        <p className="mt-3 text-g-label text-g-ink">No chats yet.</p>
        <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/ask">Ask for a referral</Link></GoalButton></div>
      </GoalNextStep></div>
    ) : (<>
      <div className="mt-5"><GoalNextStep reason={next ? "This chat is waiting on you." : "No one is waiting on you right now."}>
        {next ? <>
          <p className="mt-2 text-g-label text-g-ink">{next.counterpartLabel}</p>
          <p className="mt-1 truncate text-g-meta text-g-ink-2">{next.lastMessageBody}</p>
          <div className="mt-4"><GoalButton variant="primary" touch="large" onClick={() => { void openThread(next.counterpartUserId); }}>{`Reply to ${next.counterpartLabel}`}</GoalButton></div>
        </> : <div className="mt-4"><GoalButton variant="primary" touch="large" asChild><Link href="/requests">Go to My requests</Link></GoalButton></div>}
      </GoalNextStep></div>
      <ul aria-label="Chats" className="mt-4" data-skipwait-thread-list="open">
        {ordered.map(item => <ChatRow key={item.counterpartUserId} item={item} onOpen={() => { void openThread(item.counterpartUserId); }} />)}
      </ul>
    </>)}
  </>);
}
