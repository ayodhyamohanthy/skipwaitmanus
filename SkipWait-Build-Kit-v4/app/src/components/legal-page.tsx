import { Link } from "@tanstack/react-router";

export type LegalSection = { id: string; title: string; body: string[] };

export function LegalPage({ eyebrow, title, updated, summary, sections }: { eyebrow: string; title: string; updated: string; summary: string[]; sections: LegalSection[] }) {
  return <div className="min-h-screen bg-background">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4"><Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link><nav className="flex gap-4 text-sm"><Link to="/terms" activeProps={{ className: "font-semibold" }}>Terms</Link><Link to="/privacy" activeProps={{ className: "font-semibold" }}>Privacy</Link><Link to="/guidelines" activeProps={{ className: "font-semibold" }}>Guidelines</Link><Link to="/help" className="hidden sm:inline">Help</Link></nav></header>
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <p className="example-banner mb-6">DRAFT FOR DESIGN · HAVE A LAWYER REVIEW BEFORE LAUNCH</p>
      <span className="eyebrow">{eyebrow}</span><h1 className="mt-2 text-4xl font-semibold sm:text-5xl">{title}<span className="brand-dot">.</span></h1><p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <section className="mt-8 rounded-3xl bg-accent p-6 text-accent-foreground"><h2 className="font-semibold">The short version</h2><ul className="mt-3 space-y-2">{summary.map(s => <li key={s} className="flex gap-2"><span aria-hidden>•</span>{s}</li>)}</ul></section>
      <div className="mt-10 grid gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden md:block" aria-label="On this page"><ul className="sticky top-6 space-y-2 text-sm">{sections.map(s => <li key={s.id}><a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">{s.title}</a></li>)}</ul></nav>
        <article className="min-w-0 space-y-10">{sections.map((s, i) => <section key={s.id} id={s.id} className="scroll-mt-6"><h2 className="text-xl font-semibold">{i + 1}. {s.title}</h2>{s.body.map((p, j) => <p key={j} className="mt-3 leading-relaxed text-muted-foreground">{p}</p>)}</section>)}<p className="text-sm text-muted-foreground">Questions? Write to <strong className="text-foreground">hello@skipwait.me</strong> (placeholder address).</p></article>
      </div>
    </main>
  </div>;
}
