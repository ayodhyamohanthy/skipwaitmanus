import { ArrowRight, Mail } from "lucide-react";
import { Link } from "wouter";

type Template = { name: string; channel: string; trigger: string };
const TEMPLATES: Template[] = [
  { name: "Work-email code", channel: "Email", trigger: "Sent when a referrer requests a one-time code. 6 digits, 10-minute expiry, 5 attempts." },
  { name: "Welcome", channel: "Email", trigger: "Sent after first sign-in with the honest next step for the account type." },
  { name: "Request claimed", channel: "Email + in-app", trigger: "A verified employee claims a pending ask. Seeker sees company domain only." },
  { name: "Ask accepted", channel: "Email + in-app", trigger: "A referrer accepts. Messaging opens; identities follow the accept rules." },
  { name: "Ask passed", channel: "Email + in-app", trigger: "A referrer passes. The ask stays active for other employees; the slot is not freed." },
  { name: "New message", channel: "In-app", trigger: "A private message arrives in an accepted conversation." },
  { name: "Waiting for coverage", channel: "In-app", trigger: "An ask has no verified employees available yet at the company." },
  { name: "Slot opened", channel: "Email", trigger: "A referrer opens capacity and waiting asks become reviewable." },
  { name: "Review ready", channel: "Email + Slack", trigger: "A private review link is prepared for a verified employee. Never includes candidate content." },
  { name: "Re-verify reminder", channel: "Email", trigger: "A work-email verification approaches its re-check window." },
  { name: "Report outcome", channel: "In-app", trigger: "A safety report the user filed reaches resolved or dismissed." },
  { name: "Payment receipt / failed", channel: "Email", trigger: "A credit purchase or subscription event confirms — or a payment fails with next steps." },
];

export default function Emails() {
  return (
    <div data-skipwait-screen="emails" className="min-h-screen bg-[var(--background)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-xl font-semibold tracking-[-.04em]" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <span className="eyebrow">Internal reference</span>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <span className="eyebrow">Transactional mail</span>
        <h1 className="mt-2 text-4xl font-semibold">Every email we send<span className="brand-dot">.</span></h1>
        <p className="mt-2 max-w-2xl text-[var(--muted-foreground)]">Twelve templates, each fired by exactly one real event. Managed server-side and always private — marketing mail never exists. <Link href="/alerts" className="text-link">See in-app updates <ArrowRight /></Link></p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map(template => (
            <li key={template.name}>
              <article className="h-full rounded-3xl border border-[var(--border)] p-5">
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)]"><Mail className="size-3.5" />{template.channel}</p>
                <h2 className="mt-2 font-semibold">{template.name}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{template.trigger}</p>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
