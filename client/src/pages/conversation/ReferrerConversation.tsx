// The referrer's side of a private thread as a goal page (D-048 phase 3, row
// D-048-p3-conversation; packet docs/plans/D-048-referrer.md). It is the kit
// ThreadMain + ReferrerPanel pair on the goal system: one heading that states
// the referrer's goal, exactly one "Your next step" block holding the page's
// single black commit, the ask as it was sent, the private thread once it is
// open, and the never-paid line. Data, actions and copy come from the
// existing thread model and threadApi; nothing new is fetched or invented.
//
// Privacy (D-019): before the referrer's own acceptance there is no seeker
// name, no resume or file name and no message box. The parent decides the
// composer with canMessage(role, request) and threadApi already drops the
// candidate name and files before acceptance; this page renders only what it
// is given and never derives identity itself.
// Money (D-055): a referrer is never paid or charged, so nothing here names a
// credit, a plan or a price; GoalAppShell drops the credits pill on the
// server's verified-referrer verdict.
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { GoalAppShell, GoalButton, GoalErrorState, GoalNextStep, GoalNum, GoalPassReasons, GoalSheet, GoalStatus, GoalTextInput, GoalVerifiedMark, useOnlineStatus, type GoalStatusValue } from "@/components/goal";
import { companyName, isAccepted, referrerPendingCopy, stageOf, type StageLabel } from "@/components/thread/threadModel";
import { formatDayTime } from "@/lib/displayPrefs";
import type { ThreadMessage, ThreadRequest, ThreadRole } from "@/lib/threadApi";
import { functionEyebrow } from "@shared/jobFunctions";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { REFERRED_DEADLINE_ENABLED } from "@shared/referral";

export const GOAL_PAGE = { goalLine: "Would you refer this person?" } as const;

// Pass reasons (D-052) built from the shared list, exactly as the kit decision
// panels build them: `value` is the legacy decline reason the server routes on,
// `code` the reason the referrer picked. Local, so this moved page does not
// import the kit panels and their kit button (D-167 (3)).
const PASS_REASONS = PASS_REASON_OPTIONS.map(option => ({ label: option.label, value: option.legacy, code: option.code }));

const COORDINATE = "Use messages to coordinate. Keep personal contact details off-platform only if you both choose to.";
const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

const STATUS: Record<StageLabel, { status: GoalStatusValue; label: string }> = {
  Requested: { status: "queue_new", label: "Waiting for your decision" },
  Accepted: { status: "accepted", label: "Accepted" },
  Referred: { status: "referred", label: "Referred" },
  Interviewing: { status: "referred", label: "Interviewing" },
  Offer: { status: "referred", label: "Offer" },
  Hired: { status: "referred", label: "Hired" },
  Declined: { status: "withdrawn", label: "Closed" },
  Expired: { status: "expired", label: "Expired" },
  Withdrawn: { status: "withdrawn", label: "Withdrawn" },
};

function stamp(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return formatDayTime(typeof value === "number" ? new Date(value) : value);
}

// Phone width, the goal shell's own breakpoint (max-gdesk: < 641px). On a phone
// the pass reasons open as the goal bottom sheet (GoalSheet, spec §4.10), never
// the desktop popover that opened upward over the header and the ask (#831 F3).
const PHONE_QUERY = "(max-width: 640px)";
function usePhoneWidth(): boolean {
  const query = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
  const [phone, setPhone] = useState(query);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, []);
  return phone;
}

type Confirm = null | "accept" | "pass" | "referred" | "extend" | "stepback";

export type ReferrerConversationProps = {
  request: ThreadRequest | null;
  role: Exclude<ThreadRole, "seeker">;
  /** The signed-in account's id (auth.me); undefined while it loads. A pending ask
   * offers a decision only when it is unassigned or assigned to this id (#831 F1). */
  viewerId?: number | null;
  failure: string;
  loading: boolean;
  onReload: () => void;
  returnPath: string;
  passed: boolean;
  /** The referrer's own name, shown to them once they accepted; null before. */
  ownName: string | null;
  messages: readonly ThreadMessage[];
  messageError: string;
  referenceId: string | null;
  canMessage: boolean;
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  onSend: () => void;
  onAccept: () => Promise<void>;
  onPass: (reason: string, passReason: string) => Promise<void>;
  onMarkReferred: (referenceId?: string) => Promise<void>;
  onExtendReferredDeadline: () => Promise<void>;
  onStepBack: () => Promise<void>;
};

