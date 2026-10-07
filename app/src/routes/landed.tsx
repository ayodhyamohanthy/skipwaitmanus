import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, DoorOpen, Gift, Heart, PartyPopper, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel } from "@/components/preview-kit";

export const Route = createFileRoute("/landed")({
  head: () => pageMeta("You landed the role", "Celebrate the offer, thank the referrer who opened the door, and pay it forward by becoming a referrer."),
  component: Landed,
});

const steps = ["Celebrate", "Thank", "Pay it forward", "Done"] as const;
function Landed() {
  const [s, setS] = useState(0);
  const [msg, setMsg] = useState("Thank you for taking a chance on my ask. I start on the 3rd — I owe you a coffee!");
  const [share, setShare] = useState(true);
  const [optIn, setOptIn] = useState<"yes" | "later" | null>(null);

  return <main className="page-content mx-auto max-w-2xl">
    <ol className="mb-8 grid grid-cols-4 gap-1.5">{steps.map((l, i) => <li key={l}><span className={`block h-1.5 rounded-full ${i <= s ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 block text-xs text-muted-foreground">{l}</span></li>)}</ol>
    <p className="example-banner mb-6">EXAMPLE · ILLUSTRATIVE OUTCOME, NOT A REAL HIRE</p>

    {s === 0 && <section className="text-center"><span className="mx-auto grid size-24 place-items-center rounded-full bg-accent"><PartyPopper className="size-12 text-primary" /></span><h1 className="mt-6 text-4xl font-semibold">You did it.</h1><p className="mt-3 text-lg">Product Designer at Wipro.</p><p className="mt-2 text-muted-foreground">You did the work. A referrer opened the door. Let's close the loop kindly.</p><Button className="mt-8" onClick={() => setS(1)}>Thank your referrer <ArrowRight /></Button></section>}

    {s === 1 && <section><Heart className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Say thanks to Rahul.</h1><p className="mt-2 text-muted-foreground">The single message referrers remember most.</p><textarea className="mt-6 min-h-36 w-full rounded-2xl border border-input bg-background p-4 text-base" value={msg} onChange={e => setMsg(e.target.value)} aria-label="Thank-you message" /><button onClick={() => setShare(!share)} className="mt-3 flex items-center gap-2 text-sm"><span className={`grid size-5 place-items-center rounded border ${share ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{share && <Check className="size-3.5" />}</span>Let Rahul add this to his private thank-you wall</button><Panel tone="muted" className="mt-6 text-sm"><Gift className="mb-2 size-5" />Gifts or payments for referrals aren't allowed on SkipWait. A real thank-you is enough.</Panel><div className="mt-8 flex justify-between"><Button variant="ghost" onClick={() => setS(2)}>Skip</Button><Button onClick={() => setS(2)}><Send />Send thanks</Button></div></section>}

    {s === 2 && <section><DoorOpen className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Hold the door for the next person.</h1><p className="mt-2 text-muted-foreground">Once you have your Wipro email, verify in 30 seconds and refer people you believe in — at your own pace.</p><div className="mt-6 grid gap-3">{[["You choose every request", "Passing is private and always okay."], ["Set your own capacity", "Even 1 request a month helps."], ["Stay anonymous", "Until you accept."]].map(([t, d]) => <div key={t} className="flex gap-3 rounded-2xl border border-border p-4"><BadgeCheck className="size-5 shrink-0 text-primary" /><span><strong className="block">{t}</strong><small className="text-muted-foreground">{d}</small></span></div>)}</div><div className="mt-8 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => { setOptIn("later"); setS(3); }}>Remind me after I join</Button><Button onClick={() => { setOptIn("yes"); setS(3); }}>Yes, I'll pay it forward</Button></div></section>}

    {s === 3 && <section className="text-center"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-3xl font-semibold">{optIn === "yes" ? "Welcome to the other side of the door." : "We'll check in after your start date."}</h1><p className="mt-2 text-muted-foreground">{optIn === "yes" ? "Verify your new work email whenever you're ready." : "We'll send one reminder 30 days after you start. That's it."}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link to="/requests">Close my other asks</Link></Button>{optIn === "yes" ? <Button asChild><Link to="/verify">Verify work email <ArrowRight /></Link></Button> : <Button asChild><Link to="/explore">Back to SkipWait</Link></Button>}</div><button className="text-link mt-6 text-sm" onClick={() => setS(0)}>Replay preview</button></section>}
  </main>;
}
