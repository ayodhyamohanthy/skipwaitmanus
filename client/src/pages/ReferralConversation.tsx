import { ArrowLeft, ArrowRight, BadgeCheck, ExternalLink, EyeOff, FileText, Send, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation, useRoute } from "wouter";
import { getJobSeekerReferralState, isPostApprovalReferralStatus, referralStatusLabels, type ReferralStatus } from "@shared/referral";
import { usePersistFn } from "@/hooks/usePersistFn";
import { decideReview, loadConversation, loadThread, recordProgress, sendConversationMessage, withdrawThreadRequest, type ThreadMessage, type ThreadRequest, type ThreadRole } from "@/lib/threadApi";
import { ReferrerPanel, SeekerPanel } from "@/components/thread/ThreadDecisionPanels";

const STAGES = ["Requested", "Accepted", "Referred", "Interviewing", "Offer", "Hired"] as const;
const STAGE_STATUS = ["pending", "approved", "intro_made", "interview", "offer", "closed"] as const;

function stageIndex(status: string) {
  return STAGE_STATUS.indexOf(status as (typeof STAGE_STATUS)[number]);
}

function pillClass(status: string) {
  if (["approved", "intro_made", "interview", "offer"].includes(status)) return "status-pill status-approved";
  if (status === "declined" || status === "withdrawn") return "status-pill status-declined";
  if (status === "closed") return "status-pill status-closed";
  return "status-pill status-pending";
}

function pillLabel(role: ThreadRole, request: ThreadRequest) {
  if (role === "referrer-pending") return "Needs your decision";
  if (role === "referrer-claimed") return referralStatusLabels[request.status as ReferralStatus] ?? request.status;
  return getJobSeekerReferralState({ status: request.status as ReferralStatus, referrerId: request.referrerId }).label;
}

function Notice({ tone, title, text }: { tone: "muted" | "accent"; title: string; text: string }) {
  return (
    <div className={`rounded-2xl p-4 ${tone === "accent" ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "bg-[var(--muted)]"}`}>
      <strong>{title}</strong>
      <p className="mt-1 text-sm">{text}</p>
    </div>
  );
}

export default function ReferralConversation() {
  const [, params] = useRoute("/conversation/:requestId");
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const requestId = Number(params?.requestId);
  const returnPath = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "inbox" ? "/inbox" : "/requests";
  const fetchToken = usePersistFn(getToken);

  const [role, setRole] = useState<ThreadRole | null>(null);
  const [request, setRequest] = useState<ThreadRequest | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [passed, setPassed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const reload = useCallback(async () => {
    if (!isSignedIn || !Number.isInteger(requestId) || requestId <= 0) return;
    setLoading(true); setError("");
    try {
      const thread = await loadThread(requestId, fetchToken);
      setRole(thread.role); setRequest(thread.request);
      const canReadMessages =
        (thread.role === "seeker" && isPostApprovalReferralStatus(thread.request.status)) || thread.role === "referrer-claimed";
      if (canReadMessages) {
        const conversation = await loadConversation(requestId, fetchToken);
        setMessages(conversation.messages);
      } else setMessages([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open this private thread"); }
    finally { setLoading(false); }
  }, [fetchToken, isSignedIn, requestId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referral-conversation-sign-in" className="mx-auto max-w-xl px-5 py-6 text-black">
        <button type="button" onClick={() => go(returnPath)} className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</button>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-.02em]">Continue securely.</h1>
        <p className="mt-3 text-sm leading-6 text-[#505050]">Sign in to access your accepted referral conversation.</p>
        <div className="mt-6"><SignInButton><button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 text-sm font-bold text-white">Secure sign in</button></SignInButton></div>
      </main>
    );
  }

  const runAction = async (action: () => Promise<unknown>, after?: () => void) => {
    setActionBusy(true); setActionError("");
    try { await action(); after?.(); await reload(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : "We could not complete this private thread action"); }
    finally { setActionBusy(false); }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || !request) return;
    setSending(true);
    try {
      await sendConversationMessage(request.id, body, fetchToken);
      setDraft("");
      const conversation = await loadConversation(request.id, fetchToken);
      setMessages(conversation.messages);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "We could not send this private message"); }
    finally { setSending(false); }
  };

  return (
    <main data-skipwait-screen="referral-conversation" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(returnPath)} className="text-link"><ArrowLeft className="size-4" />All requests</button>
      </div>
      {loading && !request ? <p className="mt-10 text-center text-sm text-[#505050]">Opening this private thread…</p> : null}
      {error ? (
        <section className="mx-auto mt-10 max-w-xl text-center">
          <h1 className="text-2xl font-semibold">This thread isn&apos;t available.</h1>
          <p className="mt-2 text-sm leading-6 text-[#505050]">{error}</p>
          <button type="button" onClick={() => go(returnPath)} className="brand-button mt-6">Back to requests</button>
        </section>
      ) : null}
      {request && role ? (
        <ThreadBody
          request={request}
          role={role}
          messages={messages}
          draft={draft}
          setDraft={setDraft}
          sending={sending}
          onSend={() => { void send(); }}
          actionBusy={actionBusy}
          actionError={actionError}
          passed={passed}
          go={go}
          onAccept={() => runAction(() => decideReview(request.id, "approved", undefined, fetchToken))}
          onPass={reason => runAction(() => decideReview(request.id, "declined", reason, fetchToken), () => setPassed(true))}
          onMarkReferred={() => runAction(() => recordProgress(request.id, "intro_made", fetchToken))}
          onProgress={status => runAction(() => recordProgress(request.id, status, fetchToken))}
          onWithdraw={id => withdrawThreadRequest(id, fetchToken).then(() => undefined)}
        />
      ) : null}
    </main>
  );
}

