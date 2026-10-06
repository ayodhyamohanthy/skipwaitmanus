import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { launchCompanies } from "@/lib/marketplace-data";
import { Heading, Panel, field } from "@/components/preview-kit";

export const Route = createFileRoute("/suggest-company")({
  head: () => pageMeta("Suggest a company", "Can't find your company? Suggest it and we'll add it after a quick review — then invite the people you know inside."),
  component: Suggest,
});

function Suggest() {
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [role, setRole] = useState<"seeker" | "employee">("seeker");
  const [sent, setSent] = useState(false);
  const dup = launchCompanies.find(c => name.trim().length > 1 && c.name.toLowerCase().startsWith(name.trim().toLowerCase()));
  const validSite = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(site);

  if (sent) return <main className="page-content mx-auto max-w-xl text-center"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-3xl font-semibold">Thanks — {name} is in review.</h1><p className="mt-2 text-muted-foreground">We check the domain and careers page, usually within 2 days. We'll notify you when it's live.</p><Panel tone="muted" className="mt-6 text-left"><strong>Speed it up</strong><p className="mt-1 text-sm text-muted-foreground">{role === "employee" ? "Verify your work email — the company goes live as soon as one referrer joins." : "Know someone there? Invite them to be the first referrer."}</p><Button asChild className="mt-3">{role === "employee" ? <Link to="/verify">Verify work email</Link> : <Link to="/invite">Invite someone</Link>}</Button></Panel><p className="mt-4 text-xs text-muted-foreground">You can suggest up to 3 companies a day.</p></main>;

  return <main className="page-content mx-auto max-w-2xl">
    <Heading eyebrow="GROW THE MAP" title="Suggest a company" text="Real employers only. We review every suggestion before it appears." />
    <Panel>
      <label className="block text-sm font-medium">Company name<input className={field} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Freshworks" /></label>
      {dup && <p className="mt-2 flex items-center gap-2 text-sm"><AlertTriangle className="size-4" />{dup.name} is already on SkipWait. <Link to="/explore/$slug" params={{ slug: dup.slug }} className="text-link">Open it</Link></p>}
      <label className="mt-4 block text-sm font-medium">Website<input className={field} value={site} onChange={e => setSite(e.target.value)} placeholder="freshworks.com" /></label>
      <fieldset className="mt-4"><legend className="text-sm font-medium">You are</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{([["seeker", "Looking to join"], ["employee", "Working there now"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setRole(k)} className={`flex min-h-12 items-center gap-2 rounded-xl border px-4 text-left ${role === k ? "border-primary bg-primary/5" : "border-border"}`}><Building2 className="size-4" />{l}</button>)}</div></fieldset>
      <Button className="mt-6 w-full" disabled={!name.trim() || !validSite || !!dup} onClick={() => setSent(true)}>Submit for review <ArrowRight /></Button>
    </Panel>
    <p className="mt-4 text-center text-xs text-muted-foreground">DESIGN PREVIEW · NOTHING IS SUBMITTED</p>
  </main>;
}
