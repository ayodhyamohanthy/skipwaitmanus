import { WifiOff } from "lucide-react";
import { Link } from "wouter";
import { readReferralDraft } from "@/lib/pwaContinuity";

export default function Offline() {
  const draft = typeof window !== "undefined" ? readReferralDraft() : null;
  const hasDraft = Boolean(draft?.targetUrl);
  return (
    <main data-skipwait-screen="offline" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black">
      <div className="mx-auto flex h-full max-w-xl flex-col">
        <header className="flex h-10 shrink-0 items-center"><Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#505050]">Home</Link></header>
        <section className="flex flex-1 flex-col justify-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ededff] text-[#0000ff]"><WifiOff className="h-6 w-6" /></span>
          <h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">You’re offline.</h1>
          <p className="mt-4 text-sm leading-6 text-[#505050]">No request was sent and nothing was lost. Reconnect to continue.</p>
          {hasDraft ? <p role="status" className="mt-4 rounded-xl border border-[#0000ff] bg-[#ededff] px-4 py-3 text-sm font-semibold text-black">Your referral draft is saved on this device: {draft?.targetUrl}</p> : null}
        </section>
        <footer className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-bold text-white">Try again</button>
        </footer>
      </div>
    </main>
  );
}
