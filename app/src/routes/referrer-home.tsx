import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, Clock3, Heart, Inbox, Pause, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/referrer-home")({
  head: () => pageMeta("Referrer home", "Your daily referrer view: new asks, asks about to expire, capacity left, re-verification, and private thank-yous."),
  component: ReferrerHome,
});

const states = ["Active", "New referrer", "At capacity", "Paused", "Re-verify due"] as const;
const asks = [{ role: "Product Designer", fn: "Design", left: "6 days", strength: "Strong" }, { role: "UX Researcher", fn: "Design", left: "1 day", strength: "Good" }, { role: "Design Systems Lead", fn: "Design", left: "4 days", strength: "Strong" }];

function ReferrerHome() {
  const [st, setSt] = useState<(typeof states)[number]>("Active");
  const fresh = st === "New referrer";
  const used = st === "At capacity" ? 3 : fresh ? 0 : 1;
  const list = fresh ? [] : asks;

  return <main className="page-content">
    <Heading eyebrow="REFERRER HOME · WIPRO" title="Good evening" text="Here's what needs you today. Nothing here is urgent unless it says so." aside={<div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1 text-sm"><BadgeCheck className="size-4 text-primary" />Verified · Wipro</span><Button variant="outline" size="sm" asChild><Link to="/referrer">Queue & settings</Link></Button><Button variant="ghost" size="sm" asChild><Link to="/verify">Become a referrer</Link></Button></div>} />
    <StateChips states={states} value={st} onChange={setSt} />
    {st === "Re-verify due" && <Panel tone="accent" className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2"><CalendarClock />Re-verify your Wipro email within 5 days to keep receiving asks.</span><Button asChild size="sm"><Link to="/verify">Re-verify</Link></Button></Panel>}
    {st === "Paused" && <Panel tone="muted" className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2"><Pause />New asks are paused. Open conversations still work.</span><Button size="sm" onClick={() => setSt("Active")}><Play />Resume</Button></Panel>}

    <div className="grid gap-3 sm:grid-cols-3">
      <Panel><Inbox className="mb-2 size-5" /><strong className="text-3xl">{st === "Paused" ? 0 : list.length}</strong><p className="text-sm text-muted-foreground">New asks waiting</p></Panel>
      <Panel><Clock3 className="mb-2 size-5" /><strong className="text-3xl">{fresh || st === "Paused" ? 0 : 1}</strong><p className="text-sm text-muted-foreground">Expiring within 24h</p></Panel>
      <Panel><ShieldCheck className="mb-2 size-5" /><strong className="text-3xl">{3 - used}<span className="text-lg text-muted-foreground">/3</span></strong><p className="text-sm text-muted-foreground">Capacity left this month</p><div className="mt-2 h-1.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(used / 3) * 100}%` }} /></div></Panel>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section><div className="mb-3 flex items-end justify-between"><h2 className="text-xl font-semibold">Waiting for you</h2><Link to="/referrer" className="text-link text-sm">Full queue →</Link></div>
        {st === "At capacity" ? <Panel tone="muted"><h3 className="font-semibold">You've hit this month's capacity.</h3><p className="mt-1 text-sm text-muted-foreground">New asks go to other referrers. Raise your limit only if you really have time.</p><Button variant="outline" className="mt-3" asChild><Link to="/referrer">Adjust capacity</Link></Button></Panel>
          : list.length === 0 || st === "Paused" ? <Panel tone="muted" className="text-center"><Inbox className="mx-auto mb-2 size-8" /><h3 className="font-semibold">{fresh ? "Your first ask will appear here." : "No asks right now."}</h3><p className="mt-1 text-sm text-muted-foreground">{fresh ? "Seekers can now find a verified referrer at Wipro. Share your profile to help them find you." : "Enjoy the quiet."}</p></Panel>
          : <ul className="space-y-3">{list.map(a => <li key={a.role}><Link to="/thread" className="flex min-h-16 items-center gap-3 rounded-3xl border border-border p-4 hover:border-foreground/40"><span className="company-mark">W</span><span className="min-w-0 flex-1"><strong className="block">{a.role}</strong><small className="text-muted-foreground">{a.fn} · ask strength: {a.strength}</small></span><span className={`shrink-0 text-xs ${a.left === "1 day" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{a.left} left</span><ArrowRight className="size-4 shrink-0" /></Link></li>)}</ul>}
        <p className="example-banner mt-4">EXAMPLE ASKS · NOT LIVE ACTIVITY</p>
      </section>
      <aside className="space-y-4">
        <Panel><span className="eyebrow">YOUR THANK-YOU WALL · PRIVATE</span>{fresh ? <p className="mt-3 text-sm text-muted-foreground">Notes from people you help will live here. Only you can see them.</p> : <blockquote className="mt-3 rounded-2xl bg-muted p-4 text-sm"><Heart className="mb-2 size-4 text-primary" />“Thank you for taking a chance on my ask. I start on the 3rd!”<footer className="mt-2 text-xs text-muted-foreground">Asha · Product Designer · example</footer></blockquote>}</Panel>
        <Panel><span className="eyebrow">YOUR RECORD · PRIVATE</span><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{[["Introductions", fresh ? 0 : 1], ["People helped", fresh ? 0 : 1], ["Replied within 3 days", fresh ? "—" : "100%"], ["Thank-yous", fresh ? 0 : 1]].map(([k, v]) => <div key={k as string}><dt className="text-muted-foreground">{k as string}</dt><dd className="text-xl font-semibold">{v as string}</dd></div>)}</dl><p className="mt-3 text-xs text-muted-foreground">Never ranked. Never public.</p></Panel>
        <Button variant="outline" className="w-full" onClick={() => setSt(st === "Paused" ? "Active" : "Paused")}>{st === "Paused" ? <><Play />Resume new asks</> : <><Pause />Pause new asks</>}</Button>
      </aside>
    </div>
  </main>;
}
