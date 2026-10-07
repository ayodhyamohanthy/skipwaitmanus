import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Bell, Check, Coins, CreditCard, Crown, Gauge, Link2, LockKeyhole, MessageSquareText, ShieldCheck, Smartphone, Sparkles, Wallet as WalletIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { creditActions, creditPacks, fairnessRules, proLevels, seekerPlans, signatureTools } from "@/lib/monetization-data";

export const Route = createFileRoute("/plans")({ head: () => pageMeta("Individual plans and credits", "Upgrade SkipWait Start, Momentum or Land when you need more. Every referral stays free and every queue stays equal."), component: Plans });

// Preview-only values: backend must replace with the signed-in user's real usage. Never show other users' stats.
const usageStats = [
  { label: "Open referral slots used", value: "3 of 3", hint: "A slot frees when a request is answered or passed.", pct: 100 },
  { label: "Credits used", value: "2 of 3", hint: "Free welcome credits. Purchased credits never expire.", pct: 66 },
  { label: "Plan credits expiring", value: "0", hint: "Shown 7 days before included credits roll off.", pct: 0 },
];
const upgradeNudges = [
  { trigger: "All open slots in use", title: "Your 3 requests are all open", copy: "Wait for an answer to free a slot, or move to Momentum for 15 open requests. Queue position stays equal either way.", cta: "See Momentum", alt: "I'll wait" },
  { trigger: "Credit balance reaches 0", title: "You're out of credits", copy: "Add a pack once, or get 30 credits every month with Momentum.", cta: "Add credits", alt: "Compare plans" },
  { trigger: "Plan credits about to roll off", title: "4 credits expire in 7 days", copy: "Use them on an Ask One-Pager, or move up for longer carryover.", cta: "Use credits", alt: "Dismiss" },
];

const compare = [
  ["Ask for referrals", true, true, true, true], ["Open requests at once", "3", "8", "15", "30–unlimited"], ["Place in referrer queue", "Equal", "Equal", "Equal", "Equal"], ["Preparation tools", "Limited", "Expanded", "Advanced", "Maximum"], ["Uploads and memory", "Limited", "Expanded", "More", "Highest"], ["Role and company research", "Basic", "Basic", "Advanced", "Maximum"], ["Guided workflows", false, false, false, true], ["Showcase pieces", "3", "10", "Unlimited", "Unlimited"], ["Pinned on requests", "1", "3", "6", "6"], ["Custom profile link", false, false, true, true], ["Private work insights", false, false, true, true], ["Monthly credit carryover", "—", "1 month", "3 months", "Rolls over"],
] as const;

const moments = [
  { icon: MessageSquareText, title: "While writing an ask", copy: "“Your note doesn’t mention the role. Ask coach can tighten it in one tap.”" },
  { icon: Bell, title: "After a referrer passes", copy: "“Get alerted the moment someone new opens up at Wipro.”" },
  { icon: Gauge, title: "On your profile", copy: "“Your profile is 60% ready. See what a referrer will notice first.”" },
  { icon: Link2, title: "When sharing work", copy: "“Claim skipwait.me/yourname for one clean link to everything.”" },
];

const faqs = [
  ["Does paying help me get referred?", "No. Referrers see the same queue and never know who pays. Paid plans expand preparation tools; the decision stays human."],
  ["How many referral requests can I have open?", "Free includes 3 open requests at a time. Start raises it to 8, Momentum to 15, and Land to 30 — 50 on Sprint, unlimited on Concierge. A request that's answered or passed frees the slot. Every plan shares the same queue."],
  ["What are credits for?", "1 credit = $1 = one finished piece of work, like a research report or mock interview. Everyone gets 3 free credits, plans include monthly credits, and bigger packs save up to 30%."],
  ["Do unused credits expire?", "Credits you buy never expire — even if you cancel. Monthly plan credits carry over: 1 month on Start, 3 months on Momentum, and they roll over while you're subscribed on Land."],
  ["Can I cancel?", "Anytime, in two taps. You keep your work, requests and history on Free."],
  ["Do referrers pay?", "Never. Referrers are always free, and can receive optional thank-you tips that go fully to them."],
  ["Is pricing local?", "Yes. Prices adapt to your country so the platform stays fair globally."],
] as const;

