import { ArrowRight, Check, Undo2 } from "lucide-react";
import { useState } from "react";
import { isPostApprovalReferralStatus, type ReferralStatus } from "@shared/referral";
import type { ThreadRequest } from "@/lib/threadApi";

/** Kit pass reasons mapped to the server's one-click decline reasons. */
export const PASS_REASONS = [
  { label: "Not my team or function", value: "role_not_a_fit" },
  { label: "Role needs more experience", value: "role_not_a_fit" },
  { label: "Not enough context", value: "cannot_support" },
  { label: "At capacity right now", value: "timing" },
  { label: "Prefer not to say", value: "cannot_support" },
] as const;

const SEEKER_MILESTONES = [
  { status: "interview", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "closed", label: "Hired" },
] as const;
const STATUS_ORDER: readonly string[] = ["pending", "approved", "intro_made", "interview", "offer", "closed", "declined", "withdrawn"] as const;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>✕</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

type SeekerProps = {
  request: ThreadRequest;
  go: (path: string) => void;
  onWithdraw: (id: number) => Promise<void>;
  onProgress: (status: string) => Promise<void>;
};

export function SeekerPanel({ request, go, onWithdraw, onProgress }: SeekerProps) {
  const [modal, setModal] = useState<null | "withdraw">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = request.status as ReferralStatus;
  const order = STATUS_ORDER.indexOf(status);

  const confirmWithdraw = async () => {
    setBusy(true); setError("");
    try { await onWithdraw(request.id); setModal(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not withdraw this request"); }
    finally { setBusy(false); }
  };

  if (status === "pending") {
    return (
      <div>
        <h2>Nothing to do yet.</h2>
        <p>We&apos;ll notify you the moment it&apos;s accepted.</p>
        <button type="button" className="brand-button mt-4 w-full border-2 border-[var(--foreground)] bg-[var(--background)]" onClick={() => { setError(""); setModal("withdraw"); }}>
          <Undo2 />Withdraw request
        </button>
        {modal === "withdraw" ? (
          <Modal title="Withdraw this request?" onClose={() => setModal(null)}>
            <p>It leaves the referrer&apos;s queue and frees your slot.</p>
            {error ? <p role="alert">{error}</p> : null}
            <footer>
              <button type="button" onClick={() => setModal(null)}>Keep it</button>
              <button type="button" disabled={busy} onClick={() => { void confirmWithdraw(); }}>{busy ? "Withdrawing…" : "Withdraw"}</button>
            </footer>
          </Modal>
        ) : null}
      </div>
    );
  }
  if (status === "declined") {
    return (
      <div>
        <h2>Try another verified referrer.</h2>
        <p>Passing is private and never about you — your slot is open again.</p>
        <button type="button" className="brand-button mt-4 w-full" onClick={() => go("/start")}>Find another referrer <ArrowRight /></button>
      </div>
    );
  }
  if (status === "withdrawn") {
    return (
      <div>
        <h2>You withdrew this request.</h2>
        <p>Your credit was returned to your balance.</p>
        <button type="button" className="brand-button mt-4 w-full" onClick={() => go("/start")}>Request a referral <ArrowRight /></button>
      </div>
    );
  }
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
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="brand-button w-full border-2 border-[var(--foreground)] bg-[var(--background)]"
        onClick={() => {
          setBusy(true); setError("");
          void onProgress(status).catch(reason => setError(reason instanceof Error ? reason.message : "We could not record this milestone")).finally(() => setBusy(false));
        }}
      >
        {label}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

type ReferrerProps = {
  request: ThreadRequest;
  claimed: boolean;
  busy: boolean;
  error: string;
  onAccept: () => Promise<void>;
  onPass: (reason: string) => Promise<void>;
  onMarkReferred: () => Promise<void>;
};

export function ReferrerPanel({ request, claimed, busy, error, onAccept, onPass, onMarkReferred }: ReferrerProps) {
  const [modal, setModal] = useState<null | "accept" | "pass" | "referred">(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState<string>(PASS_REASONS[0].value);
  const [reasonLabel, setReasonLabel] = useState<string>(PASS_REASONS[0].label);
  const status = request.status as ReferralStatus;

  const run = async (action: () => Promise<void>) => {
    await action();
    setModal(null);
    setConfirmed(false);
  };

  return (
    <div>
      {status === "pending" ? (
        <>
          <h2>Would you refer this person?</h2>
          <div className="mt-4 grid gap-2">
            <button type="button" className="brand-button w-full" onClick={() => { setModal("accept"); }}>Accept &amp; connect <ArrowRight /></button>
            <button type="button" className="min-h-11 w-full text-center text-sm font-semibold" onClick={() => { setModal("pass"); }}>Pass privately</button>
          </div>
          <p className="mt-3 text-sm">No reply needed to pass — but a quick answer helps. Your identity is never revealed when you pass.</p>
        </>
      ) : null}
      {claimed && status === "approved" ? (
        <>
          <h2>Submit through your company.</h2>
          <p>Then mark it here so the seeker knows.</p>
          <button type="button" className="brand-button mt-4 w-full" onClick={() => { setModal("referred"); }}>Mark as referred <Check /></button>
        </>
      ) : null}
      {claimed && isPostApprovalReferralStatus(status) && status !== "approved" ? (
        <p>Use messages to coordinate. The seeker records milestones from their side.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {modal === "accept" ? (
        <Modal title="Accept this request?" onClose={() => setModal(null)}>
          <p>You&apos;ll both see names, and you&apos;ll get the resume.</p>
          <label>
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            I&apos;ll refer only through {request.companyDomain}&apos;s official process and won&apos;t accept anything in return.
          </label>
          <footer>
            <button type="button" onClick={() => setModal(null)}>Cancel</button>
            <button type="button" disabled={!confirmed || busy} onClick={() => { void run(onAccept); }}>Accept <Check /></button>
          </footer>
        </Modal>
      ) : null}
      {modal === "pass" ? (
        <Modal title="Pass privately" onClose={() => setModal(null)}>
          <p>The seeker sees a kind note. Never your name.</p>
          <div role="radiogroup" aria-label="Pass reason">
            {PASS_REASONS.map(option => (
              <label key={option.label}>
                <input type="radio" name="pass-reason" checked={reasonLabel === option.label} onChange={() => { setReason(option.value); setReasonLabel(option.label); }} />
                {option.label}
              </label>
            ))}
          </div>
          <footer>
            <button type="button" onClick={() => setModal(null)}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => { void run(() => onPass(reason)); }}>Pass</button>
          </footer>
        </Modal>
      ) : null}
      {modal === "referred" ? (
        <Modal title="Mark as referred" onClose={() => setModal(null)}>
          <p>Tell the seeker you submitted this through your company&apos;s process.</p>
          <footer>
            <button type="button" onClick={() => setModal(null)}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => { void run(onMarkReferred); }}>Confirm <Check /></button>
          </footer>
        </Modal>
      ) : null}
    </div>
  );
}
