import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Ban, Check, Flag, LifeBuoy, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel } from "@/components/preview-kit";

export const Route = createFileRoute("/report")({
  head: () => pageMeta("Report or block", "Report a person or request, block them, and see exactly what happens next. Reports are confidential."),
  component: Report,
});

const reasons = [["Asked for or offered money", "Referrals on SkipWait are always free"], ["Harassment or inappropriate messages", ""], ["Fake job or scam", "Suspicious links, fees, or personal data requests"], ["Pretending to work at a company", ""], ["Spam or repeated asks", ""], ["Something else", ""]] as const;

function Report() {
  const [s, setS] = useState(0);
  const [reason, setReason] = useState<string>(reasons[0][0]);
  const [block, setBlock] = useState(true);
  const [urgent, setUrgent] = useState(false);

  return <main className="page-content mx-auto max-w-2xl">
    <Link to="/thread" className="text-link mb-4 inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />Back to conversation</Link>
    <p className="example-banner mb-6">DESIGN PREVIEW · NOTHING IS SUBMITTED</p>
    {s === 0 && <section><Flag className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">What's going on?</h1><p className="mt-2 text-muted-foreground">Reporting is confidential. The other person isn't told who reported them.</p><div className="mt-6 grid gap-2">{reasons.map(([r, d]) => <label key={r} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 ${reason === r ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="r" checked={reason === r} onChange={() => setReason(r)} /><span><strong className="block text-sm">{r}</strong>{d && <small className="text-muted-foreground">{d}</small>}</span></label>)}</div><div className="mt-8 flex justify-end"><Button onClick={() => setS(1)}>Continue <ArrowRight /></Button></div></section>}
    {s === 1 && <section><h1 className="text-3xl font-semibold">Add details</h1><p className="mt-2 text-muted-foreground">Optional. The relevant messages are attached automatically.</p><textarea className="mt-6 min-h-32 w-full rounded-2xl border border-input bg-background p-4 text-base" placeholder="What happened? Include anything that helps us review quickly." aria-label="Details" />
      <div className="mt-4 space-y-2"><button onClick={() => setBlock(!block)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-4 text-left ${block ? "border-primary bg-primary/5" : "border-border"}`}><Ban className="size-5" /><span className="flex-1"><strong className="block text-sm">Also block this person</strong><small className="text-muted-foreground">They can't message or send you asks. They won't be notified.</small></span>{block && <Check className="text-primary" />}</button><button onClick={() => setUrgent(!urgent)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-4 text-left ${urgent ? "border-destructive bg-destructive/5" : "border-border"}`}><ShieldAlert className="size-5" /><span className="flex-1"><strong className="block text-sm">I feel unsafe</strong><small className="text-muted-foreground">Reviewed first, within hours.</small></span>{urgent && <Check className="text-destructive" />}</button></div>
      <div className="mt-8 flex justify-between"><Button variant="ghost" onClick={() => setS(0)}><ArrowLeft />Back</Button><Button onClick={() => setS(2)}>Submit report</Button></div></section>}
    {s === 2 && <section className="text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><ShieldCheck className="size-10 text-primary" /></span><h1 className="mt-4 text-3xl font-semibold">Thanks. We're on it.</h1><p className="mt-2 text-muted-foreground">{block ? "This person is blocked. " : ""}Here's what happens next:</p>
      <Panel className="mt-6 text-left"><ol className="space-y-4 text-sm">{[["Now", "Report received · reference #R-2048"], [urgent ? "Within 4 hours" : "Within 48 hours", "A person on our safety team reviews it"], ["After review", "We may warn, restrict, or remove the account"], ["Then", "You get a notification with the outcome"]].map(([t, d], i) => <li key={t} className="flex gap-3"><span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}</span><span><strong className="block">{t}</strong><span className="text-muted-foreground">{d}</span></span></li>)}</ol></Panel>
      {urgent && <Panel tone="muted" className="mt-4 text-left text-sm"><LifeBuoy className="mb-2 size-5" />If you're in immediate danger, contact local emergency services first.</Panel>}
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link to="/settings">Manage blocked people</Link></Button><Button asChild><Link to="/requests">Back to requests</Link></Button></div></section>}
  </main>;
}
