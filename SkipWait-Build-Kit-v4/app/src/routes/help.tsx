import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BadgeCheck, ChevronDown, CreditCard, LifeBuoy, MessageSquare, Search, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, field } from "@/components/preview-kit";

export const Route = createFileRoute("/help")({
  head: () => pageMeta("Help centre", "Answers about asking for referrals, becoming a verified referrer, plans and credits, privacy, and safety on SkipWait."),
  component: Help,
});

const cats = [["Asking", MessageSquare], ["Referring", BadgeCheck], ["Plans & credits", CreditCard], ["Account & privacy", UserRound], ["Safety", ShieldCheck]] as const;
const faqs: [string, string, string][] = [
  ["Asking", "Is asking for a referral really free?", "Yes. Asking and referring are free forever. Paid plans only add preparation tools and more open asks at once."],
  ["Asking", "How many asks can I have open?", "Free: 3 at a time. Momentum and Land allow more. An answered, passed or expired ask frees a slot."],
  ["Asking", "Why did my ask expire?", "If no referrer accepts within 7 days it closes automatically and your slot returns. Try refreshing your note."],
  ["Asking", "Does a referral guarantee an interview?", "No. Referrers recommend; companies decide. We never promise outcomes."],
  ["Referring", "How do I become a referrer?", "Verify your work email with a one-time code, then choose your job areas and monthly capacity."],
  ["Referring", "My company uses a different email domain.", "Start verification anyway — unlisted domains go to a person for review, usually within 2 days."],
  ["Referring", "Will seekers see my name?", "Only after you accept their ask. Passing is private."],
  ["Plans & credits", "Do credits expire?", "Purchased credits never expire. Plan credits roll over based on your plan."],
  ["Plans & credits", "Does paying move me up the queue?", "Never. Every ask is shown on equal terms."],
  ["Plans & credits", "How do I cancel?", "Plans & credits → Manage plan → Cancel. You keep access until the period ends."],
  ["Account & privacy", "Who can see my resume?", "Only a referrer who accepted your ask."],
  ["Account & privacy", "How do I delete my account?", "Settings → Account → Delete account. You have 14 days to change your mind."],
  ["Safety", "Someone asked me for money.", "Don't pay. Use Report on the conversation — it's confidential and reviewed within hours."],
  ["Safety", "How do I block someone?", "Open the conversation → Report or block. They aren't notified."],
];

function Help() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(faqs[0]![1]);
  const list = faqs.filter(f => (cat === "All" || f[0] === cat) && (f[1] + f[2]).toLowerCase().includes(q.toLowerCase()));
  return <main className="page-content mx-auto max-w-4xl">
    <Heading eyebrow="HELP CENTRE" title="How can we help" />
    <label className="relative block"><Search className="absolute left-4 top-1/2 mt-1 size-5 -translate-y-1/2 text-muted-foreground" /><span className="sr-only">Search help</span><input className={`${field} pl-12`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search: credits, verify, expire…" /></label>
    <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setCat("All")} className={`min-h-10 rounded-full border px-4 text-sm ${cat === "All" ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>All</button>{cats.map(([c, I]) => <button key={c} onClick={() => setCat(c)} className={`flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm ${cat === c ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}><I className="size-4" />{c}</button>)}</div>
    <ul className="mt-6 overflow-hidden rounded-3xl border border-border">{list.length === 0 ? <li className="p-8 text-center text-muted-foreground">No answers for “{q}”. Try another word or contact us below.</li> : list.map(([, t, a]) => <li key={t} className="border-b border-border last:border-0"><button aria-expanded={open === t} onClick={() => setOpen(open === t ? null : t)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left font-medium">{t}<ChevronDown className={`size-5 shrink-0 transition-transform ${open === t ? "rotate-180" : ""}`} /></button>{open === t && <p className="px-4 pb-4 text-muted-foreground">{a}</p>}</li>)}</ul>
    <div className="mt-8 grid gap-4 sm:grid-cols-2"><Panel tone="muted"><LifeBuoy className="mb-2 size-5" /><h2 className="font-semibold">Still stuck?</h2><p className="mt-1 text-sm text-muted-foreground">A person replies within 1 working day.</p><Button className="mt-4">Contact support</Button></Panel><Panel><ShieldCheck className="mb-2 size-5" /><h2 className="font-semibold">Rules & policies</h2><ul className="mt-2 space-y-1 text-sm"><li><Link to="/guidelines" className="text-link">Community guidelines</Link></li><li><Link to="/terms" className="text-link">Terms of service</Link></li><li><Link to="/privacy" className="text-link">Privacy policy</Link></li><li><Link to="/safety" className="text-link">Safety</Link></li></ul></Panel></div>
  </main>;
}
