import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, Bell, BellOff, Check, CheckCheck, Clock3, MessageSquare, Plus, Search, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { launchCompanies } from "@/lib/marketplace-data";
import { Heading, Panel, StateChips, field } from "@/components/preview-kit";

export const Route = createFileRoute("/alerts")({
  head: () => pageMeta("Notifications and alerts", "Every update about your asks, plus saved searches that tell you when a verified referrer opens at a company you want."),
  component: Alerts,
});

type N = { id: number; icon: typeof Bell; title: string; text: string; time: string; group: "Today" | "Earlier"; unread: boolean; to: "/thread" | "/plans" | "/verify" | "/explore" };
const seed: N[] = [
  { id: 1, icon: Check, title: "Your ask was accepted", text: "A verified referrer at Wipro accepted · Product Designer", time: "12 min", group: "Today", unread: true, to: "/thread" },
  { id: 2, icon: MessageSquare, title: "New message", text: "“Happy to help — I'll submit this week.”", time: "10 min", group: "Today", unread: true, to: "/thread" },
  { id: 3, icon: BadgeCheck, title: "New referrer at Merkle", text: "Matches your alert: Merkle · Design", time: "2 h", group: "Today", unread: false, to: "/explore" },
  { id: 4, icon: Clock3, title: "Ask expires in 1 day", text: "TCS · Data Analyst — refresh your note or let it go", time: "Yesterday", group: "Earlier", unread: false, to: "/thread" },
  { id: 5, icon: Wallet, title: "6 plan credits expire Friday", text: "Use them on an interview dossier or mock interview", time: "2 days", group: "Earlier", unread: false, to: "/plans" },
];
const tabs = ["Notifications", "Saved alerts"] as const;

function Alerts() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Notifications");
  const [state, setState] = useState<"Filled" | "Empty">("Filled");
  const [items, setItems] = useState(seed);
  const [filter, setFilter] = useState<"All" | "Unread">("All");
  const [alerts, setAlerts] = useState([{ c: "merkle", f: "Design", on: true }, { c: "skipwait", f: "Product", on: true }]);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState("tcs");
  const [nf, setNf] = useState("Engineering");
  const shown = (state === "Empty" ? [] : items).filter(n => filter === "All" || n.unread);
  const unread = items.filter(n => n.unread).length;

  return <main className="page-content mx-auto max-w-3xl">
    <Heading eyebrow="STAY IN THE LOOP" title="Alerts" text="Only things that need you. No marketing, no “you might like”." />
    <StateChips states={["Filled", "Empty"] as const} value={state} onChange={setState} />
    <div className="directory-tabs section-tabs" role="tablist">{tabs.map(t => <Button key={t} variant="ghost" role="tab" aria-selected={tab === t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>{t}{t === "Notifications" && unread > 0 && state === "Filled" && <span className="ml-1 rounded-full bg-primary px-2 text-xs text-primary-foreground">{unread}</span>}</Button>)}</div>

    {tab === "Notifications" && <>
      <div className="my-4 flex items-center justify-between gap-2"><div className="flex rounded-full bg-muted p-1 text-sm">{(["All", "Unread"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className={`min-h-9 rounded-full px-4 ${filter === f ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{f}</button>)}</div><Button variant="ghost" size="sm" disabled={!unread} onClick={() => setItems(items.map(n => ({ ...n, unread: false })))}><CheckCheck />Mark all read</Button></div>
      {shown.length === 0 ? <Panel tone="muted" className="text-center"><BellOff className="mx-auto mb-3 size-8" /><h2 className="text-lg font-semibold">{filter === "Unread" && state === "Filled" ? "You're all caught up." : "No notifications yet."}</h2><p className="mt-1 text-sm text-muted-foreground">When a referrer replies or a new one opens at your alert companies, it lands here.</p><Button asChild className="mt-4"><Link to="/explore">Explore companies</Link></Button></Panel> :
        (["Today", "Earlier"] as const).map(g => shown.some(n => n.group === g) && <div key={g} className="mb-4"><h2 className="mb-2 text-xs font-semibold text-muted-foreground">{g.toUpperCase()}</h2><ul className="overflow-hidden rounded-3xl border border-border">{shown.filter(n => n.group === g).map(n => <li key={n.id} className="border-b border-border last:border-0"><Link to={n.to} onClick={() => setItems(items.map(x => x.id === n.id ? { ...x, unread: false } : x))} className={`flex min-h-16 items-start gap-3 p-4 hover:bg-muted ${n.unread ? "bg-primary/5" : ""}`}><span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"><n.icon className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm">{n.title}</strong><span className="block truncate text-sm text-muted-foreground">{n.text}</span></span><span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>{n.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}</Link></li>)}</ul></div>)}
      <p className="mt-4 text-center text-sm text-muted-foreground"><Link to="/settings" className="text-link">Choose what notifies you</Link></p>
    </>}

    {tab === "Saved alerts" && <div className="mt-4 space-y-3">
      {state === "Empty" || alerts.length === 0 ? <Panel tone="muted" className="text-center"><Search className="mx-auto mb-3 size-8" /><h2 className="text-lg font-semibold">Get told when a door opens.</h2><p className="mt-1 text-sm text-muted-foreground">Pick a company and function. We'll alert you when a verified referrer becomes available.</p></Panel> :
        alerts.map((a, i) => { const c = launchCompanies.find(x => x.slug === a.c)!; return <Panel key={i} className="flex items-center gap-3 !p-4"><span className="company-mark">{c.initials}</span><span className="min-w-0 flex-1"><strong className="block">{c.name} · {a.f}</strong><small className="text-muted-foreground">{a.on ? "Instant · push and email" : "Paused"}</small></span><Button variant="ghost" size="icon" aria-label={a.on ? "Pause alert" : "Resume alert"} onClick={() => setAlerts(alerts.map((x, j) => j === i ? { ...x, on: !x.on } : x))}>{a.on ? <Bell /> : <BellOff />}</Button><Button variant="ghost" size="icon" aria-label="Delete alert" onClick={() => setAlerts(alerts.filter((_, j) => j !== i))}><Trash2 /></Button></Panel>; })}
      {adding ? <Panel><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Company<select className={field} value={nc} onChange={e => setNc(e.target.value)}>{launchCompanies.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label><label className="text-sm font-medium">Function<select className={field} value={nf} onChange={e => setNf(e.target.value)}>{["Engineering", "Product", "Design", "Data", "Operations"].map(f => <option key={f}>{f}</option>)}</select></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={() => { setAlerts([...alerts, { c: nc, f: nf, on: true }]); setAdding(false); setState("Filled"); }}>Save alert</Button></div></Panel> : <Button variant="outline" className="w-full" onClick={() => setAdding(true)}><Plus />New alert</Button>}
      <p className="text-center text-xs text-muted-foreground">Free: 3 alerts · Momentum and Land: unlimited</p>
    </div>}
  </main>;
}