function Cell({ v }: { v: boolean | string }) { return typeof v === "string" ? <span>{v}</span> : v ? <Check className="ok" aria-label="Included" /> : <X className="no" aria-label="Not included" />; }

const methods = [{ id: "upi", label: "UPI", icon: Smartphone }, { id: "card", label: "Card", icon: CreditCard }, { id: "wallet", label: "Wallet", icon: WalletIcon }] as const;

function Plans() {
  const [proLevel, setProLevel] = useState<(typeof proLevels)[number]["id"]>("focus");
  const [chosen, setChosen] = useState<string | null>(null);
  const [pack, setPack] = useState<string>("c30");
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [method, setMethod] = useState<string>("upi");
  const [yearly, setYearly] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const selectedPro = proLevels.find(level => level.id === proLevel) ?? proLevels[0];
  const sel = creditPacks.find(p => p.id === pack) ?? creditPacks[0];
  return <main className="page-content plans-page">
    <div className="page-heading"><div><span className="eyebrow">INDIVIDUAL PLANS · <Link to="/billing" className="underline">Manage plan</Link></span><h1>Choose how much help you need<span className="brand-dot">.</span></h1><p>Everyone starts free — no card needed. Upgrade when your search grows. Referrals stay free on every plan, and queue position never changes.</p></div><div className="heading-aside"><span className="preview-label">EXAMPLE PRICING</span><button type="button" className="credit-cta" onClick={() => { setCreditsOpen(true); setStep(0); }}><Coins /><b>3 free credits</b><span>Add credits</span></button></div></div>

    <section className="plan-grid individual-plan-grid">{seekerPlans.map(p => <article key={p.id} className={`plan-card ${"featured" in p && p.featured ? "featured" : ""}`}>
      {"featured" in p && p.featured && <span className="plan-flag"><Crown />Most chosen</span>}
      <h2>{p.name}</h2><p className="plan-tag">{p.tagline}</p>
      <div className="plan-billing" role="radiogroup" aria-label="Billing period">
        <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "selected" : ""} onClick={() => setYearly(false)}>Monthly</button>
        <button type="button" role="radio" aria-checked={yearly} className={yearly ? "selected" : ""} onClick={() => setYearly(true)}>Yearly <span className="save-flag">2 mo free</span></button>
      </div>
      <div className="plan-price"><strong>{p.id === "pro" ? (yearly ? selectedPro.yearly : selectedPro.price) : (yearly ? p.yearly : p.price)}</strong><span>{yearly ? "per year · 2 months free" : p.cadence}</span></div>
      {p.id === "pro" && <><div className="pro-levels" role="radiogroup" aria-label="Land level">{proLevels.map(level => <Button key={level.id} type="button" variant="ghost" role="radio" aria-checked={proLevel === level.id} className={proLevel === level.id ? "selected" : ""} onClick={() => setProLevel(level.id)}>{yearly ? level.yearly : level.price}</Button>)}</div><p className="pro-detail"><strong>{selectedPro.label}</strong> · {selectedPro.detail}</p></>}
      <ul>{p.features.map(f => <li key={f}><Check />{f}</li>)}</ul>
      <Button className="brand-button" onClick={() => setChosen(`${p.name}${p.id === "pro" ? ` ${yearly ? selectedPro.yearly : selectedPro.price}` : ""}${yearly ? " · yearly" : ""}`)}>{p.cta}<ArrowRight /></Button>
    </article>)}
    </section>
    <p className="plan-grid-note">Every account starts on the free tier — asking for referrals, tracking requests and showing your first three pieces of work cost nothing, ever. Upgrading only adds preparation room.</p>

    <section className="plans-section credits-section" id="credits">
      <span className="eyebrow">NO SUBSCRIPTION NEEDED</span>
      <div className="credits-bar-wrap">
        <div className="credits-bar">
          <div className="balance"><Coins /><div><span className="eyebrow">YOUR BALANCE</span><strong>0 <small>credits</small></strong></div></div>
          <ul className="cost-strip" aria-label="Popular credit costs">{creditActions.slice(0, 3).map(a => <li key={a.action}><span className="cost-badge">{a.cost} cr</span>{a.action}</li>)}</ul>
          <Button className="brand-button" onClick={() => { setCreditsOpen(true); setStep(0); }}>Add credits<ArrowRight /></Button>
        </div>
        <p className="credits-fine"><Check />New here? Every account gets <b>3 free credits</b> after completing a profile. Credits you buy never expire and never affect referral access or queue position.</p>
      </div>
    </section>

    <section className="plans-section usage-panel" aria-label="Your usage this cycle">
      <span className="eyebrow">YOUR USAGE THIS CYCLE · PREVIEW DATA</span>
      <div className="moment-grid">
        {usageStats.map(u => <article key={u.label} className="moment-card"><Gauge /><h3>{u.value}</h3><p><b>{u.label}.</b> {u.hint}</p><div className="usage-meter" role="meter" aria-valuenow={u.pct} aria-valuemin={0} aria-valuemax={100} aria-label={u.label}><span style={{ width: `${u.pct}%` }} /></div></article>)}
      </div>
    </section>

    <section className="plans-section" aria-label="Upgrade moments">
      <span className="eyebrow">SHOWN ONLY WHEN A LIMIT IS HIT</span>
      <h2>Upgrade moments</h2>
      <div className="moment-grid">{upgradeNudges.map(n => <article key={n.trigger} className="moment-card"><Bell /><span className="mini-ghost">{n.trigger}</span><h3>{n.title}</h3><p>{n.copy}</p><div className="moment-actions"><span className="mini-btn">{n.cta}</span><span className="mini-ghost">{n.alt}</span></div></article>)}</div>
    </section>

    <section className="fair-band" aria-label="Fairness promise"><ShieldCheck /><ul>{fairnessRules.map(r => <li key={r}><Check />{r}</li>)}</ul></section>

    <section className="plans-section"><span className="eyebrow">SIGNATURE TOOLS</span><h2>Things you can hold, send and use</h2><p className="muted">Each one is a finished piece of work. Use credits, or get them included from the plan shown.</p><div className="moment-grid">{signatureTools.map(t => <article key={t.id} className="moment-card"><Crown /><h3>{t.name}</h3><p><b>{t.output}.</b> {t.detail}</p><div className="moment-actions"><span className="mini-btn">{t.cost} credits</span><span className="mini-ghost">Included in {t.plan}+</span></div></article>)}</div></section>

    <section className="plans-section"><span className="eyebrow">SIDE BY SIDE</span><h2>Compare every individual plan</h2><div className="compare-wrap wide"><table className="compare-table plan-compare"><thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Start</th><th scope="col">Momentum</th><th scope="col">Land</th></tr></thead><tbody>{compare.map(([f, ...values]) => <tr key={f}><th scope="row">{f}</th>{values.map((value, index) => <td key={`${f}-${index}`}><Cell v={value} /></td>)}</tr>)}</tbody></table></div></section>

    <section className="plans-section"><span className="eyebrow">HELP, IN CONTEXT</span><h2>Offered at the right moment. Never in the way.</h2><div className="moment-grid">{moments.map(m => <article key={m.title} className="moment-card"><m.icon /><h3>{m.title}</h3><p>{m.copy}</p><div className="moment-actions"><span className="mini-btn">Try it</span><span className="mini-ghost">Not now</span></div></article>)}</div></section>

    <section className="plans-section referrer-free"><Sparkles /><div><h2>Referrers: always free.</h2><p>Open your door, keep your capacity, earn verified badges and an impact record. Seekers can send an optional thank-you tip — 100% goes to you.</p></div><Button asChild variant="outline" className="brand-button"><Link to="/referrer">Referrer workspace <ArrowRight /></Link></Button></section>

    <section className="plans-section"><span className="eyebrow">QUESTIONS</span><h2>Straight answers</h2><div className="safety-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>

    <p className="design-note">DESIGN PREVIEW · EXAMPLE PRICES · NO PAYMENT IS TAKEN · <Link to="/for-companies">Hiring? See company plans</Link></p>

    {chosen && <div className="modal-backdrop" onClick={() => setChosen(null)}><div className="app-dialog" role="dialog" aria-modal="true" aria-label="Checkout preview" onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={() => setChosen(null)}><X /></Button><span className="preview-check"><Check /></span><h2>{chosen} — checkout preview</h2><p>In the live app this opens a secure checkout with local payment methods (UPI, cards, wallets). Nothing is charged in this preview.</p><Button className="brand-button" onClick={() => setChosen(null)}>Got it</Button></div></div>}

    {creditsOpen && <div className="modal-backdrop" onClick={() => setCreditsOpen(false)}>
      <div className="app-dialog credits-dialog" role="dialog" aria-modal="true" aria-label="Add credits" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={() => setCreditsOpen(false)}><X /></Button>
        <h2>Add credits</h2>
        <p className="dialog-lead">One-off tools, no subscription. Credits never expire and never change your place in any queue.</p>
        <ol className="checkout-steps" aria-label="Checkout progress">{["Choose pack", "Pay", "Done"].map((s, i) => <li key={s} className={step >= ([0, 1, 3][i] ?? 0) ? "on" : ""}><span>{i + 1}</span>{s}</li>)}</ol>
        {step <= 1 && <div className="pack-grid" role="radiogroup" aria-label="Credit packs">{creditPacks.map(p => <button key={p.id} role="radio" aria-checked={pack === p.id} className={`pack-card ${pack === p.id ? "selected" : ""} ${"featured" in p && p.featured ? "featured" : ""}`} onClick={() => { setPack(p.id); setStep(1); }}><span className="pack-note">{p.note}</span><strong>{p.credits}<small> credits</small></strong><span className="pack-price">{p.price} <em>{p.usd}</em></span>{pack === p.id && <Check className="pack-check" />}</button>)}</div>}
        {step === 1 && <div className="pay-panel"><h3>Pay {sel.price} for {sel.credits} credits</h3><div className="method-row" role="radiogroup" aria-label="Payment method">{methods.map(m => <button key={m.id} role="radio" aria-checked={method === m.id} className={method === m.id ? "selected" : ""} onClick={() => setMethod(m.id)}><m.icon />{m.label}</button>)}</div>{method === "upi" ? <label>UPI ID<input placeholder="name@bank" /></label> : method === "card" ? <label>Card number<input placeholder="1234 5678 9012 3456" inputMode="numeric" /></label> : <label>Wallet<select><option>Choose a wallet</option><option>Paytm</option><option>Apple Pay</option><option>Google Pay</option></select></label>}<p className="secure"><LockKeyhole />Secure checkout · Local prices · Instant refund if unused within 7 days</p><Button className="brand-button" onClick={() => setStep(3)}>Pay {sel.price}<ArrowRight /></Button></div>}
        {step === 3 && <div className="request-complete wallet-done"><span className="preview-check"><Check /></span><h3>{sel.credits} credits added.</h3><p>This is how success looks. Nothing was charged in this preview.</p><div className="done-actions"><Button className="brand-button" asChild><Link to="/explore">Use on a request <ArrowRight /></Link></Button><Button variant="outline" className="brand-button" onClick={() => setStep(0)}>Buy another pack</Button></div></div>}
        {step <= 1 && <div className="dialog-costs"><span className="eyebrow">WHAT CREDITS DO</span><div className="cost-list">{creditActions.map(a => <div key={a.action}><span className="cost-badge">{a.cost} cr</span><span><strong>{a.action}</strong><small>{a.detail}</small></span></div>)}</div></div>}
      </div>
    </div>}
  </main>;
}
