import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, CreditCard, Download, PauseCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/billing")({
  head: () => pageMeta("Manage plan and billing", "Change, pause or cancel your SkipWait plan, update payment, and download receipts."),
  component: Billing,
});

const reasons = ["Got a job 🎉", "Too expensive", "Not using it enough", "Missing a feature", "Other"];
const receipts = [["6 Oct 2026", "Momentum · monthly", "$20"], ["6 Sep 2026", "Momentum · monthly", "$20"], ["21 Aug 2026", "25 credits", "$22"]];

function Billing() {
  const [st, setSt] = useState<"Active" | "Cancelling" | "Payment issue" | "Free">("Active");
  const [flow, setFlow] = useState<0 | 1 | 2 | 3>(0);
  const [reason, setReason] = useState(reasons[0]!);
  return <main className="page-content mx-auto max-w-3xl">
    <Heading eyebrow="PLANS & CREDITS" title="Manage plan" aside={<Link to="/plans" className="text-link text-sm">Compare plans →</Link>} />
    <StateChips states={["Active", "Cancelling", "Payment issue", "Free"] as const} value={st} onChange={setSt} />
    {st === "Payment issue" && <Panel tone="muted" className="mb-4 border border-destructive/40"><strong className="text-destructive">Your last payment failed.</strong><p className="mt-1 text-sm">You keep Momentum until 13 Oct. Update your payment method to avoid losing plan credits.</p><Button size="sm" className="mt-3"><CreditCard />Update payment</Button></Panel>}
    <Panel>
      {st === "Free" ? <><span className="eyebrow">CURRENT PLAN</span><h2 className="mt-1 text-2xl font-semibold">Free</h2><p className="text-sm text-muted-foreground">3 open asks · buy credits anytime</p><Button asChild className="mt-4"><Link to="/plans">Upgrade</Link></Button></> : <>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="eyebrow">CURRENT PLAN</span><h2 className="mt-1 text-2xl font-semibold">Momentum · $20/month</h2><p className="text-sm text-muted-foreground">{st === "Cancelling" ? "Ends 6 Nov 2026 — you keep everything until then." : "Renews 6 Nov 2026 · 8 open asks · 30 credits/month"}</p></div>{st === "Cancelling" ? <Button onClick={() => setSt("Active")}>Keep my plan</Button> : null}</div>
        {st !== "Cancelling" && <div className="mt-5 grid gap-2 sm:grid-cols-3"><Button variant="outline" asChild><Link to="/plans"><ArrowUp />Upgrade to Land</Link></Button><Button variant="outline"><ArrowDown />Switch to Start</Button><Button variant="ghost" onClick={() => setFlow(1)}>Cancel plan</Button></div>}
      </>}
    </Panel>
    <Panel className="mt-4"><h2 className="font-semibold">Payment method</h2><ul className="mt-2 divide-y divide-border">{[["Visa •••• 4242", "Default · expires 08/28"], ["UPI · asha@okbank", "India only · AutoPay mandate"], ["PayPal", "Outside India"]].map(([m, d], i) => <li key={m} className="flex min-h-14 items-center gap-3"><CreditCard className="size-5" /><span className="flex-1"><strong className="block text-sm">{m}</strong><small className="text-muted-foreground">{d}</small></span>{i > 0 && <Button variant="ghost" size="sm">Make default</Button>}</li>)}</ul><Button variant="outline" size="sm" className="mt-3">Add payment method</Button><p className="mt-3 text-xs text-muted-foreground">India: cards, UPI, netbanking and wallets. Elsewhere: cards and PayPal. Prices shown in USD; tax added at checkout.</p></Panel>
    <Panel className="mt-4"><h2 className="font-semibold">Receipts</h2><ul className="mt-2 divide-y divide-border">{receipts.map(([d, w, a]) => <li key={d} className="flex min-h-12 items-center gap-3 text-sm"><span className="w-24 shrink-0 text-muted-foreground">{d}</span><span className="min-w-0 flex-1 truncate">{w}</span><span>{a}</span><Button variant="ghost" size="icon" aria-label={`Download receipt ${d}`}><Download /></Button></li>)}</ul><p className="mt-2 text-xs text-muted-foreground">EXAMPLE RECEIPTS · LOCAL PRICES ARE PLACEHOLDERS</p></Panel>

    {flow > 0 && <div className="modal-backdrop" onClick={() => setFlow(0)}><section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="c-t" onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={() => setFlow(0)}><X /></Button>
      {flow === 1 && <><h2 id="c-t" className="text-xl font-semibold">Why are you leaving?</h2><div className="mt-4 grid gap-2">{reasons.map(r => <label key={r} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 ${reason === r ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}</div><footer className="mt-6 flex justify-end"><Button onClick={() => setFlow(2)}>Continue</Button></footer></>}
      {flow === 2 && <><h2 id="c-t" className="text-xl font-semibold">{reason.startsWith("Got") ? "Congratulations!" : "Before you go"}</h2><p className="mt-2 text-muted-foreground">{reason.startsWith("Got") ? "Cancel now — your purchased credits stay forever. Pay it forward by becoming a referrer." : "You could pause instead and keep your rolled-over credits."}</p><div className="mt-4 grid gap-2">{!reason.startsWith("Got") && <Button variant="outline" onClick={() => { setFlow(0); }}><PauseCircle />Pause for 1 month</Button>}<Button variant="ghost" onClick={() => setFlow(3)}>Cancel anyway</Button></div></>}
      {flow === 3 && <><h2 id="c-t" className="text-xl font-semibold">Plan cancelled.</h2><p className="mt-2 text-muted-foreground">You keep Momentum until 6 Nov. Unused plan credits expire then; purchased credits never do. Referrals stay free.</p><footer className="mt-6 flex justify-end"><Button onClick={() => { setFlow(0); setSt("Cancelling"); }}>Done</Button></footer></>}
    </section></div>}
  </main>;
}
