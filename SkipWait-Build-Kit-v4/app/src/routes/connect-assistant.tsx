import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Check, Clock, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/connect-assistant")({
  head: () => pageMeta("Connect an assistant", "Approve ChatGPT, Claude or another assistant to use SkipWait for you, with clear limits."),
  component: Consent,
});

const states = ["Consent", "Unverified app", "Signed out", "Not on Land", "Expired", "Approved", "Declined"] as const;
const can = [["Search companies open to referrals", "read"], ["See your requests, alerts and replies", "read"], ["Draft asks for you to review", "draft"], ["Send an ask — only after you approve each one", "send"], ["Run paid tools — shows the credit cost, you approve first", "credits"]] as const;
const never = ["Accept, pass or refer on anyone's behalf", "See referrers' work emails or other people's data", "Skip the queue or go past your open-request limit", "Buy plans or credits"];

function Consent() {
  const [s, setS] = useState<(typeof states)[number]>("Consent");
  const [scopes, setScopes] = useState<string[]>(can.map(c => c[1]));
  const toggle = (k: string) => setScopes(x => x.includes(k) ? x.filter(y => y !== k) : [...x, k]);
  return <main className="mx-auto min-h-screen max-w-lg px-4 py-8 sm:py-14">
    <Link to="/" className="wordmark mb-6 inline-block text-xl">SkipWait<span className="brand-dot">.</span></Link>
    <StateChips states={states} value={s} onChange={setS} />
    {s === "Consent" && <>
      <div className="flex items-center gap-3"><span className="grid size-14 place-items-center rounded-2xl bg-muted"><Bot className="size-7" /></span><span className="text-2xl text-muted-foreground">→</span><span className="grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">S</span></div>
      <h1 className="mt-5 text-3xl font-semibold">Connect ChatGPT to SkipWait</h1>
      <p className="mt-2 text-muted-foreground">ChatGPT will be able to use SkipWait as <strong className="text-foreground">asha@gmail.com</strong>. <button className="text-link">Switch account</button></p>
      <Panel className="mt-6"><h2 className="font-semibold">It can</h2><ul className="mt-2">{can.map(([t, k]) => <li key={k}><label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border py-2 last:border-0"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={scopes.includes(k)} onChange={() => toggle(k)} disabled={k === "read"} /><span className="text-sm">{t}</span></label></li>)}</ul></Panel>
      <Panel tone="muted" className="mt-3"><h2 className="font-semibold">It can never</h2><ul className="mt-2 space-y-2 text-sm">{never.map(n => <li key={n} className="flex gap-2"><X className="size-4 shrink-0 text-destructive" />{n}</li>)}</ul></Panel>
      <p className="mt-4 flex gap-2 text-xs text-muted-foreground"><Lock className="size-4 shrink-0" />Asks it sends show “Sent with ChatGPT” to the referrer. You can disconnect anytime in Settings → Connected assistants. Callback: chatgpt.com</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2"><Button variant="outline" size="lg" onClick={() => setS("Declined")}>Cancel connection</Button><Button size="lg" onClick={() => setS("Approved")}>Approve</Button></div>
    </>}
    {s === "Unverified app" && <Panel className="border-destructive"><ShieldAlert className="size-8 text-destructive" /><h1 className="mt-3 text-2xl font-semibold">“JobBot” isn't verified by SkipWait</h1><p className="mt-2 text-sm text-muted-foreground">It connected through the open MCP link. It can only read and draft until it's verified. Only continue if you trust it.</p><div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => setS("Declined")}>Cancel</Button><Button onClick={() => setS("Approved")}>Continue, read & draft only</Button></div></Panel>}
    {s === "Signed out" && <Panel className="text-center"><Bot className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">Sign in to connect ChatGPT</h1><p className="mt-2 text-sm text-muted-foreground">You'll come straight back here after signing in.</p><Button asChild size="lg" className="mt-5 w-full"><Link to="/sign-in">Sign in to SkipWait</Link></Button></Panel>}
    {s === "Not on Land" && <Panel className="text-center"><ShieldCheck className="mx-auto size-8 text-primary" /><h1 className="mt-3 text-2xl font-semibold">Assistants need Land</h1><p className="mt-2 text-sm text-muted-foreground">Signing in, connecting and applying through ChatGPT, Claude, bots or your own tools is part of Land and Concierge.</p><div className="mt-5 grid gap-2"><Button asChild size="lg"><Link to="/plans">Upgrade to Land</Link></Button><Button variant="ghost" asChild><Link to="/explore">Keep using SkipWait yourself</Link></Button></div></Panel>}
    {s === "Expired" && <Panel className="text-center"><Clock className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">This link has expired</h1><p className="mt-2 text-sm text-muted-foreground">Go back to ChatGPT and start the connection again. It takes a few seconds.</p></Panel>}
    {s === "Approved" && <Panel className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-accent"><Check className="size-8 text-primary" /></span><h1 className="mt-3 text-2xl font-semibold">ChatGPT is connected</h1><p className="mt-2 text-sm text-muted-foreground">Taking you back to ChatGPT…</p><Button asChild variant="outline" className="mt-5"><Link to="/assistants">Manage assistants</Link></Button></Panel>}
    {s === "Declined" && <Panel className="text-center"><ShieldAlert className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">Connection cancelled</h1><p className="mt-2 text-sm text-muted-foreground">ChatGPT has no access to your SkipWait account.</p></Panel>}
  </main>;
}
