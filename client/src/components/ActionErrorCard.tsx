/**
 * Deterministic error surface for the pending screens (spec §2.2 / §2.4 / §2.6).
 *
 * Copy pattern, in order: what happened (title) → why (detail) → reassurance
 * (what is still true) → a primary retry + a quiet escape hatch. The list or
 * record behind the error is never cleared; this card sits alongside it.
 *
 * Tinted with the error tint ground derived from the brand functional token
 * (`bg-[#b91c1c]/10` on a `border-[#b91c1c]/30` hairline), `role="alert"`
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
  return <div role="alert" data-skipwait-error="true" className={`rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-4 ${className}`}>
    <p className="text-sm font-bold text-[#b91c1c]">{title}</p>
    {detail ? <p className="mt-1 text-sm leading-6 text-[#505050]">{detail}</p> : null}
    {reassurance ? <p className="mt-1 text-sm leading-6 text-[#505050]">{reassurance}</p> : null}
    {onRetry || onDismiss ? <div className="mt-3 flex gap-2">
      {onRetry ? <button type="button" disabled={retrying} onClick={onRetry} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-[#131311] px-4 py-2.5 text-sm font-bold text-white">{retrying ? "Retrying…" : retryLabel}</button> : null}
      {onDismiss ? <button type="button" onClick={onDismiss} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-bold text-[#505050]">{dismissLabel ?? "Dismiss"}</button> : null}
    </div> : null}
  </div>;
}
