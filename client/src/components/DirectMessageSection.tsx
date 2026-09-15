import { useState } from "react";
import { Link } from "wouter";
import { Crown, MessageSquare, Send } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { readApiJson } from "@/lib/apiResponse";
import { FollowButton } from "./FollowButton";

type ComposeState = { allowed: boolean; upgradeRequired: boolean; threadExists: boolean };

function PaywallCard({ compact, referrerUserId }: { compact?: boolean; referrerUserId?: number }) {
  return <div data-skipwait-screen="dm-paywall" className={`${compact ? "p-4" : "p-5"} rounded-xl border border-[#F3D5C7] bg-[#F9E4DE]/70`}>
    <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#191713]"><Crown className="h-5 w-5" /></span>
    <h2 className={`${compact ? "mt-3 text-lg" : "mt-4 text-xl"} font-semibold tracking-[-.02em] text-[#191713]`}>Direct messaging is for members</h2>
    <p className="mt-2 text-sm leading-6 text-[#191713]">Pro members can message verified referrers directly and get answers faster. Pro includes 10 referral credits monthly — the core referral loop stays free for everyone. Or follow each other to message free — many referrers follow back.</p>{typeof referrerUserId === "number" ? <div className="mt-3"><FollowButton targetUserId={referrerUserId} compact /></div> : null}
    <Link href="/premium?role=job_seeker" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white">Upgrade to Pro</Link>
  </div>;
}

export function DirectMessageSection({ referrerUserId }: { referrerUserId: number }) {
  const { isSignedIn, getToken } = useAuth();
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const authedFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };

  const beginCompose = async () => {
    if (!isSignedIn || checking) return;
    setChecking(true); setError("");
    try {
      const response = await authedFetch(`/api/dms/compose/${referrerUserId}`);
      const payload = await readApiJson<ComposeState & { error?: string }>(response, "We could not check direct messaging");
      if (!response.ok) throw new Error(payload.error || "We could not check direct messaging");
      setCompose({ allowed: payload.allowed, upgradeRequired: payload.upgradeRequired, threadExists: payload.threadExists });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not check direct messaging"); }
    finally { setChecking(false); }
  };

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true); setError("");
    try {
      const response = await authedFetch(`/api/dms/threads/${referrerUserId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not send this direct message");
      if (response.status === 402) { setCompose({ allowed: false, upgradeRequired: true, threadExists: false }); setDraft(""); return; }
      if (!response.ok) throw new Error(payload.error || "We could not send this direct message");
      setSent(true); setDraft("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not send this direct message"); }
    finally { setSending(false); }
  };

  return <section data-skipwait-screen="direct-message" aria-label="Direct message this referrer" className="mt-3">
    {!isSignedIn ? <PaywallCard compact referrerUserId={referrerUserId} /> : sent ? <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-semibold text-[#191713]">Message sent. Track replies in your <Link href="/messages" className="text-[#191713] underline-offset-2 hover:underline">direct messages</Link>.</p> : !compose ? <>
      <button type="button" onClick={() => { void beginCompose(); }} disabled={checking} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#D5CFC0] bg-white px-5 py-3 text-sm font-bold text-[#2E2B25] disabled:opacity-50"><MessageSquare className="h-4 w-4" />{checking ? "Checking…" : "Message"}</button>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </> : compose.allowed ? <div>
      <div className="mb-2"><FollowButton targetUserId={referrerUserId} compact /></div>
      <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor="dm-compose-draft">Message</label>
        <input id="dm-compose-draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message" maxLength={3000} className="h-11 flex-1 rounded-lg border border-[#E2DDD2] bg-white px-3 text-sm text-[#191713] outline-none focus:border-[#191713] focus:bg-[#F9E4DE]/40" />
        <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#191713] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{error}</p>}
    </div> : <PaywallCard compact referrerUserId={referrerUserId} />}
  </section>;
}