export function ReferrerConversation(props: ReferrerConversationProps) {
  const { request, role, failure, loading, onReload, returnPath, passed, viewerId } = props;
  const online = useOnlineStatus();
  const phone = usePhoneWidth();
  const [pick, setPick] = useState<PassReasonCode | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [attested, setAttested] = useState(false);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const open = (next: Confirm) => { setActionError(""); setAttested(false); setReference(""); setPick(null); setConfirm(next); };
  const close = () => { setConfirm(null); setActionError(""); };
  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true); setActionError("");
    try { await action(); setConfirm(null); } catch (reason) { setActionError(errorText(reason, fallback)); } finally { setBusy(false); }
  };

  const active = returnPath === "/inbox" ? "inbox" : "queue";
  const back = (
    <Link href={returnPath} className="inline-flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2 hover:text-g-ink">
      <ArrowLeft aria-hidden="true" className="size-4" />{returnPath === "/inbox" ? "Inbox" : "All requests"}
    </Link>
  );
  const offlineLine = online ? null : <p role="status" className="mt-2 text-g-meta text-g-ink-2">You’re offline. Your decision and messages can send once you’re back online.</p>;

  if (!request) {
    return (
      <GoalAppShell active={active} pageTitle="Conversation">
        <div data-testid="goal-referrer-conversation" data-skipwait-screen="referral-conversation" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6">
          {back}
          {offlineLine}
          {loading && !failure ? <p role="status" className="mt-8 text-g-body text-g-ink-2">Opening this private thread…</p> : null}
          {failure ? <GoalErrorState className="px-0" title="This thread isn’t available." body={failure} retry={{ label: "Try again", onClick: onReload }} /> : null}
        </div>
      </GoalAppShell>
    );
  }

  const company = companyName(request);
  const stage = stageOf(request);
  const accepted = isAccepted(request);
  // A pending ask is this referrer's to decide only when nobody holds it or it is
  // assigned to them. One a colleague holds can only answer Accept with a 409, so
  // it offers no decision; while the account is still loading nothing is offered.
  const assignee = request.referrerId ?? null;
  const colleagueHolds = !passed && role === "referrer-pending" && stage === "Requested" && assignee !== null && viewerId !== undefined && assignee !== viewerId;
  const deciding = !passed && role === "referrer-pending" && stage === "Requested" && (assignee === null || (viewerId !== undefined && viewerId !== null && assignee === viewerId));
  const status = passed ? { status: "withdrawn" as const, label: "Passed privately" } : colleagueHolds ? { status: "withdrawn" as const, label: "With a colleague" } : STATUS[stage];
  const asker = accepted && role === "referrer-claimed" ? (request.candidateName ?? "Seeker") : "Seeker · identity hidden";
  // An accepted referrer's file without a link: their document access has ended (D-019(e)).
  const accessEnded = role === "referrer-claimed" && accepted && request.attachments.some(file => !file.url);
  const offline = online ? undefined : "You’re offline";

  const heading = passed
    ? "You passed privately."
    : colleagueHolds ? "A colleague has this request."
    : deciding ? "Would you refer this person?"
    : stage === "Accepted" ? "Submit through your company."
    : stage === "Hired" ? "Hired. Thank you for opening this door."
    : accepted ? "You referred this person."
    : "This referral request";

  let reason: string;
  if (passed) reason = "The request stays active for other verified employees. Your identity was never revealed.";
  else if (colleagueHolds) reason = `Another verified employee at ${company} is deciding on it. Nothing is needed from you.`;
  else if (deciding) reason = request.decisionDueAt
    ? `Accept or pass by ${new Date(request.decisionDueAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. After that it goes back to your colleagues, and nothing is held against you.`
    : referrerPendingCopy(request);
  else if (stage === "Accepted") reason = REFERRED_DEADLINE_ENABLED && request.referredDueAt
    ? `Submit it through ${company}’s official referral process, then mark it Referred by ${new Date(request.referredDueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} so the seeker knows.`
    : `Submit it through ${company}’s official referral process, then mark it Referred so the seeker knows.`;
  else if (stage === "Referred") reason = `Submitted through ${company}’s internal referral process. Companies decide hiring; skipwait.me never promises outcomes.`;
  else if (stage === "Interviewing" || stage === "Offer" || stage === "Hired") reason = COORDINATE;
  else if (stage === "Requested") reason = referrerPendingCopy(request);
  else reason = "This request is closed. There is nothing more to do here.";

  return (
    <GoalAppShell active={active} pageTitle="Conversation">
      <div data-testid="goal-referrer-conversation" data-skipwait-screen="referral-conversation" className="max-w-[696px] px-8 pt-10 pb-10 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-8">
        {back}
        {offlineLine}
        {failure ? (
          <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-g-meta text-g-ink-2">{failure}<GoalButton size="xs" variant="ghost" onClick={onReload}>Try again</GoalButton></p>
        ) : null}
        <p className="mt-2 text-g-meta text-g-ink-3">{functionEyebrow(request.jobFunction, company)}</p>
        <h1 className="mt-1 text-g-display text-g-ink">{heading}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-g-meta text-g-ink-2">
          <span>{request.title ?? "Referral request"}</span>
          {request.targetRoleUrl ? (
            <a href={request.targetRoleUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">Official job posting<ExternalLink aria-hidden="true" className="size-3.5" /></a>
          ) : null}
        </p>
        <div className="mt-6"><GoalStatus status={status.status} label={status.label} className="text-g-label" /></div>

        <div className="relative mt-4">
          <GoalNextStep reason={reason}>
            {passed || colleagueHolds || (!deciding && (stage === "Declined" || stage === "Expired" || stage === "Withdrawn")) ? (
              <GoalButton variant="primary" size="sm" className="mt-3" asChild><Link href={returnPath}>All requests</Link></GoalButton>
            ) : null}
            {deciding ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GoalButton variant="primary" size="sm" disabledReason={offline} onClick={() => open("accept")}>Accept &amp; connect</GoalButton>
                <GoalButton variant="ghost" size="sm" aria-haspopup="dialog" aria-expanded={confirm === "pass"} disabledReason={offline} onClick={() => open("pass")}>Pass privately</GoalButton>
              </div>
            ) : null}
            {!passed && stage === "Accepted" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GoalButton variant="primary" size="sm" disabledReason={offline} onClick={() => open("referred")}>Mark as referred</GoalButton>
                {REFERRED_DEADLINE_ENABLED && request.referredDueAt && !request.extensionUsed ? <GoalButton variant="outline" size="sm" disabledReason={offline} onClick={() => open("extend")}>Need 3 more days</GoalButton> : null}
                {REFERRED_DEADLINE_ENABLED ? <GoalButton variant="ghost" size="sm" disabledReason={offline} onClick={() => open("stepback")}>I can’t refer this after all</GoalButton> : null}
              </div>
            ) : null}

            {confirm === "accept" ? (
              <div className="mt-4" role="group" aria-label="Accept this request">
                <p className="text-g-label text-g-ink">Accept this request?</p>
                <p className="mt-1 text-pretty text-g-meta text-g-ink-2">You’ll both see names, and you’ll get the resume.</p>
                <label className="mt-3 flex items-start gap-3 text-g-meta text-g-ink">
                  <input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} className="mt-1 size-4" />
                  I’ll refer only through {company}’s official process and won’t accept anything in return.
                </label>
                <div className="mt-3 flex items-center gap-2">
                  <GoalButton variant="ghost" flush size="sm" onClick={close}>Cancel</GoalButton>
                  <GoalButton variant="outline" size="sm" busy={busy} busyLabel="Accepting…" disabledReason={!attested ? "Confirm the official process first" : offline} onClick={() => { void run(props.onAccept, "We could not accept this request"); }}>Accept</GoalButton>
                </div>
              </div>
            ) : null}
            {confirm === "referred" ? (
              <div className="mt-4" role="group" aria-label="Mark as referred">
                <p className="text-g-label text-g-ink">Mark as referred</p>
                <p className="mt-1 text-pretty text-g-meta text-g-ink-2">Tell the seeker you submitted this through your company’s process. Optional: add your portal’s reference so the seeker can mention it.</p>
                <label htmlFor="referrer-reference-id" className="mt-3 block text-g-label text-g-ink">Reference ID (optional)</label>
                <GoalTextInput id="referrer-reference-id" className="mt-2" value={reference} maxLength={40} onChange={event => setReference(event.target.value)} placeholder="e.g. TC-4410" autoComplete="off" />
                <div className="mt-3 flex items-center gap-2">
                  <GoalButton variant="ghost" flush size="sm" onClick={close}>Cancel</GoalButton>
                  <GoalButton variant="outline" size="sm" busy={busy} busyLabel="Saving…" disabledReason={offline} onClick={() => { void run(() => props.onMarkReferred(reference.trim() || undefined), "We could not mark this as referred"); }}>Confirm</GoalButton>
                </div>
              </div>
            ) : null}
            {confirm === "extend" ? (
              <div className="mt-4" role="group" aria-label="Extend the deadline">
                <p className="text-g-label text-g-ink">Extend the deadline by 3 days?</p>
                <p className="mt-1 text-pretty text-g-meta text-g-ink-2">This moves your Referred deadline to 8 days from acceptance. You can only do this once per acceptance.</p>
                <div className="mt-3 flex items-center gap-2">
                  <GoalButton variant="ghost" flush size="sm" onClick={close}>Cancel</GoalButton>
                  <GoalButton variant="outline" size="sm" busy={busy} disabledReason={offline} onClick={() => { void run(props.onExtendReferredDeadline, "We could not extend the deadline"); }}>Extend</GoalButton>
                </div>
              </div>
            ) : null}
            {confirm === "stepback" ? (
              <div className="mt-4" role="group" aria-label="Step back from this referral">
                <p className="text-g-label text-g-ink">Step back from this referral?</p>
                <p className="mt-1 text-pretty text-g-meta text-g-ink-2">They’ll be told kindly, and the ask opens to your colleagues. No fault.</p>
                <div className="mt-3 flex items-center gap-2">
                  <GoalButton variant="ghost" flush size="sm" onClick={close}>Cancel</GoalButton>
                  <GoalButton variant="outline" size="sm" busy={busy} disabledReason={offline} onClick={() => { void run(props.onStepBack, "We could not record your step-back"); }}>Step back</GoalButton>
                </div>
              </div>
            ) : null}
            {actionError ? <p role="alert" className="mt-2 text-g-meta font-semibold text-g-ink">{actionError}</p> : null}
          </GoalNextStep>
          {deciding && phone ? (
            <GoalSheet open={confirm === "pass"} onOpenChange={next => { if (!next) close(); }} title="Pass privately" description="The seeker sees a kind note with your reason. Never your name.">
              <div role="radiogroup" aria-label="Pass reason" className="mt-3">
                {PASS_REASON_OPTIONS.map(option => (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={pick === option.code}
                    onClick={() => setPick(option.code)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-g-control px-2 text-left text-g-body text-g-ink hover:bg-g-surface-hover"
                  >
                    <span aria-hidden="true" className={`size-[18px] shrink-0 rounded-full border-[1.5px] border-g-control-edge${pick === option.code ? " border-[5px] border-g-ink" : ""}`} />
                    {option.label}
                  </button>
                ))}
              </div>
              {actionError ? <p role="alert" className="mt-2 text-g-meta font-semibold text-g-ink">{actionError}</p> : null}
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-g-hairline pt-3">
                <GoalButton size="sm" variant="ghost" onClick={close}>Cancel</GoalButton>
                <GoalButton
                  size="sm"
                  variant="outline"
                  busy={busy}
                  disabledReason={pick === null ? "Pick a reason first" : offline}
                  onClick={() => {
                    const picked = PASS_REASONS.find(option => option.code === pick);
                    if (picked) void run(() => props.onPass(picked.value, picked.code), "We could not record your decision");
                  }}
                >Pass</GoalButton>
              </div>
            </GoalSheet>
          ) : null}
          {deciding && !phone ? (
            <GoalPassReasons
              open={confirm === "pass"}
              onOpenChange={next => { if (!next) close(); }}
              title="Pass privately"
              description="The seeker sees a kind note with your reason. Never your name."
              cancelLabel="Cancel"
              confirmLabel="Pass"
              onCancel={close}
              onConfirm={(code: PassReasonCode) => {
                const picked = PASS_REASONS.find(option => option.code === code);
                if (picked) void run(() => props.onPass(picked.value, picked.code), "We could not record your decision");
              }}
            />
          ) : null}
        </div>

        <section aria-label="The ask" className="mt-6 border-t border-g-hairline pt-4">
          <h2 className="g-num text-g-ink-3 uppercase">Ask</h2>
          <p className="mt-3 text-g-meta font-semibold text-g-ink-2">{asker}</p>
          {request.pitch ? <p className="mt-1 break-words whitespace-pre-line text-g-body text-g-ink">{request.pitch}</p> : null}
          {!accepted ? (
            <p className="mt-2 text-g-meta text-g-ink-3">Resume and profile shared after acceptance</p>
          ) : role === "referrer-claimed" && request.attachments.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {request.attachments.map(file => (
                <li key={file.id} className="text-g-meta text-g-ink">
                  {file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{file.fileName}</a> : <span>{file.fileName}</span>}
                </li>
              ))}
            </ul>
          ) : null}
          {accessEnded ? <p className="mt-2 text-g-meta text-g-ink-2">Resume access has ended. Message the Job Seeker here if you still need it.</p> : null}
        </section>

        {accepted ? (
          <section aria-label="Conversation" className="mt-6 border-t border-g-hairline pt-4">
            <h2 className="g-num text-g-ink-3 uppercase">Conversation</h2>
            <ul>
              {props.messages.map(message => {
                const when = stamp(message.createdAt);
                return (
                  <li key={message.id} className="border-b border-g-hairline py-3">
                    <p className="flex items-baseline gap-2 text-g-meta text-g-ink-2"><span className="font-semibold">{message.isMine ? "You" : asker}</span>{when ? <GoalNum className="text-g-ink-3">{when}</GoalNum> : null}</p>
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
                    placeholder="Write a message…"
                    aria-label="Message"
                    maxLength={3000}
                    className="h-10 min-w-0 flex-1 bg-transparent text-g-body text-g-ink outline-none placeholder:text-g-ink-3 max-gdesk:min-w-[10rem]"
                  />
                  <GoalButton variant="outline" size="sm" type="submit" busy={props.sending} busyLabel="Sending…" disabledReason={offline}>Send</GoalButton>
                </div>
                {props.messageError ? <p role="alert" className="mt-2 text-g-meta font-semibold text-g-ink">{props.messageError}</p> : null}
              </form>
            ) : null}
          </section>
        ) : null}

        <div className="mt-6 border-t border-g-hairline pt-4">
          <p className="text-g-meta text-g-ink">{accepted && props.ownName ? props.ownName : "You"}</p>
          <GoalVerifiedMark className="mt-1">Verified via work email</GoalVerifiedMark>
          {props.referenceId ? <p className="mt-2 text-g-meta text-g-ink">Referred. Reference ID <GoalNum>{props.referenceId}</GoalNum></p> : null}
        </div>
        <p className="mt-4 text-pretty text-g-meta text-g-ink-3">
          {REFERRER_MONEY_SENTENCE} Never pay or accept money for a referral. <Link href="/report" className="underline underline-offset-2">Report or block</Link>
        </p>
      </div>
    </GoalAppShell>
  );
}
