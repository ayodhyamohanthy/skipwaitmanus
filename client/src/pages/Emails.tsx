import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";

/**
 * /emails — full preview of every transactional message skipwait.me sends,
 * in the kit v4 template-gallery layout (app/src/routes/emails.tsx).
 *
 * Each template names the one real event that fires it. Everything here is
 * static preview content: nothing sends, and no signed-in user data renders.
 */
type Template = {
  name: string;
  subject: string;
  trigger: string;
  body: readonly string[];
  /** Push companion shown alongside the email, when the real event sends one. */
  push?: string;
  /** Button label the real email carries, when it has one. */
  cta?: string;
  /** The work-email code arrives as a six-digit code block. */
  code?: string;
};

const TEMPLATES: readonly [Template, ...Template[]] = [
  { name: "Work-email code", subject: "Your SkipWait code: 482 913", trigger: "a referrer requests a one-time work-email code.", body: ["Use this code to verify you work at Wipro. It expires in 10 minutes.", "Didn't ask for this? Ignore this email — nothing changes."], code: "482 913" },
  { name: "Welcome", subject: "Welcome to SkipWait — your first ask is free", trigger: "someone signs in for the first time.", body: ["You have 3 free credits and 3 open asks.", "Start by finding a verified referrer at a company you want."], cta: "Explore companies" },
  { name: "Ask accepted", subject: "Good news: a Wipro referrer accepted your ask", trigger: "a verified employee accepts a pending ask.", body: ["A verified referrer accepted your ask for Product Designer. You can now message each other, and they can see your resume."], push: "Your Wipro ask was accepted 🎉", cta: "Open conversation" },
  { name: "Ask passed", subject: "An update on your Wipro ask", trigger: "a referrer passes on an ask.", body: ["A referrer passed on this one: “Not my team or function.” It's not a judgment of you.", "Your slot is free again."], push: "Update on your Wipro ask", cta: "Find another referrer" },
  { name: "Expiring soon", subject: "Your TCS ask expires tomorrow", trigger: "an ask approaches expiry with no acceptance yet.", body: ["Nobody has accepted yet. A sharper note often helps — try naming one result."], push: "TCS ask expires in 24h", cta: "Edit my ask" },
  { name: "New ask (referrer)", subject: "New referral ask: Product Designer", trigger: "a new ask arrives for a verified employee to review.", body: ["Someone asked for a referral for a Design role at Wipro. Their identity stays hidden until you accept.", "Passing is private and always okay."], push: "New ask · Product Designer", cta: "Review ask" },
  { name: "Re-verify", subject: "Please re-verify your Wipro email", trigger: "a work-email verification approaches its re-check window.", body: ["It's been 90 days. Re-verify in 30 seconds to keep receiving asks."], cta: "Re-verify" },
  { name: "Alert match", subject: "A door just opened at Merkle", trigger: "a verified referrer matching a saved alert becomes open to asks.", body: ["A verified referrer in Design is now open to asks at Merkle — matching your alert."], push: "New referrer at Merkle · Design", cta: "View Merkle" },
  { name: "Weekly summary", subject: "Your week on SkipWait", trigger: "the weekly digest is prepared.", body: ["2 asks open · 1 accepted · 1 expiring soon", "6 plan credits expire Friday."], cta: "See my asks" },
  { name: "Receipt", subject: "Receipt: Momentum, monthly", trigger: "a credit purchase or subscription payment confirms.", body: ["Momentum plan · $20 · 6 Oct 2026", "Next renewal 6 Nov 2026. Cancel anytime from Plans & credits."], cta: "View receipt" },
  { name: "Payment failed", subject: "We couldn't renew Momentum", trigger: "a subscription renewal payment fails.", body: ["Your bank declined the payment. You keep access for 7 days while you update your card."], push: "Payment issue — action needed", cta: "Update payment" },
  { name: "Report outcome", subject: "Update on your report #R-2048", trigger: "a filed safety report reaches resolved or dismissed.", body: ["Thanks for reporting. We reviewed it and took action under our Community Guidelines. For privacy, we can't share details."] },
];

const SENDER = "SkipWait <noreply@skipwait.me>";

export default function Emails() {
  const [selected, setSelected] = useState<string>(TEMPLATES[0].name);
  const template: Template = TEMPLATES.find(item => item.name === selected) ?? TEMPLATES[0];
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
        {template.push ? <div className="mx-auto max-w-sm rounded-2xl bg-background p-3 shadow-md"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className="grid size-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">S</span>SKIPWAIT · now</div><p className="mt-1 text-sm font-semibold">{template.push}</p></div> : null}
        <article aria-label={template.name} className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-background">
          <div className="border-b border-border p-4 text-sm">
            <p><span className="text-muted-foreground">From:</span> {SENDER}</p>
            <p className="font-semibold">{template.subject}</p>
            <p className="mt-1 text-xs text-muted-foreground">Fires when {template.trigger}</p>
          </div>
          <div className="p-8">
            <p className="wordmark text-xl">SkipWait<span className="brand-dot">.</span></p>
            {template.body.map(line => <p key={line} className="mt-3 leading-relaxed">{line}</p>)}
            {template.code ? <p role="img" aria-label="Six-digit code" className="mt-6 rounded-2xl bg-muted py-5 text-center text-3xl font-semibold tracking-[0.3em]">{template.code}</p> : null}
            {template.cta ? <span className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">{template.cta}</span> : null}
            <hr className="my-8 border-border" />
            <p className="text-xs text-muted-foreground">Referrals on SkipWait are always free. We'll never ask for money or your password. · Manage notifications</p>
          </div>
        </article>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">Twelve templates, each fired by exactly one real event. Managed server-side and always private — marketing mail never exists. <Link href="/alerts" className="text-link">See in-app updates <ArrowRight /></Link></p>
      </div>
    </div>
  </div>;
}
