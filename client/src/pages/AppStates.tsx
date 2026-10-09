// Kit v4 /app-states (app/src/routes/app-states.tsx): the phone-frame gallery of
// app and system screens. The Screen chips are the page's own navigation, not a
// preview toggle; install and push screens drive the real browser APIs
// (components/app-states/DeviceStates.tsx). Copy that would be untrue of the
// live product (device push, a lighter page version, drafts that send
// themselves, UPI, a sample error ref) is replaced by what actually happens.
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CreditCard, RefreshCw, SearchX, Signal, WifiOff } from "lucide-react";
import { Button } from "@/components/kit/button";
import { AppShell } from "@/components/AppShell";
import { Heading } from "@/components/kit/preview-kit";
import { Center, InstallAndroidSheet, InstallIphoneSheet, PushPermission } from "@/components/app-states/DeviceStates";

const APP_STATES = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"] as const;
type AppState = (typeof APP_STATES)[number];

// The kit renders /app-states inside its shell; App.tsx mounts this route bare,
// so the page brings the shell itself.
export default function AppStates() {
  return <AppShell><AppStatesGallery /></AppShell>;
}

export function AppStatesGallery() {
  // `run` remounts the phone screen on every chip press so a dismissed sheet comes back.
  const [view, setView] = useState<{ state: AppState; run: number }>({ state: "Install (Android)", run: 0 });
  const show = (state: AppState) => setView(current => ({ state, run: current.run + 1 }));
  return <main data-skipwait-screen="app-states" className="page-content">
    <Heading eyebrow="APP & SYSTEM SCREENS" title="Every edge, designed" text="How SkipWait behaves when installing, asking permission, or when something goes wrong." />
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Screen">
      <span className="text-muted-foreground">Screen:</span>
      {APP_STATES.map(state => <button key={state} type="button" onClick={() => show(state)} aria-pressed={view.state === state} className={`min-h-8 rounded-full border px-3 ${view.state === state ? "border-primary bg-primary/5 font-semibold" : "border-border hover:bg-muted"}`}>{state}</button>)}
    </div>
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-8 border-foreground bg-background shadow-xl">
      <div key={view.run} className="relative flex min-h-[620px] flex-col p-6"><Screen state={view.state} show={show} /></div>
    </div>
  </main>;
}

function Banner({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-muted px-6 py-2 text-sm">{icon}{children}</div>;
}

function Screen({ state, show }: { state: AppState; show: (state: AppState) => void }) {
  switch (state) {
    case "Install (Android)": return <InstallAndroidSheet />;
    case "Install (iPhone)": return <InstallIphoneSheet />;
    case "Push permission": return <PushPermission />;
    case "Offline": return <><Banner icon={<WifiOff className="size-4" />}>You're offline. Showing saved info.</Banner><Center icon={<WifiOff className="size-8" />} title="No connection." text="Your drafts are saved on this device. Send them when you're back online."><Button onClick={() => show("Loading")}><RefreshCw />Try again</Button></Center></>;
    case "Slow connection": return <><Banner icon={<Signal className="size-4" />}>Slow connection — pages may take a moment.</Banner><div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="flex gap-3 rounded-2xl border border-border p-4"><span className="size-10 animate-pulse rounded-xl bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-2/3 animate-pulse rounded-[0.25rem] bg-muted" /><span className="block h-3 w-1/3 animate-pulse rounded-[0.25rem] bg-muted" /></span></div>)}</div></>;
    case "Not found": return <Center icon={<SearchX className="size-8" />} title="This door doesn't lead anywhere." text="The page may have moved, or the link was mistyped."><Button asChild><Link href="/explore">Explore companies <ArrowRight /></Link></Button><Button variant="ghost" asChild><Link href="/">Go home</Link></Button></Center>;
    case "Something went wrong": return <Center icon={<AlertTriangle className="size-8" />} title="Something went wrong on our side." text="Nothing you did. Your asks and messages are safe."><Button onClick={() => show("Loading")}><RefreshCw />Try again</Button><Button variant="ghost" asChild><Link href="/support">Contact support</Link></Button></Center>;
    case "Payment failed": return <Center icon={<CreditCard className="size-8 text-destructive" />} title="Payment didn't go through." text="Your card was declined by your bank. You haven't been charged, and your plan hasn't changed."><Button asChild><Link href="/plans">Try another card</Link></Button><Button variant="ghost" asChild><Link href="/support">Contact support</Link></Button><small className="text-xs text-muted-foreground">Some banks block international payments — check your card settings.</small></Center>;
    case "Loading": return <div className="space-y-4" role="status" aria-label="Loading"><div className="h-8 w-40 animate-pulse rounded-[0.25rem] bg-muted" /><div className="h-4 w-56 animate-pulse rounded-[0.25rem] bg-muted" />{[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>;
  }
}
