import { ArrowRight, Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { ThreadRequest, ThreadRole } from "@/lib/threadApi";
import { ModalError, ThreadModal } from "./ThreadModal";
import { companyName, stageIndex, stageOf } from "./threadModel";

/** Kit pass reasons mapped to the server's one-click decline reasons. */
export const PASS_REASONS = [
  { label: "Not my team or function", value: "role_not_a_fit" },
  { label: "Role needs more experience", value: "role_not_a_fit" },
  { label: "Not enough context", value: "cannot_support" },
  { label: "At capacity right now", value: "timing" },
  { label: "Prefer not to say", value: "cannot_support" },
] as const;

const SEEKER_MILESTONES = [
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
};

export function SeekerPanel({ request, onWithdraw, onProgress }: SeekerProps) {
  const [modal, setModal] = useState<null | "withdraw">(null);
  const action = useAction();
  const stage = stageOf(request);
  const idx = stageIndex(stage);
  const close = () => { setModal(null); action.reset(); };

  if (stage === "Requested") {
    const canWithdraw = request.referrerId === null;
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
                <p className="mt-2 text-muted-foreground">It leaves the referrer&apos;s queue and frees your slot.</p>
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
    return <p className="mt-2 text-sm text-muted-foreground"><Link href="/landed" className="text-link">Open the landed journey <ArrowRight className="size-3.5" /></Link></p>;
  }
<<<<<<< HEAD
  if (status === "closed") {
    return (
      <div>
        <h2>This request is closed.</h2>
        <p>Your private history stays protected. Thank your referrer with a message when you&apos;re ready.</p>
        <button type="button" className="brand-button mt-4 w-full" onClick={() => go("/landed")}>Open the landed journey <ArrowRight /></button>
      </div>
    );
  }
  const next = SEEKER_MILESTONES.filter(milestone => STATUS_ORDER.indexOf(milestone.status) > order);
  return (
    <div>
      <h2>Update your progress</h2>
      <div className="mt-3 grid gap-2">
        {next.map(milestone => (
          <ProgressButton key={milestone.status} status={milestone.status} label={milestone.label} onProgress={onProgress} />
        ))}
      </div>
      <p>Use messages to coordinate. Keep personal contact details off this thread unless you both choose to share them.</p>
    </div>
  );
}

function ProgressButton({ status, label, onProgress }: { status: string; label: string; onProgress: (status: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
=======
  const next = SEEKER_MILESTONES.filter(milestone => stageIndex(milestone.stage) > idx);
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
  return (
    <>
      <h2 className="mt-2 text-lg font-semibold">Update your progress</h2>
      <div className="mt-3 grid gap-2">
        {next.map(milestone => (
          <Button key={milestone.status} variant="outline" disabled={action.busy} onClick={() => { void action.run(() => onProgress(milestone.status), "We could not record this milestone"); }}>{milestone.stage}</Button>
        ))}
      </div>
      {action.error ? <p role="alert" className="mt-3 text-sm text-destructive">{action.error}</p> : null}
      {stage === "Accepted" ? <p className="mt-4 text-sm text-muted-foreground">{COORDINATE}</p> : null}
    </>
  );
}

type ReferrerProps = {
  request: ThreadRequest;
  role: Exclude<ThreadRole, "seeker">;
  passed: boolean;
  returnPath: string;
  onAccept: () => Promise<void>;
  onPass: (reason: string) => Promise<void>;
  onMarkReferred: () => Promise<void>;
};

export function ReferrerPanel({ request, role, passed, returnPath, onAccept, onPass, onMarkReferred }: ReferrerProps) {
  const [modal, setModal] = useState<null | "accept" | "pass" | "referred">(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reasonLabel, setReasonLabel] = useState<string>(PASS_REASONS[0].label);
  const action = useAction();
  const stage = stageOf(request);
  const company = companyName(request.companyDomain);
  const open = (next: "accept" | "pass" | "referred") => { action.reset(); setConfirmed(false); setModal(next); };
  const close = () => { setModal(null); action.reset(); };
  const submit = (run: () => Promise<void>, fallback: string) => { void action.run(run, fallback).then(ok => { if (ok) setModal(null); }); };
  const reasonValue = PASS_REASONS.find(option => option.label === reasonLabel)?.value ?? PASS_REASONS[0].value;

  return (
    <>
      {passed ? (
        <Button asChild className="mt-4 w-full"><Link href={returnPath}>All requests <ArrowRight /></Link></Button>
      ) : role === "referrer-pending" && stage === "Requested" ? (
        <>
          <h2 className="mt-2 text-lg font-semibold">Would you refer this person?</h2>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => open("accept")}>Accept &amp; connect <ArrowRight /></Button>
            <Button variant="ghost" onClick={() => open("pass")}>Pass privately</Button>
          </div>
        </>
      ) : stage === "Accepted" ? (
        <>
          <h2 className="mt-2 text-lg font-semibold">Submit through your company.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Then mark it here so the seeker knows.</p>
          <Button className="mt-4 w-full" onClick={() => open("referred")}>Mark as referred <Check /></Button>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{COORDINATE}</p>
      )}
      {modal === "accept" ? (
        <ThreadModal onClose={close}>
          {titleId => (
            <>
              <h2 id={titleId} className="text-xl font-semibold">Accept this request?</h2>
              <p className="mt-2 text-muted-foreground">You&apos;ll see their name, and you&apos;ll get the resume.</p>
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
              <p className="mt-2 text-muted-foreground">The seeker sees a kind note. Never your name.</p>
              <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Pass reason">
                {PASS_REASONS.map(option => (
                  <label key={option.label} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 ${reasonLabel === option.label ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" name="pass-reason" checked={reasonLabel === option.label} onChange={() => setReasonLabel(option.label)} />{option.label}
                  </label>
                ))}
              </div>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={action.busy} onClick={() => submit(() => onPass(reasonValue), "We could not record your decision")}>Pass</Button>
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
              <p className="mt-2 text-muted-foreground">Tell the seeker you submitted this through your company&apos;s process.</p>
              <ModalError message={action.error} />
              <footer className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancel</Button>
                <Button disabled={action.busy} onClick={() => submit(onMarkReferred, "We could not mark this as referred")}>Confirm <Check /></Button>
              </footer>
            </>
          )}
        </ThreadModal>
      ) : null}
    </>
  );
}
