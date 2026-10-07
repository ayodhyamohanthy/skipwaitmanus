import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/emails")({
  head: () => pageMeta("Email and notification templates", "Every SkipWait email and push notification: verification code, ask accepted, expiry, weekly summary, receipts and more."),
  component: Emails,
});

type T = { name: string; subject: string; push?: string; body: string[]; cta?: string; code?: string };
const t: T[] = [
  { name: "Work-email code", subject: "Your SkipWait code: 482 913", body: ["Use this code to verify you work at Wipro. It expires in 10 minutes.", "Didn't ask for this? Ignore this email — nothing changes."], code: "482 913" },
  { name: "Welcome", subject: "Welcome to SkipWait — your first ask is free", body: ["You have 3 free credits and 3 open asks.", "Start by finding a verified referrer at a company you want."], cta: "Explore companies" },
  { name: "Ask accepted", subject: "Good news: a Wipro referrer accepted your ask", push: "Your Wipro ask was accepted 🎉", body: ["A verified referrer accepted your ask for Product Designer. You can now message each other, and they can see your resume."], cta: "Open conversation" },
  { name: "Ask passed", subject: "An update on your Wipro ask", push: "Update on your Wipro ask", body: ["A referrer passed on this one: “Not my team or function.” It's not a judgment of you.", "Your slot is free again."], cta: "Find another referrer" },
  { name: "Expiring soon", subject: "Your TCS ask expires tomorrow", push: "TCS ask expires in 24h", body: ["Nobody has accepted yet. A sharper note often helps — try naming one result."], cta: "Edit my ask" },
  { name: "New ask (referrer)", subject: "New referral ask: Product Designer", push: "New ask · Product Designer", body: ["Someone asked for a referral for a Design role at Wipro. Their identity stays hidden until you accept.", "Passing is private and always okay."], cta: "Review ask" },
  { name: "Re-verify", subject: "Please re-verify your Wipro email", body: ["It's been 90 days. Re-verify in 30 seconds to keep receiving asks."], cta: "Re-verify" },
  { name: "Alert match", subject: "A door just opened at Merkle", push: "New referrer at Merkle · Design", body: ["A verified referrer in Design is now open to asks at Merkle — matching your alert."], cta: "View Merkle" },
  { name: "Weekly summary", subject: "Your week on SkipWait", body: ["2 asks open · 1 accepted · 1 expiring soon", "6 plan credits expire Friday."], cta: "See my asks" },
  { name: "Receipt", subject: "Receipt: Momentum, monthly", body: ["Momentum plan · $20 · 6 Oct 2026", "Next renewal 6 Nov 2026. Cancel anytime from Plans & credits."], cta: "View receipt" },
  { name: "Payment failed", subject: "We couldn't renew Momentum", push: "Payment issue — action needed", body: ["Your bank declined the payment. You keep access for 7 days while you update your card."], cta: "Update payment" },
  { name: "Report outcome", subject: "Update on your report #R-2048", body: ["Thanks for reporting. We reviewed it and took action under our Community Guidelines. For privacy, we can't share details."] },
];

function Emails() {
  const [i, setI] = useState(0);
  const x = t[i]!;
  return <div className="min-h-screen bg-muted">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link><span className="text-xs font-semibold text-muted-foreground">EMAIL & PUSH TEMPLATES · DESIGN</span></header>
    <div className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 md:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">{t.map((e, j) => <button key={e.name} onClick={() => setI(j)} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm ${i === j ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{e.name}</button>)}</nav>
      <div className="min-w-0 space-y-4">
        {x.push && <div className="mx-auto max-w-sm rounded-2xl bg-background p-3 shadow-md"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid size-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">S</span>SKIPWAIT · now</div><p className="mt-1 text-sm font-semibold">{x.push}</p></div>}
        <article className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-background">
          <div className="border-b border-border p-4 text-sm"><p><span className="text-muted-foreground">From:</span> SkipWait &lt;noreply@skipwait.me&gt;</p><p className="font-semibold">{x.subject}</p></div>
          <div className="p-8"><p className="wordmark text-xl">SkipWait<span className="brand-dot">.</span></p>{x.body.map(b => <p key={b} className="mt-4 leading-relaxed">{b}</p>)}{x.code && <p className="mt-6 rounded-2xl bg-muted py-5 text-center text-3xl font-semibold tracking-[0.3em]">{x.code}</p>}{x.cta && <span className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">{x.cta}</span>}<hr className="my-8 border-border" /><p className="text-xs text-muted-foreground">Referrals on SkipWait are always free. We'll never ask for money or your password. · Manage notifications</p></div>
        </article>
      </div>
    </div>
  </div>;
}
