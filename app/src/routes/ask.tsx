import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Circle, FileText, Globe2, Lightbulb, Pin, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel, field } from "@/components/preview-kit";

export const Route = createFileRoute("/ask")({
  head: () => pageMeta("Write a referral ask", "Compose a referral request with live quality checks, location fit, and a preview of exactly what the referrer will see."),
  component: Ask,
});

const LIMIT = 600;
function Ask() {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [loc, setLoc] = useState("Remote · India");
  const [pin, setPin] = useState(true);
  const [sent, setSent] = useState(false);
  const officialUrl = /^https?:\/\/(careers\.|jobs\.)?[\w.-]+\.(com|me|in|io)\/.+/i.test(url);
  const words = note.trim() ? note.trim().split(/\s+/).length : 0;
  const generic = /\b(any role|any job|please refer|kindly refer|looking for job)\b/i.test(note);
  const specific = /\b(led|built|shipped|designed|grew|reduced|launched|\d+%|\d+ (years|users))\b/i.test(note);
  const fitBlocked = loc === "On-site · USA (no sponsorship)";
  const checks = [
    { ok: officialUrl, label: "Official job link", hint: "Paste the posting from the company careers site." },
    { ok: words >= 30 && words <= 120, label: "30–120 words", hint: `${words} words so far.` },
    { ok: specific && !generic, label: "One specific proof of fit", hint: generic ? "Avoid “any role” or “please refer” — name the role and one result." : "Mention something you led, built or measured." },
    { ok: pin, label: "Relevant work attached", hint: "Pin one piece of work." },
    { ok: !fitBlocked, label: "Location works for you", hint: "This role needs US work authorization you said you don't have." },
  ];
  const score = checks.filter(c => c.ok).length;
  const strength = score === 5 ? "Strong" : score >= 3 ? "Good start" : "Needs work";

  if (sent) return <main className="page-content mx-auto max-w-xl text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><Check className="size-10 text-primary" /></span><h1 className="mt-4 text-3xl font-semibold">Ask sent to Wipro.</h1><p className="mt-2 text-muted-foreground">Verified Wipro referrers in Design will see it. It expires in 7 days if nobody accepts, and your slot returns.</p><p className="mt-4 text-sm">Open slots: <strong>2 of 3</strong> used</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" onClick={() => setSent(false)}>Write another</Button><Button asChild><Link to="/thread">Track this ask <ArrowRight /></Link></Button></div></main>;

  return <main className="page-content">
    <div className="page-heading"><div><span className="eyebrow">NEW ASK · WIPRO · DESIGN</span><h1>Write a great ask<span className="brand-dot">.</span></h1><p>Referrers decide in under a minute. Make that minute easy.</p></div><span className="preview-label">DESIGN PREVIEW</span></div>
    <div className="mb-4 flex flex-wrap gap-2 text-xs"><span className="text-muted-foreground">Fill example:</span><button className="rounded-full border border-border px-3 py-1" onClick={() => { setUrl("https://careers.wipro.com/job/product-designer-123"); setNote("I've led two end-to-end redesigns of enterprise approval workflows, cutting task time by 40% for 3,000 users. This Product Designer role focuses on the same problem space. I'd value an honest fit check, and I'm happy to answer any questions before you decide to refer me."); }}>Strong</button><button className="rounded-full border border-border px-3 py-1" onClick={() => { setUrl("wipro jobs"); setNote("Please refer me for any role."); }}>Weak</button><button className="rounded-full border border-border px-3 py-1" onClick={() => setLoc("On-site · USA (no sponsorship)")}>Location mismatch</button></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel>
        <label className="block text-sm font-medium">Official job link<input className={field} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://careers.wipro.com/…" /></label>
        {url && !officialUrl && <p className="mt-2 flex gap-2 text-sm text-destructive"><AlertTriangle className="size-4 shrink-0" />That doesn't look like a job posting link.</p>}
        <label className="mt-5 block text-sm font-medium">Role location<select className={field} value={loc} onChange={e => setLoc(e.target.value)}><option>Remote · India</option><option>Hybrid · Bengaluru</option><option>On-site · USA (no sponsorship)</option></select></label>
        {fitBlocked && <p className="mt-2 flex gap-2 rounded-xl bg-muted p-3 text-sm"><Globe2 className="size-4 shrink-0" />This role needs US work authorization. Your profile says you'd need sponsorship. You can still ask — but say so in your note.</p>}
        <label className="mt-5 block text-sm font-medium">Your note<textarea value={note} maxLength={LIMIT} onChange={e => setNote(e.target.value)} placeholder="Name the role, one result that proves fit, and what you'd like from the referrer." className="mt-2 min-h-44 w-full rounded-xl border border-input bg-background p-4 text-base" /></label>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Tip: one specific result beats a list of skills.</span><span>{note.length}/{LIMIT}</span></div>
        <Button variant="outline" className="mt-3"><Sparkles />Improve my note · 1 credit</Button>
        <div className="mt-6"><span className="text-sm font-medium">Attached</span><div className="mt-2 flex flex-wrap gap-2"><span className="flex min-h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm"><FileText className="size-4" />Resume (shared after accept)</span><button onClick={() => setPin(!pin)} className={`flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm ${pin ? "border-primary bg-primary/5" : "border-border"}`}><Pin className="size-4" />Enterprise approvals redesign {pin ? <X className="size-3.5" /> : null}</button></div></div>
      </Panel>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Panel><div className="flex items-center justify-between"><span className="eyebrow">ASK STRENGTH</span><strong className={score === 5 ? "text-primary" : ""}>{strength}</strong></div><div className="mt-3 flex gap-1">{checks.map((c, i) => <span key={i} className={`h-2 flex-1 rounded-full ${i < score ? "bg-primary" : "bg-muted"}`} />)}</div><ul className="mt-4 space-y-3">{checks.map(c => <li key={c.label} className="flex gap-2 text-sm">{c.ok ? <Check className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}<span><strong className="block">{c.label}</strong>{!c.ok && <small className="text-muted-foreground">{c.hint}</small>}</span></li>)}</ul></Panel>
        <Panel tone="muted"><Lightbulb className="mb-2 size-5" /><p className="text-sm">The referrer sees your role, note, and pinned work — not your name or resume — until they accept.</p></Panel>
        <Button className="w-full" disabled={!officialUrl || words < 10} onClick={() => setSent(true)}>Send ask <ArrowRight /></Button>
        <p className="text-center text-xs text-muted-foreground">Uses 1 of your 3 open slots · referrals are always free</p>
      </aside>
    </div>
  </main>;
}
