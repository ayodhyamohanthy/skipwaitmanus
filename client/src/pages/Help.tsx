import { BadgeCheck, ChevronDown, CreditCard, LifeBuoy, MessageSquare, Search, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Heading, Panel, field } from "@/components/kit/preview-kit";

// Kit v4 /help (app/src/routes/help.tsx). Questions follow the kit; answers are
// adapted wherever the kit copy would misstate live plans, limits or tooling.
const CATS = [["Asking", MessageSquare], ["Referring", BadgeCheck], ["Plans & credits", CreditCard], ["Account & privacy", UserRound], ["Safety", ShieldCheck]] as const;
const FAQS: ReadonlyArray<readonly [string, string, string]> = [
  ["Asking", "Is asking for a referral really free?", "Yes. Asking and referring are free forever. Paid plans only add monthly credits on top of the free allowance."],
  ["Asking", "How many asks can I have open?", "Every account gets free referral credits each month plus any packs you buy. An answered, passed, or withdrawn ask frees its slot."],
  ["Asking", "Why did my ask expire?", "No verified employee claimed it within seven days, so it expired automatically and the reserved credit returned to your balance. Withdraw anytime before then to free the slot early and get the credit back."],
  ["Asking", "Does a referral guarantee an interview?", "No. Referrers recommend; companies decide. We never promise outcomes."],
  ["Referring", "How do I become a referrer?", "Verify your work email with a one-time code, then review private requests for your company."],
  ["Referring", "My company uses a different email domain.", "Start verification anyway — unlisted domains go to a person for manual review."],
  ["Referring", "Will seekers see my name?", "Only after you accept their ask. Passing is private."],
  ["Plans & credits", "Do credits expire?", "Purchased credits never expire. Monthly plan allowances refresh each billing cycle."],
  ["Plans & credits", "Does paying move me up the queue?", "Never. Every ask is shown on equal terms."],
  ["Plans & credits", "How do I cancel?", "Open Plans and manage your subscription there. You keep access until the period ends."],
  ["Account & privacy", "Who can see my resume?", "Only a referrer who accepted your ask."],
  ["Account & privacy", "How do I delete my account?", "Settings lets you download your data or request deletion review. We review requests rather than silently removing records."],
  ["Safety", "Someone asked me for money.", "Don't pay. Contact support and we will review it confidentially."],
  ["Safety", "How do I block someone?", "Contact support from any conversation and we will step in — including both-direction blocks where needed."],
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState<string | null>(FAQS[0]?.[1] ?? null);
  const list = FAQS.filter(item => (category === "All" || item[0] === category) && (item[1] + item[2]).toLowerCase().includes(query.toLowerCase()));
  const pill = (active: boolean) => `min-h-11 rounded-full border px-4 text-sm ${active ? "border-primary bg-primary/5 font-semibold" : "border-border"}`;

  return (
    <main data-skipwait-screen="help" className="page-content mx-auto max-w-4xl">
      <Heading eyebrow="HELP CENTRE" title="How can we help" />
      <label className="relative block">
        <Search className="absolute left-4 top-1/2 mt-1 size-5 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Search help</span>
        <input className={`${field} pl-12`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search: credits, verify, expire…" />
      </label>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Help categories">
        <button type="button" role="tab" aria-selected={category === "All"} onClick={() => setCategory("All")} className={pill(category === "All")}>All</button>
        {CATS.map(([name, Icon]) => (
          <button key={name} type="button" role="tab" aria-selected={category === name} onClick={() => setCategory(name)} className={`flex items-center gap-2 ${pill(category === name)}`}><Icon className="size-4" />{name}</button>
        ))}
      </div>
      <ul className="mt-6 overflow-hidden rounded-3xl border border-border">
        {list.length === 0 ? <li className="p-8 text-center text-muted-foreground">No answers for “{query}”. Try another word or contact us below.</li> : list.map(([, title, answer]) => (
          <li key={title} className="border-b border-border last:border-0">
            <button type="button" aria-expanded={open === title} onClick={() => setOpen(open === title ? null : title)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left font-medium">{title}<ChevronDown className={`size-5 shrink-0 transition-transform ${open === title ? "rotate-180" : ""}`} /></button>
            {open === title ? <p className="px-4 pb-4 text-muted-foreground">{answer}</p> : null}
          </li>
        ))}
      </ul>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Panel tone="muted">
          <LifeBuoy className="mb-2 size-5" /><h2 className="font-semibold">Still stuck?</h2>
          <p className="mt-1 text-sm text-muted-foreground">A person replies within 1 working day.</p>
          <Button asChild className="mt-4"><Link href="/support">Contact support</Link></Button>
        </Panel>
        <Panel>
          <ShieldCheck className="mb-2 size-5" /><h2 className="font-semibold">Rules &amp; policies</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/guidelines" className="text-link">Community guidelines</Link></li>
            <li><Link href="/terms" className="text-link">Terms of service</Link></li>
            <li><Link href="/privacy" className="text-link">Privacy &amp; trust</Link></li>
            <li><Link href="/safety" className="text-link">Safety</Link></li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}