type BodyProps = {
  request: ThreadRequest;
  role: ThreadRole;
  messages: ThreadMessage[];
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  actionBusy: boolean;
  actionError: string;
  passed: boolean;
  go: (path: string) => void;
  onAccept: () => Promise<void>;
  onPass: (reason: string) => Promise<void>;
  onMarkReferred: () => Promise<void>;
  onProgress: (status: string) => Promise<void>;
  onWithdraw: (id: number) => Promise<void>;
};

function ThreadBody(props: BodyProps) {
  const { request, role, messages, draft, setDraft, sending, onSend, actionError, passed, go } = props;
  const status = request.status as ReferralStatus;
  const idx = stageIndex(request.status);
  const pitch = request.candidateMessage ?? request.pitch ?? "";
  const title = request.title ?? "Referral request";
  const mark = (request.companyDomain?.[0] ?? "?").toUpperCase();
  const claimed = role === "referrer-claimed";
  const canReadMessages = (role === "seeker" && isPostApprovalReferralStatus(status)) || claimed;
  const showComposer = canReadMessages && !["declined", "withdrawn", "closed"].includes(status);

  const askName = role === "seeker" ? "Your ask" : claimed ? (request.candidateName ?? "Seeker") : "Seeker · identity hidden";
  const counterpart = role === "seeker" ? `Someone at ${request.companyDomain}` : (claimed ? (request.candidateName ?? "Seeker") : "Seeker · identity hidden");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--card)]">
        <header className="flex flex-wrap items-start gap-3 border-b border-[var(--border)] p-5">
          <span className="company-mark">{mark}</span>
          <div className="min-w-0 flex-1">
            <span className="eyebrow">{request.companyDomain}</span>
            <h1 className="text-2xl font-semibold">{title}</h1>
            {request.targetRoleUrl ? <a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="text-link mt-1 text-sm">Official job posting <ExternalLink className="size-3.5" /></a> : null}
          </div>
          <span className={pillClass(request.status)}>{pillLabel(role, request)}</span>
        </header>

        <ol className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-5 py-4" aria-label="Request progress">
          {STAGES.map((stage, i) => (
            <li key={stage} className="min-w-16 flex-1">
              <span className={`block h-1.5 rounded-full ${idx >= 0 && idx >= i ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} />
              <span className={`mt-1.5 block text-[11px] ${idx === i ? "font-semibold" : "text-[var(--muted-foreground)]"}`}>{stage}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--muted)]">
              {claimed || role === "seeker" ? <UserRound className="size-5" /> : <EyeOff className="size-5" />}
            </span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-[var(--muted)] p-4">
              <strong className="text-sm">{askName}</strong>
              {pitch ? <p className="mt-1 text-sm leading-6">&ldquo;{pitch}&rdquo;</p> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {claimed && request.attachments?.length ? request.attachments.map(file => (
                  <a key={file.id} href={file.url ?? `/api/documents/${file.id}`} className="flex items-center gap-1 rounded-full bg-[var(--background)] px-3 py-1">
                    <FileText className="size-3.5" />{file.fileName}
                  </a>
                )) : (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--background)] px-3 py-1">
                    <EyeOff className="size-3.5" />Resume and profile shared after acceptance
                  </span>
                )}
              </div>
            </div>
          </div>

          {status === "pending" && role === "seeker" ? <p className="text-sm text-[var(--muted-foreground)]">Waiting for a verified {request.companyDomain} referrer. We&apos;ll notify you the moment it&apos;s accepted.</p> : null}
          {status === "pending" && role !== "seeker" && !passed ? <p className="text-sm text-[var(--muted-foreground)]">No reply needed to pass — but a quick answer helps.</p> : null}
          {status === "declined" ? <Notice tone="muted" title={role === "seeker" ? "This referrer passed." : "Decision recorded."} text={role === "seeker" ? (request.referrerMessage ?? "Passing is private and never about you — your slot is open again.") : "The seeker was notified privately. Your identity was never revealed."} /> : null}
          {status === "withdrawn" ? <Notice tone="muted" title="You withdrew this request." text="Your credit was returned to your balance." /> : null}
          {status === "closed" ? <Notice tone="muted" title="This request is closed." text="Your private history stays protected." /> : null}
          {passed ? <Notice tone="muted" title="You passed privately." text="The request stays active for other verified employees. Your identity was never revealed." /> : null}

          {messages.map(message => (
            <div key={message.id} className={`flex ${message.isMine ? "justify-end" : ""}`}>
              <p className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.isMine ? "rounded-br-sm bg-[var(--primary)] text-[var(--primary-foreground)]" : "rounded-bl-sm bg-[var(--muted)]"}`}>{message.body}</p>
            </div>
          ))}
          {status === "approved" ? <p className="text-center text-xs text-[var(--muted-foreground)]">— Request accepted. {role === "seeker" ? "You can now message privately." : "Identities and resume are now shared."} —</p> : null}
          {status === "intro_made" ? <Notice tone="accent" title="Referral submitted" text={`Submitted through ${request.companyDomain}'s internal referral process. Companies decide hiring; SkipWait never promises outcomes.`} /> : null}
        </div>

        {showComposer ? (
          <div className="flex gap-2 border-t border-[var(--border)] p-4">
            <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSend(); }} placeholder="Write a message…" aria-label="Message" className="h-12 min-w-0 flex-1 rounded-full border border-[var(--input)] bg-[var(--background)] px-4" />
            <button type="button" disabled={sending || !draft.trim()} className="brand-button grid size-12 place-items-center !rounded-full !p-0" aria-label="Send message" onClick={onSend}><Send /></button>
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-[var(--border)] p-5">
          <span className="eyebrow">{role === "seeker" ? "YOUR NEXT STEP" : "YOUR DECISION"}</span>
          <div className="mt-2">
            {role === "seeker" ? (
              <SeekerPanel request={request} go={go} onWithdraw={props.onWithdraw} onProgress={props.onProgress} />
            ) : (
              <ReferrerPanel request={request} claimed={claimed} busy={props.actionBusy} error={actionError} onAccept={props.onAccept} onPass={props.onPass} onMarkReferred={props.onMarkReferred} />
            )}
          </div>
        </div>
        <div className="rounded-3xl bg-[var(--muted)] p-5 text-sm">
          <span className="eyebrow">{role === "seeker" ? "REFERRER" : "SEEKER"}</span>
          <p className="mt-2 flex items-center gap-2 font-medium">{counterpart}<BadgeCheck className="size-4 text-[var(--primary)]" /></p>
          <p className="text-[var(--muted-foreground)]">{role === "seeker" ? "Verified via work email" : claimed ? "Identity shared on accept" : "Identity hidden until you accept"}</p>
        </div>
        <div className="rounded-3xl border border-[var(--border)] p-5 text-sm text-[var(--muted-foreground)]">
          <ShieldCheck className="mb-2 size-5 text-[var(--primary)]" />Referrals are free. Never pay or accept money for a referral. <Link href="/report" className="text-link">Report</Link>
        </div>
      </aside>
    </div>
  );
}
