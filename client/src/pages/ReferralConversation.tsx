import { useEffect, useRef, useState } from "react";
import { useAuth as useClerkAuth, SignInButton } from "@clerk/react";
import { ArrowLeft, ArrowUp, CheckCircle2, LockKeyhole } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { isPostApprovalReferralStatus, referralStatusSteps, type ReferralStatus } from "@shared/referral";

type ConversationMessage = { id: number; body: string; createdAt: string; isMine: boolean };
const progressOptions = [
  { status: "intro_made", label: "Introduction made" },
  { status: "interview", label: "Interview started" },
  { status: "offer", label: "Offer received" },
  { status: "closed", label: "Close request" },
] as const;

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export default function ReferralConversation() {
  const [, params] = useRoute("/conversation/:requestId");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useClerkAuth();
  const requestId = Number(params?.requestId);
  const returnPath = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "inbox" ? "/inbox" : "/requests";
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [progressStatus, setProgressStatus] = useState<ReferralStatus>("approved");
  const messageListRef = useRef<HTMLDivElement>(null);

  const request = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "We could not complete this private conversation action");
    return payload;
  };
  const loadConversation = async () => {
    if (!isSignedIn || !Number.isInteger(requestId) || requestId <= 0) return;
    setLoading(true); setError("");
    try { const payload = await request(`/api/company-referrals/${requestId}/conversation`); setMessages(payload.messages || []); if (isPostApprovalReferralStatus(payload.progressStatus)) setProgressStatus(payload.progressStatus); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open this private conversation"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadConversation(); }, [isSignedIn, requestId]);
  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;
    if (typeof messageList.scrollTo === "function") messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    else messageList.scrollTop = messageList.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true); setError("");
    try {
      await request(`/api/company-referrals/${requestId}/conversation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      setDraft("");
      await loadConversation();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not send this private message"); }
    finally { setSending(false); }
  };
  const updateProgress = async (status: (typeof progressOptions)[number]["status"]) => {
    if (updatingProgress) return;
    setUpdatingProgress(true); setProgressError("");
    try {
      const payload = await request(`/api/company-referrals/${requestId}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (isPostApprovalReferralStatus(payload.progress?.status)) setProgressStatus(payload.progress.status);
      setShowProgress(false);
    } catch (reason) { setProgressError(reason instanceof Error ? reason.message : "We could not record this referral progress"); }
    finally { setUpdatingProgress(false); }
  };

  if (!isSignedIn) return <main data-skipwait-screen="referral-conversation-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><button type="button" onClick={() => go(returnPath)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button></header><section className="flex flex-1 flex-col justify-center"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><LockKeyhole className="h-5 w-5" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private referral conversation</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Continue securely.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Sign in to access your accepted referral conversation.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><SignInButton mode="modal"><button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-bold text-white">Secure sign in <ArrowUp className="h-4 w-4" /></button></SignInButton></footer></div></main>;

  const availableProgressOptions = progressOptions.filter(option => option.status === "closed" ? progressStatus !== "closed" : referralStatusSteps.indexOf(option.status) > referralStatusSteps.indexOf(progressStatus));
  return <main data-skipwait-screen="referral-conversation" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between"><button type="button" onClick={() => go(returnPath)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button>{availableProgressOptions.length ? <button type="button" onClick={() => { setShowProgress(current => !current); setProgressError(""); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0B57D0]"><CheckCircle2 className="h-3.5 w-3.5" />Update</button> : null}</header><section className="mt-4 shrink-0"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Accepted referral</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.045em]">Private conversation</h1><p className="mt-2 text-sm leading-5 text-slate-600">Only you and the accepted referral partner can read or send messages here.</p></section>{showProgress ? <section aria-label="Referral progress update" className="mt-3 shrink-0 rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-xs font-bold text-slate-900">Record a real milestone</p><p className="mt-1 text-[11px] leading-4 text-slate-600">Your partner will receive a private factual update. No reward or public post is created.</p><div className="mt-3 grid grid-cols-2 gap-2">{availableProgressOptions.map(option => <button key={option.status} type="button" disabled={updatingProgress} onClick={() => { void updateProgress(option.status); }} className="rounded-lg border border-blue-100 bg-white px-2 py-2 text-left text-xs font-bold text-[#0B57D0] disabled:opacity-50">{option.label}</button>)}</div>{progressError ? <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{progressError}</p> : null}</section> : null}{error ? <section className="flex flex-1 flex-col justify-center"><div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-sm font-semibold text-rose-900">Conversation unavailable</p><p className="mt-1 text-sm leading-5 text-rose-800">{error}</p><button type="button" onClick={() => go(returnPath)} className="mt-4 text-sm font-bold text-[#0B57D0]">Return to your requests</button></div></section> : loading ? <section className="flex flex-1 flex-col justify-center"><div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" /></section> : <><div ref={messageListRef} className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" aria-live="polite">{messages.length ? <div className="flex flex-col gap-3 pb-3">{messages.map(message => <article key={message.id} className={`flex flex-col ${message.isMine ? "items-end" : "items-start"}`}><p className="mb-1 px-1 text-[11px] font-bold text-slate-500">{message.isMine ? "You" : "Private referral partner"}</p><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-5 ${message.isMine ? "rounded-br-md bg-[#0B57D0] text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className={`mt-1 text-[10px] ${message.isMine ? "text-blue-100" : "text-slate-400"}`}>{shortTime(message.createdAt)}</p></div></article>)}</div> : <div className="flex h-full flex-col items-center justify-center text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-[#0B57D0]"><LockKeyhole className="h-5 w-5" /></span><p className="mt-4 text-sm font-bold text-slate-900">Start the conversation.</p><p className="mt-1 max-w-xs text-sm leading-5 text-slate-600">Ask one clear question or confirm the next referral step.</p></div>}</div><footer className="shrink-0 border-t border-slate-200 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"><label className="sr-only" htmlFor="conversation-message">Message</label><div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"><textarea id="conversation-message" value={draft} onChange={event => setDraft(event.target.value.slice(0, 3000))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a private message" rows={1} className="max-h-24 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-slate-400" /><button type="button" aria-label="Send message" onClick={() => { void send(); }} disabled={!draft.trim() || sending} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#0B57D0] text-white disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button></div></footer></>}</div></main>;
}
