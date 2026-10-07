import { ArrowRight, Braces, KeyRound, Webhook } from "lucide-react";
import { Link } from "wouter";

export default function Developers() {
  return (
    <div data-skipwait-screen="developers" className="min-h-screen bg-[var(--background)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-xl font-semibold tracking-[-.04em]" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <span className="eyebrow">For builders</span>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <span className="eyebrow">Developer access</span>
        <h1 className="mt-2 text-4xl font-semibold">Build on real referrals<span className="brand-dot">.</span></h1>
        <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">Register apps and agents, approve every send, and keep referrers human. Referrers are never automated — every ask and every credit spend needs the user&apos;s approval.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <Braces className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">Assistant connections</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">OAuth consent with six explicit states. Connect, review, and revoke anytime.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <KeyRound className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">API tokens</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Scoped tokens with a full activity log. Availability follows the assistant backend.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <Webhook className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">MCP + webhooks</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Assistant and agent access over MCP with human-confirmed sends.</p>
          </article>
        </div>
        <div className="mt-8 rounded-3xl bg-[var(--muted)] p-5 text-sm">
          <p><strong>Availability.</strong> Third-party app registration, consent screens, token issuance, and the approval sheet ship with the assistant backend. This page describes the contract; the flows stay closed until the consent service, token ledger, and audit log land.</p>
          <p className="mt-2"><Link href="/support" className="text-link">Contact support for early access <ArrowRight /></Link></p>
        </div>
      </main>
    </div>
  );
}
