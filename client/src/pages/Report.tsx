import { useCallback, useState } from "react";
import { ArrowLeft, ArrowRight, Ban, Check, Flag, LifeBuoy, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/report` (screens/web/29_report__*.png, app/src/routes/report.tsx).
 *
 * Three designed states: reason → details → confirmation. The kit's
 * "DESIGN PREVIEW · NOTHING IS SUBMITTED" banner is deliberately absent: this
 * is the production screen, not the preview, and the kit requires those
 * banners be removed once a screen is backed by real data.
 *
 * Reason ids are the server enum in drizzle/schema.ts (`safetyReports.reason`),
 * so the label→value mapping here is a contract, not copy.
 */

const REASONS = [
  { id: "money_request", label: "Asked for or offered money", hint: "Referrals on SkipWait are always free" },
  { id: "harassment", label: "Harassment or inappropriate messages", hint: "" },
  { id: "fake_job", label: "Fake job or scam", hint: "Suspicious links, fees, or personal data requests" },
  { id: "impersonation", label: "Pretending to work at a company", hint: "" },
  { id: "spam", label: "Spam or repeated asks", hint: "" },
  { id: "other", label: "Something else", hint: "" },
] as const;

type ReasonId = (typeof REASONS)[number]["id"];
type Filed = { reference: string; urgent: boolean; blocked: boolean };

const readContext = () => {
  if (typeof window === "undefined") return { subjectUserId: undefined as number | undefined, backTo: "/requests", backLabel: "Back to requests" };
  const params = new URLSearchParams(window.location.search);
  const subject = Number(params.get("subject"));
  const threadId = params.get("thread");
  return {
    subjectUserId: Number.isInteger(subject) && subject > 0 ? subject : undefined,
    backTo: threadId ? `/conversation/${threadId}` : "/requests",
    backLabel: threadId ? "Back to conversation" : "Back to requests",
  };
};

export default function Report() {
  const [{ subjectUserId, backTo, backLabel }] = useState(readContext);
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<ReasonId>("money_request");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [filed, setFiled] = useState<Filed | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subjectUserId, reason, details: details.trim() || undefined, urgent, block }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "We could not submit this report");
      setFiled({ reference: String(payload.reference), urgent: Boolean(payload.urgent), blocked: Boolean(payload.blocked) });
      setStep(2);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We could not submit this report");
    } finally {
      setSubmitting(false);
    }
  }, [block, details, reason, subjectUserId, urgent]);

  const timeline = filed ? [
    { when: "Now", what: `Report received · reference ${filed.reference}` },
    { when: filed.urgent ? "Within 4 hours" : "Within 48 hours", what: "A person on our safety team reviews it" },
    { when: "After review", what: "We may warn, restrict, or remove the account" },
    { when: "Then", what: "You get a notification with the outcome" },
  ] : [];

  return (
    <main data-skipwait-screen="report" className="page-content mx-auto max-w-2xl">
      <Link href={backTo} className="text-link mb-4 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />{backLabel}
      </Link>

      {step === 0 && (
        <section>
          <Flag className="mb-3 size-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-semibold">What's going on?</h1>
          <p className="mt-2 text-muted-foreground">Reporting is confidential. The other person isn't told who reported them.</p>
          <div role="radiogroup" aria-label="Reason for this report" className="mt-6 grid gap-2">
            {REASONS.map(option => {
              const selected = reason === option.id;
              return (
                <label key={option.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-4 ${selected ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="radio" name="report-reason" value={option.id} checked={selected} onChange={() => setReason(option.id)} className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold">{option.label}</strong>
                    {option.hint && <small className="block text-xs text-muted-foreground">{option.hint}</small>}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-8 flex justify-end">
            <button type="button" onClick={() => setStep(1)} className="brand-button inline-flex items-center gap-2 bg-primary text-primary-foreground">
              Continue <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="text-3xl font-semibold">Add details</h1>
          <p className="mt-2 text-muted-foreground">Optional. The relevant messages are attached automatically.</p>
          <label htmlFor="report-details" className="sr-only">Details</label>
          <textarea
            id="report-details"
            value={details}
            onChange={event => setDetails(event.target.value)}
            maxLength={2000}
            placeholder="What happened? Include anything that helps us review quickly."
            className="mt-6 min-h-32 w-full rounded-lg border border-input bg-background p-4 text-base"
          />
          <div className="mt-4 space-y-2">
            <button
              type="button"
              aria-pressed={block}
              onClick={() => setBlock(current => !current)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-4 text-left ${block ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <Ban className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold">Also block this person</strong>
                <small className="block text-xs text-muted-foreground">They can't message or send you asks. They won't be notified.</small>
              </span>
              {block && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
            </button>
            <button
              type="button"
              aria-pressed={urgent}
              onClick={() => setUrgent(current => !current)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-4 text-left ${urgent ? "border-destructive bg-destructive/5" : "border-border"}`}
            >
              <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm font-semibold">I feel unsafe</strong>
                <small className="block text-xs text-muted-foreground">Reviewed first, within hours.</small>
              </span>
              {urgent && <Check className="size-5 shrink-0 text-destructive" aria-hidden="true" />}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span>{error} Your report has not been sent.</span>
              <button type="button" onClick={() => void submit()} className="min-h-11 rounded-lg border border-destructive/30 bg-background px-4 text-xs font-bold text-destructive">Try again</button>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep(0)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
              <ArrowLeft className="size-4" aria-hidden="true" />Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="brand-button inline-flex items-center gap-2 bg-primary text-primary-foreground"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </section>
      )}

      {step === 2 && filed && (
        <section className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent">
            <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-3xl font-semibold">Thanks. We're on it.</h1>
          <p className="mt-2 text-muted-foreground">{filed.blocked ? "This person is blocked. " : ""}Here's what happens next:</p>
          <div className="mt-6 rounded-lg border border-border bg-background p-6 text-left">
            <ol className="space-y-4 text-sm">
              {timeline.map((entry, index) => (
                <li key={entry.when} className="flex gap-3">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                  <span>
                    <strong className="block font-semibold">{entry.when}</strong>
                    <span className="text-muted-foreground">{entry.what}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {filed.urgent && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-4 text-left text-sm">
              <LifeBuoy className="size-5 shrink-0" aria-hidden="true" />
              <span className="text-muted-foreground">If you're in immediate danger, contact local emergency services first.</span>
            </div>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/settings" className="inline-flex min-h-11 items-center rounded-lg border border-foreground bg-background px-5 text-sm font-semibold">Manage blocked people</Link>
            <Link href="/requests" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Back to requests</Link>
          </div>
        </section>
      )}
    </main>
  );
}
