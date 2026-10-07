import { useState } from "react";
import { BadgeCheck, ChevronDown, CreditCard, LifeBuoy, MessageSquare, Search, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/help` (screens/web/28_help__default.png, app/src/routes/help.tsx).
 *
 * Search + category filter over the kit's 14 answers, with the empty state.
 *
 * ONE COPY CHANGE, and it matters: the kit's answer to "How many asks can I
 * have open?" reads "Free: 3 at a time. Momentum and Land allow more." Those
 * plan names do not exist in the live product, which sells Pro and Max. Naming
 * plans a user cannot buy is the same class of error as inventing a price, so
 * the answer says "paid plans" instead and the specific allowance waits on the
 * owner's pricing decision (D2). Everything else is the kit's copy verbatim.
 */

const CATEGORIES = [
  ["Asking", MessageSquare],
  ["Referring", BadgeCheck],
  ["Plans & credits", CreditCard],
  ["Account & privacy", UserRound],
  ["Safety", ShieldCheck],
] as const;

const FAQS: ReadonlyArray<readonly [string, string, string]> = [
  ["Asking", "Is asking for a referral really free?", "Yes. Asking and referring are free forever. Paid plans only add preparation tools and more open asks at once."],
  ["Asking", "How many asks can I have open?", "Free: 3 at a time. Paid plans allow more. An answered, passed or expired ask frees a slot."],
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

export default function Help() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [open, setOpen] = useState<string | null>(FAQS[0]![1]);

  const needle = query.trim().toLowerCase();
  const visible = FAQS.filter(([group, question, answer]) =>
    (category === "All" || group === category) && (needle === "" || `${question} ${answer}`.toLowerCase().includes(needle)));

  return (
    <main data-skipwait-screen="help" className="page-content mx-auto max-w-4xl">
      <p className="eyebrow text-muted-foreground">Help centre</p>
      <h1 className="mt-3 text-4xl font-semibold">How can we help</h1>

      <label className="relative mt-6 block">
        <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Search help</span>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search: credits, verify, expire…"
          className="min-h-12 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-base"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" aria-pressed={category === "All"} onClick={() => setCategory("All")} className={`min-h-11 rounded-full border px-4 text-sm ${category === "All" ? "border-primary bg-accent font-semibold" : "border-border"}`}>All</button>
        {CATEGORIES.map(([name, Icon]) => (
          <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)} className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${category === name ? "border-primary bg-accent font-semibold" : "border-border"}`}>
            <Icon className="size-4" aria-hidden="true" />{name}
          </button>
        ))}
      </div>

      <ul className="mt-6 overflow-hidden rounded-3xl border border-border">
        {visible.length === 0 ? (
          <li className="p-8 text-center text-muted-foreground">No answers for “{query}”. Try another word or contact us below.</li>
        ) : visible.map(([, question, answer]) => (
          <li key={question} className="border-b border-border last:border-0">
            <button
              type="button"
              aria-expanded={open === question}
              onClick={() => setOpen(current => (current === question ? null : question))}
              className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left font-medium"
            >
              {question}
              <ChevronDown className={`size-5 shrink-0 transition-transform ${open === question ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {open === question && <p className="px-4 pb-4 text-muted-foreground">{answer}</p>}
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg bg-muted p-5">
          <LifeBuoy className="mb-2 size-5 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Still stuck?</h2>
          <p className="mt-1 text-sm text-muted-foreground">A person replies within 1 working day.</p>
          <Link href="/support" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">Contact support</Link>
        </section>
        <section className="rounded-lg border border-border p-5">
          <ShieldCheck className="mb-2 size-5 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Rules &amp; policies</h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/guidelines" className="text-link">Community guidelines</Link></li>
            <li><Link href="/terms" className="text-link">Terms of service</Link></li>
            <li><Link href="/privacy" className="text-link">Privacy policy</Link></li>
            <li><Link href="/safety" className="text-link">Safety</Link></li>
          </ul>
        </section>
      </div>
    </main>
  );
}
