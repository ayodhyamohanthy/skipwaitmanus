import { ArrowLeft, ArrowRight, Ban, Check, Flag, LifeBuoy, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

const REASONS = [
  ["Asked for or offered money", "Referrals on SkipWait are always free"],
  ["Harassment or inappropriate messages", ""],
  ["Fake job or scam", "Suspicious links, fees, or personal data requests"],
  ["Pretending to work at a company", ""],
  ["Spam or repeated asks", ""],
  ["Something else", ""],
] as const;

export default function Report() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState<string>(REASONS[0][0]);
  const [details, setDetails] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="report-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Report or block</p>
        <h1 className="mt-2 text-3xl font-semibold">What&apos;s going on?</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Reporting is confidential. Sign in so we can follow up on your report.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const token = await fetchToken();
      const params = new URLSearchParams(window.location.search);
      const body: Record<string, unknown> = { reason, details: details.trim() || undefined, urgent };
      const requestId = Number(params.get("request"));
      if (Number.isInteger(requestId) && requestId > 0) body.referralRequestId = requestId;
      const response = await fetch("/api/safety-reports", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      const payload = await readApiJson<{ report?: { reference?: string }; error?: string }>(response, "We could not file this report");
      if (!response.ok) throw new Error(payload.error || "We could not file this report");
      setReference(payload.report?.reference ?? "");
      setStep(2);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not file this report"); }
    finally { setSubmitting(false); }
  };

  return (
    <main data-skipwait-screen="report" className="page-content">
      <button type="button" onClick={() => go("/requests")} className="text-link mb-4 inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />Back to requests</button>

      {step === 0 ? (
        <section>
          <Flag className="mb-3 text-[var(--primary)]" />
          <h1 className="text-3xl font-semibold">What&apos;s going on?</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Reporting is confidential. The other person isn&apos;t told who reported them.</p>
          <div className="mt-6 grid gap-2" role="radiogroup" aria-label="Report reason">
            {REASONS.map(([title, hint]) => (
              <label key={title} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 ${reason === title ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-[var(--border)]"}`}>
                <input type="radio" name="report-reason" checked={reason === title} onChange={() => setReason(title)} className="size-4 accent-[var(--primary)]" />
                <span><strong className="block text-sm">{title}</strong>{hint ? <small className="text-[var(--muted-foreground)]">{hint}</small> : null}</span>
              </label>
            ))}
          </div>
          <div className="mt-8 flex justify-end"><button type="button" className="brand-button" onClick={() => setStep(1)}>Continue <ArrowRight /></button></div>
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="text-3xl font-semibold">Add details</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Optional. Anything that helps us review quickly.</p>
          <label className="mt-6 block"><span className="sr-only">Details</span>
            <textarea value={details} maxLength={2000} onChange={event => setDetails(event.target.value)} placeholder="What happened? Include anything that helps us review quickly." rows={5} className="min-h-32 w-full rounded-2xl border border-[var(--input)] bg-[var(--background)] p-4 text-base" />
          </label>
          <button type="button" aria-pressed={urgent} onClick={() => setUrgent(!urgent)} className={`mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border p-4 text-left ${urgent ? "border-[var(--destructive)] bg-[var(--destructive)]/5" : "border-[var(--border)]"}`}>
            <ShieldAlert className="size-5 shrink-0" />
            <span className="flex-1"><strong className="block text-sm">I feel unsafe</strong><small className="text-[var(--muted-foreground)]">Reviewed first, within hours.</small></span>
            {urgent ? <Check className="text-[var(--destructive)]" /> : null}
          </button>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--muted)] p-4 text-sm text-[var(--muted-foreground)]"><Ban className="mt-0.5 size-4 shrink-0" />To block someone immediately, contact support from this page after filing — blocking both directions is handled by our team for now.</div>
          {error ? <p role="alert" className="mt-4 text-sm font-semibold text-[var(--destructive)]">{error}</p> : null}
          <div className="mt-8 flex justify-between gap-3">
            <button type="button" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]" onClick={() => setStep(0)}><ArrowLeft />Back</button>
            <button type="button" disabled={submitting} onClick={() => { void submit(); }} className="brand-button">{submitting ? "Submitting…" : "Submit report"}</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--accent)]"><ShieldCheck className="size-10 text-[var(--primary)]" /></span>
          <h1 className="mt-4 text-3xl font-semibold">Thanks. We&apos;re on it.</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Here&apos;s what happens next:</p>
          <div className="mt-6 rounded-3xl border border-[var(--border)] p-5 text-left">
            <ol className="space-y-4 text-sm">
              {[["Now", `Report received${reference ? ` · reference ${reference}` : ""}`], [urgent ? "Within 4 hours" : "Within 48 hours", "A person on our safety team reviews it"], ["After review", "We may warn, restrict, or remove the account"], ["Then", "You get a notification with the outcome"]].map(([when, what], i) => (
                <li key={when} className="flex gap-3">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i === 0 ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)]"}`}>{i + 1}</span>
                  <span><strong className="block">{when}</strong><span className="text-[var(--muted-foreground)]">{what}</span></span>
                </li>
              ))}
            </ol>
          </div>
          {urgent ? <div className="mt-4 rounded-2xl bg-[var(--muted)] p-4 text-left text-sm"><LifeBuoy className="mb-2 size-5" />If you&apos;re in immediate danger, contact local emergency services first.</div> : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/support" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Contact support</Link>
            <Link href="/requests" className="brand-button">Back to requests</Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
