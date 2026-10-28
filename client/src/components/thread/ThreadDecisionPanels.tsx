import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { REFERRED_DEADLINE_ENABLED } from "@shared/referral";
import { ArrowRight, Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { referrerGreeting } from "@/components/landed/landedModel";
import type { ThreadRequest, ThreadRole } from "@/lib/threadApi";
import { ModalError, ThreadModal } from "./ThreadModal";
import { companyName, stageIndex, stageOf } from "./threadModel";

/** Pass reasons (D-052); `value` is the legacy decline reason the server routes on, `code` the reason the referrer picked. */
export const PASS_REASONS = PASS_REASON_OPTIONS.map(option => ({ label: option.label, value: option.legacy, code: option.code }));

export const SEEKER_MILESTONES = [
  { status: "interview", stage: "Interviewing" },
  { status: "offer", stage: "Offer" },
  { status: "closed", stage: "Hired" },
] as const;

const COORDINATE = "Use messages to coordinate. Keep personal contact details off-platform only if you both choose to.";
const errorText = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);

/** Run an action for a modal or button: busy while pending, error kept on failure. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>, fallback: string): Promise<boolean> => {
    setBusy(true); setError("");
    try { await action(); return true; }
    catch (reason) { setError(errorText(reason, fallback)); return false; }
    finally { setBusy(false); }
  };
  return { busy, error, run, reset: () => setError("") };
}

type SeekerProps = {
  request: ThreadRequest;
  onWithdraw: () => Promise<void>;
  onProgress: (status: string) => Promise<void>;
  onConfirmReferredEmail: () => Promise<void>;
};

export function SeekerPanel({ request, onWithdraw, onProgress, onConfirmReferredEmail }: SeekerProps) {
  const [modal, setModal] = useState<null | "withdraw" | "confirm">(null);
  const action = useAction();
  const stage = stageOf(request);
  const idx = stageIndex(stage);
  const close = () => { setModal(null); action.reset(); };

  if (stage === "Requested") {
    // Unclaimed: no referrer yet, a personal-link ask its employee has not acted on (D-050), or any assigned ask
    // nobody claimed, such as a D-034 delivery (P0-allocated-ask-stuck). The server re-decides.
    const canWithdraw = request.referrerId === null || request.heldForReferrer === true || request.unclaimedAssignment === true;
    // D-061: a waiting or held ask never reached a verified employee, so withdrawing it returns nothing — nothing was spent.
    const awaitingCoverage = request.queueStatus === "waiting_for_coverage" || request.queueStatus === "held_for_credit";
    return (
      <>
        <h2 className="mt-2 text-lg font-semibold">Nothing to do yet.</h2>
        <p className="mt-1 text-sm text-muted-foreground">We&apos;ll notify you the moment it&apos;s accepted.</p>
        {canWithdraw ? <Button variant="ghost" className="mt-4 w-full" onClick={() => { action.reset(); setModal("withdraw"); }}><Undo2 />Withdraw request</Button> : null}
        {modal === "withdraw" ? (
          <ThreadModal onClose={close}>
            {titleId => (
              <>
                <h2 id={titleId} className="text-xl font-semibold">Withdraw this request?</h2>
                <p className="mt-2 text-muted-foreground">{awaitingCoverage ? "It never reached a verified employee, so no credit was used." : "It leaves the referrer's queue and frees your slot."}</p>
                <ModalError message={action.error} />
                <footer className="mt-6 flex justify-end gap-2">
                  <Button variant="ghost" onClick={close}>Keep it</Button>
                  <Button variant="destructive" disabled={action.busy} onClick={() => { void action.run(onWithdraw, "We could not withdraw this request").then(ok => { if (ok) setModal(null); }); }}>{action.busy ? "Withdrawing…" : "Withdraw"}</Button>
                </footer>
              </>
            )}
          </ThreadModal>
        ) : null}
      </>
    );
  }
  if (stage === "Declined" || stage === "Expired" || stage === "Withdrawn") {
    return <Button asChild className="mt-4 w-full"><Link href="/explore">Find another referrer <ArrowRight /></Link></Button>;
  }
  if (stage === "Hired") {
    return <p className="mt-2 text-sm text-muted-foreground"><Link href={`/landed?request=${request.id}`} className="text-link">Thank {referrerGreeting(request.referrerName)} <ArrowRight className="size-3.5" /></Link></p>;
  }
  if (stage === "Accepted") {
    // D-038-B: the seeker can confirm they got the referral email, which stops
    // the clock and marks the ask as referred. D-038-reconcile R-2: no confirm
    // control while part B is switched off.
    if (request.status === "approved" && REFERRED_DEADLINE_ENABLED) {
      return (
        <>
          <h2 className="mt-2 text-lg font-semibold">Did you get the referral email?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Confirming helps your referrer and records your referral.</p>
          <Button className="mt-4 w-full" onClick={() => { action.reset(); setModal("confirm"); }}>I got the referral email <Check /></Button>
          {request.referredDueAt ? <p className="mt-2 text-sm text-muted-foreground">The referrer&apos;s deadline to mark Referred is {new Date(request.referredDueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.</p> : null}
          {modal === "confirm" ? (
            <ThreadModal onClose={close}>
              {titleId => (
                <>
                  <h2 id={titleId} className="text-xl font-semibold">Confirm you received the referral email?</h2>
                  <p className="mt-2 text-muted-foreground">This tells your referrer you got it and counts the ask as referred.</p>
                  <ModalError message={action.error} />
                  <footer className="mt-6 flex justify-end gap-2">
                    <Button variant="ghost" onClick={close}>Cancel</Button>
                    <Button disabled={action.busy} onClick={() => { void action.run(() => onConfirmReferredEmail(), "We could not record your confirmation").then(ok => { if (ok) setModal(null); }); }}>{action.busy ? "Confirming…" : "Confirm"}</Button>
                  </footer>
                </>
              )}
            </ThreadModal>
          ) : null}
        </>
      );
    }
    return <p className="mt-2 text-sm text-muted-foreground">{COORDINATE}</p>;
  }
  const next = SEEKER_MILESTONES.filter(milestone => stageIndex(milestone.stage) > idx);
  return (
    <>
      <h2 className="mt-2 text-lg font-semibold">Update your progress</h2>
      <div className="mt-3 grid gap-2">
        {next.map(milestone => (
          <Button key={milestone.status} variant="outline" disabled={action.busy} onClick={() => { void action.run(() => onProgress(milestone.status), "We could not record this milestone"); }}>{milestone.stage}</Button>
        ))}
      </div>
      {action.error ? <p role="alert" className="mt-3 text-sm text-destructive">{action.error}</p> : null}
    </>
  );
}

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

export function ReferrerPanel({ request, role, passed, returnPath, onAccept, onPass, onMarkReferred, onExtendReferredDeadline, onStepBack }: ReferrerProps) {
  const [modal, setModal] = useState<null | "accept" | "pass" | "referred" | "extend" | "stepback">(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reference, setReference] = useState("");
  // D-052: the referrer always picks a reason actively, so nothing is selected when the pass opens.
  const [reasonCode, setReasonCode] = useState<PassReasonCode | null>(null);
  const action = useAction();
  const stage = stageOf(request);
  const company = companyName(request);
  const open = (next: "accept" | "pass" | "referred" | "extend" | "stepback") => { action.reset(); setConfirmed(false); setReference(""); setReasonCode(null); setModal(next); };
  const close = () => { setModal(null); action.reset(); };
  const submit = (run: () => Promise<void>, fallback: string) => { void action.run(run, fallback).then(ok => { if (ok) setModal(null); }); };
  const selectedReason = PASS_REASONS.find(option => option.code === reasonCode);

  return (
    <>
      {passed ? (
        <Button asChild className="mt-4 w-full"><Link href={returnPath}>All requests <ArrowRight /></Link></Button>
      ) : role === "referrer-pending" && stage === "Requested" ? (
        <>
          <h2 className="mt-2 text-lg font-semibold">Would you refer this person?</h2>
          {request.decisionDueAt ? <p className="mt-1 text-sm text-muted-foreground">Accept or pass by {new Date(request.decisionDueAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}. After that it goes back to your colleagues, and nothing is held against you.</p> : null}
          <div className="mt-4 grid gap-2">
            <Button onClick={() => open("accept")}>Accept &amp; connect <ArrowRight /></Button>
            <Button variant="ghost" onClick={() => open("pass")}>Pass privately</Button>
          </div>
        </>
      ) : stage === "Accepted" ? (
        <>
          <h2 className="mt-2 text-lg font-semibold">Submit through your company.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Then mark it here so the seeker knows.</p>
          {REFERRED_DEADLINE_ENABLED && request.referredDueAt ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Mark as referred by {new Date(request.referredDueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}.</p>
              <Button className="mt-4 w-full" onClick={() => open("referred")}>Mark as referred <Check /></Button>
              {!request.extensionUsed && (
                <Button variant="outline" className="mt-2 w-full" onClick={() => open("extend")}>Need 3 more days</Button>
              )}
            </>
          ) : (
            <Button className="mt-4 w-full" onClick={() => open("referred")}>Mark as referred <Check /></Button>
          )}
          {REFERRED_DEADLINE_ENABLED ? <Button variant="destructive" className="mt-2 w-full" onClick={() => open("stepback")}>I can't refer this after all</Button> : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{COORDINATE}</p>
      )}
      {modal === "accept" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Accept this request?</h2>
              <p className="mt-2 text-muted-foreground">You&apos;ll both see names, and you&apos;ll get the resume.</p>
              <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4" />I&apos;ll refer only through {company}&apos;s official process and won&apos;t accept anything in return.</label>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={!confirmed || action.busy} onClick={() => submit(onAccept, "We could not accept this request")}>Accept <Check /></Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
      {modal === "pass" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Pass privately</h2>
              <p className="mt-2 text-muted-foreground">The seeker sees a kind note with your reason. Never your name.</p>
              <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Pass reason">
                {PASS_REASONS.map(option => (
                  <label key={option.code} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 ${reasonCode === option.code ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" name="pass-reason" checked={reasonCode === option.code} onChange={() => setReasonCode(option.code)} />{option.label}
                  </label>
                ))}
              </div>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={!selectedReason || action.busy} onClick={() => { if (selectedReason) submit(() => onPass(selectedReason.value, selectedReason.code), "We could not record your decision"); }}>Pass</Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
      {modal === "referred" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Mark as referred</h2>
              <p className="mt-2 text-muted-foreground">Tell the seeker you submitted this through your company&apos;s process. Optional: add your portal&apos;s reference so the seeker can mention it.</p>
              <label className="mt-4 block text-sm font-medium">Reference ID (optional)<input className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-base" value={reference} maxLength={40} onChange={event => setReference(event.target.value)} placeholder="e.g. TC-4410" autoComplete="off" /></label>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={action.busy} onClick={() => submit(() => onMarkReferred(reference.trim() || undefined), "We could not mark this as referred")}>Confirm <Check /></Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
      {modal === "extend" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Extend the deadline by 3 days?</h2>
              <p className="mt-2 text-muted-foreground">This moves your Referred deadline to 8 days from acceptance. You can only do this once per acceptance.</p>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={action.busy} onClick={() => submit(() => onExtendReferredDeadline(), "We could not extend the deadline")}>Extend <Check /></Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
      {modal === "stepback" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Step back from this referral?</h2>
              <p className="mt-2 text-muted-foreground">They&apos;ll be told kindly, and the ask opens to your colleagues. No fault.</p>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button variant="destructive" disabled={action.busy} onClick={() => submit(() => onStepBack(), "We could not record your step-back")}>Step back</Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
    </>
  );
}
