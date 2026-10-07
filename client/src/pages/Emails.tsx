import { useState } from "react";
import { Link } from "wouter";

/**
 * Kit v4 `/emails` (screens/web/38_emails__default.png,
 * app/src/routes/emails.tsx).
 *
 * A gallery of the twelve email and push templates. Standalone, with its own
 * header — the capture shows no app sidebar.
 *
 * TWO CHANGES FOR PRODUCTION:
 *
 * 1. The header label drops "· DESIGN". Every other preview marker on this
 *    screen is gone too; the templates themselves are the content.
 *
 * 2. The receipt and payment-failed templates no longer name "Momentum" or a
 *    "$20" price. Those are the kit's plan names, and this product sells Pro
 *    and Max — the same error class as an invented price, which is why /help
 *    carries the same fix. The templates now say "your plan" and carry no
 *    amount until the pricing decision lands (D2).
 *
 * Sample names, companies and counts in the other templates are the kit's
 * approved template copy: this screen previews what a template looks like, and
 * a template with no sample content previews nothing. Nothing here sends mail —
 * production sends stay server-driven through the existing providers.
 */

type Template = { name: string; subject: string; push?: string; body: string[]; cta?: string; code?: string };

const TEMPLATES: Template[] = [
  { name: "Work-email code", subject: "Your SkipWait code: 482 913", body: ["Use this code to verify you work at Wipro. It expires in 10 minutes.", "Didn't ask for this? Ignore this email — nothing changes."], code: "482 913" },
  { name: "Welcome", subject: "Welcome to SkipWait — your first ask is free", body: ["You have 3 free credits and 3 open asks.", "Start by finding a verified referrer at a company you want."], cta: "Explore companies" },
  { name: "Ask accepted", subject: "Good news: a Wipro referrer accepted your ask", push: "Your Wipro ask was accepted 🎉", body: ["A verified referrer accepted your ask for Product Designer. You can now message each other, and they can see your resume."], cta: "Open conversation" },
  { name: "Ask passed", subject: "An update on your Wipro ask", push: "Update on your Wipro ask", body: ["A referrer passed on this one: “Not my team or function.” It's not a judgment of you.", "Your slot is free again."], cta: "Find another referrer" },
  { name: "Expiring soon", subject: "Your TCS ask expires tomorrow", push: "TCS ask expires in 24h", body: ["Nobody has accepted yet. A sharper note often helps — try naming one result."], cta: "Edit my ask" },
  { name: "New ask (referrer)", subject: "New referral ask: Product Designer", push: "New ask · Product Designer", body: ["Someone asked for a referral for a Design role at Wipro. Their identity stays hidden until you accept.", "Passing is private and always okay."], cta: "Review ask" },
  { name: "Re-verify", subject: "Please re-verify your Wipro email", body: ["It's been 90 days. Re-verify in 30 seconds to keep receiving asks."], cta: "Re-verify" },
  { name: "Alert match", subject: "A door just opened at Merkle", push: "New referrer at Merkle · Design", body: ["A verified referrer in Design is now open to asks at Merkle — matching your alert."], cta: "View Merkle" },
  { name: "Weekly summary", subject: "Your week on SkipWait", body: ["2 asks open · 1 accepted · 1 expiring soon", "6 plan credits expire Friday."], cta: "See my asks" },
  { name: "Receipt", subject: "Receipt: your monthly plan", body: ["Your monthly plan renewed.", "Next renewal 6 Nov 2026. Cancel anytime from Plans & credits."], cta: "View receipt" },
  { name: "Payment failed", subject: "We couldn't renew your plan", push: "Payment issue — action needed", body: ["Your bank declined the payment. You keep access for 7 days while you update your card."], cta: "Update payment" },
  { name: "Report outcome", subject: "Update on your report #R-2048", body: ["Thanks for reporting. We reviewed it and took action under our Community Guidelines. For privacy, we can't share details."] },
];

export default function Emails() {
  const [index, setIndex] = useState(0);
  const template = TEMPLATES[index]!;

  return (
    <div data-skipwait-screen="emails" className="min-h-dvh bg-muted">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="text-2xl font-bold">SkipWait<span className="text-primary">.</span></Link>
        <span className="text-xs font-semibold text-muted-foreground">Email &amp; push templates</span>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Templates" className="flex gap-1 overflow-x-auto md:flex-col">
          {TEMPLATES.map((entry, position) => (
            <button
              key={entry.name}
              type="button"
              aria-pressed={index === position}
              onClick={() => setIndex(position)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm ${index === position ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
            >
              {entry.name}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          {template.push && (
            <div className="mx-auto max-w-sm rounded-2xl bg-background p-3 shadow-md">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="grid size-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground" aria-hidden="true">S</span>
                SKIPWAIT · now
              </div>
              <p className="mt-1 text-sm font-semibold">{template.push}</p>
            </div>
          )}

          <article className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-background">
            <div className="border-b border-border p-4 text-sm">
              <p><span className="text-muted-foreground">From:</span> SkipWait &lt;noreply@skipwait.me&gt;</p>
              <p className="font-semibold">{template.subject}</p>
            </div>
            <div className="p-8">
              <p className="text-xl font-bold">SkipWait<span className="text-primary">.</span></p>
              {template.body.map(line => <p key={line} className="mt-4 leading-relaxed">{line}</p>)}
              {template.code && <p className="mt-6 rounded-2xl bg-muted py-5 text-center text-3xl font-semibold tracking-[0.3em]">{template.code}</p>}
              {template.cta && <span className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">{template.cta}</span>}
              <hr className="my-8 border-border" />
              <p className="text-xs text-muted-foreground">
                Referrals on SkipWait are always free. We'll never ask for money or your password. · Manage notifications
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
