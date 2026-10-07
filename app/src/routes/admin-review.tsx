import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, Building2, Check, Clock3, FileText, MailWarning, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/admin-review")({
  head: () => pageMeta("Admin review queue", "Internal review of safety reports, verification exceptions, and company submissions with evidence, decisions, and an audit trail."),
  component: AdminReview,
});

type Case = { id: string; kind: "Report" | "Verification" | "Company"; title: string; sub: string; sev: "Urgent" | "High" | "Normal"; age: string; evidence: string[] };
const cases: Case[] = [
  { id: "R-2048", kind: "Report", title: "Asked for money for a referral", sub: "Seeker → Referrer · TCS", sev: "Urgent", age: "38 min", evidence: ["Message: “₹5,000 and I'll push your profile”", "Reporter flagged: feels unsafe", "Reported account: 1 prior warning"] },
  { id: "R-2045", kind: "Report", title: "Repeated identical asks", sub: "Seeker · 14 asks in 1 hour", sev: "Normal", age: "5 h", evidence: ["Auto-flag: rate pattern", "Same note text ×14"] },
  { id: "V-311", kind: "Verification", title: "Unlisted domain @wipro.co.in", sub: "Referrer claims Wipro", sev: "High", age: "2 h", evidence: ["MX records: Wipro mail servers", "Domain not on Wipro allowlist", "OTP delivered and confirmed"] },
  { id: "V-309", kind: "Verification", title: "Re-verify bounced", sub: "Merkle · email now undeliverable", sev: "Normal", age: "1 d", evidence: ["Hard bounce on 90-day re-check", "2 open accepted requests"] },
  { id: "C-087", kind: "Company", title: "New company: Freshworks", sub: "Submitted by a seeker · freshworks.com", sev: "Normal", age: "1 d", evidence: ["Domain resolves · careers page found", "No duplicates", "3 submissions in 7 days"] },
];
const tabs = ["All", "Report", "Verification", "Company"] as const;
const actions: Record<Case["kind"], [string, string][]> = {
  Report: [["Dismiss", "No violation"], ["Warn", "Send policy warning"], ["Restrict 7 days", "No new asks or accepts"], ["Ban", "Remove account, notify parties"]],
  Verification: [["Approve domain", "Add to company allowlist"], ["Request more", "Ask for second proof"], ["Reject", "Keep unverified"], ["Remove badge", "Return open requests"]],
  Company: [["Approve", "List with 0 referrers + 'joining' state"], ["Merge", "Duplicate of existing"], ["Reject", "Not a real employer"]],
};

function AdminReview() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("All");
  const [sel, setSel] = useState(cases[0]!.id);
  const [done, setDone] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const list = cases.filter(c => tab === "All" || c.kind === tab);
  const c = cases.find(x => x.id === sel)!;
  const Icon = c.kind === "Report" ? ShieldAlert : c.kind === "Verification" ? MailWarning : Building2;

  return <div className="min-h-screen bg-muted">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-foreground px-5 py-3 text-background"><span className="text-xs font-semibold tracking-widest">INTERNAL OPERATIONS · REVIEW QUEUE</span><Button variant="secondary" size="sm" asChild><Link to="/admin"><ArrowLeft />Admin overview</Link></Button></header>
    <p className="mx-auto mt-4 max-w-6xl px-5 text-xs font-semibold text-muted-foreground">EXAMPLE CASES · NO REAL USERS</p>
    <div className="mx-auto grid max-w-6xl gap-4 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-3xl bg-background p-3">
        <div className="flex gap-1 overflow-x-auto p-1">{tabs.map(t => <button key={t} onClick={() => setTab(t)} className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${tab === t ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t === "All" ? "All" : t + "s"} <span className="opacity-60">{t === "All" ? cases.length : cases.filter(x => x.kind === t).length}</span></button>)}</div>
        <ul className="mt-2 space-y-1">{list.map(x => <li key={x.id}><button onClick={() => { setSel(x.id); setNote(""); }} className={`w-full rounded-2xl p-3 text-left ${sel === x.id ? "bg-muted" : "hover:bg-muted/60"}`}><div className="flex items-center justify-between gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${x.sev === "Urgent" ? "bg-destructive text-destructive-foreground" : x.sev === "High" ? "bg-accent text-accent-foreground" : "bg-muted"}`}>{x.sev}</span><span className="text-muted-foreground">{done[x.id] ? <Check className="inline size-3.5" /> : <Clock3 className="inline size-3.5" />} {done[x.id] ?? x.age}</span></div><strong className="mt-1 block text-sm">{x.title}</strong><small className="text-muted-foreground">{x.id} · {x.sub}</small></button></li>)}</ul>
      </section>
      <section className="min-w-0 rounded-3xl bg-background p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-muted"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{c.kind.toUpperCase()} · {c.id} · opened {c.age} ago</span><h1 className="text-2xl font-semibold">{c.title}</h1><p className="text-sm text-muted-foreground">{c.sub}</p></div>{c.sev === "Urgent" && <span className="flex items-center gap-1 text-sm font-semibold text-destructive"><AlertTriangle className="size-4" />SLA 4h</span>}</div>
        <h2 className="mt-6 text-sm font-semibold">Evidence</h2><ul className="mt-2 space-y-2">{c.evidence.map(e => <li key={e} className="flex gap-2 rounded-xl bg-muted p-3 text-sm"><FileText className="size-4 shrink-0" />{e}</li>)}</ul>
        {done[c.id] ? <div className="mt-6 rounded-2xl bg-accent p-4 text-accent-foreground"><strong className="flex items-center gap-2"><ShieldCheck className="size-4" />Decision: {done[c.id]}</strong><p className="mt-1 text-sm">Parties notified. Logged to audit trail. Appeal window 14 days.</p><button className="mt-2 text-sm underline" onClick={() => { const d = { ...done }; delete d[c.id]; setDone(d); }}>Reopen</button></div> : <>
          <h2 className="mt-6 text-sm font-semibold">Decision</h2><div className="mt-2 grid gap-2 sm:grid-cols-2">{actions[c.kind].map(([a, d]) => <button key={a} disabled={!note.trim()} onClick={() => setDone({ ...done, [c.id]: a })} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left disabled:opacity-40 ${a === "Ban" || a === "Reject" || a === "Remove badge" ? "border-destructive/40" : "border-border hover:border-foreground/40"}`}>{a === "Ban" ? <Ban className="size-4" /> : a.startsWith("Dismiss") || a === "Reject" ? <X className="size-4" /> : <Check className="size-4" />}<span><strong className="block text-sm">{a}</strong><small className="text-muted-foreground">{d}</small></span></button>)}</div>
          <label className="mt-4 block text-sm font-medium">Reviewer note (required)<textarea value={note} onChange={e => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background p-3" placeholder="Why this decision? Visible to other reviewers only." /></label></>}
        <h2 className="mt-6 text-sm font-semibold">Audit trail</h2><ol className="mt-2 space-y-1 text-xs text-muted-foreground"><li>{c.age} ago · case opened {c.kind === "Report" ? "by user report" : "automatically"}</li>{c.sev === "Urgent" && <li>{c.age} ago · escalated to urgent queue</li>}{done[c.id] && <li>just now · {done[c.id]} by reviewer (you)</li>}</ol>
      </section>
    </div>
  </div>;
}
