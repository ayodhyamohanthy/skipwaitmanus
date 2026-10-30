import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, CreditCard, RefreshCw, SearchX, Signal, WifiOff, Download, Share, X, Bell } from "lucide-react";
import { GoalButton, GoalNextStep } from "@/components/goal";

export const GOAL_PAGE = { goalLine: "See how skipwait.me behaves when things go wrong." } as const;

const APP_STATES = ["Install (Android)", "Install (iPhone)", "Push permission", "Offline", "Slow connection", "Not found", "Something went wrong", "Payment failed", "Loading"] as const;
type AppState = (typeof APP_STATES)[number];

export default function GoalAppStates() {
  const [view, setView] = useState<{ state: AppState; run: number }>({ state: "Install (Android)", run: 0 });
  const show = (state: AppState) => setView(current => ({ state, run: current.run + 1 }));
  return (
    <main data-skipwait-screen="app-states" data-goal-page="app-states" className="g-scope min-h-dvh bg-g-canvas px-5 py-8 font-g-sans text-g-ink">
      <header className="mx-auto max-w-3xl">
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-3 text-g-body text-g-ink-2">How skipwait.me behaves when installing, asking permission, or when something goes wrong.</p>
      </header>
      <div className="mx-auto mt-5 max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-g-meta" role="group" aria-label="Screen">
          <span className="text-g-ink-3">Screen:</span>
          {APP_STATES.map(state => (
            <button key={state} type="button" onClick={() => show(state)} aria-pressed={view.state === state}
              className={`min-h-8 rounded-full border px-3 text-g-meta ${view.state === state ? "border-g-ink bg-g-ink font-semibold text-g-on-primary" : "border-g-hairline text-g-ink-2 hover:bg-g-surface"}`}>
              {state}
            </button>
          ))}
        </div>
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2.5rem] border-8 border-g-ink bg-g-surface shadow-xl">
          <div key={view.run} className="relative flex min-h-[620px] flex-col p-6">
            <Screen state={view.state} show={show} />
          </div>
        </div>
        <div className="mt-8 max-w-3xl">
          <GoalNextStep reason="Reference gallery of edge states.">
            <GoalButton variant="primary" asChild><Link href="/">Go home</Link></GoalButton>
          </GoalNextStep>
        </div>
      </div>
    </main>
  );
}

function Center({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="m-auto text-center">
      <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-g-surface text-g-ink-3">{icon}</span>
      <h2 className="text-g-heading text-g-ink">{title}</h2>
      <p className="mt-2 text-g-body text-g-ink-2">{text}</p>
      {children && <div className="mt-6 grid gap-2">{children}</div>}
    </div>
  );
}

function Screen({ state, show }: { state: AppState; show: (s: AppState) => void }) {
  switch (state) {
    case "Install (Android)":
      return <InstallAndroid />;
    case "Install (iPhone)":
      return <InstallIphone />;
    case "Push permission":
      return <PushPermission />;
    case "Offline":
      return <><Banner icon={<WifiOff className="size-4" />} text="You're offline. Showing saved info." /><Center icon={<WifiOff className="size-8" />} title="No connection." text="Your drafts are saved on this device. Send them when you're back online."><button type="button" onClick={() => show("Loading")} className="min-h-11 rounded-g-tile border border-g-hairline px-4 py-2 text-g-label text-g-ink hover:bg-g-surface">Try again</button></Center></>;
    case "Slow connection":
      return <><Banner icon={<Signal className="size-4" />} text="Slow connection — pages may take a moment." /><div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="flex gap-3 rounded-g-tile border border-g-hairline p-4"><span className="size-10  rounded-g-tile bg-g-surface" /><span className="flex-1 space-y-2"><span className="block h-3 w-2/3  rounded-[0.25rem] bg-g-surface" /><span className="block h-3 w-1/3  rounded-[0.25rem] bg-g-surface" /></span></div>)}</div></>;
    case "Not found":
      return <Center icon={<SearchX className="size-8" />} title="This door doesn't lead anywhere." text="The page may have moved, or the link was mistyped."><Link href="/explore" className="min-h-11 rounded-g-tile bg-g-primary px-4 py-2 text-g-label font-semibold text-g-on-primary">Explore companies</Link><Link href="/" className="min-h-11 rounded-g-tile border border-g-hairline px-4 py-2 text-g-label text-g-ink">Go home</Link></Center>;
    case "Something went wrong":
      return <Center icon={<AlertTriangle className="size-8" />} title="Something went wrong on our side." text="Nothing you did. Your asks and messages are safe."><button type="button" onClick={() => show("Loading")} className="min-h-11 rounded-g-tile bg-g-primary px-4 py-2 text-g-label font-semibold text-g-on-primary">Try again</button><Link href="/support" className="min-h-11 rounded-g-tile border border-g-hairline px-4 py-2 text-g-label text-g-ink">Contact support</Link></Center>;
    case "Payment failed":
      return <Center icon={<CreditCard className="size-8 text-g-ink-3" />} title="Payment didn't go through." text="Your card was declined by your bank. You haven't been charged, and your plan hasn't changed."><Link href="/plans" className="min-h-11 rounded-g-tile bg-g-primary px-4 py-2 text-g-label font-semibold text-g-on-primary">Try another card</Link><Link href="/support" className="min-h-11 rounded-g-tile border border-g-hairline px-4 py-2 text-g-label text-g-ink">Contact support</Link><small className="text-g-meta text-g-ink-3">Some banks block international payments — check your card settings.</small></Center>;
    case "Loading":
      return <div className="space-y-4" role="status" aria-label="Loading"><div className="h-8 w-40 rounded-[0.25rem] bg-g-surface" /><div className="h-4 w-56 rounded-[0.25rem] bg-g-surface" />{[0, 1, 2, 3].map(i => <div key={i} className="h-20 rounded-g-tile bg-g-surface" />)}</div>;
  }
}

