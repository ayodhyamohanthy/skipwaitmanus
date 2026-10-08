import { RefreshCw, WifiOff } from "lucide-react";
import { readReferralDraft } from "@/lib/pwaContinuity";

// Kit v4 app state "Offline": saved-info banner, centered icon, "No connection.",
// draft reassurance, and a brand Try again button.
export default function Offline() {
  const draft = typeof window !== "undefined" ? readReferralDraft() : null;
  const hasDraft = Boolean(draft?.targetUrl);
  return (
    <main data-skipwait-screen="offline" className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div role="status" aria-live="polite" className="flex items-center gap-3 bg-[var(--muted)] px-6 py-3 text-sm"><WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />You're offline. Showing saved info.</div>
      <section className="m-auto w-full max-w-sm px-6 py-10 text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[var(--muted)]"><WifiOff aria-hidden="true" /></span>
        <h1 className="text-2xl font-semibold">No connection.</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">Your drafts are saved on this device and will send when you're back online.</p>
        {hasDraft ? <p role="status" className="mt-4 break-words rounded-xl border border-[var(--foreground)] bg-[var(--muted)] px-4 py-3 text-sm font-semibold">Your referral draft is saved on this device: {draft?.targetUrl}</p> : null}
        <button type="button" onClick={() => window.location.reload()} className="brand-button mt-6 w-full"><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button>
      </section>
    </main>
  );
}
