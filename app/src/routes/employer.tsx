import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, BadgeCheck, Building2, Check, Copy, Globe, LayoutDashboard, Mail, Plus, Settings, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { StateChips, Toggle, field } from "@/components/preview-kit";

export const Route = createFileRoute("/employer")({
  head: () => pageMeta("Employer workspace", "For companies on SkipWait: verified email domains, employee referrers, referral activity, and invites — without gating free referrals."),
  component: Employer,
});

const views = [["Overview", LayoutDashboard], ["Referrers", UsersRound], ["Domains", Globe], ["Settings", Settings]] as const;
type V = (typeof views)[number][0];

function Employer() {
  const [v, setV] = useState<V>("Overview");
  const [st, setSt] = useState<"Example data" | "Just joined">("Example data");
  const [domains, setDomains] = useState(["merkle.com", "merkle.co.in"]);
  const [nd, setNd] = useState("");
  const [copied, setCopied] = useState(false);
  const [s, setS] = useState({ ats: false, digest: true, brand: true });
  const fresh = st === "Just joined";
  const people = fresh ? [] : [["Design", 2, "Active"], ["Data", 1, "Active"], ["Engineering", 1, "Paused"]] as const;

  return <div className="min-h-screen bg-muted">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-3"><div className="flex items-center gap-3"><Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">EMPLOYER · MERKLE</span></div><Button variant="ghost" size="sm" asChild><Link to="/for-companies"><ArrowLeft />For companies</Link></Button></header>
    <div className="mx-auto grid max-w-6xl gap-4 p-5 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">{views.map(([l, I]) => <button key={l} onClick={() => setV(l)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm ${v === l ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}><I className="size-4" />{l}</button>)}</nav>
      <main className="min-w-0 space-y-4">
        <StateChips states={["Example data", "Just joined"] as const} value={st} onChange={setSt} />
        {v === "Overview" && <>
          <section className="rounded-3xl bg-background p-6"><span className="eyebrow">MERKLE ON SKIPWAIT</span><h1 className="mt-1 text-3xl font-semibold">{fresh ? "Welcome. Let's open your first doors." : "Your referral programme, warmer."}</h1><p className="mt-2 max-w-xl text-muted-foreground">Employees verify with their own work email and choose who to refer. You see aggregate activity — never individual seekers' private asks.</p></section>
          <div className="grid gap-3 sm:grid-cols-4">{[["Verified referrers", fresh ? 0 : 4], ["Asks received", fresh ? 0 : 23], ["Referred", fresh ? 0 : 6], ["Hired (reported)", fresh ? 0 : 1]].map(([k, n]) => <section key={k as string} className="rounded-3xl bg-background p-5"><strong className="text-3xl">{n as number}</strong><p className="text-sm text-muted-foreground">{k as string}</p></section>)}</div>
          {fresh ? <section className="rounded-3xl bg-background p-6"><h2 className="font-semibold">Get started</h2><ol className="mt-3 space-y-3">{[["Add your email domains", "Domains"], ["Invite employees to verify", "Referrers"], ["Connect your referral portal (optional)", "Settings"]].map(([t, go], i) => <li key={t}><button onClick={() => setV(go as V)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-border p-3 text-left"><span className="grid size-7 place-items-center rounded-full bg-muted text-sm">{i + 1}</span>{t}</button></li>)}</ol></section>
            : <section className="rounded-3xl bg-background p-6"><h2 className="font-semibold">Asks by function · last 30 days</h2><div className="mt-4 space-y-3">{[["Design", 11], ["Data", 8], ["Engineering", 4]].map(([f, n]) => <div key={f as string}><div className="flex justify-between text-sm"><span>{f as string}</span><span>{n as number}</span></div><div className="mt-1 h-2 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${((n as number) / 11) * 100}%` }} /></div></div>)}</div><p className="mt-4 text-xs text-muted-foreground">EXAMPLE NUMBERS · NOT REAL ACTIVITY</p></section>}
        </>}
        {v === "Referrers" && <section className="rounded-3xl bg-background p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Employee referrers</h1><p className="text-sm text-muted-foreground">Shown by function only. Employees choose whether to share their name with you.</p></div><Button variant="outline" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy />{copied ? "Copied" : "Copy invite link"}</Button></div>
          {people.length === 0 ? <div className="mt-6 rounded-2xl bg-muted p-8 text-center"><UsersRound className="mx-auto mb-2 size-8" /><p className="font-medium">No verified referrers yet.</p><p className="text-sm text-muted-foreground">Share the invite link in Slack or your intranet.</p></div> : <ul className="mt-6 divide-y divide-border">{people.map(([f, n, s]) => <li key={f} className="flex min-h-14 items-center gap-3"><BadgeCheck className="size-5 text-primary" /><span className="flex-1"><strong className="block text-sm">{f}</strong><small className="text-muted-foreground">{n} verified referrer{n > 1 ? "s" : ""}</small></span><span className="rounded-full bg-muted px-3 py-1 text-xs">{s}</span></li>)}</ul>}
          <label className="mt-6 block text-sm font-medium">Invite by email<div className="flex gap-2"><input className={field} placeholder="name@merkle.com, name2@merkle.com" /><Button className="mt-2 h-12"><Mail />Send</Button></div></label></section>}
        {v === "Domains" && <section className="rounded-3xl bg-background p-6"><h1 className="text-2xl font-semibold">Verified email domains</h1><p className="text-sm text-muted-foreground">Employees with these domains can verify instantly. Others go to manual review.</p><ul className="mt-4 divide-y divide-border">{domains.map(d => <li key={d} className="flex min-h-12 items-center gap-3"><Check className="size-4 text-primary" /><span className="flex-1">@{d}</span><Button variant="ghost" size="icon" aria-label={`Remove ${d}`} onClick={() => setDomains(domains.filter(x => x !== d))}><Trash2 /></Button></li>)}</ul><div className="mt-4 flex gap-2"><input className={field} value={nd} onChange={e => setNd(e.target.value)} placeholder="new-domain.com" aria-label="New domain" /><Button className="mt-2 h-12" disabled={!/\.\w{2,}$/.test(nd)} onClick={() => { setDomains([...domains, nd]); setNd(""); }}><Plus />Add</Button></div><p className="mt-3 text-xs text-muted-foreground">We confirm ownership with a DNS record before a new domain goes live.</p></section>}
        {v === "Settings" && <section className="rounded-3xl bg-background p-6"><Building2 className="mb-2 size-5" /><h1 className="text-2xl font-semibold">Programme settings</h1><Toggle on={s.ats} onChange={x => setS({ ...s, ats: x })} label="Link your referral portal" hint="Referrers get a one-tap link to your internal referral form" /><Toggle on={s.digest} onChange={x => setS({ ...s, digest: x })} label="Monthly activity digest" hint="Aggregate only, to programme admins" /><Toggle on={s.brand} onChange={x => setS({ ...s, brand: x })} label="Show company story on your SkipWait page" /><p className="mt-4 rounded-xl bg-muted p-3 text-sm">Employers can't see or block individual asks, and can't pay to boost visibility. Referrals stay free for everyone.</p></section>}
      </main>
    </div>
  </div>;
}
