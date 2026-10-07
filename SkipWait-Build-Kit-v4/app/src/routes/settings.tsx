import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Bell, Download, Globe2, KeyRound, Laptop, LogOut, Smartphone, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, Toggle, field } from "@/components/preview-kit";

export const Route = createFileRoute("/settings")({
  head: () => pageMeta("Settings", "Language, currency, time zone, notifications, install, blocked people, sessions, your data, and account deletion."),
  component: Settings,
});

const sections = ["Region", "Notifications", "App", "Privacy", "Account"] as const;
const langs = ["English", "हिन्दी (Hindi)", "Español", "Português", "Français", "العربية (Arabic)", "Bahasa Indonesia"];
const currencies = [["USD", "$20"], ["INR", "₹1,699"], ["EUR", "€19"], ["GBP", "£16"], ["AED", "AED 75"]] as const;

function Settings() {
  const [sec, setSec] = useState<(typeof sections)[number]>("Region");
  const [cur, setCur] = useState("INR");
  const [n, setN] = useState({ accepted: true, messages: true, expiring: true, alerts: true, credits: false, digest: true, email: true, push: false, quiet: true });
  const [blocked, setBlocked] = useState(["Seeker · reported 2 Oct", "Referrer · Merkle"]);
  const [sessions, setSessions] = useState([["iPhone · Safari", "Bengaluru · this device", Smartphone], ["MacBook · Chrome", "Bengaluru · 2 days ago", Laptop]] as const as readonly (readonly [string, string, typeof Laptop])[]);
  const [del, setDel] = useState<0 | 1 | 2>(0);
  const [confirm, setConfirm] = useState("");
  const [exported, setExported] = useState(false);
  const [dark, setDark] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [errors, setErrors] = useState(true);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const set = (k: keyof typeof n) => (v: boolean) => setN({ ...n, [k]: v });

  return <main className="page-content">
    <Heading eyebrow="ACCOUNT" title="Settings" aside={<span className="preview-label">DESIGN PREVIEW</span>} />
    <div className="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Settings sections">{sections.map(s => <button key={s} onClick={() => setSec(s)} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm ${sec === s ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted"}`}>{s}</button>)}</nav>
      <div className="min-w-0 space-y-4">
        {sec === "Region" && <Panel><Globe2 className="mb-2 size-5" /><h2 className="text-lg font-semibold">Language & region</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Language<select className={field}>{langs.map(l => <option key={l}>{l}</option>)}</select></label><label className="text-sm font-medium">Time zone<select className={field}><option>Asia/Kolkata (GMT+5:30)</option><option>Europe/London (GMT+1)</option><option>America/New_York (GMT-4)</option><option>Asia/Dubai (GMT+4)</option></select></label><label className="text-sm font-medium">Currency<select className={field} value={cur} onChange={e => setCur(e.target.value)}>{currencies.map(([c]) => <option key={c}>{c}</option>)}</select></label><label className="text-sm font-medium">Date format<select className={field}><option>6 Oct 2026</option><option>Oct 6, 2026</option><option>2026-10-06</option></select></label></div><p className="mt-4 rounded-xl bg-muted p-3 text-sm">Momentum shows as <strong>{currencies.find(c => c[0] === cur)![1]}/month</strong>. Local prices are examples; the final price is confirmed at checkout, including tax.</p><p className="mt-2 text-xs text-muted-foreground">Ask expiry and message times always show in your time zone. Right-to-left languages flip the layout.</p></Panel>}

        {sec === "Notifications" && <><Panel><Bell className="mb-2 size-5" /><h2 className="text-lg font-semibold">What notifies you</h2><div className="mt-2"><Toggle on={n.accepted} onChange={set("accepted")} label="Ask accepted or passed" hint="Always recommended" /><Toggle on={n.messages} onChange={set("messages")} label="New messages" /><Toggle on={n.expiring} onChange={set("expiring")} label="Asks about to expire" hint="24 hours before" /><Toggle on={n.alerts} onChange={set("alerts")} label="Saved alert matches" /><Toggle on={n.credits} onChange={set("credits")} label="Credits about to expire" /><Toggle on={n.digest} onChange={set("digest")} label="Weekly summary" hint="Mondays, one email" /></div></Panel>
          <Panel><h2 className="text-lg font-semibold">How</h2><div className="mt-2"><Toggle on={n.push} onChange={set("push")} label="Push notifications" hint={n.push ? "On for this device" : "Install the app to turn on"} /><Toggle on={n.email} onChange={set("email")} label="Email" /><Toggle on={n.quiet} onChange={set("quiet")} label="Quiet hours" hint="10 pm – 8 am in your time zone" /></div><p className="mt-3 text-xs text-muted-foreground">Safety and account notices are always sent. We never send marketing push notifications.</p></Panel></>}

        {sec === "App" && <Panel><Smartphone className="mb-2 size-5" /><h2 className="text-lg font-semibold">SkipWait app</h2><p className="mt-1 text-sm text-muted-foreground">Install for push notifications, faster opening, and offline drafts.</p><Button asChild className="mt-4"><Link to="/app-states">Preview install and app screens</Link></Button><div className="mt-4"><Toggle on={true} onChange={() => {}} label="Save drafts offline" hint="Asks you write offline send when you reconnect" /><Toggle on={dark} onChange={v => { setDark(v); document.documentElement.classList.toggle("dark", v); try { localStorage.setItem("sw-theme", v ? "dark" : "light"); } catch {} }} label="Dark mode" hint="Preview — some older screens are still being tuned" /><Toggle on={false} onChange={() => {}} label="Reduce motion" hint="Follows your device setting by default" /></div></Panel>}

        {sec === "Privacy" && <><Panel><Ban className="mb-2 size-5" /><h2 className="text-lg font-semibold">Blocked people</h2>{blocked.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">You haven't blocked anyone.</p> : <ul className="mt-3 divide-y divide-border">{blocked.map(b => <li key={b} className="flex min-h-12 items-center justify-between gap-3"><span className="text-sm">{b}</span><Button variant="ghost" size="sm" onClick={() => setBlocked(blocked.filter(x => x !== b))}>Unblock</Button></li>)}</ul>}</Panel>
          <Panel><h2 className="text-lg font-semibold">Cookies & analytics</h2><p className="mt-1 text-sm text-muted-foreground">Essential cookies keep you signed in. The rest are optional.</p><div className="mt-2"><Toggle on={true} onChange={() => {}} label="Essential" hint="Always on" /><Toggle on={analytics} onChange={setAnalytics} label="Product analytics" hint="Anonymous usage to improve SkipWait. Never sold, never ads." /><Toggle on={errors} onChange={setErrors} label="Error reports" hint="Crash details so we can fix bugs" /></div></Panel>
          <Panel><h2 className="text-lg font-semibold">Connected assistants</h2><p className="mt-1 text-sm text-muted-foreground">ChatGPT, Claude and API tokens that can use your account.</p><Link to="/assistants" className="text-link mt-2 inline-block text-sm">Manage assistants</Link></Panel>
          <Panel><Download className="mb-2 size-5" /><h2 className="text-lg font-semibold">Download your data</h2><p className="mt-1 text-sm text-muted-foreground">Profile, asks, messages, work and receipts as a ZIP. Ready within 24 hours.</p><Button variant="outline" className="mt-4" disabled={exported} onClick={() => setExported(true)}>{exported ? "Requested · we'll email you" : "Request export"}</Button></Panel></>}

        {sec === "Account" && <><Panel><KeyRound className="mb-2 size-5" /><h2 className="text-lg font-semibold">Where you're signed in</h2><ul className="mt-3 divide-y divide-border">{sessions.map(([d, w, Icon], i) => <li key={d} className="flex min-h-14 items-center gap-3"><Icon className="size-5" /><span className="flex-1"><strong className="block text-sm">{d}</strong><small className="text-muted-foreground">{w}</small></span>{i > 0 && <Button variant="ghost" size="sm" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}>Sign out</Button>}</li>)}</ul><Button variant="outline" className="mt-3" onClick={() => setSessions(sessions.slice(0, 1))}><LogOut />Sign out everywhere else</Button></Panel>
          <Panel className="border-destructive/40"><Trash2 className="mb-2 size-5 text-destructive" /><h2 className="text-lg font-semibold">Delete account</h2><p className="mt-1 text-sm text-muted-foreground">Open asks are withdrawn, referrers are told kindly, and your data is erased within 30 days. Purchased credits are lost.</p><Button variant="outline" className="mt-4 text-destructive" onClick={() => setDel(1)}>Delete my account</Button></Panel></>}
      </div>
    </div>
    {del > 0 && <div className="modal-backdrop" onClick={() => setDel(0)}><section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="del" onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={() => setDel(0)}><X /></Button>{del === 1 ? <><AlertTriangle className="mb-2 text-destructive" /><h2 id="del" className="text-xl font-semibold">This can't be undone.</h2><p className="mt-2 text-sm text-muted-foreground">Type DELETE to confirm. You have 2 open asks and 12 credits.</p><input className={field} value={confirm} onChange={e => setConfirm(e.target.value)} aria-label="Type DELETE" /><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(0)}>Keep account</Button><Button variant="destructive" disabled={confirm !== "DELETE"} onClick={() => setDel(2)}>Delete forever</Button></footer></> : <><h2 id="del" className="text-xl font-semibold">Account scheduled for deletion.</h2><p className="mt-2 text-sm text-muted-foreground">Changed your mind? Sign in within 14 days to cancel.</p><footer className="mt-6 flex justify-end"><Button onClick={() => { setDel(0); setConfirm(""); }}>Close</Button></footer></>}</section></div>}
  </main>;
}
