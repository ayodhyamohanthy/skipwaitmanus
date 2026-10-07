import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, BadgeCheck, Copy, Eye, EyeOff, Github, Globe, Link2, LockKeyhole, MapPin, Pin, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/p/$handle")({
  head: () => pageMeta("Public work profile", "A shareable SkipWait profile: who someone is, the work they're proud of, and how to reach them — no feed, no follower counts."),
  component: PublicProfile,
});

const work = [
  { title: "Enterprise approvals redesign", kind: "Case study", source: "Behance", pinned: true },
  { title: "Design system for a logistics dashboard", kind: "Project", source: "Website", pinned: true },
  { title: "Accessible form patterns", kind: "Article", source: "Medium", pinned: false },
  { title: "Prototype kit", kind: "Code", source: "GitHub", pinned: false },
];
type Vis = "public" | "link" | "private";

function PublicProfile() {
  const { handle } = Route.useParams();
  const [owner, setOwner] = useState(true);
  const [vis, setVis] = useState<Vis>("link");
  const [kind, setKind] = useState<"seeker" | "referrer">("seeker");
  const [copied, setCopied] = useState(false);
  const [empty, setEmpty] = useState(false);
  const url = `skipwait.me/p/${handle}`;
  const hidden = !owner && vis === "private";

  return <div className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4"><Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link><div className="flex rounded-full bg-muted p-1 text-sm">{[true, false].map(o => <button key={String(o)} onClick={() => setOwner(o)} className={`min-h-10 rounded-full px-4 ${owner === o ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{o ? "You" : "Visitor"}</button>)}</div></header>
    <main className="mx-auto max-w-5xl px-5 pb-16">
      <div className="mb-4 flex flex-wrap gap-2 text-xs"><span className="example-banner !m-0">EXAMPLE PROFILE · PREVIEW</span>{(["seeker", "referrer"] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 ${kind === k ? "border-primary bg-primary/5" : "border-border"}`}>{k === "seeker" ? "Seeker" : "Referrer"}</button>)}<button onClick={() => setEmpty(!empty)} className={`rounded-full border px-3 py-1 ${empty ? "border-primary bg-primary/5" : "border-border"}`}>Empty state</button></div>

      {owner && <section className="mb-6 rounded-3xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><span className="eyebrow">WHO CAN SEE THIS</span><p className="mt-1 flex items-center gap-2 text-sm"><Link2 className="size-4 shrink-0" /><span className="truncate">{url}</span></p></div><div className="flex gap-2"><Button variant="outline" onClick={() => { navigator.clipboard?.writeText(`https://${url}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy />{copied ? "Copied" : "Copy link"}</Button><Button variant="outline" size="icon" aria-label="Share"><Share2 /></Button></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">{([["public", Globe, "Public", "Anyone, and search engines"], ["link", Link2, "Link only", "People with the link"], ["private", LockKeyhole, "Private", "Only referrers you ask"]] as const).map(([v, Icon, l, d]) => <button key={v} onClick={() => setVis(v)} className={`flex items-start gap-3 rounded-2xl border p-3 text-left ${vis === v ? "border-primary bg-primary/5" : "border-border"}`}><Icon className="mt-0.5 size-5 shrink-0" /><span><strong className="block text-sm">{l}</strong><small className="text-muted-foreground">{d}</small></span></button>)}</div>
      </section>}

      {hidden ? <section className="rounded-3xl bg-muted p-10 text-center"><LockKeyhole className="mx-auto mb-3 size-8" /><h1 className="text-2xl font-semibold">This profile is private.</h1><p className="mt-2 text-muted-foreground">It's shared only with referrers this person asks.</p><Button asChild className="mt-6"><Link to="/explore">Explore companies <ArrowRight /></Link></Button></section> : <>
        <section className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid size-24 shrink-0 place-items-center rounded-full bg-accent text-3xl font-semibold text-accent-foreground">AR</span>
          <div className="min-w-0 flex-1"><h1 className="text-3xl font-semibold sm:text-4xl">Asha R.</h1><p className="mt-1 text-lg">{kind === "seeker" ? "Senior Product Designer · enterprise workflows" : "Design Lead"}</p><p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="size-4" />Bengaluru · open to remote</span>{kind === "referrer" && <span className="flex items-center gap-1 text-foreground"><BadgeCheck className="size-4 text-primary" />Verified at Wipro via work email</span>}</p></div>
          {!owner && kind === "referrer" && <Button asChild><Link to="/explore/$slug" params={{ slug: "wipro" }}>Ask for a referral at Wipro <ArrowRight /></Link></Button>}
        </section>
        {kind === "seeker" && <div className="mt-5 flex flex-wrap gap-2">{["Product Designer", "UX Lead", "Design Systems"].map(t => <span key={t} className="rounded-full bg-muted px-3 py-1.5 text-sm">Open to: {t}</span>)}</div>}
        {kind === "referrer" && <p className="mt-5 max-w-2xl rounded-2xl bg-muted p-4 text-sm">Open to referrals for Design and Product roles at Wipro. Name shown here because Asha chose a public referrer profile — most referrers stay anonymous.</p>}

        <section className="mt-10"><div className="mb-4 flex items-end justify-between gap-3"><h2 className="text-xl font-semibold">Work</h2>{owner && <Link to="/work" className="text-link text-sm">Manage work →</Link>}</div>
          {empty ? <div className="rounded-3xl border border-dashed border-border p-10 text-center"><p className="font-medium">{owner ? "Add one piece you're proud of." : "No public work yet."}</p>{owner && <><p className="mt-1 text-sm text-muted-foreground">Import from GitHub, Behance, Dribbble, Medium or your site.</p><Button asChild className="mt-4"><Link to="/work">Add work</Link></Button></>}</div> :
            <div className="grid gap-4 sm:grid-cols-2">{work.map(w => <article key={w.title} className="rounded-3xl border border-border p-5"><div className="mb-10 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1">{w.source === "GitHub" ? <Github className="size-3.5" /> : <Globe className="size-3.5" />}{w.source}</span>{w.pinned && <span className="flex items-center gap-1 text-foreground"><Pin className="size-3.5" />Pinned</span>}</div><span className="eyebrow">{w.kind.toUpperCase()}</span><h3 className="mt-1 text-lg font-semibold">{w.title}</h3>{owner && <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">{w.pinned ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{w.pinned ? "Visible on profile" : "Shown only in requests"}</p>}</article>)}</div>}
        </section>
        <p className="mt-12 text-center text-sm text-muted-foreground">No feed. No followers. No likes. Just work. · <Link to="/" className="text-link">Make your own on SkipWait</Link></p>
      </>}
    </main>
  </div>;
}
