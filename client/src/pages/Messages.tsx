import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Crown, MessageSquare, Send } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { readApiJson } from "@/lib/apiResponse";
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

function PaywallCard() {
  return <div data-skipwait-screen="dm-paywall" className="rounded-xl border border-[#DBEAFE] bg-[#E8F0FE]/70 p-5">
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#191713]"><Crown className="h-5 w-5" /></span>
    <h2 className="mt-4 text-xl font-semibold tracking-[-.02em] text-[#191713]">Direct messaging is for members</h2>
    <p className="mt-2 text-sm leading-6 text-[#191713]">Pro members can message verified referrers directly and get answers faster. Pro includes 10 referral credits monthly — the core referral loop stays free for everyone. Or follow each other to message free — many referrers follow back.</p>
    <Link href="/premium?role=job_seeker" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white">Upgrade to Pro</Link>
  </div>;
}

export default function Messages() {
  const { isSignedIn, getToken } = useAuth();
  const [location, navigate] = useLocation();
  const [threads, setThreads] = useState<DmThreadSummary[] | null>(null);
  const [thread, setThread] = useState<DmThread | null>(null);
  const [threadError, setThreadError] = useState("");
  const [listError, setListError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [paywalled, setPaywalled] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);

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
    setThreadError(""); setPaywalled(false);
    try {
      const response = await authedFetch(`/api/dms/threads/${counterpartUserId}`);
      const payload = await readApiJson<{ thread?: DmThread; error?: string }>(response, "We could not open this conversation");
      if (!response.ok) throw new Error(payload.error || "We could not open this conversation");
      setThread(payload.thread ?? null);
    } catch (reason) { setThreadError(reason instanceof Error ? reason.message : "We could not open this conversation"); }
  };

  const send = async () => {
    if (!thread || !draft.trim() || sending) return;
    setSending(true); setThreadError(""); setPaywalled(false);
    try {
      const response = await authedFetch(`/api/dms/threads/${thread.counterpartUserId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }) });
      const payload = await readApiJson<{ message?: { id: number }; error?: string }>(response, "We could not send this direct message");
      if (response.status === 402) { setPaywalled(true); setDraft(""); return; }
      if (!response.ok) throw new Error(payload.error || "We could not send this direct message");
      setThread(current => current ? { ...current, messages: [...current.messages, { id: payload.message?.id ?? Date.now(), body: draft.trim(), createdAt: new Date().toISOString(), isMine: true }] } : current);
      setDraft("");
      composerRef.current?.focus();
    } catch (reason) { setThreadError(reason instanceof Error ? reason.message : "We could not send this direct message"); }
    finally { setSending(false); }
  };

  if (!isSignedIn) return <main data-skipwait-screen="messages" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-[#625D52]"><ArrowLeft className="h-4 w-4" />Back</Link></header><section className="flex min-h-0 flex-1 flex-col justify-center gap-5"><h1 className="text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">Direct messages</h1><PaywallCard /></section></div></main>;

  return <main data-skipwait-screen="messages" className="h-dvh min-h-dvh overflow-hidden bg-[#F5F4EF] px-5 py-4 text-[#191713]"><div className="mx-auto flex h-full max-w-xl flex-col">
    <header className="flex h-10 shrink-0 items-center justify-between">{thread ? <button type="button" onClick={() => { setThread(null); setThreadError(""); setPaywalled(false); }} className="inline-flex items-center gap-1 text-sm font-bold text-[#625D52]"><ArrowLeft className="h-4 w-4" />All chats</button> : <Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-[#625D52]"><ArrowLeft className="h-4 w-4" />Back</Link>}{!thread && <button type="button" onClick={() => navigate("/wall")} className="text-sm font-bold text-[#191713]">New chat</button>}</header>
    {thread ? <section className="flex min-h-0 flex-1 flex-col">
      <h1 className="pt-4 text-lg font-semibold tracking-[-.02em] text-[#191713]">{thread.counterpartLabel}</h1>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-3" data-skipwait-thread="open">
        {thread.messages.map(message => <div key={message.id} className={`flex ${message.isMine ? "justify-end" : "justify-start"}`}><p className={`${message.isMine ? "bg-[#191713] text-white" : "bg-white text-[#191713] border border-[#E2DDD2]"} max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-6`}>{message.body}</p></div>)}
      </div>
      {paywalled && <PaywallCard />}
      {threadError && <p role="alert" className="pb-2 text-xs font-semibold text-rose-700">{threadError}</p>}
      <footer className="shrink-0 border-t border-[#E2DDD2] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="dm-draft">Message</label>
          <input ref={composerRef} id="dm-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message" maxLength={3000} className="h-11 flex-1 rounded-lg border border-[#E2DDD2] bg-white px-3 text-sm text-[#191713] outline-none focus:border-[#191713] focus:bg-[#E8F0FE]/40" />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#191713] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
        </form>
      </footer>
    </section> : <section className="flex min-h-0 flex-1 flex-col pt-4">
      {listError && <p role="alert" className="pb-3 text-xs font-semibold text-rose-700">{listError}</p>}
      {threads === null ? <div className="h-24 animate-pulse rounded-xl border border-[#E2DDD2] bg-white" /> : threads.length === 0 ? <div className="flex flex-1 flex-col justify-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#E8F0FE] text-[#191713]"><MessageSquare className="h-7 w-7" /></span>
        <h1 className="mt-5 text-[2rem] font-semibold leading-[1] tracking-[-.02em]">Your chats live here.</h1>
        <p className="mt-3 text-sm leading-6 text-[#625D52]">Direct messages with referrers appear in this inbox. Referral-request conversations stay in <Link href="/requests" className="font-semibold text-[#191713] underline-offset-2 hover:underline">My requests</Link>.</p>
        <Link href="/wall" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white">Find referrers <ArrowRight className="h-4 w-4" /></Link>
      </div> : <ul className="min-h-0 flex-1 divide-y divide-[#E2DDD2] overflow-y-auto" data-skipwait-thread-list="open">
        {threads.map(item => <li key={item.counterpartUserId}><button type="button" onClick={() => { void openThread(item.counterpartUserId); }} className="flex w-full items-start gap-3 py-3.5 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E8F0FE] text-[#191713]"><MessageSquare className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-bold text-[#191713]">{item.counterpartLabel}</span><span className="shrink-0 text-[11px] text-[#625D52]">{relativeTime(item.lastMessageAt)}</span></span>
            <span className="mt-0.5 flex items-center justify-between gap-2"><span className="truncate text-sm text-[#625D52]">{item.lastMessageIsMine ? "you: " : ""}{item.lastMessageBody}</span>{item.unreadCount > 0 && <span aria-label={`${item.unreadCount} unread`} className="h-2 w-2 shrink-0 rounded-full bg-[#191713]" />}</span>
          </span>
        </button></li>)}
      </ul>}
    </section>}
  </div></main>;
}
