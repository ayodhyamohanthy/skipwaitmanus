import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Clock3, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/requests")({
  head: () => pageMeta("My requests", "Every referral ask you've sent, open slots, what's expiring, and the next step for each."),
  component: Requests,
});

type St = "Requested" | "Accepted" | "Referred" | "Interviewing" | "Declined" | "Expired";
const all: { co: string; name: string; role: string; status: St; note: string }[] = [
  { co: "W", name: "Wipro", role: "Product Designer", status: "Accepted", note: "Message your referrer" },
  { co: "M", name: "Merkle", role: "Data Analyst", status: "Requested", note: "Expires in 5 days" },
  { co: "T", name: "TCS", role: "UX Researcher", status: "Requested", note: "Expires tomorrow" },
  { co: "GN", name: "Go Neutrinos", role: "Product Manager", status: "Interviewing", note: "Prepare with a dossier" },
  { co: "SW", name: "SkipWait", role: "Designer", status: "Declined", note: "Not my team · slot freed" },
];
const tabs = ["Active", "Closed"] as const;

function Requests() {
  const [st, setSt] = useState<"Some asks" | "Slots full" | "First time">("Some asks");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Active");
  const items = st === "First time" ? [] : all;
  const open = st === "Slots full" ? 3 : items.filter(i => i.status === "Requested").length;
  const list = items.filter(i => (tab === "Closed") === ["Declined", "Expired"].includes(i.status));

  return <main className="page-content">
    <Heading eyebrow="MY ASKS" title="Requests" text="Track every ask in one place. Answered or expired asks free a slot." aside={<Button asChild><Link to="/explore"><Plus />New ask</Link></Button>} />
    <StateChips states={["Some asks", "Slots full", "First time"] as const} value={st} onChange={setSt} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Panel><span className="eyebrow">OPEN SLOTS · FREE</span><p className="mt-1 text-3xl font-semibold">{open}<span className="text-lg text-muted-foreground">/3</span></p><div className="mt-2 flex gap-1">{[0, 1, 2].map(i => <span key={i} className={`h-2 flex-1 rounded-full ${i < open ? "bg-primary" : "bg-muted"}`} />)}</div></Panel>
      <Panel><span className="eyebrow">IN CONVERSATION</span><p className="mt-1 text-3xl font-semibold">{items.filter(i => ["Accepted", "Referred", "Interviewing"].includes(i.status)).length}</p></Panel>
      <Panel><span className="eyebrow">EXPIRING SOON</span><p className="mt-1 flex items-center gap-2 text-3xl font-semibold">{st === "First time" ? 0 : 1}<Clock3 className="size-5 text-muted-foreground" /></p></Panel>
    </div>
    {st === "Slots full" && <Panel tone="muted" className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm">All 3 slots are in use. Wait for an answer, withdraw an ask, or get more slots with Momentum (8).</span><Button size="sm" variant="outline" asChild><Link to="/plans">See plans</Link></Button></Panel>}
    <div className="directory-tabs section-tabs mt-6" role="tablist">{tabs.map(t => <Button key={t} variant="ghost" role="tab" aria-selected={tab === t} className={tab === t ? "selected" : ""} onClick={() => setTab(t)}>{t}</Button>)}</div>
    {list.length === 0 ? <Panel tone="muted" className="mt-4 text-center"><Send className="mx-auto mb-3 size-8" /><h2 className="text-lg font-semibold">{tab === "Active" ? "No asks yet." : "Nothing closed yet."}</h2><p className="mt-1 text-sm text-muted-foreground">Pick a company, find a verified referrer, and write one great ask.</p>{tab === "Active" && <div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" asChild><Link to="/onboarding">Finish setup</Link></Button><Button asChild><Link to="/explore">Explore companies</Link></Button></div>}</Panel> :
      <ul className="mt-4 space-y-3">{list.map(i => <li key={i.role}><Link to="/thread" className="flex min-h-20 items-center gap-3 rounded-3xl border border-border p-4 hover:border-foreground/40"><span className="company-mark">{i.co}</span><span className="min-w-0 flex-1"><strong className="block truncate">{i.role}</strong><small className={i.note.includes("tomorrow") ? "font-semibold text-destructive" : "text-muted-foreground"}>{i.name} · {i.note}</small></span><StatusPill status={i.status} /><ArrowRight className="hidden size-4 shrink-0 sm:block" /></Link></li>)}</ul>}
    <p className="example-banner mt-4">EXAMPLE ASKS · NOT LIVE ACTIVITY</p>
  </main>;
}