function Banner({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="-mx-6 -mt-6 mb-4 flex items-center gap-2 bg-g-surface px-6 py-2 text-g-meta text-g-ink-2">{icon}{text}</div>;
}

function InstallAndroid() {
  const [status, setStatus] = useState("");
  return (
    <>
      <div className="space-y-3 opacity-40"><div className="h-6 w-32 rounded-[0.25rem] bg-g-surface" /><div className="h-24 rounded-g-tile bg-g-surface" /><div className="h-24 rounded-g-tile bg-g-surface" /></div>
      <div className="absolute inset-x-3 bottom-3 rounded-g-tile border border-g-hairline bg-g-canvas p-5 shadow-lg">
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-g-tile bg-g-primary text-lg font-bold text-g-on-primary">S.</span><span><strong className="block text-g-ink">Install skipwait.me</strong><small className="text-g-ink-3">One tap from your home screen</small></span></div>
        <button type="button" onClick={() => setStatus("Install prompt not available in this browser. Use its menu: Install app, or Add to Home screen.")} className="mt-4 min-h-11 w-full rounded-g-tile bg-g-primary px-4 py-2 text-g-label font-semibold text-g-on-primary">Install app</button>
        {status ? <p role="status" className="mt-2 text-center text-g-meta text-g-ink-3">{status}</p> : null}
        <button type="button" className="mt-2 w-full text-g-meta text-g-ink-3">Not now</button>
      </div>
    </>
  );
}

function InstallIphone() {
  return (
    <>
      <div className="space-y-3 opacity-40"><div className="h-6 w-32 rounded-[0.25rem] bg-g-surface" /><div className="h-24 rounded-g-tile bg-g-surface" /><div className="h-24 rounded-g-tile bg-g-surface" /></div>
      <div className="absolute inset-x-3 bottom-3 rounded-g-tile border border-g-hairline bg-g-canvas p-5 shadow-lg">
        <strong className="block text-g-ink">Add skipwait.me to your Home Screen</strong>
        <ol className="mt-3 space-y-3 text-g-body text-g-ink-2">
          <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-g-surface text-g-meta">1</span>Tap <Share className="size-4" /> Share in Safari</li>
          <li className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-g-surface text-g-meta">2</span>Choose “Add to Home Screen”</li>
        </ol>
      </div>
    </>
  );
}

function PushPermission() {
  const [status, setStatus] = useState("");
  return (
    <>
      <div className="space-y-3 opacity-40"><div className="h-6 w-32 rounded-[0.25rem] bg-g-surface" /><div className="h-24 rounded-g-tile bg-g-surface" /></div>
      <div className="absolute inset-x-3 bottom-3 rounded-g-tile border border-g-hairline bg-g-canvas p-5 shadow-lg">
        <div className="flex items-center gap-3"><Bell className="size-6 text-g-ink-3" /><strong className="text-g-ink">Allow notifications?</strong></div>
        <p className="mt-2 text-g-body text-g-ink-2">skipwait.me sends no device push today. This screen only sets the browser permission.</p>
        <button type="button" onClick={() => setStatus("Permission request not available in this browser.")} className="mt-4 min-h-11 w-full rounded-g-tile bg-g-primary px-4 py-2 text-g-label font-semibold text-g-on-primary">Allow</button>
        {status ? <p role="status" className="mt-2 text-center text-g-meta text-g-ink-3">{status}</p> : null}
      </div>
    </>
  );
}
