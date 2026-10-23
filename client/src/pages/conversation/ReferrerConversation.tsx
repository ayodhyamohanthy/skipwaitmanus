import * as Dialog from "@radix-ui/react-dialog";
import {
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { REFERRED_DEADLINE_ENABLED } from "@shared/referral";
import { ArrowLeft, ExternalLink, ArrowRight, Check } from "lucide-react";
import { Link } from "wouter";
import {
  GoalAppShell,
  GoalButton,
  GoalNum,
  GoalStatus,
} from "@/components/goal";
import {
  canMessage,
  companyName,
  isAccepted,
  stageOf,
} from "@/components/thread/threadModel";
import { functionEyebrow } from "@shared/jobFunctions";
import { formatDayTime } from "@/lib/displayPrefs";
import type { ThreadMessage, ThreadRequest, ThreadRole } from "@/lib/threadApi";

type Props = {
  request: ThreadRequest;
  role: Exclude<ThreadRole, "seeker">;
  passed: boolean;
  referrerLabel: string;
  messages: readonly ThreadMessage[];
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  messageError: string;
  referenceId: string | null;
  failure: string;
  loading: boolean;
  onReload: () => void;
  onSend: () => void;
  onAccept: () => Promise<void>;
  onPass: (reason: string, code: string) => Promise<void>;
  onMarkReferred: (reference?: string) => Promise<void>;
  onExtendReferredDeadline: () => Promise<void>;
  onStepBack: () => Promise<void>;
};
export function ReferrerConversation(p: Props) {
  const { request: r, role, passed } = p;
  const accepted = role === "referrer-claimed" && isAccepted(r);
  const stage = stageOf(r);
  const action =
    !passed &&
    ((role === "referrer-pending" && stage === "Requested") ||
      stage === "Accepted");
  const headline = passed
    ? "You passed privately."
    : stage === "Accepted"
      ? "Help this ask become a referral."
      : stage === "Requested"
        ? "Decide if you can open this door."
        : "Keep this referral moving.";
  return (
    <GoalAppShell active="queue" pageTitle="Referral conversation">
      <main
        data-skipwait-screen="referral-conversation"
        className="px-8 py-8 max-gdesk:px-4 max-gdesk:py-6"
      >
        <Link
          href="/queue"
          className="inline-flex min-h-11 items-center gap-2 text-g-meta text-g-ink-2"
        >
          <ArrowLeft className="size-4" />
          Referral queue
        </Link>
        <header className="mt-4 max-w-[920px]">
          <p className="eyebrow text-g-meta text-g-ink-3">
            {functionEyebrow(r.jobFunction, companyName(r))}
          </p>
          <h1 className="mt-2 text-g-display text-g-ink">{headline}</h1>
          <p className="mt-3 break-words text-g-body text-g-ink">
            {r.title ?? "Referral request"}
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <GoalStatus
              status={
                stage === "Requested"
                  ? "queue_new"
                  : stage === "Accepted"
                    ? "accepted"
                    : stage === "Withdrawn" ? "withdrawn" : stage === "Expired" || stage === "Declined" ? "expired" : "referred"
              }
              label={stage}
            />
            {r.targetRoleUrl ? (
              <a
                className="inline-flex min-h-11 items-center gap-2 text-g-meta text-g-ink underline"
                href={r.targetRoleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Official job posting
                <ExternalLink className="size-4" />
              </a>
            ) : null}
          </div>
        </header>
        {p.failure ? (
          <p role="alert" className="mt-4 text-g-meta">
            {p.failure}
            <GoalButton onClick={p.onReload}>Try again</GoalButton>
          </p>
        ) : null}
        <div className="mt-6 grid max-w-[1120px] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <section
              aria-label="Your next step"
              className="border border-g-control-edge p-5"
            >
              <p className="text-g-meta text-g-ink-3">Your next step</p>
              {passed ? (
                <p className="mt-2 text-g-body">
                  The request stays active for other verified employees. Your
                  identity was never revealed.
                </p>
              ) : null}
              <ReferrerDecision
                request={r}
                role={role}
                passed={passed}
                returnPath="/queue"
                onAccept={p.onAccept}
                onPass={p.onPass}
                onMarkReferred={p.onMarkReferred}
                onExtendReferredDeadline={p.onExtendReferredDeadline}
                onStepBack={p.onStepBack}
              />
            </section>
            <section
              aria-label="Conversation"
              className="border-t border-g-hairline pt-5"
            >
              <h2 className="text-g-heading text-g-ink">Conversation</h2>
              {accepted ? (
                <>
                  <ul>
                    {p.messages.map(m => (
                      <li
                        key={m.id}
                        className="border-b border-g-hairline py-4"
                      >
                        <p className="text-g-meta text-g-ink-2">
                          {m.isMine ? "You" : (r.candidateName ?? "Seeker")}
                          {m.createdAt ? (
                            <GoalNum className="ml-2 text-g-ink-3">
                              {formatDayTime(
                                typeof m.createdAt === "number"
                                  ? new Date(m.createdAt)
                                  : m.createdAt
                              )}
                            </GoalNum>
                          ) : null}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-g-body text-g-ink">
                          {m.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {p.messages.length === 0 ? (
                    <p className="mt-3 text-g-meta text-g-ink-2">
                      No messages yet. Use this private thread to coordinate.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-g-meta text-g-ink-2">
                  Private messages open after you accept.
                </p>
              )}
              {canMessage(role, r) ? (
                <form
                  className="mt-4"
                  onSubmit={e => {
                    e.preventDefault();
                    if (!p.sending && p.draft.trim()) p.onSend();
                  }}
                >
                  <label
                    htmlFor="referrer-message"
                    className="text-g-label text-g-ink"
                  >
                    Message
                  </label>
                  <textarea
                    id="referrer-message"
                    className="mt-2 min-h-24 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body"
                    maxLength={3000}
                    value={p.draft}
                    onChange={e => p.setDraft(e.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <GoalButton
                      type="submit"
                      variant={action ? "outline" : "primary"}
                      busy={p.sending}
                      disabledReason={
                        !p.draft.trim() ? "Write a message first" : undefined
                      }
                    >
                      Send
                    </GoalButton>
                  </div>
                </form>
              ) : null}
              {p.messageError ? (
                <p role="alert" className="mt-3 text-g-meta">
                  {p.messageError}
                </p>
              ) : null}
            </section>
          </div>
          <aside className="min-w-0 space-y-6">
            <section className="border-t border-g-hairline pt-5">
              <h2 className="text-g-heading">The ask</h2>
              <p className="mt-3 text-g-label">
                {accepted
                  ? (r.candidateName ?? "Seeker")
                  : "Seeker · identity hidden"}
              </p>
              {r.pitch ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-g-body text-g-ink-2">
                  {r.pitch}
                </p>
              ) : null}
              {accepted ? (
                r.attachments.map(f => (
                  <p className="mt-3 break-all text-g-meta" key={f.id}>
                    {f.url ? (
                      <a
                        className="underline"
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {f.fileName}
                      </a>
                    ) : (
                      f.fileName
                    )}
                  </p>
                ))
              ) : (
                <p className="mt-3 text-g-meta text-g-ink-2">
                  Resume and profile shared after acceptance
                </p>
              )}
              {accepted && r.attachments.some(f => !f.url) ? (
                <p className="mt-3 text-g-meta text-g-ink-2">
                  Resume access has ended. Message the Job Seeker here if you
                  still need it.
                </p>
              ) : null}
            </section>
            {accepted ? (
              <section className="border-t border-g-hairline pt-5">
                <h2 className="text-g-heading">Your referral</h2>
                <p className="mt-2 text-g-meta">{p.referrerLabel}</p>
                {stage === "Referred" ? (
                  <p className="mt-2 text-g-meta">Referral submitted</p>
                ) : null}
                {p.referenceId ? (
                  <p className="mt-2 text-g-meta">
                    Reference ID <GoalNum>{p.referenceId}</GoalNum>
                  </p>
                ) : null}
              </section>
            ) : null}
            <p className="border-t border-g-hairline pt-5 text-g-meta text-g-ink-2">
              A referral is an introduction. It never promises an interview or a
              job. Companies decide hiring.
            </p>
            <p className="text-g-meta text-g-ink-3">
              Referrers are never paid and never ask for money. Never pay or
              accept money for a referral.{" "}
              <Link href="/report" className="underline">
                Report or block
              </Link>
            </p>
          </aside>
        </div>
      </main>
    </GoalAppShell>
  );
}

const PASS_REASONS = PASS_REASON_OPTIONS.map(option => ({
  label: option.label,
  value: option.legacy,
  code: option.code,
}));
const COORDINATE =
  "Use messages to coordinate. Keep personal contact details off-platform only if you both choose to.";
type ReferrerProps = {
  request: ThreadRequest;
  role: Exclude<ThreadRole, "seeker">;
  passed: boolean;
  returnPath: string;
  onAccept: () => Promise<void>;
  onPass: (reason: string, passReason: string) => Promise<void>;
  onMarkReferred: (referenceId?: string) => Promise<void>;
  onExtendReferredDeadline: () => Promise<void>;
  onStepBack: () => Promise<void>;
};
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  return {
    busy,
    error,
    reset: () => setError(""),
    run: async (action: () => Promise<void>, fallback: string) => {
      if (lock.current) return false;
      lock.current = true;
      setBusy(true);
      setError("");
      try {
        await action();
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : fallback);
        return false;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
  };
}
function ModalError({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="mt-4 text-g-meta text-g-ink">
      {message}
    </p>
  ) : null;
}
function DecisionButton({
  variant,
  disabled,
  children,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  asChild?: boolean;
}) {
  if (asChild)
    return <div className="mt-4 text-g-meta underline">{children}</div>;
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled}
      data-g-primary={!variant ? true : undefined}
      className={`inline-flex items-center justify-center gap-2 min-h-11 rounded-g-control px-4 text-g-label disabled:cursor-not-allowed disabled:opacity-50 ${!variant ? "bg-g-primary text-g-on-primary" : "text-g-ink underline underline-offset-2"} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
function DecisionModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (id: string) => ReactNode;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-g-scrim" />
        <Dialog.Content
          className="g-scope fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(480px,calc(100%_-_32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-g-hairline bg-g-surface p-6 shadow-g-popover"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">
            Confirm your next step
          </Dialog.Title>
          {children("referrer-confirm-title")}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function ReferrerDecision({
  request,
  role,
  passed,
  returnPath,
  onAccept,
  onPass,
  onMarkReferred,
  onExtendReferredDeadline,
  onStepBack,
}: ReferrerProps) {
  const [modal, setModal] = useState<
    null | "accept" | "pass" | "referred" | "extend" | "stepback"
  >(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reference, setReference] = useState("");
  // D-052: the referrer always picks a reason actively, so nothing is selected when the pass opens.
  const [reasonCode, setReasonCode] = useState<PassReasonCode | null>(null);
  const action = useAction();
  const stage = stageOf(request);
  const company = companyName(request);
  const open = (
    next: "accept" | "pass" | "referred" | "extend" | "stepback"
  ) => {
    action.reset();
    setConfirmed(false);
    setReference("");
    setReasonCode(null);
    setModal(next);
  };
  const close = () => {
    setModal(null);
    action.reset();
  };
  const submit = (run: () => Promise<void>, fallback: string) => {
    void action.run(run, fallback).then(ok => {
      if (ok) setModal(null);
    });
  };
  const selectedReason = PASS_REASONS.find(
    option => option.code === reasonCode
  );

  return (
    <>
      {passed ? (
        <DecisionButton asChild className="mt-4 w-full">
          <Link href={returnPath}>
            All requests <ArrowRight />
          </Link>
        </DecisionButton>
      ) : role === "referrer-pending" && stage === "Requested" ? (
        <>
          <h2 className="mt-2 text-g-heading">Would you refer this person?</h2>
          {request.decisionDueAt ? (
            <p className="mt-1 text-sm text-g-ink-2">
              Accept or pass by{" "}
              {new Date(request.decisionDueAt).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              . After that it goes back to your colleagues, and nothing is held
              against you.
            </p>
          ) : null}
          <div className="mt-4 grid gap-2">
            <DecisionButton
              variant={modal ? "ghost" : undefined}
              onClick={() => open("accept")}
            >
              Accept &amp; connect <ArrowRight />
            </DecisionButton>
            <DecisionButton variant="ghost" onClick={() => open("pass")}>
              Pass privately
            </DecisionButton>
          </div>
        </>
      ) : stage === "Accepted" ? (
        <>
          <h2 className="mt-2 text-g-heading">Submit through your company.</h2>
          <p className="mt-1 text-sm text-g-ink-2">
            Then mark it here so the seeker knows.
          </p>
          {REFERRED_DEADLINE_ENABLED && request.referredDueAt ? (
            <>
              <p className="mt-1 text-sm text-g-ink-2">
                Mark as referred by{" "}
                {new Date(request.referredDueAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                .
              </p>
              <DecisionButton
                variant={modal ? "ghost" : undefined}
                className="mt-4 w-full"
                onClick={() => open("referred")}
              >
                Mark as referred <Check />
              </DecisionButton>
              {!request.extensionUsed && (
                <DecisionButton
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => open("extend")}
                >
                  Need 3 more days
                </DecisionButton>
              )}
            </>
          ) : (
            <DecisionButton
              variant={modal ? "ghost" : undefined}
              className="mt-4 w-full"
              onClick={() => open("referred")}
            >
              Mark as referred <Check />
            </DecisionButton>
          )}
          {REFERRED_DEADLINE_ENABLED ? (
            <DecisionButton
              variant="destructive"
              className="mt-2 w-full"
              onClick={() => open("stepback")}
            >
              I can't refer this after all
            </DecisionButton>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-g-ink-2">{COORDINATE}</p>
      )}
      {modal === "accept" ? (
        <DecisionModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-g-heading">
                Accept this request?
              </h2>
              <p className="mt-2 text-g-ink-2">
                You&apos;ll both see names, and you&apos;ll get the resume.
              </p>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={event => setConfirmed(event.target.checked)}
                  className="mt-1 size-4"
                />
                I&apos;ll refer only through {company}&apos;s official process
                and won&apos;t accept anything in return.
              </label>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <DecisionButton variant="ghost" onClick={close}>
                  Cancel
                </DecisionButton>
                <DecisionButton
                  disabled={!confirmed || action.busy}
                  onClick={() =>
                    submit(onAccept, "We could not accept this request")
                  }
                >
                  Accept <Check />
                </DecisionButton>
              </footer>
            </>
          )}
        </DecisionModal>
      ) : null}
      {modal === "pass" ? (
        <DecisionModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-g-heading">
                Pass privately
              </h2>
              <p className="mt-2 text-g-ink-2">
                The seeker sees a kind note with your reason. Never your name.
              </p>
              <div
                className="mt-4 grid gap-2"
                role="radiogroup"
                aria-label="Pass reason"
              >
                {PASS_REASONS.map(option => (
                  <label
                    key={option.code}
                    className={`flex min-h-11 items-center gap-3 rounded-g-control border px-3 ${reasonCode === option.code ? "border-g-ink bg-g-surface-hover" : "border-g-control-edge"}`}
                  >
                    <input
                      type="radio"
                      name="pass-reason"
                      checked={reasonCode === option.code}
                      onChange={() => setReasonCode(option.code)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <DecisionButton variant="ghost" onClick={close}>
                  Cancel
                </DecisionButton>
                <DecisionButton
                  disabled={!selectedReason || action.busy}
                  onClick={() => {
                    if (selectedReason)
                      submit(
                        () => onPass(selectedReason.value, selectedReason.code),
                        "We could not record your decision"
                      );
                  }}
                >
                  Pass
                </DecisionButton>
              </footer>
            </>
          )}
        </DecisionModal>
      ) : null}
      {modal === "referred" ? (
        <DecisionModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-g-heading">
                Mark as referred
              </h2>
              <p className="mt-2 text-g-ink-2">
                Tell the seeker you submitted this through your company&apos;s
                process. Optional: add your portal&apos;s reference so the
                seeker can mention it.
              </p>
              <label className="mt-4 block text-sm font-medium">
                Reference ID (optional)
                <input
                  className="mt-2 h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-base"
                  value={reference}
                  maxLength={40}
                  onChange={event => setReference(event.target.value)}
                  placeholder="e.g. TC-4410"
                  autoComplete="off"
                />
              </label>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <DecisionButton variant="ghost" onClick={close}>
                  Cancel
                </DecisionButton>
                <DecisionButton
                  disabled={action.busy}
                  onClick={() =>
                    submit(
                      () => onMarkReferred(reference.trim() || undefined),
                      "We could not mark this as referred"
                    )
                  }
                >
                  Confirm <Check />
                </DecisionButton>
              </footer>
            </>
          )}
        </DecisionModal>
      ) : null}
      {modal === "extend" ? (
        <DecisionModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-g-heading">
                Extend the deadline by 3 days?
              </h2>
              <p className="mt-2 text-g-ink-2">
                This moves your Referred deadline to 8 days from acceptance. You
                can only do this once per acceptance.
              </p>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <DecisionButton variant="ghost" onClick={close}>
                  Cancel
                </DecisionButton>
                <DecisionButton
                  disabled={action.busy}
                  onClick={() =>
                    submit(
                      () => onExtendReferredDeadline(),
                      "We could not extend the deadline"
                    )
                  }
                >
                  Extend <Check />
                </DecisionButton>
              </footer>
            </>
          )}
        </DecisionModal>
      ) : null}
      {modal === "stepback" ? (
        <DecisionModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-g-heading">
                Step back from this referral?
              </h2>
              <p className="mt-2 text-g-ink-2">
                They&apos;ll be told kindly, and the ask opens to your
                colleagues. No fault.
              </p>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <DecisionButton variant="ghost" onClick={close}>
                  Cancel
                </DecisionButton>
                <DecisionButton
                  variant="destructive"
                  disabled={action.busy}
                  onClick={() =>
                    submit(
                      () => onStepBack(),
                      "We could not record your step-back"
                    )
                  }
                >
                  Step back
                </DecisionButton>
              </footer>
            </>
          )}
        </DecisionModal>
      ) : null}
    </>
  );
}
