// The seeker's side of a private thread as a goal page (D-048 phase 3 W2; comp
// design/goal-ui/w2/conversation-*.png). Header = company, role + mono SENT day.
// Status row = the shipped askView vocabulary with the four-node stepper, then
// one next-step sentence. Below: the thread (sender + mono time, message), one
// black Send, a ghost Withdraw while the ask is unclaimed, and the honesty line.
// Data, actions and copy all come from the existing thread model; nothing new
// is invented here. Referrer-side variants stay on the kit page (W4).
import { ArrowLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalAppShell, GoalButton, GoalErrorState, GoalMiniStepper, GoalNum, GoalStatus } from "@/components/goal";
import { referrerGreeting } from "@/components/landed/landedModel";
import { REFERRED_DEADLINE_ENABLED } from "@shared/referral";
import { askView } from "@/components/requests/askView";
import { SEEKER_MILESTONES } from "@/components/thread/ThreadDecisionPanels";
import { isUnknownCompany } from "@shared/companies";
import { companyName, seekerWaitingCopy, stageIndex, stageOf } from "@/components/thread/threadModel";
import { formatDay, formatDayTime } from "@/lib/displayPrefs";
import type { ThreadMessage, ThreadRequest } from "@/lib/threadApi";

const HONESTY = "A referral is an introduction. It never promises an interview or a job. Companies decide hiring.";
const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

function nextLine(request: ThreadRequest, name: string, unknown: boolean): string | null {
  const company = unknown ? "the company" : name;
  const at = unknown ? "at the company" : `at ${name}`;
  switch (request.status) {
    case "pending": return seekerWaitingCopy(request);
    case "approved": return `Your referrer submits it through ${unknown ? "the company’s" : `${name}’s`} process, then marks it Referred.`;
    case "intro_made": return `Watch your email for ${unknown ? "the company’s" : `${name}’s`} recruiters. Companies decide hiring.`;
    case "declined": return `It’s not a judgment of you. Your slot is open again. Try another verified referrer ${at}.`;
    case "withdrawn": return "You withdrew this ask. Its open slot is free again. The credit came back only if no verified employee had picked it up.";
    case "closed": return request.referrerId === null ? "Nobody could take it within 7 days. Your slot is free. Refresh your note and ask again." : null;
    default: return null;
  }
}

function stamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return formatDayTime(typeof value === "number" ? new Date(value) : value);
}

type Props = {
  request: ThreadRequest | null;
  failure: string;
  loading: boolean;
  onReload: () => void;
  returnPath: string;
  referrerLabel: string;
  referrerName: string | null;
  messages: readonly ThreadMessage[];
  messageError: string;
  referenceId: string | null;
  canMessage: boolean;
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  onWithdraw: () => Promise<void>;
  onProgress: (status: string) => Promise<void>;
  onConfirmReferredEmail: () => Promise<void>;
  extra?: ReactNode;
};

