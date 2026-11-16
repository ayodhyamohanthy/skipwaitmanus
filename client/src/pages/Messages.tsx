import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, MessageSquare, Send, UserPlus } from "lucide-react";
import { DM_REFERRER_ACCEPTANCE_ERROR, parseDmFollowRequired, parseDmSendBlock, type DmFollowRequired, type DmSendBlock } from "@shared/directMessages";
import { SignInButton, useAuth } from "@/_core/auth";
import { buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { ReferrerRuleCard } from "@/components/messages/ReferrerRuleCard";
import { readApiJson } from "@/lib/apiResponse";
import { goalSurfaceOn } from "@/lib/goalSurfaces";
import {
  DM_SEND_WORKFLOW,
  beginPendingSend,
  clearPendingSend,
  normalizeMessageBody,
  readPendingSend,
} from "@/lib/idempotentSend";
import { FollowButton } from "@/components/FollowButton";

type DmThreadSummary = { counterpartUserId: number; counterpartLabel: string; lastMessageBody: string; lastMessageIsMine: boolean; lastMessageAt: string; unreadCount: number };
type DmThreadMessage = { id: number; body: string; createdAt: string; isMine: boolean };
type DmThread = { counterpartUserId: number; counterpartLabel: string; messages: DmThreadMessage[] };

function relativeTime(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// After a 403 the composer is replaced by the rule, so the refused text is
// shown read-only (copyable) instead of staying in a hidden draft that the
// next conversation's composer would inherit.
function UnsentText({ text }: { text: string }) {
  return <div data-skipwait-unsent="draft" className="mt-3">
    <p className="text-xs font-semibold text-[#505050]">Not sent. Copy your text if you want to keep it; it clears when you leave this chat.</p>
    <p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm leading-6 text-black">{text}</p>
  </div>;
}

// A member writing to another member (neither a verified referrer) with no
// chat yet needs a mutual follow; no plan opens it (D-067), so there is no
// upgrade path. The composer and the draft stay for when they follow each other.
function FollowRuleCard({ rule }: { rule: DmFollowRequired }) {
  return <div data-skipwait-screen="dm-follow-rule" role="status" className="pb-2">
    <Panel tone="muted">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-background text-foreground"><UserPlus className="h-5 w-5" aria-hidden="true" /></span>
      <h2 className="mt-4 text-xl font-semibold tracking-[-.02em] text-foreground">Follow each other to message</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{rule.error}</p>
    </Panel>
  </div>;
}

// Goal-UI migration (D-048-p3-messages): the goal page replaces this one when
// the "messages" surface flag is on; off, the kit page below is unchanged.
const GoalMessages = lazy(() => import("./goal/messages/GoalMessages"));

export default function Messages() {
  if (goalSurfaceOn("messages")) return <Suspense fallback={null}><GoalMessages /></Suspense>;
  const { isSignedIn, getToken } = useAuth();
  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [thread, setThread] = useState<DmThread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [listError, setListError] = useState("");
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
    return fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };

  useEffect(() => {
    if (!isSignedIn) { setThreads([]); return; }
    let active = true;
    void authedFetch("/api/dms/threads").then(async response => {
      const payload = await readApiJson<{ threads?: DmThreadSummary[]; error?: string }>(response, "We could not load your direct messages");
      if (!response.ok) throw new Error(payload.error || "We could not load your direct messages");
      if (active) setThreads(payload.threads ?? []);
    }).catch(reason => { if (active) { setListError(reason instanceof Error ? reason.message : "We could not load your direct messages"); setThreads([]); } });
    return () => { active = false; };
  }, [isSignedIn]);

  const openThread = async (counterpartUserId: number) => {
    // A draft belongs to one conversation: never carry it into another.
    setThreadError(""); setFollowRule(null); setSendBlock(null); setDraft(""); setUnsent("");
    openCounterpartRef.current = counterpartUserId;
    try {
      const response = await authedFetch(`/api/dms/threads/${counterpartUserId}`);
      const payload = await readApiJson<{ thread?: DmThread; sendBlock?: unknown; error?: string }>(response, "We could not open this conversation");
      if (!response.ok) throw new Error(payload.error || "We could not open this conversation");
      setThread(payload.thread ?? null);
      setSendBlock(parseDmSendBlock(payload.sendBlock));
      const pending = readPendingSend(DM_SEND_WORKFLOW, { recipientKey: String(counterpartUserId) });
      if (pending) setDraft(current => (current === "" ? pending.body : current));
    } catch (reason) { setThreadError(reason instanceof Error ? reason.message : "We could not open this conversation"); }
  };

  const send = async () => {
    if (!thread || sending || inFlightRef.current) return;
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
      const payload = await readApiJson<{ message?: { id?: number }; error?: string; retryAt?: string | number }>(response, "We could not send this direct message");
      if (response.status === 201 || response.status === 200) {
        const acknowledgedId = typeof payload.message?.id === "number" ? payload.message.id : null;
        setThread(current => {
          if (!current || current.counterpartUserId !== recipientUserId) return current;
          if (acknowledgedId !== null && current.messages.some(message => message.id === acknowledgedId)) return current;
          return { ...current, messages: [...current.messages, { id: acknowledgedId ?? Date.now(), body: attempt.body, createdAt: new Date().toISOString(), isMine: true }] };
        });
        clearPendingSend(DM_SEND_WORKFLOW);
        setDraft("");
        composerRef.current?.focus();
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
      throw new Error(payload.error || "We could not send this direct message");
    } catch (reason) { setThreadError(reason instanceof Error ? reason.message : "We could not send this direct message"); }
    finally { inFlightRef.current = false; setSending(false); }
  };

  if (!isSignedIn) return <main data-skipwait-screen="messages" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex min-h-0 flex-1 flex-col justify-center gap-5"><h1 className="text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">Direct messages</h1><Panel tone="muted"><h2 className="text-xl font-semibold tracking-[-.02em] text-foreground">Sign in to see your messages</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{DM_REFERRER_ACCEPTANCE_ERROR}</p><SignInButton className={buttonVariants({ className: "mt-4 h-11 w-full" })}>Sign in</SignInButton></Panel></section></div></main>;

  return <main data-skipwait-screen="messages" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col">
    <header className="flex h-10 shrink-0 items-center justify-between">{thread ? <button type="button" onClick={() => { openCounterpartRef.current = null; setThread(null); setThreadError(""); setFollowRule(null); setSendBlock(null); setDraft(""); setUnsent(""); }} className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />All chats</button> : <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</Link>}</header>
    {thread ? <section className="flex min-h-0 flex-1 flex-col">
      <h1 className="pt-4 text-lg font-semibold tracking-[-.02em] text-black">{thread.counterpartLabel}</h1>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-3" data-skipwait-thread="open">
        {thread.messages.map(message => <div key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}><p className={`${message.isMine ? "bg-[#141414] text-white" : "bg-white text-black border border-[#e5e5e5]"} max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-6`}>{message.body}</p></div>)}
      </div>
      {followRule ? <FollowRuleCard rule={followRule} /> : null}
      {threadError && <p role="alert" className="pb-2 text-xs font-semibold text-[#B91C1C]">{threadError}</p>}
      {sendBlock ? <div className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"><ReferrerRuleCard block={sendBlock} />{unsent ? <UnsentText text={unsent} /> : null}</div> : <footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="dm-draft">Message</label>
          <input ref={composerRef} id="dm-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message" maxLength={3000} className="h-11 flex-1 rounded-lg border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none focus:border-[#141414] focus:bg-[#f5f5f5]/40" />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#141414] text-white"><Send className="h-4 w-4" /></button>
        </form>
      </footer>}
    </section> : <section className="flex min-h-0 flex-1 flex-col pt-4">
      {listError && <p role="alert" className="pb-3 text-xs font-semibold text-[#B91C1C]">{listError}</p>}
      {threads === null ? <div className="h-24 animate-pulse rounded-xl border border-[#e5e5e5] bg-white" /> : threads.length === 0 ? <div className="flex flex-1 flex-col justify-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f5f5f5] text-black"><MessageSquare className="h-7 w-7" /></span>
        <h1 className="mt-5 text-[2rem] font-semibold leading-[1] tracking-[-.02em]">Your chats live here.</h1>
        <p className="mt-3 text-sm leading-6 text-[#505050]">Messages with a referrer open after they accept your request. Referral-request conversations stay in <Link href="/requests" className="font-semibold text-black underline-offset-2 hover:underline">My requests</Link>.</p>
        <Link href="/ask" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-4 py-3 text-sm font-bold text-white">Ask for a referral <ArrowRight className="h-4 w-4" /></Link>
      </div> : <ul className="min-h-0 flex-1 divide-y divide-[#e5e5e5] overflow-y-auto" data-skipwait-thread-list="open">
        {threads.map(item => <li key={item.counterpartUserId}><button type="button" onClick={() => { void openThread(item.counterpartUserId); }} className="flex w-full items-start gap-3 py-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f5f5f5] text-black"><MessageSquare className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-bold text-black">{item.counterpartLabel}</span><span className="shrink-0 text-[11px] text-[#505050]">{relativeTime(item.lastMessageAt)}</span></span>
            <span className="mt-0.5 flex items-center justify-between gap-2"><span className="truncate text-sm text-[#505050]">{item.lastMessageIsMine ? "you: " : ""}{item.lastMessageBody}</span>{item.unreadCount > 0 && <span aria-label={`${item.unreadCount} unread`} className="h-2 w-2 shrink-0 rounded-full bg-[#141414]" />}</span>
          </span>
        </button></li>)}
      </ul>}
    </section>}
  </div></main>;
}
