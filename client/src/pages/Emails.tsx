import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * /emails — reference for every transactional message skipwait.me sends, in
 * the kit v4 template-gallery layout (app/src/routes/emails.tsx).
 *
 * Each entry describes the one real event that fires it. Nothing here is a
 * sample message: no example codes, people, companies or prices. Subjects are
 * omitted where they carry user data; the card names the template instead.
 */
type Template = {
  name: string;
  channel: "Email" | "Email + in-app" | "In-app" | "Email + Slack";
  trigger: string;
  /** The work-email code arrives as a six-digit code block. */
  code?: true;
  /** Button label the real email carries, when it has one. */
  cta?: string;
};

const TEMPLATES = [
  { name: "Work-email code", channel: "Email", trigger: "Sent when a referrer requests a one-time code. 6 digits, 10-minute expiry, 5 attempts.", code: true },
  { name: "Welcome", channel: "Email", trigger: "Sent after first sign-in with the honest next step for the account type." },
  { name: "Request claimed", channel: "Email + in-app", trigger: "A verified employee claims a pending ask. Seeker sees company domain only." },
  { name: "Ask accepted", channel: "Email + in-app", trigger: "A referrer accepts. Messaging opens; identities follow the accept rules." },
  { name: "Ask passed", channel: "Email + in-app", trigger: "A referrer passes. The ask stays active for other employees; the slot is not freed." },
  { name: "New message", channel: "In-app", trigger: "A private message arrives in an accepted conversation." },
  { name: "Waiting for coverage", channel: "In-app", trigger: "An ask has no verified employees available yet at the company." },
  { name: "Slot opened", channel: "Email", trigger: "A referrer opens capacity and waiting asks become reviewable.", cta: "View private request" },
  { name: "Review ready", channel: "Email + Slack", trigger: "A private review link is prepared for a verified employee. Never includes candidate content.", cta: "Open private review" },
  { name: "Re-verify reminder", channel: "Email", trigger: "A work-email verification approaches its re-check window." },
  { name: "Report outcome", channel: "In-app", trigger: "A safety report the user filed reaches resolved or dismissed." },
  { name: "Payment receipt / failed", channel: "Email", trigger: "A credit purchase or subscription event confirms — or a payment fails with next steps." },
] as const satisfies readonly [Template, ...Template[]];

const SENDER = "SkipWait <noreply@skipwait.me>";

export default function Emails() {
  const [selected, setSelected] = useState<string>(TEMPLATES[0].name);
  const template: Template = TEMPLATES.find(item => item.name === selected) ?? TEMPLATES[0];
  const emailed = template.channel !== "In-app";
  return <div data-skipwait-screen="emails" className="min-h-screen bg-muted">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
      <Link href="/" className="wordmark" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
      <h1 className="text-xs font-semibold text-muted-foreground">EMAIL & IN-APP TEMPLATES</h1>
    </header>
    <div className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 md:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Templates" className="flex gap-1 overflow-x-auto md:flex-col">
        {TEMPLATES.map(item => {
          const active = item.name === template.name;
          return <button key={item.name} type="button" aria-pressed={active} onClick={() => setSelected(item.name)} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm ${active ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{item.name}</button>;
        })}
      </nav>
      <div className="min-w-0 space-y-4">
        <article aria-label={template.name} className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-background">
          <div className="border-b border-border p-4 text-sm">
            <p>{emailed ? <><span className="text-muted-foreground">From:</span> {SENDER}</> : <><span className="text-muted-foreground">In-app:</span> SkipWait notifications</>}</p>
            <p className="font-semibold">{template.name}</p>
          </div>
          <div className="p-8">
            <p className="wordmark text-xl">SkipWait<span className="brand-dot">.</span></p>
            <p className="mt-4 leading-relaxed">{template.trigger}</p>
            <p className="mt-4 leading-relaxed text-muted-foreground">Sent by: {template.channel}</p>
            {template.code ? <p role="img" aria-label="Six-digit code" className="mt-6 rounded-2xl bg-muted py-5 text-center text-3xl font-semibold tracking-[0.3em]">••• •••</p> : null}
            {template.cta ? <span className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">{template.cta}</span> : null}
            <hr className="my-8 border-border" />
            <p className="text-xs text-muted-foreground">Referrals on SkipWait are always free. We'll never ask for money or your password.</p>
          </div>
        </article>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">Twelve templates, each fired by exactly one real event. Managed server-side and always private — marketing mail never exists. <Link href="/alerts" className="text-link">See in-app updates <ArrowRight /></Link></p>
      </div>
    </div>
  </div>;
}
