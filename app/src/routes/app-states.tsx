import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CreditCard, Download, RefreshCw, SearchX, Share, Signal, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/app-states")({
  head: () => pageMeta("App and system states", "Install prompt, push permission, offline, slow connection, not found, error and failed payment screens for the SkipWait app."),
  component: AppStates,
});

const states = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"] as const;
type S = (typeof states)[number];

function AppStates() {
  const [s, setS] = useState<S>("Install (Android)");
  return <main className="page-content">
    <Heading eyebrow="APP & SYSTEM SCREENS" title="Every edge, designed" text="How SkipWait behaves when installing, asking permission, or when something goes wrong." />
    <StateChips label="Screen:" states={states} value={s} onChange={setS} />
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-8 border-foreground bg-background shadow-xl">
      <div className="relative flex min-h-[620px] flex-col p-6">{render(s, setS)}</div>
    </div>
  </main>;
}

function Center({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children?: React.ReactNode }) {
  return <div className="m-auto text-center"><span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-muted">{icon}</span><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-2 text-muted-foreground">{text}</p>{children && <div className="mt-6 grid gap-2">{children}</div>}</div>;
}

function render(s: S, setS: (v: S) => void) {
  const backdrop = <div className="space-y-3 opacity-40"><div className="h-6 w-32 rounded bg-muted" /><div className="h-24 rounded-2xl bg-muted" /><div className="h-24 rounded-2xl bg-muted" /></div>;
  switch (s) {
    case "Install (Android)": return <>{backdrop}<div className="absolute inset-x-3 bottom-3 rounded-3xl border border-border bg-card p-5 shadow-lg"><button className="absolute right-2 top-2 grid size-11 place-items-center" aria-label="Dismiss"><X className="size-5" /></button><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">S.</span><span><strong className="block">Install SkipWait</strong><small className="text-muted-foreground">Know the moment a referrer replies</small></span></div><Button className="mt-4 w-full"><Download />Install app</Button><button className="mt-2 w-full text-sm text-muted-foreground">Not now</button></div></>;
    case "Install (iPhone)": return <>{backdrop}<div className="absolute inset-x-3 bottom-3 rounded-3xl border border-border bg-card p-5 shadow-lg"><strong className="block">Add SkipWait to your Home Screen</strong><ol className="mt-3 space-y-3 text-sm"><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">1</span>Tap <Share className="size-4" /> Share in Safari</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">2</span>Choose “Add to Home Screen”</li><li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-muted text-xs">3</span>Open it from your Home Screen</li></ol><button className="mt-4 w-full text-sm text-muted-foreground">Got it</button></div></>;
    case "Push permission": return <Center icon={<Bell className="size-8 text-primary" />} title="Know the moment a door opens." text="We'll only notify you when a referrer accepts, replies, or an ask is about to expire. Never marketing."><Button>Turn on notifications</Button><Button variant="ghost">Maybe later</Button></Center>;
    case "Offline": return <><div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-muted px-6 py-2 text-sm"><WifiOff className="size-4" />You're offline. Showing saved info.</div><Center icon={<WifiOff className="size-8" />} title="No connection." text="Your drafts are saved on this device and will send when you're back online."><Button onClick={() => setS("Loading")}><RefreshCw />Try again</Button></Center></>;
    case "Slow connection": return <><div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-muted px-6 py-2 text-sm"><Signal className="size-4" />Slow connection — loading a lighter version.</div><div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="flex gap-3 rounded-2xl border border-border p-4"><span className="size-10 animate-pulse rounded-xl bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-2/3 animate-pulse rounded bg-muted" /><span className="block h-3 w-1/3 animate-pulse rounded bg-muted" /></span></div>)}</div></>;
    case "Not found": return <Center icon={<SearchX className="size-8" />} title="This door doesn't lead anywhere." text="The page may have moved, or the link was mistyped."><Button asChild><Link to="/explore">Explore companies <ArrowRight /></Link></Button><Button variant="ghost" asChild><Link to="/">Go home</Link></Button></Center>;
    case "Something went wrong": return <Center icon={<AlertTriangle className="size-8" />} title="Something went wrong on our side." text="Nothing you did. Your asks and messages are safe."><Button onClick={() => setS("Loading")}><RefreshCw />Try again</Button><Button variant="ghost" asChild><Link to="/safety">Contact support</Link></Button><small className="text-xs text-muted-foreground">Error ref: SW-5F2A</small></Center>;
    case "Payment failed": return <Center icon={<CreditCard className="size-8 text-destructive" />} title="Payment didn't go through." text="Your card was declined by your bank. You haven't been charged, and your plan hasn't changed."><Button asChild><Link to="/plans">Try another card</Link></Button><Button variant="ghost">Pay with UPI</Button><small className="text-xs text-muted-foreground">Some banks block international payments — check your card settings.</small></Center>;
    case "Loading": return <div className="space-y-4"><div className="h-8 w-40 animate-pulse rounded bg-muted" /><div className="h-4 w-56 animate-pulse rounded bg-muted" />{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>;
  }
}
