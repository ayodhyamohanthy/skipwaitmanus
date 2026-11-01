// Goal /report (D-048-p3-support, packet docs/plans/D-048-account.md): "Report a problem."
// The kit flow is kept exactly: the same 3 steps (reason, details, done), one
// black commit per step, the same POST /api/safety-reports body, the block of
// the other participant only with a conversation in context (POST /api/blocks
// after the report is filed), the urgent path and the honest support route.
// A refused report shows the server's own words and stays on the details step;
// a failed block keeps the filed report and says the block did not go through.
// Offline, the submit commit waits and names why, and nothing is sent.
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Ban, Check, ShieldAlert } from "lucide-react";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton, GoalNextStep, useOnlineStatus } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { cn } from "@/lib/utils";
import { REPORT_REASONS } from "./supportContent";

export const GOAL_PAGE = { goalLine: "Report a problem." } as const;

const MAIN = "g-scope mx-auto flex w-full max-w-2xl flex-col bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-5 gdesk:py-7";
const OFFLINE_REASON = "You're offline. Reconnect to send your report.";

function requestIdFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const id = Number(new URLSearchParams(window.location.search).get("request"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function StepLabel({ step }: { step: number }) {
  return <p className="mt-6 text-g-meta text-g-ink-3">Step <span className="g-num">{step + 1}</span> of <span className="g-num">3</span></p>;
}

function Toggle({ pressed, onToggle, icon: Icon, title, hint }: { pressed: boolean; onToggle(): void; icon: typeof Ban; title: string; hint: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn("g-hit flex min-h-14 w-full items-center gap-3 rounded-g-control border p-4 text-left transition-colors duration-(--g-dur-hover)", pressed ? "border-g-ink bg-g-surface-selected" : "border-g-hairline hover:bg-g-surface-hover")}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-g-ink" strokeWidth={1.75} />
      <span className="flex-1"><span className="block text-g-label text-g-ink">{title}</span><span className="block text-g-meta text-g-ink-2">{hint}</span></span>
      {pressed ? <Check aria-hidden="true" className="size-5 shrink-0 text-g-ink" strokeWidth={1.75} /> : null}
    </button>
  );
}

export default function GoalReport() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0][0]);
  const [details, setDetails] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockError, setBlockError] = useState("");

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="report-sign-in" data-goal-page="report" className={MAIN}>
        <p className="text-g-meta text-g-ink-3">Report or block</p>
        <h1 className="mt-2 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-2 text-g-body text-g-ink-2">Reporting is confidential. The other person isn&apos;t told who reported them.</p>
        <div className="mt-6">
          <GoalNextStep reason="Sign in so we can follow up on your report.">
            <div className="mt-3"><SignInButton><GoalButton variant="primary">Sign in</GoalButton></SignInButton></div>
          </GoalNextStep>
        </div>
      </main>
    );
  }

  const reportRequestId = requestIdFromUrl();
  const backTarget = reportRequestId ? `/conversation/${reportRequestId}` : "/requests";
  const backLabel = reportRequestId ? "Back to conversation" : "Back to requests";

  const submit = async () => {
    if (!online) return;
    setSubmitting(true); setError("");
    try {
      const token = await fetchToken();
      const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const body: Record<string, unknown> = { reason, details: details.trim() || undefined, urgent };
      if (reportRequestId) body.referralRequestId = reportRequestId;
      const response = await fetch("/api/safety-reports", { method: "POST", credentials: "include", headers, body: JSON.stringify(body) });
      const payload = await readApiJson<{ report?: { reference?: string }; error?: string }>(response, "We could not file this report");
      if (!response.ok) throw new Error(payload.error || "We could not file this report");
      setReference(payload.report?.reference ?? "");
      setStep(2);
      if (alsoBlock && reportRequestId) {
        try {
          const blockResponse = await fetch("/api/blocks", { method: "POST", credentials: "include", headers, body: JSON.stringify({ referralRequestId: reportRequestId }) });
          if (!blockResponse.ok) throw new Error("Your report was filed, but the block did not go through — you can block from Settings.");
          setBlocked(true);
        } catch (blockReason) {
          setBlockError(blockReason instanceof Error ? blockReason.message : "Your report was filed, but the block did not go through.");
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not file this report");
    } finally {
      setSubmitting(false);
    }
  };

  const timeline: ReadonlyArray<readonly [string, string]> = [
    ["Now", `Report received${reference ? ` · reference #${reference}` : ""}`],
    [urgent ? "Within 4 hours" : "Within 48 hours", "A person on our safety team reviews it"],
    ["After review", "We may warn, restrict, or remove the account"],
    ["Then", "You get a notification with the outcome"],
  ];

  return (
    <main data-skipwait-screen="report" data-goal-page="report" className={MAIN}>
      <button type="button" onClick={() => go(backTarget)} className="g-hit -ml-1 inline-flex items-center gap-1 self-start text-g-meta text-g-ink-2 hover:text-g-ink">
        <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />{backLabel}
      </button>
      <h1 className="mt-4 text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-2 text-g-body text-g-ink-2">Reporting is confidential. The other person isn&apos;t told who reported them.</p>

      {step === 0 ? (
        <>
          <StepLabel step={0} />
          <h2 className="mt-1 text-g-heading text-g-ink">What&apos;s going on?</h2>
          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Report reason">
            {REPORT_REASONS.map(([title, hint]) => (
              <label key={title} className={cn("g-hit flex min-h-14 cursor-pointer items-center gap-3 rounded-g-control border p-4", reason === title ? "border-g-ink bg-g-surface-selected" : "border-g-hairline hover:bg-g-surface-hover")}>
                <input type="radio" name="report-reason" checked={reason === title} onChange={() => setReason(title)} className="size-4 accent-g-ink" />
                <span><span className="block text-g-label text-g-ink">{title}</span>{hint ? <span className="block text-g-meta text-g-ink-2">{hint}</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="mt-6">
            <GoalNextStep reason="Pick the closest reason. You can add details next.">
              <div className="mt-3"><GoalButton variant="primary" onClick={() => setStep(1)}>Continue</GoalButton></div>
            </GoalNextStep>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <StepLabel step={1} />
          <h2 className="mt-1 text-g-heading text-g-ink">Add details</h2>
          <p className="mt-1 text-g-meta text-g-ink-2">Optional. Anything that helps us review quickly. Reason: {reason}.</p>
          <label className="mt-4 block">
            <span className="sr-only">Details</span>
            <textarea
              value={details}
              maxLength={2000}
              onChange={event => setDetails(event.target.value)}
              placeholder="What happened? Include anything that helps us review quickly."
              className="min-h-32 w-full rounded-g-control border border-g-control-edge bg-g-surface p-4 text-g-body text-g-ink placeholder:text-g-ink-3"
            />
          </label>
          <div className="mt-3 grid gap-2">
            {reportRequestId ? (
              <Toggle pressed={alsoBlock} onToggle={() => setAlsoBlock(!alsoBlock)} icon={Ban} title="Also block this person" hint="They can't message you or appear in your inbox. They aren't told." />
            ) : (
              <p className="flex items-start gap-2 border border-g-hairline p-4 text-g-meta text-g-ink-2">
                <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                To block someone immediately, contact support from this page after filing — blocking both directions is handled by our team for now.
              </p>
            )}
            <Toggle pressed={urgent} onToggle={() => setUrgent(!urgent)} icon={ShieldAlert} title="I feel unsafe" hint="Reviewed first, within hours." />
          </div>
          {error ? <p role="alert" className="mt-4 text-g-label text-g-crimson">{error}</p> : null}
          <div className="mt-6">
            <GoalNextStep reason={reportRequestId && alsoBlock ? "We file the report first, then block this person." : "A person on our safety team reviews every report."}>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GoalButton
                  variant="primary"
                  busy={submitting}
                  busyLabel="Submitting…"
                  disabledReason={!online ? OFFLINE_REASON : undefined}
                  onClick={() => { void submit(); }}
                >
                  Submit report
                </GoalButton>
                <GoalButton variant="ghost" leadingIcon={ArrowLeft} onClick={() => setStep(0)}>Back</GoalButton>
              </div>
              {!online ? <p className="mt-2 text-g-meta text-g-ink-2">Nothing is sent while you&apos;re offline; reconnect to send your report.</p> : null}
            </GoalNextStep>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <StepLabel step={2} />
          <h2 className="mt-1 text-g-heading text-g-ink">Thanks. We&apos;re on it.</h2>
          <p className="mt-1 text-g-body text-g-ink-2">{blocked ? "This person is blocked. " : ""}Here&apos;s what happens next:</p>
          <ol className="mt-4 grid gap-4 border-y border-g-hairline py-4">
            {timeline.map(([when, what], index) => (
              <li key={when} className="flex gap-3">
                <span aria-hidden="true" className={cn("mt-2 size-(--g-dot) shrink-0 rounded-full", index === 0 ? "bg-g-ink" : "border border-g-control-edge")} />
                <span><span className="block text-g-label text-g-ink">{when}</span><span className="block text-g-meta text-g-ink-2">{what}</span></span>
              </li>
            ))}
          </ol>
          {blockError ? <p role="alert" className="mt-4 text-g-label text-g-crimson">{blockError}</p> : null}
          {urgent ? <p className="mt-4 border border-g-hairline p-4 text-g-meta text-g-ink">If you&apos;re in immediate danger, contact local emergency services first.</p> : null}
          <div className="mt-6">
            <GoalNextStep reason="We'll notify you when the review is done.">
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GoalButton variant="primary" asChild><Link href="/requests">Back to requests</Link></GoalButton>
                {/* Blocking is self-serve only with a conversation in context; otherwise
                    the details step sends people to support, so that route stays here. */}
                {reportRequestId
                  ? <GoalButton variant="ghost" asChild><Link href="/settings">Manage blocked people</Link></GoalButton>
                  : <GoalButton variant="ghost" asChild><Link href="/support">Contact support</Link></GoalButton>}
              </div>
            </GoalNextStep>
          </div>
        </>
      ) : null}
    </main>
  );
}
