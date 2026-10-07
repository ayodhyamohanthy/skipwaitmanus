import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, EyeOff, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { pageMeta } from "@/lib/page-meta";
import { Heading, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/inbox")({
  head: () => pageMeta("Your inbox", "Private conversations that begin when a SkipWait referrer accepts your request — and asks waiting for your decision."),
  component: Inbox,
});

const threads = [
  { co: "W", who: "Rahul K. · Wipro", role: "Product Designer", last: "Happy to help — I'll submit this week.", time: "10m", unread: true, status: "Accepted" as const, side: "Asking" },
  { co: "M", who: "Someone at Merkle", role: "Data Analyst", last: "Waiting for a referrer to accept", time: "2d", unread: false, status: "Requested" as const, side: "Asking" },
  { co: "W", who: "Seeker · identity hidden", role: "UX Researcher", last: "New ask for you to review", time: "1h", unread: true, status: "Requested" as const, side: "Referring" },
  { co: "T", who: "Priya S. · TCS", role: "Data Analyst", last: "Referred! Reference ID TC-4410", time: "5d", unread: false, status: "Referred" as const, side: "Asking" },
];

function Inbox() {
  const [st, setSt] = useState<"Filled" | "Empty">("Filled");
  const [side, setSide] = useState<"All" | "Asking" | "Referring">("All");
  const [q, setQ] = useState("");
  const list = (st === "Empty" ? [] : threads).filter(t => (side === "All" || t.side === side) && (t.who + t.role).toLowerCase().includes(q.toLowerCase()));
  return <main className="page-content mx-auto max-w-3xl">
    <Heading eyebrow="MESSAGES" title="Inbox" text="Conversations open when a referrer accepts. Until then, identities stay private." />
    <StateChips states={["Filled", "Empty"] as const} value={st} onChange={setSt} />
    <div className="mb-4 flex flex-wrap items-center gap-2"><div className="flex rounded-full bg-muted p-1 text-sm">{(["All", "Asking", "Referring"] as const).map(s => <button key={s} onClick={() => setSide(s)} className={`min-h-9 rounded-full px-4 ${side === s ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{s}</button>)}</div><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search conversations</span><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="h-11 w-full rounded-full border border-input bg-background pl-9 pr-4" /></label></div>
    {list.length === 0 ? <section className="rounded-3xl bg-muted p-10 text-center"><MessageSquare className="mx-auto mb-3 size-8" /><h2 className="text-lg font-semibold">No conversations yet.</h2><p className="mt-1 text-sm text-muted-foreground">Send an ask to a verified referrer. When they accept, you'll talk here.</p><Button asChild className="mt-4"><Link to="/explore">Find a referrer</Link></Button></section> :
      <ul className="overflow-hidden rounded-3xl border border-border">{list.map(t => <li key={t.who + t.role} className="border-b border-border last:border-0"><Link to="/thread" className={`flex min-h-20 items-center gap-3 p-4 hover:bg-muted ${t.unread ? "bg-primary/5" : ""}`}><span className="company-mark">{t.co}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1 text-sm font-semibold">{t.who.includes("hidden") ? <EyeOff className="size-3.5" /> : <BadgeCheck className="size-3.5 text-primary" />}<span className="truncate">{t.who}</span></span><span className="block truncate text-sm text-muted-foreground">{t.role} · {t.last}</span></span><span className="flex shrink-0 flex-col items-end gap-1"><span className="text-xs text-muted-foreground">{t.time}</span><StatusPill status={t.status} /></span></Link></li>)}</ul>}
    <p className="example-banner mt-4">EXAMPLE CONVERSATIONS · NOT LIVE ACTIVITY</p>
  </main>;
}