export function SeekerConversation(props: Props) {
  const { request, failure, loading, onReload, returnPath } = props;
  const [confirm, setConfirm] = useState<null | "withdraw" | "email">(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const run = async (action: () => Promise<void>, fallback: string, done?: () => void) => {
    setBusy(true); setActionError("");
    try { await action(); setConfirm(null); done?.(); } catch (reason) { setActionError(errorText(reason, fallback)); } finally { setBusy(false); }
  };

  const backLabel = returnPath === "/inbox" ? "Inbox" : "My asks";
  const back = (
    <Link href={returnPath} className="inline-flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2 hover:text-g-ink">
      <ArrowLeft aria-hidden="true" className="size-4" />{backLabel}
    </Link>
  );

  if (!request) {
    return (
      <GoalAppShell active={returnPath === "/inbox" ? "inbox" : "asks"} pageTitle="Conversation">
        <div data-skipwait-screen="referral-conversation" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6">
          {back}
          {loading && !failure ? <p role="status" className="mt-8 text-g-body text-g-ink-2">Opening this private thread…</p> : null}
          {failure ? (
            <GoalErrorState className="px-0" title="This thread isn’t available." body={failure} retry={{ label: "Try again", onClick: onReload }} />
          ) : null}
        </div>
      </GoalAppShell>
    );
  }

  const company = companyName(request);
  const unknown = isUnknownCompany(request);
  const view = askView(request);
  const stage = stageOf(request);
  const idx = stageIndex(stage);
  const sent = formatDay(request.createdAt === null ? "" : typeof request.createdAt === "number" ? new Date(request.createdAt) : request.createdAt);
  const line = nextLine(request, company, unknown);
  const canWithdraw = request.status === "pending" && (request.referrerId === null || request.heldForReferrer === true || request.unclaimedAssignment === true);
  const awaitingCoverage = request.queueStatus === "waiting_for_coverage" || request.queueStatus === "held_for_credit";
  const closedFor = ["Declined", "Expired", "Withdrawn"].includes(stage);
  const nextMilestones = request.status === "intro_made" || request.status === "interview" || request.status === "offer" ? SEEKER_MILESTONES.filter(m => stageIndex(m.stage) > idx) : [];

  return (
    <GoalAppShell active={returnPath === "/inbox" ? "inbox" : "asks"} pageTitle="Conversation">
      <div data-skipwait-screen="referral-conversation" className="max-w-[696px] px-8 pt-10 pb-10 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-8">
        {back}
        {failure ? (
          <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-g-meta text-g-ink-2">{failure}<GoalButton size="xs" variant="ghost" onClick={onReload}>Try again</GoalButton></p>
        ) : null}
        <h1 className="mt-2 text-g-display text-g-ink">{unknown ? (request.title ?? "Your ask") : company}</h1>
        <p className="mt-1 text-g-meta text-g-ink-2">
          {unknown ? null : (request.title ?? "Referral request")}{sent ? <>{unknown ? null : " · "}<span className="uppercase"><GoalNum>SENT {sent}</GoalNum></span></> : null}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <GoalStatus status={view.status} label={view.label} className="text-g-label" />
          {view.stepper ? <GoalMiniStepper stage={view.stepper.stage} terminal={view.stepper.terminal} label={`Stage ${view.stepper.stage + 1} of 4: ${view.label}`} /> : null}
        </div>
        {line ? <p className="mt-2 text-pretty text-g-meta text-g-ink-2">{line}</p> : null}
        {props.referrerName ? <p className="mt-1 text-g-meta text-g-ink-2">Your referrer <span className="text-g-ink">{props.referrerName}</span></p> : null}
        {request.status === "approved" && request.referredDueAt ? (
          <p className="mt-1 text-g-meta text-g-ink-3">The referrer’s deadline to mark Referred is {formatDay(request.referredDueAt)}.</p>
        ) : null}
        {props.referenceId ? <p className="mt-2 text-g-meta text-g-ink">Referred. Reference ID <GoalNum>{props.referenceId}</GoalNum></p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canWithdraw && confirm !== "withdraw" ? <GoalButton variant="ghost" flush size="sm" onClick={() => { setActionError(""); setConfirm("withdraw"); }}>Withdraw ask</GoalButton> : null}
          {request.status === "approved" && REFERRED_DEADLINE_ENABLED && confirm !== "email" ? <GoalButton variant="outline" size="sm" onClick={() => { setActionError(""); setConfirm("email"); }}>I got the referral email</GoalButton> : null}
          {closedFor ? <GoalButton variant="outline" size="sm" asChild><Link href="/explore">Find another referrer</Link></GoalButton> : null}
          {stage === "Hired" ? <Link href={`/landed?request=${request.id}`} className="text-g-meta text-g-ink-2 underline underline-offset-2">Thank {referrerGreeting(props.referrerName ?? request.referrerName)}</Link> : null}
          {nextMilestones.map(m => (
            <GoalButton key={m.status} variant="outline" size="sm" busy={busy} onClick={() => { void run(() => props.onProgress(m.status), "We could not record this milestone"); }}>Mark {m.stage}</GoalButton>
          ))}
        </div>
        {confirm === "withdraw" ? (
          <div className="mt-3" role="group" aria-label="Withdraw this ask">
            <p className="text-g-label text-g-ink">Withdraw this ask?</p>
            <p className="mt-1 text-pretty text-g-meta text-g-ink-2">{awaitingCoverage ? "It never reached a verified employee, so no credit was used." : "It leaves the referrer’s queue and frees your slot."}</p>
            <div className="mt-3 flex items-center gap-2">
              <GoalButton variant="ghost" flush size="sm" onClick={() => setConfirm(null)}>Keep it</GoalButton>
              <GoalButton variant="outline" size="sm" busy={busy} busyLabel="Withdrawing…" onClick={() => { void run(props.onWithdraw, "We could not withdraw this request"); }}>Withdraw</GoalButton>
            </div>
          </div>
        ) : null}
        {confirm === "email" ? (
          <div className="mt-3" role="group" aria-label="Confirm the referral email">
            <p className="text-g-label text-g-ink">Confirm you received the referral email?</p>
            <p className="mt-1 text-pretty text-g-meta text-g-ink-2">This tells your referrer you got it and counts the ask as referred.</p>
            <div className="mt-3 flex items-center gap-2">
              <GoalButton variant="ghost" flush size="sm" onClick={() => setConfirm(null)}>Cancel</GoalButton>
              <GoalButton variant="outline" size="sm" busy={busy} busyLabel="Confirming…" onClick={() => { void run(props.onConfirmReferredEmail, "We could not record your confirmation"); }}>Confirm</GoalButton>
            </div>
          </div>
        ) : null}
        {actionError ? <p role="alert" className="mt-2 text-g-meta text-g-ink font-semibold">{actionError}</p> : null}

        <div className="mt-6 border-t border-g-hairline pt-4">
          <h2 className="g-num text-g-ink-3 uppercase">Conversation</h2>
          {request.pitch ? (
            <div data-testid="conversation-ask" className={`py-3 ${props.messages.length > 0 ? "border-b border-g-hairline" : ""}`}>
              <p className="flex items-baseline gap-2 text-g-meta text-g-ink-2"><span className="font-semibold">You</span>{sent ? <GoalNum className="text-g-ink-3">{`Ask · ${sent}`}</GoalNum> : null}</p>
              <p className="mt-1 break-words whitespace-pre-line text-g-body text-g-ink">{request.pitch}</p>
            </div>
          ) : null}
          <ul>
            {props.messages.map(message => {
              const when = stamp(message.createdAt);
              return (
                <li key={message.id} className="border-b border-g-hairline py-3">
                  <p className="flex items-baseline gap-2 text-g-meta text-g-ink-2"><span className="font-semibold">{message.isMine ? "You" : props.referrerLabel}</span>{when ? <GoalNum className="text-g-ink-3">{when}</GoalNum> : null}</p>
                  <p className="mt-1 break-words text-g-body text-g-ink">{message.body}</p>
                </li>
              );
            })}
          </ul>
          {props.canMessage ? (
            <form className="mt-4" onSubmit={event => { event.preventDefault(); props.onSend(); }}>
              <div className="flex items-center gap-2 rounded-g-control border border-g-control-edge px-3 py-2 max-gdesk:flex-wrap">
                <input
                  value={props.draft}
                  onChange={event => props.setDraft(event.target.value)}
                  placeholder="Write a reply…"
                  aria-label="Message"
                  maxLength={3000}
                  className="h-10 min-w-0 flex-1 bg-transparent text-g-body text-g-ink outline-none placeholder:text-g-ink-3 max-gdesk:min-w-[10rem]"
                />
                <GoalButton variant="primary" size="sm" type="submit" busy={props.sending} busyLabel="Sending…">Send</GoalButton>
              </div>
              {props.messageError ? <p role="alert" className="mt-2 text-g-meta text-g-ink font-semibold">{props.messageError}</p> : null}
            </form>
          ) : null}
        </div>

        <p className="mt-6 border-t border-g-hairline pt-4 text-pretty text-g-meta text-g-ink-2">{HONESTY}</p>
        <p className="mt-2 text-pretty text-g-meta text-g-ink-3">
          Referrers are never paid and never ask for money. Never pay or accept money for a referral. <Link href="/report" className="underline underline-offset-2">Report or block</Link>
        </p>
        {props.extra}
      </div>
    </GoalAppShell>
  );
}

/** Signed-out gate: the /ask pattern. One line, one black Sign in, one quiet privacy line. */
export function ConversationSignInGate({ returnPath }: { returnPath: string }) {
  const { openSignIn } = useAuth();
  return (
    <GoalAppShell active={returnPath === "/inbox" ? "inbox" : "asks"} pageTitle="Conversation">
      <div data-skipwait-screen="referral-conversation-sign-in" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-6">
        <Link href={returnPath} className="inline-flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2 hover:text-g-ink">
          <ArrowLeft aria-hidden="true" className="size-4" />{returnPath === "/inbox" ? "Inbox" : "My asks"}
        </Link>
        <h1 className="mt-6 text-g-display text-g-ink">Sign in to see this conversation.</h1>
        <p className="mt-3 text-pretty text-g-meta text-g-ink-2">Conversations stay private to the two people in them.</p>
        <div className="mt-6 max-gdesk:grid">
          <GoalButton variant="primary" touch="large" className="max-gdesk:w-full" onClick={() => { openSignIn(); }}>Sign in</GoalButton>
        </div>
      </div>
    </GoalAppShell>
  );
}
