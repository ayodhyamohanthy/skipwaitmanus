/**
 * Deterministic error surface for the pending screens (spec §2.2 / §2.4 / §2.6).
 *
 * Copy pattern, in order: what happened (title) → why (detail) → reassurance
 * (what is still true) → a primary retry + a quiet escape hatch. The list or
 * record behind the error is never cleared; this card sits alongside it.
 *
 * Tinted with the shared error tokens (`#b91c1c` on `#FEF3F2`), `role="alert"`
 * so the failure is announced once, and both actions stay ≥ 44 px tall.
 */
export function ActionErrorCard({ title, detail, reassurance, retryLabel = "Try again", onRetry, dismissLabel, onDismiss, retrying = false, className = "" }: {
  title: string;
  detail?: string;
  reassurance?: string;
  retryLabel?: string;
  onRetry?: () => void;
  dismissLabel?: string;
  onDismiss?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return <div role="alert" data-skipwait-error="true" className={`rounded-xl border border-danger-border bg-danger-tint p-4 ${className}`}>
    <p className="text-sm font-bold text-danger">{title}</p>
    {detail ? <p className="mt-1 text-sm leading-6 text-slate-700">{detail}</p> : null}
    {reassurance ? <p className="mt-1 text-sm leading-6 text-slate-700">{reassurance}</p> : null}
    {onRetry || onDismiss ? <div className="mt-3 flex gap-2">
      {onRetry ? <button type="button" disabled={retrying} onClick={onRetry} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{retrying ? "Retrying…" : retryLabel}</button> : null}
      {onDismiss ? <button type="button" onClick={onDismiss} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-surface px-4 py-2.5 text-sm font-bold text-slate-700">{dismissLabel ?? "Dismiss"}</button> : null}
    </div> : null}
  </div>;
}
